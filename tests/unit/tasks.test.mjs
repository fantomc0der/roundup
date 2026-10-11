import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { bin, sandbox } from './helpers.mjs'

function board() {
  const box = sandbox()
  assert.equal(box.run('init', 'build', '--lead', 'l', '--layout', 'tab').status, 0)
  const task = (...args) => box.run('task', 'build', ...args)
  return { box, task }
}

test('add, claim, complete, and dependency unblocking', () => {
  const { task } = board()
  const a = task('add', 'Footer', '--owner', 'fe', '--files', 'src/Modal.tsx')
  assert.equal(a.status, 0, a.stderr)
  assert.equal(a.json.task.id, 1)
  assert.equal(a.json.task.status, 'pending')
  const b = task('add', 'Tests', '--owner', 'qa', '--depends', '1', '--files', 'src/Modal.test.tsx').json
  assert.deepEqual(b.task.dependsOn, [1])
  assert.equal(task('claim', '2', '--as', 'qa').error.code, 'blocked_by')
  assert.equal(task('claim', '1', '--as', 'qa').error.code, 'owned')
  assert.equal(task('claim', '1', '--as', 'fe').json.task.status, 'in_progress')
  assert.equal(task('claim', '1', '--as', 'fe').error.code, 'not_pending')
  assert.equal(task('complete', '1', '--as', 'qa').error.code, 'owned')
  const done = task('complete', '1', '--as', 'fe', '--notes', 'sticky footer').json
  assert.equal(done.task.status, 'done')
  assert.deepEqual(done.unblocked, [2])
  assert.equal(task('claim', '2', '--as', 'qa').json.task.status, 'in_progress')
  const summary = task('list').json.summary
  assert.equal(summary.total, 2)
  assert.equal(summary.done, 1)
  assert.equal(summary.inProgress, 1)
})

test('next prefers owned tasks, then unowned, and reports when nothing is left', () => {
  const { task } = board()
  task('add', 'Shared chore')
  task('add', 'Mine', '--owner', 'fe')
  task('add', 'Theirs', '--owner', 'be')
  assert.equal(task('next', '--as', 'fe').json.task.title, 'Mine')
  assert.equal(task('next', '--as', 'fe').json.task.title, 'Shared chore')
  const none = task('next', '--as', 'fe').json
  assert.equal(none.task, null)
  assert.equal(task('next', '--as', 'be').json.task.title, 'Theirs')
  assert.equal(task('next').error.code, 'usage')
})

test('block and unblock keep the claimed state', () => {
  const { task } = board()
  task('add', 'A', '--owner', 'fe')
  task('claim', '1', '--as', 'fe')
  assert.equal(task('block', '1', '--reason', 'needs the user').json.task.status, 'blocked')
  assert.equal(task('complete', '1', '--as', 'fe').error.code, 'not_in_progress')
  assert.equal(task('unblock', '1').json.task.status, 'in_progress')
  assert.equal(task('unblock', '1').error.code, 'not_blocked')
  task('add', 'B')
  task('block', '2')
  assert.equal(task('unblock', '2').json.task.status, 'pending')
})

test('add warns when two owners list the same file', () => {
  const { task } = board()
  assert.deepEqual(task('add', 'A', '--owner', 'fe', '--files', 'src/x.ts,src/y.ts').json.warnings, [])
  const w = task('add', 'B', '--owner', 'be', '--files', 'src/y.ts').json.warnings
  assert.equal(w.length, 1)
  assert.match(w[0], /task 1 \(fe\) also lists src\/y.ts/)
  assert.equal(task('add', 'C', '--owner', 'fe', '--files', 'src/y.ts').json.warnings.length, 1)
  assert.equal(task('add', 'D', '--depends', '9').error.code, 'no_task')
})

test('a stale lock is reclaimed, a fresh one is waited on', async () => {
  const { box, task } = board()
  const dir = box.run('dir', 'build').json.dir
  const lock = join(dir, 'tasks.lock')
  mkdirSync(lock)
  const old = new Date(Date.now() - 60_000)
  utimesSync(lock, old, old)
  assert.equal(task('add', 'A').status, 0)
  assert.ok(!existsSync(lock))
  mkdirSync(lock)
  const started = Date.now()
  const r = task('add', 'B')
  assert.equal(r.error.code, 'board_busy')
  assert.ok(Date.now() - started >= 4000)
})

test('concurrent claimers never double-claim', async () => {
  const { box, task } = board()
  for (let i = 0; i < 4; i++) task('add', `T${i}`)
  const claimers = Array.from({ length: 8 }, (_, i) =>
    new Promise(resolve => {
      const p = spawn(process.execPath, [bin, 'task', 'build', 'next', '--as', `b${i}`], { env: box.env, cwd: box.dir })
      let out = ''
      p.stdout.on('data', d => (out += d))
      p.on('close', code => resolve({ code, json: JSON.parse(out) }))
    }),
  )
  const results = await Promise.all(claimers)
  assert.ok(results.every(r => r.code === 0))
  const claimed = results.filter(r => r.json.task).map(r => r.json.task.id)
  assert.equal(claimed.length, 4)
  assert.deepEqual([...new Set(claimed)].sort(), [1, 2, 3, 4])
  const final = task('list').json
  assert.equal(final.summary.inProgress, 4)
  assert.equal(new Set(final.tasks.map(t => t.owner)).size, 4)
})
