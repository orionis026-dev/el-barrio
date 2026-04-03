// providers/llm.js — Abstracción sobre Ollama y Claude API
// Cambia MODEL_PROVIDER en .env para alternar. El resto del código no cambia.

const axios = require('axios')
require('dotenv').config()

const PROVIDER  = process.env.MODEL_PROVIDER || 'openrouter'
const OLLAMA_URL = process.env.OLLAMA_URL    || 'http://localhost:11434'
const OPENROUTER_FALLBACK_MODEL =
  process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct'

// ─── OLLAMA ───────────────────────────────────────────────────────
async function chatOllama({ model, system, messages }) {
  const response = await axios.post(`${OLLAMA_URL}/api/chat`, {
    model: model || process.env.OLLAMA_MODEL,
    stream: false,
    options: { temperature: 0.85, top_p: 0.9 },
    messages: [
      { role: 'system', content: system },
      ...messages
    ]
  }, { timeout: 60000 })

  return response.data.message.content
}

// ─── CLAUDE API ───────────────────────────────────────────────────
async function chatClaude({ system, messages }) {
  const response = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system,
      messages
    },
    {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      }
    }
  )
  return response.data.content[0].text
}

//  OPENROUTER sin stream — Fallback por si el stream falla.
// [2026-03-11] BUG FIX: agent.model no estaba definido en este scope.
//              Ahora recibe `model` como parámetro explícito.
async function chatOpenRouter({ model, system, messages }) {
  const primaryModel = model || OPENROUTER_FALLBACK_MODEL
  const payloadBase = {
    messages: [
      { role: 'system', content: system },
      ...messages
    ],
    temperature: 0.85,
    max_tokens: 512
  }

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      { ...payloadBase, model: primaryModel },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'La Esquina',
          'Content-Type': 'application/json'
        }
      }
    )
    return response.data.choices[0].message.content
  } catch (err) {
    const shouldFallback =
      err.response?.status === 400 &&
      primaryModel !== OPENROUTER_FALLBACK_MODEL

    if (!shouldFallback) throw err

    console.warn(
      `[OpenRouter] modelo "${primaryModel}" rechazado (400), reintentando con "${OPENROUTER_FALLBACK_MODEL}".`
    )

    const retry = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      { ...payloadBase, model: OPENROUTER_FALLBACK_MODEL },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'La Esquina',
          'Content-Type': 'application/json'
        }
      }
    )

    return retry.data.choices[0].message.content
  }
}

// Openrouter con stream —
// Escribe tokens directamente en `res` (Express response) via SSE.
// El frontend los va leyendo uno a uno y llena la burbuja en tiempo real.
// Flujo: OpenRouter → chunks → this fn → SSE → frontend
// [2026-03-11] Añadido parámetro `model` para respetar el modelo del avatar.
async function chatOpenRouterStream({ model, system, messages, res }) {
  const primaryModel = model || OPENROUTER_FALLBACK_MODEL
  const payloadBase = {
    stream: true,
    messages: [
      { role: 'system', content: system },
      ...messages
    ],
    temperature: 0.85,
    max_tokens: 512
  }

  let response
  try {
    response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      { ...payloadBase, model: primaryModel },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'La Esquina',
          'Content-Type': 'application/json'
        },
        responseType: 'stream'
      }
    )
  } catch (err) {
    const shouldFallback =
      err.response?.status === 400 &&
      primaryModel !== OPENROUTER_FALLBACK_MODEL

    if (!shouldFallback) throw err

    console.warn(
      `[OpenRouter][stream] modelo "${primaryModel}" rechazado (400), reintentando con "${OPENROUTER_FALLBACK_MODEL}".`
    )

    response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      { ...payloadBase, model: OPENROUTER_FALLBACK_MODEL },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'La Esquina',
          'Content-Type': 'application/json'
        },
        responseType: 'stream'
      }
    )
  }

  // Cabeceras SSE — formato estándar que entiende el navegador
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:5173')

  let buffer = ''
  response.data.on('data', chunk => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue

      const data = trimmedLine.slice(6).trim()

      if (data === '[DONE]') {
        res.write('data: [DONE]\n\n')
        res.end()
        return
      }

      try {
        const parsed = JSON.parse(data)
        const token  = parsed.choices?.[0]?.delta?.content
        if (token) {
          res.write(`data: ${JSON.stringify({ token })}\n\n`)
        }
      } catch {
        // Chunk malformado o incompleto — ignorar
      }
    }
  })

  response.data.on('error', err => {
    console.error('[stream] error en OpenRouter:', err.message)
    if (!res.writableEnded) res.end()
  })

  response.data.on('end', () => {
    if (!res.writableEnded) res.end()
  })
}

// ─── chat() — función pública ─────────────────────────────────────
// Si llamas chat({ ..., res }) → activa stream (solo OpenRouter por ahora)
// Si llamas chat({ ... })     → respuesta completa de una vez
// [2026-03-11] `model` ahora se propaga a chatOpenRouter y chatOpenRouterStream
async function chat({ provider, model, system, messages, res }) {
  const p = provider || PROVIDER

  if (res && p === 'openrouter') {
    return await chatOpenRouterStream({ model, system, messages, res }) // [2026-03-11] fix
  }

  try {
    if (p === 'claude')     return await chatClaude({ system, messages })
    if (p === 'openrouter') return await chatOpenRouter({ model, system, messages }) // [2026-03-11] fix
    return await chatOllama({ model, system, messages })
  } catch (err) {
    console.warn(`[LLM] ${p} falló:`, err.message)
    throw err
  }
}

// Estado de salud de los providers
async function healthCheck() {
  const status = { ollama: false, claude: false, openrouter: false }
  try {
    await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 3000 })
    status.ollama = true
  } catch {}
  if (process.env.ANTHROPIC_API_KEY?.startsWith('sk-ant-')) {
    status.claude = true
  }
  if (process.env.OPENROUTER_API_KEY?.length > 10) {
    status.openrouter = true
  }
  return status
}

module.exports = { chat, healthCheck }
