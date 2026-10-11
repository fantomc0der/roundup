import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { calls, sandbox } from './helpers.mjs'

test('help and usage errors', () => {
  const box = sandbox()
  assert.equal(box.run().status, 2)
  assert.equal(box.run('help').status, 0)
  const r = box.run('bogus')
  assert.equal(r.status, 2)
  assert.equal(r.error.code, 'usage')
  assert.equal(box.run('init').error.code, 'usage')
  assert.equal(box.run('init', 'modal').error.code, 'usage')
})

test('preflight reports herdr and the pane the lead sits in', () => {
  const inside = sandbox().run('preflight').json
  assert.equal(inside.herdr.running, true)
  assert.equal(inside.insideHerdr, true)
  assert.equal(inside.paneId, 'w1:p1')
  const outside = sandbox({ inside: false }).run('preflight').json
  assert.equal(outside.insideHerdr, false)
  assert.equal(outside.paneId, null)
})

test('init in split layout creates nothing and anchors on the lead pane', () => {
  const box = sandbox()
  const r = box.run('init', 'modal', '--lead', 'lead-1', '--size', '2')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.json.layout, 'split')
  assert.deepEqual(r.json.created, { workspace: false, tab: false })
  assert.equal(r.json.herdr.rootPaneId, 'w1:p1')
  assert.equal(calls(box.herdrState(), 'tab', 'create').length, 0)
  assert.ok(existsSync(join(r.json.dir, 'settings.json')))
  assert.ok(existsSync(join(r.json.dir, 'briefs')))
  assert.ok(existsSync(join(r.json.dir, 'shared')))
})

test('init in tab layout creates a labeled tab in the lead workspace without focusing it', () => {
  const box = sandbox()
  const r = box.run('init', 'modal', '--lead', 'lead-1', '--size', '3')
  assert.equal(r.json.layout, 'tab')
  assert.equal(r.json.created.tab, true)
  const [create] = calls(box.herdrState(), 'tab', 'create')
  assert.ok(create.includes('--no-focus'))
  assert.equal(create[create.indexOf('--label') + 1], 'team:modal')
  assert.equal(create[create.indexOf('--workspace') + 1], 'w1')
})

test('init outside herdr uses the focused workspace, or creates one when none exists', () => {
  const box = sandbox({ inside: false })
  assert.equal(box.run('init', 'a', '--lead', 'l', '--size', '2').json.layout, 'tab')
  const empty = sandbox({ inside: false, state: { workspaces: [], tabs: {}, panes: {} } })
  const r = empty.run('init', 'b', '--lead', 'l', '--size', '2')
  assert.equal(r.json.layout, 'workspace')
  assert.equal(r.json.created.workspace, true)
})

test('init refuses a second open team with the same slug and a bad slug', () => {
  const box = sandbox()
  box.run('init', 'modal', '--lead', 'l')
  assert.equal(box.run('init', 'modal', '--lead', 'l').error.code, 'team_exists')
  assert.equal(box.run('init', 'Modal', '--lead', 'l').error.code, 'bad_team')
})

function spawnTwo(box, layout = 'tab') {
  const init = box.run('init', 'modal', '--lead', 'lead-1', '--layout', layout, '--size', '2')
  assert.equal(init.status, 0, init.stderr)
  const pm = box.run('spawn', 'modal', 'modal-pm', '--role', 'Product manager', '--brief', box.brief('modal-pm'))
  assert.equal(pm.status, 0, pm.stderr)
  const ux = box.run('spawn', 'modal', 'modal-ux', '--role', 'UX specialist', '--kind', 'reviewer', '--brief', box.brief('modal-ux'), '--model', 'sonnet')
  assert.equal(ux.status, 0, ux.stderr)
  return { pm: pm.json, ux: ux.json }
}

