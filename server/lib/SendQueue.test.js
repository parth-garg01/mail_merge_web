const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

// Keep test data out of the real app data directory
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mmw-test-'))
const queue = require('./SendQueue')

const row = (i, Email) => ({ _rowIndex: i, Email, Name: `n${i}` })

test('appendNew only queues addresses it has not seen', () => {
  queue.initQueue('c1', [row(1, 'a@x.com'), row(2, 'b@x.com')], 'Email')

  const added = queue.appendNew('c1', [
    row(1, 'a@x.com'),
    row(2, 'B@X.com'),
    row(3, 'c@x.com'),
    row(4, 'c@x.com'),
    row(5, ''),
    row(6, 'half-typed@')
  ], 'Email')

  assert.deepStrictEqual(added.map(r => r.email), ['c@x.com'])
  assert.strictEqual(added[0].status, 'pending')
  assert.strictEqual(queue.getQueue('c1').length, 3)
  assert.deepStrictEqual(queue.appendNew('c1', [row(3, 'c@x.com')], 'Email'), [])
})

test('recoverSending puts interrupted sends back in line', () => {
  const [first] = queue.initQueue('c2', [row(1, 'a@x.com'), row(2, 'b@x.com')], 'Email')
  queue.updateStatus('c2', first.id, 'sending')
  queue.recoverSending('c2')
  assert.deepStrictEqual(queue.getQueue('c2').map(r => r.status), ['pending', 'pending'])
})
