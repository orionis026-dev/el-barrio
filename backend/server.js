// server.js — La Esquina · Backend principal
require('dotenv').config()

const express = require('express')
const cors    = require('cors')
const path    = require('path')
const fs      = require('fs')
const agents  = require('./agents')
const { chat, healthCheck } = require('./providers/llm')
const { search } = require('./rag/search')
const {
  readMemoryContext,
  writeMemoryNote,
  memorySearch,
  memoryGet
} = require('./memory/tools')

const app  = express()
const PORT = process.env.PORT || 3001
const MEMORY_SEARCH_MODE = process.env.MEMORY_SEARCH_MODE || 'hybrid'
const MEMORY_VECTOR_WEIGHT = process.env.MEMORY_VECTOR_WEIGHT || '0.7'
const MEMORY_TEXT_WEIGHT = process.env.MEMORY_TEXT_WEIGHT || '0.3'
const CONTEXT_RESERVE_TOKENS_FLOOR = Number(process.env.CONTEXT_RESERVE_TOKENS_FLOOR || 40000)
const MEMORY_FLUSH_ENABLED = String(process.env.MEMORY_FLUSH_ENABLED || 'true') !== 'false'
const MEMORY_SOFT_THRESHOLD_TOKENS = Number(process.env.MEMORY_SOFT_THRESHOLD_TOKENS || 4000)
const MEMORY_FLUSH_SYSTEM_PROMPT = process.env.MEMORY_FLUSH_SYSTEM_PROMPT || 'Session nearing compaction. Store durable memories now.'
const MEMORY_FLUSH_PROMPT = process.env.MEMORY_FLUSH_PROMPT || 'Write any lasting notes to memory/YYYY-MM-DD.md; reply with NO_REPLY if nothing to store.'
const DIALOGUE_STYLE_PROMPT = `
[Estilo conversacional]
- Responde de forma breve y natural.
- Normalmente usa entre 1 y 3 frases cortas; evita párrafos largos.
- Si la situación lo permite, termina con una sola pregunta corta que muestre interés real por la persona.
- No hagas interrogatorios: una pregunta como máximo.
- Si el usuario pide algo muy concreto, prioriza contestar primero y luego pregunta algo solo si encaja.
`.trim()

// ─── MIDDLEWARE ───────────────────────────────────────────────────
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }))
app.use(express.json())

// ─── LOGGING SIMPLE ───────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${req.method} ${req.path}`)
  next()
})

// ─── MEMORIA DEL BARRIO — Fase 1 [2026-03-11] ────────────────────
// Archivos markdown planos por usuario.
// Cada avatar lee el perfil del usuario antes de responder.
// Cada sesión actualiza el perfil con lo relevante.
//
// Estructura:
//   memoria/usuarios/<userId>.md   ← lo que el barrio sabe del usuario
//
// Fase 2 (futuro): cuando el archivo sea muy grande, migrar a LanceDB.

const MEMORIA_DIR = path.join(__dirname, 'memoria', 'usuarios')

// Asegura que el directorio base existe al arrancar
fs.mkdirSync(MEMORIA_DIR, { recursive: true })

function leerMemoria(userId) {
  return readMemoryContext(MEMORIA_DIR, userId)
}

function escribirMemoria(userId, agentId, nota, scope = 'daily') {
  writeMemoryNote(MEMORIA_DIR, userId, agentId, nota, scope)
}

function estimateTokens(input) {
  // Estimación rápida para controlar budget sin tokenizer pesado.
  const text = Array.isArray(input)
    ? input.map((m) => m?.content || '').join('\n')
    : String(input || '')
  return Math.ceil(text.length / 4)
}

// ─── RUTAS ────────────────────────────────────────────────────────

app.get('/agents', (_req, res) => {
  const list = Object.values(agents).map(({ id, name, emoji, role, location, color, quickPrompts }) => ({
    id, name, emoji, role, location, color, quickPrompts
  }))
  res.json(list)
})

app.get('/health', async (_req, res) => {
  const providers = await healthCheck()
  res.json({
    status: 'ok',
    providers,
    activeProvider: process.env.MODEL_PROVIDER || 'openrouter',
    ragEnabled: true
  })
})