test('spawn in tab layout: root pane first, then a split with the ROUNDUP environment', () => {
  const box = sandbox()
  const { pm, ux } = spawnTwo(box)
  assert.equal(pm.placement.kind, 'root')
  assert.equal(pm.kickoff, 'working')
  assert.equal(ux.placement.kind, 'split')
  assert.equal(ux.placement.direction, 'right')
  assert.equal(ux.placement.target, pm.paneId)
  const state = box.herdrState()
  const uxPane = state.panes[ux.paneId]
  const env = Object.fromEntries(uxPane.env.map(e => e.split(/=(.*)/s)))
  assert.equal(env.ROUNDUP_TEAM, 'modal')
  assert.equal(env.ROUNDUP_NAME, 'modal-ux')
  assert.equal(env.ROUNDUP_KIND, 'reviewer')
  assert.equal(env.ROUNDUP_LEAD, 'lead-1')
  assert.ok(env.ROUNDUP_BRIEF.endsWith('modal-ux.md'))
  const claudeArgs = state.agents['modal-ux'].claudeArgs
  assert.equal(claudeArgs[claudeArgs.indexOf('--name') + 1], 'modal-ux')
  assert.equal(claudeArgs[claudeArgs.indexOf('--model') + 1], 'sonnet')
  const sys = claudeArgs[claudeArgs.indexOf('--append-system-prompt') + 1]
  assert.ok(!sys.includes('"'), 'system prompt must not contain double quotes')
  assert.ok(sys.includes('reviewer'))
  assert.ok(state.agents['modal-pm'].prompts[0].startsWith('Read your briefing at'))
  assert.equal(box.manifest('modal').teammates.length, 2)
  assert.equal(state.panes[pm.paneId].label, 'modal-pm')
})

test('spawn in split layout splits off the lead pane, then stacks', () => {
  const box = sandbox()
  const { pm, ux } = spawnTwo(box, 'split')
  assert.deepEqual(pm.placement, { kind: 'split', target: 'w1:p1', direction: 'right' })
  assert.deepEqual(ux.placement, { kind: 'split', target: pm.paneId, direction: 'down' })
  const state = box.herdrState()
  assert.equal(state.panes[pm.paneId].splitFrom, 'w1:p1')
})

test('spawn in workspace layout renames the root tab, then creates one tab per teammate', () => {
  const box = sandbox()
  const { pm, ux } = spawnTwo(box, 'workspace')
  assert.equal(pm.placement.kind, 'root')
  assert.equal(ux.placement.kind, 'tab')
  const state = box.herdrState()
  assert.equal(state.tabs[pm.tabId].label, 'modal-pm')
  assert.equal(state.tabs[ux.tabId].label, 'modal-ux')
  assert.notEqual(pm.tabId, ux.tabId)
})

test('spawn answers the folder-trust dialog only with --auto-trust and survives the stale blocked state', () => {
  const box = sandbox({ state: { startBehavior: { 'modal-pm': 'trust' } } })
  box.run('init', 'modal', '--lead', 'l', '--layout', 'tab')
  const r = box.run('spawn', 'modal', 'modal-pm', '--role', 'PM', '--brief', box.brief('modal-pm'), '--auto-trust')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.json.kickoff, 'working')
  assert.deepEqual(box.herdrState().agents['modal-pm'].keys[0], ['down', 'enter'])
})

test('spawn without --auto-trust reports the dialog, exits 3, and keeps the teammate in the manifest', () => {
  const box = sandbox({ state: { startBehavior: { 'modal-pm': 'trust' } } })
  box.run('init', 'modal', '--lead', 'l', '--layout', 'tab')
  const r = box.run('spawn', 'modal', 'modal-pm', '--role', 'PM')
  assert.equal(r.status, 3)
  assert.equal(r.error.code, 'agent_not_ready')
  assert.match(r.error.data.screen, /trust/)
  assert.equal(box.manifest('modal').teammates[0].name, 'modal-pm')
  assert.equal(box.run('release', 'modal', 'modal-pm').status, 0)
})

