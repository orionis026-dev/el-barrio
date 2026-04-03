#!/usr/bin/env node
const path = require('path')
const { ingest } = require('../rag/ingest')

async function main() {
  const input = process.argv[2]
  if (!input) {
    console.error('Usage: npm run ingest -- <path-to-text-file>')
    process.exit(1)
  }

  const filePath = path.resolve(process.cwd(), input)
  const count = await ingest(filePath)
  console.log(`Ingest complete: ${count} chunks`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
