const fs = require('fs')
const path = require('path')

let embedder = null
const searchCache = new Map()
const MEMORY_EMBED_MODEL = process.env.MEMORY_EMBEDDINGS_MODEL || process.env.EMBEDDINGS_MODEL || 'Xenova/multilingual-e5-small'
const CONTEXT_PRUNING_MODE = process.env.CONTEXT_PRUNING_MODE || 'cache-ttl'
const MEMORY_SEARCH_CACHE_ENABLED = String(process.env.MEMORY_SEARCH_CACHE_ENABLED || 'true') !== 'false'

function parseDurationMs(input, fallbackMs) {
  const raw = String(input || '').trim().toLowerCase()
  if (!raw) return fallbackMs
  const m = raw.match(/^(\d+)\s*(ms|s|m|h)?$/)
  if (!m) return fallbackMs
  const n = Number(m[1])
  const unit = m[2] || 'ms'
  if (unit === 'ms') return n
  if (unit === 's') return n * 1000
  if (unit === 'm') return n * 60 * 1000
  if (unit === 'h') return n * 60 * 60 * 1000
  return fallbackMs
}

function normalizeHybridWeights(vectorWeightRaw, textWeightRaw) {
  const vw = Number(vectorWeightRaw)
  const tw = Number(textWeightRaw)
  const v = Number.isFinite(vw) && vw >= 0 ? vw : 0.7
  const t = Number.isFinite(tw) && tw >= 0 ? tw : 0.3
  const total = v + t
  if (!total) return { vectorWeight: 0.7, textWeight: 0.3 }
  return { vectorWeight: v / total, textWeight: t / total }
}

function pruneSearchCache(now = Date.now()) {
  if (CONTEXT_PRUNING_MODE !== 'cache-ttl') return
  for (const [k, v] of searchCache.entries()) {
    if (!v || v.expiresAt <= now) searchCache.delete(k)
  }
}

function sanitizeUserId(userId) {
  return String(userId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64)
}

function getUserMemoryPaths(baseDir, rawUserId, ensureDirs = true) {
  const userId = sanitizeUserId(rawUserId)
  if (!userId) return null

  const userDir = path.join(baseDir, userId)
  const dailyDir = path.join(userDir, 'daily')
  const profileFile = path.join(userDir, 'MEMORY.md')
  const legacyFile = path.join(baseDir, `${userId}.md`)

  if (ensureDirs) fs.mkdirSync(dailyDir, { recursive: true })

  const dateStamp = (d) => d.toISOString().slice(0, 10)
  const today = new Date()
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)

  return {
    userId,
    userDir,
    dailyDir,
    profileFile,
    legacyFile,
    todayFile: path.join(dailyDir, `${dateStamp(today)}.md`),
    yesterdayFile: path.join(dailyDir, `${dateStamp(yesterday)}.md`)
  }
}

function readMemoryContext(baseDir, userId) {
  const p = getUserMemoryPaths(baseDir, userId, true)
  if (!p) return ''

  const sections = []
  const readIfExists = (file, title) => {
    if (!fs.existsSync(file)) return
    const body = fs.readFileSync(file, 'utf8').trim()
    if (!body) return
    sections.push(`[${title}]\n${body}`)
  }

  readIfExists(p.profileFile, 'MEMORIA LARGO PLAZO')
  readIfExists(p.yesterdayFile, 'DIARIO AYER')
  readIfExists(p.todayFile, 'DIARIO HOY')
  readIfExists(p.legacyFile, 'MEMORIA LEGACY')

  return sections.join('\n\n')
}

function writeMemoryNote(baseDir, userId, agentId, note, scope = 'daily') {
  const p = getUserMemoryPaths(baseDir, userId, true)
  if (!p) throw new Error('userId inválido')

  const target = scope === 'longterm' ? p.profileFile : p.todayFile
  const date = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const line = `- [${date}] [${agentId}] ${String(note || '').trim()}\n`
  fs.appendFileSync(target, line, 'utf8')
}

function listMemoryFiles(baseDir, userId) {
  const p = getUserMemoryPaths(baseDir, userId, true)
  if (!p) return []

  const files = []
  if (fs.existsSync(p.profileFile)) files.push(p.profileFile)
  if (fs.existsSync(p.yesterdayFile)) files.push(p.yesterdayFile)
  if (fs.existsSync(p.todayFile)) files.push(p.todayFile)
  if (fs.existsSync(p.dailyDir)) {
    const allDaily = fs.readdirSync(p.dailyDir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => path.join(p.dailyDir, f))
    for (const file of allDaily) {
      if (!files.includes(file)) files.push(file)
    }
  }
  if (fs.existsSync(p.legacyFile)) files.push(p.legacyFile)
  return files
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñü]+/gi, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2)
}

function keywordScore(queryTerms, candidateText) {
  if (!queryTerms.length) return 0
  const hay = String(candidateText || '').toLowerCase()
  let hits = 0
  for (const term of queryTerms) {
    if (hay.includes(term)) hits += 1
  }
  return hits / queryTerms.length
}

async function getEmbedder() {
  if (embedder) return embedder
  const { pipeline } = await import('@xenova/transformers')
  embedder = await pipeline('feature-extraction', MEMORY_EMBED_MODEL)
  return embedder
}