test('a login dialog is never answered, even with --auto-trust', () => {
  const box = sandbox({ state: { startBehavior: { 'modal-pm': 'login' } } })
  box.run('init', 'modal', '--lead', 'l', '--layout', 'tab')
  const r = box.run('spawn', 'modal', 'modal-pm', '--role', 'PM', '--auto-trust')
  assert.equal(r.status, 3)
  assert.equal(box.herdrState().agents['modal-pm'].keys, undefined)
})

test('kickoff recovers from a stall by pressing enter on text left in the box', () => {
  const box = sandbox({ state: { promptBehavior: { 'modal-pm': 'stall-typed' } } })
  box.run('init', 'modal', '--lead', 'l', '--layout', 'tab')
  const r = box.run('spawn', 'modal', 'modal-pm', '--role', 'PM', '--brief', box.brief('modal-pm'))
  assert.equal(r.json.kickoff, 'working')
  const a = box.herdrState().agents['modal-pm']
  assert.deepEqual(a.keys, [['enter']])
  assert.equal(a.prompts.length, 1)
})

test('kickoff resends once when the text was lost, and reports stalled after that', () => {
  const box = sandbox({ state: { promptBehavior: { 'modal-pm': 'stall-lost' } } })
  box.run('init', 'modal', '--lead', 'l', '--layout', 'tab')
  assert.equal(box.run('spawn', 'modal', 'modal-pm', '--role', 'PM', '--brief', box.brief('modal-pm')).json.kickoff, 'working')
  assert.equal(box.herdrState().agents['modal-pm'].prompts.length, 2)
  const stuck = sandbox({ state: { promptBehavior: { 'modal-ux': 'stall-lost' }, resendWorks: false } })
  stuck.run('init', 'modal', '--lead', 'l', '--layout', 'tab')
  const r = stuck.run('spawn', 'modal', 'modal-ux', '--role', 'UX', '--brief', stuck.brief('modal-ux'))
  assert.equal(r.status, 0)
  assert.equal(r.json.kickoff, 'stalled')
})

test('spawn defers to a mod that already kicked off', () => {
  const box = sandbox()
  box.run('init', 'modal', '--lead', 'l', '--layout', 'tab')
  // Simulate the mod: a manifest writer that stamps kickoff=mod the moment the entry exists.
  const watcher = spawn(process.execPath, ['-e', `
    const fs = require('fs'); const p = process.argv[1];
    const t = setInterval(() => { try { const m = JSON.parse(fs.readFileSync(p, 'utf8')); const e = m.teammates.find(x => x.name === 'modal-pm');
      if (e && e.kickoff === 'pending') { e.kickoff = 'mod'; fs.writeFileSync(p, JSON.stringify(m)); clearInterval(t) } } catch {} }, 2)
    setTimeout(() => process.exit(0), 3000)
  `, join(box.dir, 'teams', 'modal', 'manifest.json')])
  // The CLI waits five ticks for the mod; a slow tick keeps that window wider than the watcher's startup.
  box.env.ROUNDUP_TICK_MS = '60'
  const r = box.run('spawn', 'modal', 'modal-pm', '--role', 'PM', '--brief', box.brief('modal-pm'))
  watcher.kill()
  assert.equal(r.json.kickoff, 'mod')
  assert.equal(box.herdrState().agents['modal-pm'].prompts, undefined)
})

