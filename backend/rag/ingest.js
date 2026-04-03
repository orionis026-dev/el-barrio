// rag/ingest.js — Ingesta de documentos al corpus vectorial
const fs   = require('fs')
const path = require('path')
require('dotenv').config()

const DB_PATH     = process.env.LANCEDB_PATH || './data/lancedb'
const EMBED_MODEL = process.env.EMBEDDINGS_MODEL || 'Xenova/multilingual-e5-small'

function splitIntoChunks(text, wordsPerChunk = 250, overlap = 40) {
  const words  = text.replace(/\s+/g, ' ').trim().split(' ')
  const chunks = []
  const step   = wordsPerChunk - overlap
  for (let i = 0; i < words.length; i += step) {
    const chunk = words.slice(i, i + wordsPerChunk).join(' ')
    if (chunk.split(' ').length > 30) chunks.push(chunk) // descartar chunks muy pequeños
  }
  return chunks
}

async function ingest(textFile, meta = {}) {
  const { pipeline } = await import('@xenova/transformers')
  const lancedb      = require('vectordb')

  const embedder = await pipeline('feature-extraction', EMBED_MODEL)
  const db       = await lancedb.connect(path.resolve(DB_PATH))
  const text     = fs.readFileSync(textFile, 'utf8')
  const chunks   = splitIntoChunks(text)

  console.log(`[ingest] ${textFile} → ${chunks.length} chunks`)

  const records = []
  for (let i = 0; i < chunks.length; i++) {
    const output = await embedder(chunks[i], { pooling: 'mean', normalize: true })
    records.push({
      vector: Array.from(output.data),
      text:   chunks[i],
      source: path.basename(textFile),
      type:   meta.type || 'general',
      id:     `${path.basename(textFile)}_${i}`
    })
    if (i % 10 === 0) process.stdout.write(`  ${i}/${chunks.length}\r`)
  }

  try {
    const existing = await db.openTable('corpus')
    await existing.add(records)
  } catch {
    await db.createTable('corpus', records)
  }

  console.log(`[ingest] ✅ ${records.length} vectores guardados`)
  return records.length
}

// Ingesta de texto directo (sin archivo)
async function ingestText(text, id, meta = {}) {
  const tmpFile = path.join('/tmp', `${id}.txt`)
  fs.writeFileSync(tmpFile, text)
  const count = await ingest(tmpFile, meta)
  fs.unlinkSync(tmpFile)
  return count
}

module.exports = { ingest, ingestText }