function cosine(a, b) {
  let dot = 0
  let na = 0
  let nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const x = a[i]
    const y = b[i]
    dot += x * y
    na += x * x
    nb += y * y
  }
  if (!na || !nb) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function readLineEntries(file) {
  const content = fs.readFileSync(file, 'utf8')
  const lines = content.split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].trim()
    if (!text) continue
    out.push({
      file,
      lineStart: i + 1,
      lineEnd: i + 1,
      text
    })
  }
  return out
}

async function memorySearch(baseDir, {
  userId,
  query,
  topK = 5,
  mode = 'hybrid', // keyword | semantic | hybrid
  vectorWeight = process.env.MEMORY_VECTOR_WEIGHT,
  textWeight = process.env.MEMORY_TEXT_WEIGHT
}) {
  const cleanUserId = sanitizeUserId(userId)
  if (!cleanUserId) return []
  if (!String(query || '').trim()) return []

  const ttlMs = parseDurationMs(process.env.CONTEXT_CACHE_TTL || '5m', 5 * 60 * 1000)
  const { vectorWeight: vw, textWeight: tw } = normalizeHybridWeights(vectorWeight, textWeight)
  const normalizedMode = ['keyword', 'semantic', 'hybrid'].includes(mode) ? mode : 'hybrid'
  const cacheKey = `${cleanUserId}::${normalizedMode}::${Number(topK) || 5}::${vw.toFixed(3)}::${tw.toFixed(3)}::${String(query).trim().toLowerCase()}`

  if (MEMORY_SEARCH_CACHE_ENABLED) {
    pruneSearchCache()
    const cached = searchCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.results
    }
  }

  const files = listMemoryFiles(baseDir, cleanUserId)
  if (!files.length) return []

  const queryTerms = tokenize(query)
  let candidates = []
  for (const file of files) {
    candidates = candidates.concat(readLineEntries(file))
  }
  if (!candidates.length) return []

  for (const c of candidates) {
    c.keywordScore = keywordScore(queryTerms, c.text)
  }

  // Primario: keyword para filtrar candidatos baratos
  candidates.sort((a, b) => b.keywordScore - a.keywordScore)
  const keywordTop = candidates.slice(0, 30)

  // Solo si pidieron semántica (o hybrid), rerank semántico sobre top keyword
  if (normalizedMode === 'semantic' || normalizedMode === 'hybrid') {
    try {
      const emb = await getEmbedder()
      const q = await emb(query, { pooling: 'mean', normalize: true })
      const qv = Array.from(q.data)
      for (const c of keywordTop) {
        const r = await emb(c.text, { pooling: 'mean', normalize: true })
        c.semanticScore = cosine(qv, Array.from(r.data))
      }
    } catch (err) {
      // fallback silencioso a keyword si falla embedding
      for (const c of keywordTop) c.semanticScore = 0
    }
  } else {
    for (const c of keywordTop) c.semanticScore = 0
  }

  for (const c of keywordTop) {
    if (normalizedMode === 'keyword') {
      c.score = c.keywordScore
    } else if (normalizedMode === 'semantic') {
      c.score = c.semanticScore
    } else {
      c.score = (c.keywordScore * tw) + (c.semanticScore * vw)
    }
  }

  keywordTop.sort((a, b) => b.score - a.score)

  const results = keywordTop
    .slice(0, Math.max(1, Math.min(Number(topK) || 5, 20)))
    .map((c) => ({
      score: Number(c.score.toFixed(4)),
      keywordScore: Number((c.keywordScore || 0).toFixed(4)),
      semanticScore: Number((c.semanticScore || 0).toFixed(4)),
      file: path.relative(baseDir, c.file),
      lineStart: c.lineStart,
      lineEnd: c.lineEnd,
      text: c.text
    }))

  if (MEMORY_SEARCH_CACHE_ENABLED) {
    searchCache.set(cacheKey, {
      expiresAt: Date.now() + ttlMs,
      results
    })
  }

  return results
}

function memoryGet(baseDir, {
  userId,
  file,
  from = 1,
  to = 200
}) {
  const p = getUserMemoryPaths(baseDir, userId, true)
  if (!p) throw new Error('userId inválido')

  const normalizedFile = String(file || '').trim() || 'MEMORY.md'
  const fullPath = path.resolve(p.userDir, normalizedFile)
  const allowedRoot = path.resolve(p.userDir)
  if (!fullPath.startsWith(allowedRoot)) {
    throw new Error('ruta fuera de memoria de usuario')
  }
  if (!fs.existsSync(fullPath)) {
    throw new Error('archivo no existe')
  }

  const lines = fs.readFileSync(fullPath, 'utf8').split('\n')
  const start = Math.max(1, Number(from) || 1)
  const end = Math.min(lines.length, Math.max(start, Number(to) || start))
  const selected = lines.slice(start - 1, end).join('\n')

  return {
    userId: p.userId,
    file: path.relative(baseDir, fullPath),
    from: start,
    to: end,
    totalLines: lines.length,
    content: selected
  }
}

module.exports = {
  sanitizeUserId,
  getUserMemoryPaths,
  readMemoryContext,
  writeMemoryNote,
  memorySearch,
  memoryGet
}
