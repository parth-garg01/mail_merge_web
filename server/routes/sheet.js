const express = require('express')
const multer = require('multer')
const sheetParser = require('../lib/SheetParser')
const gmailClient = require('../lib/GmailClient')
const router = express.Router()

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.json({ success: false, error: 'No file received.' })
    const data = sheetParser.parseBuffer(req.file.buffer, req.file.originalname)
    res.json({ success: true, data })
  } catch (err) {
    res.json({ success: false, error: err.message })
  }
})

// Import straight from a Google Sheets link instead of an uploaded file
router.post('/google', async (req, res) => {
  try {
    const { values, sheetName } = await gmailClient.readSheet(sheetParser.parseSheetUrl(req.body.url))
    res.json({ success: true, data: sheetParser.fromRows(values, sheetName) })
  } catch (err) {
    res.json({ success: false, error: err.message })
  }
})

router.post('/validate', (req, res) => {
  const { parsedData, emailColumn } = req.body
  const result = sheetParser.validate(parsedData, emailColumn)
  res.json(result)
})

module.exports = router