app.get('/models', (_req, res) => {
  res.json({
    current: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct',
    available: [
      { id: 'meta-llama/llama-3.1-8b-instruct',      label: 'Llama 3.1 8B (rápido)' },
      { id: 'meta-llama/llama-3.1-70b-instruct',     label: 'Llama 3.1 70B (mejor calidad)' },
      { id: 'mistralai/mistral-7b-instruct',          label: 'Mistral 7B (muy rápido)' },
      { id: 'google/gemma-2-9b-it',                   label: 'Gemma 2 9B (bueno en español)' },
      { id: 'anthropic/claude-haiku',                 label: 'Claude Haiku (via OpenRouter)' },
      { id: 'moonshotai/kimi-k2.5',                   label: 'Kimi K2.5 (via OpenRouter)' },
      { id: 'mistralai/mistral-small-3',              label: 'Mistral Small 3 (via OpenRouter)' },
      { id: 'qwen/qwen3-30b-a3b-instruct-2507',       label: 'Qwen3 30B (via OpenRouter)' },
      { id: 'moonshotai/kimi-k2-0905',                label: 'Kimi K2 0905 (via OpenRouter)' }
    ]
  })
})

// ─── POST /chat ───────────────────────────────────────────────────
// [2026-03-11] Añadida memoria de usuario:
//   1. Lee perfil del usuario antes de responder
//   2. Inyecta perfil en el system prompt si existe
//   3. El avatar puede mencionar info de otros avatares naturalmente
//
// El frontend debe enviar `userId` en el body (ej: "pepe", "user_123").
// Si no viene userId, funciona sin memoria (retrocompatible).

app.post('/chat', async (req, res) => {
  const { agentId, messages, provider, userId } = req.body // [2026-03-11] añadido userId

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages[] requerido' })
  }

  const agent          = agents[agentId] || agents.el_yoyo
  const userMessage    = messages[messages.length - 1]?.content || ''
  const activeProvider = provider || process.env.MODEL_PROVIDER || 'openrouter'

  try {
    // 1. RAG — contexto del corpus cubano
    const ragResults = await search(userMessage)
    const ragContext  = ragResults.length
      ? `\n\n[Contexto de referencia — úsalo solo si es relevante, no lo menciones:]\n${ragResults.join('\n---\n')}`
      : ''

    // 2. Memoria del barrio: primero búsqueda relevante, fallback a lectura completa
    let memoriaContext = ''
    if (userId) {
      const memoryHits = await memorySearch(MEMORIA_DIR, {
        userId,
        query: userMessage,
        topK: 5,
        mode: MEMORY_SEARCH_MODE,
        vectorWeight: MEMORY_VECTOR_WEIGHT,
        textWeight: MEMORY_TEXT_WEIGHT
      })

      if (memoryHits.length) {
        const snippets = memoryHits
          .map((m) => `(${m.file}:${m.lineStart}) ${m.text}`)
          .join('\n')
        memoriaContext = `\n\n[Memoria relevante de esta persona — úsala con naturalidad, no la recites:]\n${snippets}`
      } else {
        const memoriaUsuario = leerMemoria(userId)
        if (memoriaUsuario) {
          memoriaContext = `\n\n[Lo que el barrio sabe de esta persona — úsalo con naturalidad, no lo recites:]\n${memoriaUsuario}`
        }
      }
    }

    // 3. System prompt completo
    let systemFinal = `${agent.system}\n\n${DIALOGUE_STYLE_PROMPT}${ragContext}${memoriaContext}`

    // 3b. Memory flush: cuando la sesión se acerca al límite de contexto.
    if (MEMORY_FLUSH_ENABLED) {
      const approxUsedTokens = estimateTokens(systemFinal) + estimateTokens(messages)
      const approxRemaining = CONTEXT_RESERVE_TOKENS_FLOOR - approxUsedTokens
      if (approxRemaining <= MEMORY_SOFT_THRESHOLD_TOKENS) {
        systemFinal += `\n\n[Memory Flush]\n${MEMORY_FLUSH_SYSTEM_PROMPT}\n${MEMORY_FLUSH_PROMPT}`
      }
    }

    // 4. Llamar al LLM — [2026-03-11] model se pasa explícito para respetar el avatar
    if (activeProvider === 'openrouter') {
      await chat({
        provider: activeProvider,
        model:    agent.model,   // [2026-03-11] cada avatar usa su propio modelo
        system:   systemFinal,
        messages,
        res
      })
    } else {
      const reply = await chat({
        provider: activeProvider,
        model:    agent.model || process.env.OLLAMA_MODEL,
        system:   systemFinal,
        messages
      })
      res.json({ reply, agentId: agent.id, ragUsed: ragResults.length > 0 })
    }

  } catch (err) {
    console.error('[chat] error completo:', err.response?.data || err.message)
    if (!res.writableEnded) {
      res.status(500).json({ error: 'El modelo no respondió', detail: err.message })
    }
  }
})

