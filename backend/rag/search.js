// rag/search.js — Búsqueda vectorial local con LanceDB
const path = require('path')
require('dotenv').config()

let embedder = null
let db = null
let table = null

const DB_PATH     = process.env.LANCEDB_PATH || './data/lancedb'
const EMBED_MODEL = process.env.EMBEDDINGS_MODEL || 'Xenova/multilingual-e5-small'
const TOP_K       = parseInt(process.env.RAG_TOP_K || '3')

async function getEmbedder() {
  if (embedder) return embedder
  // Importación dinámica porque @xenova/transformers es ESM
  const { pipeline } = await import('@xenova/transformers')
  embedder = await pipeline('feature-extraction', EMBED_MODEL)
  return embedder
}

async function getTable() {
  if (table) return table
  const lancedb = require('vectordb')
  db = await lancedb.connect(path.resolve(DB_PATH))
  try {
    table = await db.openTable('corpus')
    return table
  } catch {
    return null // corpus vacío todavía
  }
}

async function search(query, topK = TOP_K) {
  try {
    const [embed, tbl] = await Promise.all([getEmbedder(), getTable()])
    if (!tbl) return [] // sin corpus aún, el agente responde sin contexto

    const output = await embed(query, { pooling: 'mean', normalize: true })
    const results = await tbl
      .search(Array.from(output.data))
      .limit(topK)
      .execute()

    return results.map(r => r.text)
  } catch (err) {
    console.warn('[RAG] search error:', err.message)
    return []
  }
}

module.exports = { search }