test('spawn rejects bad names, duplicate names, unknown kinds, and closed teams', () => {
  const box = sandbox({ state: { agents: { taken: { status: 'idle', pane_id: 'w1:p1' } } } })
  box.run('init', 'modal', '--lead', 'l', '--layout', 'tab')
  assert.equal(box.run('spawn', 'modal', 'Bad', '--role', 'x').error.code, 'bad_name')
  assert.equal(box.run('spawn', 'modal', 'taken', '--role', 'x').error.code, 'name_taken')
  assert.equal(box.run('spawn', 'modal', 'pm', '--role', 'x', '--kind', 'boss').error.code, 'bad_kind')
  assert.equal(box.run('spawn', 'modal', 'pm').error.code, 'usage')
  box.run('spawn', 'modal', 'pm', '--role', 'x')
  assert.equal(box.run('spawn', 'modal', 'pm', '--role', 'x').error.code, 'name_taken')
  box.run('close', 'modal')
  assert.equal(box.run('spawn', 'modal', 'ux', '--role', 'x').error.code, 'team_closed')
})

test('status joins the manifest with live herdr state and marks dead sessions gone', () => {
  const box = sandbox()
  spawnTwo(box)
  box.patchState(s => delete s.agents['modal-ux'])
  const r = box.run('status', 'modal').json
  assert.equal(r.teammates.find(t => t.name === 'modal-pm').state, 'working')
  assert.equal(r.teammates.find(t => t.name === 'modal-ux').state, 'gone')
})

test('release types /exit, closes only that pane, and moves the teammate to released', () => {
  const box = sandbox()
  const { pm, ux } = spawnTwo(box)
  const r = box.run('release', 'modal', 'modal-ux')
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(r.json.released, ['modal-ux'])
  assert.equal(r.json.teammates.length, 1)
  const state = box.herdrState()
  assert.ok(state.panes[pm.paneId])
  assert.equal(state.panes[ux.paneId], undefined)
  assert.equal(calls(state, 'pane', 'close').length, 1)
  assert.equal(box.run('release', 'modal', 'modal-ux').error.code, 'no_teammate')
})

test('close releases everyone, closes the tab it created, and leaves the lead pane alone', () => {
  const box = sandbox()
  const { pm } = spawnTwo(box)
  const tabId = pm.tabId
  const r = box.run('close', 'modal')
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.json.status, 'closed')
  const state = box.herdrState()
  assert.equal(state.tabs[tabId], undefined)
  assert.ok(state.panes['w1:p1'], 'the lead pane must survive')
  assert.deepEqual(Object.keys(state.agents), [])
  assert.equal(box.run('status', 'modal').json.status, 'closed')
})

test('close in split layout closes panes but never the tab the lead lives in', () => {
  const box = sandbox()
  spawnTwo(box, 'split')
  box.run('close', 'modal')
  const state = box.herdrState()
  assert.ok(state.tabs['w1:t1'])
  assert.ok(state.panes['w1:p1'])
  assert.equal(calls(state, 'tab', 'close').length, 0)
})

test('close in workspace layout closes the workspace it created', () => {
  const box = sandbox()
  spawnTwo(box, 'workspace')
  box.run('close', 'modal')
  const state = box.herdrState()
  assert.deepEqual(state.workspaces.map(w => w.workspace_id), ['w1'])
  assert.equal(calls(state, 'workspace', 'close').length, 1)
})

test('list, dir, relead, keys, wait, and prompt', () => {
  const box = sandbox()
  spawnTwo(box)
  assert.deepEqual(box.run('list').json.teams.map(t => t.team), ['modal'])
  assert.ok(box.run('dir', 'modal').json.exists)
  assert.equal(box.run('relead', 'modal', '--lead', 'lead-2', '--lead-session-id', 'abc').json.lead, 'lead-2')
  assert.equal(box.manifest('modal').leadSessionId, 'abc')
  assert.deepEqual(box.run('keys', 'modal', 'modal-pm', 'esc').json.sent, ['esc'])
  assert.equal(box.run('wait', 'modal', 'modal-pm', '--until', 'working', '--timeout', '100').json.state, 'working')
  assert.equal(box.run('prompt', 'modal', 'modal-pm', 'Send me your position').json.state, 'working')
  assert.equal(box.run('read', 'modal', 'modal-pm', '--visible').stdout.includes('Send me your position'), true)
})