// ─── POST /memoria ────────────────────────────────────────────────
// [2026-03-11] Endpoint para que el frontend guarde lo relevante de una sesión.
// El frontend llama esto al cerrar una conversación con una nota breve.
// Ejemplo: POST /memoria { userId: "pepe", agentId: "el_yoyo", nota: "alquiló en el barrio" }

app.post('/memoria', (req, res) => {
  const { userId, agentId, nota, scope } = req.body
  if (!userId || !nota) return res.status(400).json({ error: 'userId y nota requeridos' })
  try {
    escribirMemoria(userId, agentId || 'barrio', nota, scope === 'longterm' ? 'longterm' : 'daily')
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── MEMORY TOOLS ──────────────────────────────────────────────────
// Herramientas para inspección y recuperación de memoria:
//   POST /memory/search  -> keyword/semantic/hybrid sobre archivos de memoria
//   GET  /memory/get     -> lectura directa de archivo/rango

app.post('/memory/search', async (req, res) => {
  const { userId, query, topK, mode } = req.body || {}
  if (!userId || !query) {
    return res.status(400).json({ error: 'userId y query requeridos' })
  }
  try {
    const hits = await memorySearch(MEMORIA_DIR, { userId, query, topK, mode })
    res.json({ ok: true, count: hits.length, hits })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/memory/get', (req, res) => {
  const { userId, file, from, to } = req.query
  if (!userId) return res.status(400).json({ error: 'userId requerido' })
  try {
    const data = memoryGet(MEMORIA_DIR, { userId, file, from, to })
    res.json({ ok: true, ...data })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

// ─── GET /memoria/:userId ─────────────────────────────────────────
// [2026-03-11] Devuelve el perfil de un usuario (para debug o UI futura).

app.get('/memoria/:userId', (req, res) => {
  const memoria = leerMemoria(req.params.userId)
  res.json({ userId: req.params.userId, memoria })
})

// POST /ingest — añadir texto al corpus desde el frontend (para testing)
app.post('/ingest', async (req, res) => {
  const { text, id, type } = req.body
  if (!text) return res.status(400).json({ error: 'text requerido' })
  try {
    const { ingestText } = require('./rag/ingest')
    const count = await ingestText(text, id || Date.now().toString(), { type })
    res.json({ ok: true, chunks: count })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── ARRANQUE ─────────────────────────────────────────────────────
app.listen(PORT, async () => {
  const health = await healthCheck()
  console.log(`
╔═══════════════════════════════════════════╗
║  🇨🇺  La Esquina — Backend v0.2           ║
║  http://localhost:${PORT}                    ║
╠═══════════════════════════════════════════╣
║  Ollama:      ${health.ollama     ? '✅ activo   ' : '❌ inactivo  '}               ║
║  Claude:      ${health.claude     ? '✅ activo   ' : '❌ sin key   '}               ║
║  OpenRouter:  ${health.openrouter ? '✅ activo   ' : '❌ sin key   '}               ║
║  RAG:         ✅ LanceDB local              ║
║  Memoria:     ✅ barrio activo  [2026-03-11]║
╚═══════════════════════════════════════════╝
  `)
})
