import { existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as manifest from './manifest.mjs'
import { CliError, usage } from './errors.mjs'
import { parseArgs } from './args.mjs'

const STALE_LOCK_MS = 10_000
const LOCK_WAIT_MS = 5_000
const STATUSES = ['pending', 'in_progress', 'done', 'blocked']

const boardPath = dir => join(dir, 'tasks.json')
const lockPath = dir => join(dir, 'tasks.lock')

const wait = ms => new Promise(r => setTimeout(r, ms))

// mkdir is atomic on every platform, which makes a directory a cross-process lock.
// A lock older than STALE_LOCK_MS belongs to a process that died holding it.
async function withLock(dir, fn) {
  const lock = lockPath(dir)
  const deadline = Date.now() + LOCK_WAIT_MS
  for (;;) {
    try {
      mkdirSync(lock)
      break
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
      let age = 0
      try {
        age = Date.now() - statSync(lock).mtimeMs
      } catch {
        continue
      }
      if (age > STALE_LOCK_MS) {
        try {
          rmdirSync(lock)
        } catch {
          // Another waiter reclaimed it first; loop and try again.
        }
        continue
      }
      if (Date.now() > deadline) throw new CliError('board_busy', 'the task board is locked by another process', { hint: `Retry, or remove ${lock} if no roundup process is running.` })
      await wait(20 + Math.random() * 30)
    }
  }
  try {
    return await fn()
  } finally {
    try {
      rmdirSync(lock)
    } catch {
      // Already reclaimed as stale by a waiter; nothing to release.
    }
  }
}

function readBoard(dir) {
  const path = boardPath(dir)
  if (!existsSync(path)) return { version: 1, tasks: [] }
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeBoard(dir, board) {
  const path = boardPath(dir)
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(board, null, 2) + '\n')
  renameSync(tmp, path)
}

const summarize = board => ({
  total: board.tasks.length,
  ...Object.fromEntries(STATUSES.map(s => [s === 'in_progress' ? 'inProgress' : s, board.tasks.filter(t => t.status === s).length])),
})

const find = (board, id) => {
  const task = board.tasks.find(t => t.id === Number(id))
  if (!task) throw new CliError('no_task', `no task ${id}`)
  return task
}

const unmet = (board, task) => task.dependsOn.filter(d => board.tasks.find(t => t.id === d)?.status !== 'done')

const claimable = (board, task, as) =>
  task.status === 'pending' && unmet(board, task).length === 0 && (!task.owner || task.owner === as)

function claimTask(board, task, as) {
  if (task.status !== 'pending') throw new CliError('not_pending', `task ${task.id} is ${task.status}`)
  const missing = unmet(board, task)
  if (missing.length) throw new CliError('blocked_by', `task ${task.id} waits on ${missing.join(', ')}`)
  if (task.owner && task.owner !== as) throw new CliError('owned', `task ${task.id} belongs to ${task.owner}`)
  task.owner = as
  task.status = 'in_progress'
  task.claimedAt = new Date().toISOString()
  return task
}

const list = v => (v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : [])

export async function tasks(team, sub, argv) {
  const m = manifest.load(team)
  const dir = m.dir
  const { positionals, options } = parseArgs(argv)
  const as = options.as
  const needAs = () => {
    if (!as) throw usage(`task ${sub} needs --as <teammate name>`)
    return as
  }
  return withLock(dir, async () => {
    const board = readBoard(dir)
    switch (sub) {
      case 'add': {
        const [title] = positionals
        if (!title) throw usage('task add needs a title')
        const files = list(options.files)
        const dependsOn = list(options.depends).map(Number)
        for (const d of dependsOn) find(board, d)
        const id = board.tasks.reduce((max, t) => Math.max(max, t.id), 0) + 1
        const task = { id, title, owner: options.owner ?? null, status: 'pending', dependsOn, files, notes: options.notes ?? '', createdAt: new Date().toISOString(), claimedAt: null, completedAt: null }
        const warnings = []
        for (const other of board.tasks) {
          if (other.status === 'done') continue
          const shared = other.files.filter(f => files.includes(f))
          if (shared.length && other.owner && task.owner && other.owner !== task.owner) {
            warnings.push(`task ${other.id} (${other.owner}) also lists ${shared.join(', ')}; two builders on one file is how build-together goes wrong`)
          }
        }
        board.tasks.push(task)
        writeBoard(dir, board)
        return { task, warnings }
      }
      case 'claim': {
        const task = claimTask(board, find(board, positionals[0]), needAs())
        writeBoard(dir, board)
        return { task }
      }
      case 'next': {
        const name = needAs()
        const task = board.tasks.find(t => claimable(board, t, name) && t.owner === name) ?? board.tasks.find(t => claimable(board, t, name))
        if (!task) return { task: null, remaining: board.tasks.filter(t => t.status === 'pending' && (!t.owner || t.owner === name)).length }
        claimTask(board, task, name)
        writeBoard(dir, board)
        return { task }
      }
      case 'complete': {
        const task = find(board, positionals[0])
        const name = needAs()
        if (task.status !== 'in_progress') throw new CliError('not_in_progress', `task ${task.id} is ${task.status}`)
        if (task.owner !== name) throw new CliError('owned', `task ${task.id} belongs to ${task.owner}`)
        task.status = 'done'
        task.completedAt = new Date().toISOString()
        if (options.notes) task.notes = options.notes
        writeBoard(dir, board)
        const unblocked = board.tasks.filter(t => t.status === 'pending' && t.dependsOn.includes(task.id) && unmet(board, t).length === 0).map(t => t.id)
        return { task, unblocked }
      }
      case 'block': {
        const task = find(board, positionals[0])
        if (task.status === 'done') throw new CliError('done', `task ${task.id} is already done`)
        task.status = 'blocked'
        task.blockedReason = options.reason ?? ''
        writeBoard(dir, board)
        return { task }
      }
      case 'unblock': {
        const task = find(board, positionals[0])
        if (task.status !== 'blocked') throw new CliError('not_blocked', `task ${task.id} is ${task.status}`)
        task.status = task.claimedAt ? 'in_progress' : 'pending'
        delete task.blockedReason
        writeBoard(dir, board)
        return { task }
      }
      case 'list':
        return { team, tasks: board.tasks, summary: summarize(board) }
      default:
        throw usage(`unknown task subcommand '${sub}'`, 'add | claim | next | complete | list | block | unblock')
    }
  })
}
