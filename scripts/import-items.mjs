import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import readXlsxFile from 'read-excel-file/node'

const inputPath = process.argv[2]
if (!inputPath) {
  console.error('Usage: node scripts/import-items.mjs /absolute/path/to/liste_complete_367_items_nexternat.xlsx')
  process.exit(1)
}

const resolved = path.resolve(inputPath)
if (!fs.existsSync(resolved)) {
  console.error(`File not found: ${resolved}`)
  process.exit(1)
}

const rowsFromFile = await readXlsxFile(resolved, { sheet: 'Items' })
const sheetRows =
  Array.isArray(rowsFromFile) &&
  rowsFromFile.length > 0 &&
  typeof rowsFromFile[0] === 'object' &&
  rowsFromFile[0] !== null &&
  'data' in rowsFromFile[0]
    ? rowsFromFile[0].data
    : rowsFromFile

if (!sheetRows || sheetRows.length < 2) {
  console.error('Sheet "Items" not found or empty in workbook')
  process.exit(1)
}

const headers = new Map()
sheetRows[0].forEach((cell, idx) => {
  headers.set(String(cell ?? '').trim(), idx)
})

const requiredHeaders = ['Item', 'Description_courte', 'Tags_codes', 'Tags_libelles']
for (const key of requiredHeaders) {
  if (!headers.has(key)) {
    console.error(`Missing required column: ${key}`)
    process.exit(1)
  }
}

function toCellText(value) {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') {
      return value.text
    }
    if ('result' in value && value.result !== undefined && value.result !== null) {
      return String(value.result)
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? '').join('')
    }
  }
  return String(value)
}

const rows = []
for (let rowIndex = 1; rowIndex < sheetRows.length; rowIndex += 1) {
  const row = sheetRows[rowIndex]
  const itemValue = toCellText(row[headers.get('Item')])
  if (itemValue.trim() === '') {
    continue
  }

  rows.push({
    Item: itemValue,
    Description_courte: toCellText(row[headers.get('Description_courte')]),
    Tags_codes: toCellText(row[headers.get('Tags_codes')]),
    Tags_libelles: toCellText(row[headers.get('Tags_libelles')]),
  })
}

const items = rows
  .map((row) => ({
    itemNumber: Number(row.Item),
    shortDescription: String(row.Description_courte || '').trim(),
    tagCodes: String(row.Tags_codes || '')
      .split(';')
      .map((value) => value.trim())
      .filter(Boolean),
    tagLabels: String(row.Tags_libelles || '')
      .split(';')
      .map((value) => value.trim())
      .filter(Boolean),
  }))
  .sort((a, b) => a.itemNumber - b.itemNumber)

const output = path.resolve('src/data/items.json')
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${JSON.stringify(items, null, 2)}\n`)

console.log(`Imported ${items.length} items to ${output}`)
