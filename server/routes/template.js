const express = require('express')
const templateEngine = require('../lib/TemplateEngine')
const router = express.Router()

router.post('/validate', (req, res) => {
  const { subjectTemplate, bodyTemplate, headers } = req.body
  res.json({
    subject: templateEngine.validate(subjectTemplate, headers),
    body: templateEngine.validate(bodyTemplate, headers)
  })
})

router.post('/preview', (req, res) => {
  const { subjectTemplate, bodyTemplate, row } = req.body
  res.json({
    subject: templateEngine.merge(subjectTemplate, row),
    body: templateEngine.merge(bodyTemplate, row)
  })
})

module.exports = router
