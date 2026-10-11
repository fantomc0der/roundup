import { test } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sandbox } from './helpers.mjs'

// The wrapper is exercised in a child process so the env knobs apply cleanly.
const script = `
import * as herdr from ${JSON.stringify(new URL('../../src/herdr.mjs', import.meta.url).href)}
const what = process.argv[2]
try {
  if (what === 'names') console.log(JSON.stringify(herdr.liveAgentNames()))
  if (what === 'state') console.log(JSON.stringify(herdr.agentState(process.argv[3])))
  if (what === 'throw') herdr.json(['agent', 'get', 'missing'])
  if (what === 'status') console.log(JSON.stringify(herdr.serverStatus().running))
  if (what === 'version') console.log(JSON.stringify(herdr.version()))
} catch (e) { console.log(JSON.stringify({ code: e.code, message: e.message })) }
`

import { spawnSync } from 'node:child_process'

const runProbe = (box, ...args) => {
  const file = join(box.dir, 'probe.mjs')
  writeFileSync(file, script)
  const r = spawnSync(process.execPath, [file, ...args], { encoding: 'utf8', env: box.env })
  return JSON.parse(r.stdout.trim())
}

test('strips CRLF from herdr output before parsing names and ids', () => {
  const box = sandbox({ state: { crlf: true, agents: { pm: { status: 'idle', pane_id: 'w1:p1' } } } })
  assert.deepEqual(runProbe(box, 'names'), ['pm'])
  assert.equal(runProbe(box, 'version'), '0.9.3-fake')
})

test('skips agents without a name, such as the lead pane', () => {
  const box = sandbox({ state: { agents: { ux: { status: 'working', pane_id: 'w1:p2' } } } })
  assert.deepEqual(runProbe(box, 'names'), ['ux'])
})

test('agentState answers gone for an unknown agent and raises typed errors otherwise', () => {
  const box = sandbox()
  assert.equal(runProbe(box, 'state', 'nobody'), 'gone')
  assert.deepEqual(runProbe(box, 'throw').code, 'agent_not_found')
})

test('serverStatus reads the running flag out of the text report', () => {
  assert.equal(runProbe(sandbox(), 'status'), true)
  assert.equal(runProbe(sandbox({ state: { serverDown: true } }), 'status'), false)
})
