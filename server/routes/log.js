const express = require('express')
const logger = require('../lib/Logger')
const router = express.Router({ mergeParams: true })

router.get('/', (req, res) => {
  res.json(logger.getLogs(req.params.id))
})

router.get('/export', (req, res) => {
  const csv = logger.exportCSVData(req.params.id)
  if (!csv) return res.status(404).json({ error: 'No logs to export.' })
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', `attachment; filename="campaign-${req.params.id}.csv"`)
  res.send(csv)
})

module.exports = router
