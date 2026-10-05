const XLSX = require('xlsx')

class SheetParser {
  // Parse from an in-memory buffer (multer upload)
  parseBuffer(buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellText: true, cellDates: false })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    if (!worksheet['!ref']) throw new Error('The sheet appears to be empty.')
    return this.fromRows(XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }), sheetName)
  }

  // Shared by uploads and Google Sheets: first row is the header, the rest are records
  fromRows(rawRows, sheetName) {
    if (!rawRows.length) throw new Error('The sheet appears to be empty.')
    const width = Math.max(...rawRows.map(r => r.length))
    const headers = Array.from({ length: width }, (_, i) => String(rawRows[0][i] ?? '').trim() || `Column${i + 1}`)

    const rows = rawRows
      .slice(1)
      .map((row, idx) => {
        const record = { _rowIndex: idx + 1 }
        headers.forEach((header, colIdx) => {
          record[header] = row[colIdx] !== undefined ? String(row[colIdx]).trim() : ''
        })
        return record
      })
      .filter(row => headers.some(h => row[h] !== ''))

    return { headers, rows, sheetName }
  }

  // Pulls the spreadsheet id and tab (gid) out of a Google Sheets link
  parseSheetUrl(url) {
    const id = /\/spreadsheets\/d\/([\w-]+)/.exec(String(url || ''))?.[1]
    if (!id) throw new Error('That does not look like a Google Sheets link.')
    const gid = /[#?&]gid=(\d+)/.exec(url)?.[1]
    return { spreadsheetId: id, gid: gid === undefined ? null : Number(gid) }
  }

  isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  }

  validate(parsed, emailColumn) {
    const { headers, rows } = parsed
    const errors = []
    const warnings = []

    if (!headers.includes(emailColumn)) {
      errors.push(`Column "${emailColumn}" not found. Available: ${headers.join(', ')}`)
      return { valid: false, errors, warnings }
    }

    rows.forEach((row, idx) => {
      const email = row[emailColumn]
      if (!email) {
        warnings.push(`Row ${idx + 2}: missing email address (will be skipped)`)
      } else if (!this.isEmail(email)) {
        errors.push(`Row ${idx + 2}: invalid email "${email}"`)
      }
    })

    return { valid: errors.length === 0, errors, warnings }
  }
}

module.exports = new SheetParser()
