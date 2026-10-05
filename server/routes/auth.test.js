const test = require('node:test')
const assert = require('node:assert')
const crypto = require('crypto')
const { hashPwd, verifyPwd } = require('./auth')

test('scrypt hashes verify and are salted', () => {
  const a = hashPwd('correct horse')
  assert.ok(verifyPwd('correct horse', a))
  assert.ok(!verifyPwd('wrong horse', a))
  assert.notStrictEqual(a, hashPwd('correct horse'))
})

test('legacy sha256 hashes still unlock', () => {
  const legacy = crypto.createHash('sha256').update('old-pass').digest('hex')
  assert.ok(verifyPwd('old-pass', legacy))
  assert.ok(!verifyPwd('nope', legacy))
})
