const test = require('node:test')
const assert = require('node:assert')
const XLSX = require('xlsx')
const parser = require('./SheetParser')

test('fromRows maps headers, trims, drops blank rows and keeps row numbers', () => {
  const { headers, rows } = parser.fromRows([
    ['Name', ' Email ', ''],
    ['Asha', ' asha@x.com ', 'note'],
    [],
    ['Ravi', 'ravi@x.com']
  ], 'Sheet1')
  assert.deepStrictEqual(headers, ['Name', 'Email', 'Column3'])
  assert.deepStrictEqual(rows, [
    { _rowIndex: 1, Name: 'Asha', Email: 'asha@x.com', Column3: 'note' },
    { _rowIndex: 3, Name: 'Ravi', Email: 'ravi@x.com', Column3: '' }
  ])
})

test('uploaded workbooks go through the same path', () => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Email'], ['a@b.co']]), 'People')
  const parsed = parser.parseBuffer(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
  assert.deepStrictEqual(parsed, { headers: ['Email'], rows: [{ _rowIndex: 1, Email: 'a@b.co' }], sheetName: 'People' })
})

test('parseSheetUrl reads the id and tab', () => {
  assert.deepStrictEqual(
    parser.parseSheetUrl('https://docs.google.com/spreadsheets/d/1AbC-d_9/edit?gid=42#gid=42'),
    { spreadsheetId: '1AbC-d_9', gid: 42 }
  )
  assert.deepStrictEqual(
    parser.parseSheetUrl('https://docs.google.com/spreadsheets/d/1AbC/edit'),
    { spreadsheetId: '1AbC', gid: null }
  )
  assert.throws(() => parser.parseSheetUrl('https://example.com/sheet'))
})
