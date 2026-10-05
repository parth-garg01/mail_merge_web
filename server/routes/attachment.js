const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { v4: uuidv4 } = require('uuid')
const { DATA_DIR } = require('../config')

const ATTACH_DIR = path.join(DATA_DIR, 'attachments')
if (!fs.existsSync(ATTACH_DIR)) fs.mkdirSync(ATTACH_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ATTACH_DIR),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
})

const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } })

const router = express.Router()

router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.json({ success: false, error: 'No file received.' })
  const id = path.basename(req.file.filename, path.extname(req.file.filename))
  res.json({
    success: true,
    attachment: {
      id,
      name: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path
    }
  })
})

router.delete('/:id', (req, res) => {
  const files = fs.readdirSync(ATTACH_DIR)
  const file = files.find(f => path.parse(f).name === req.params.id)
  if (file) {
    try { fs.unlinkSync(path.join(ATTACH_DIR, file)) } catch {}
  }
  res.json({ success: true })
})

module.exports = router
