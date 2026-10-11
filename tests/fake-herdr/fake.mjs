// A stand-in for the herdr CLI. State lives in the JSON file named by
// ROUNDUP_FAKE_STATE; every invocation loads it, applies the command, records the
// call under `calls`, and saves it. Tests seed the state and inspect the calls.
//
// Scripting knobs in the state file:
//   startBehavior[name]: 'ok' (default) | 'trust' (first start answers agent_not_ready with a trust dialog) | 'login' (same, with a login prompt)
//   promptBehavior[name]: 'ok' (default) | 'stall-typed' (first --wait prompt stalls with the text left in the box) | 'stall-lost' (first --wait prompt stalls, nothing on screen)
//   agents[name].statusScript: statuses handed out one per `agent get` before settling on `status`
//   agents[name].screen: what `agent read` returns
import { readFileSync, writeFileSync } from 'node:fs'

const file = process.env.ROUNDUP_FAKE_STATE
const state = JSON.parse(readFileSync(file, 'utf8'))
state.calls ??= []
state.workspaces ??= []
state.tabs ??= {}
state.panes ??= {}
state.agents ??= {}
state.startBehavior ??= {}
state.promptBehavior ??= {}
state.nextId ??= 100

const argv = process.argv.slice(2)
state.calls.push(argv)

const eol = state.crlf ? '\r\n' : '\n'
const out = v => process.stdout.write((typeof v === 'string' ? v : JSON.stringify(v)) + eol)
const fail = (code, message, status = 1) => {
  out({ error: { code, message }, id: 'fake' })
  finish(status)
}
const finish = status => {
  writeFileSync(file, JSON.stringify(state, null, 2))
  process.exit(status)
}
const flag = (name, dflt) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : dflt
}
const flags = name => argv.flatMap((a, i) => (a === name ? [argv[i + 1]] : []))
const id = prefix => `${prefix}${state.nextId++}`

const agentIn = paneId => Object.entries(state.agents).find(([, a]) => a.pane_id === paneId)?.[0]
const target = t => (state.agents[t] ? t : agentIn(t))

const newPane = (workspace_id, tab_id, env) => {
  const pane_id = `${workspace_id}:p${state.nextId++}`
  state.panes[pane_id] = { pane_id, tab_id, workspace_id, env, label: null }
  return pane_id
}
const newTab = (workspace_id, label, env) => {
  const tab_id = `${workspace_id}:t${state.nextId++}`
  state.tabs[tab_id] = { tab_id, workspace_id, label }
  const root = newPane(workspace_id, tab_id, env)
  return { tab: { tab_id, label }, root_pane: { pane_id: root } }
}
const closePane = pane_id => {
  const name = agentIn(pane_id)
  if (name) delete state.agents[name]
  delete state.panes[pane_id]
}
const closeTab = tab_id => {
  for (const p of Object.values(state.panes)) if (p.tab_id === tab_id) closePane(p.pane_id)
  delete state.tabs[tab_id]
}

const [group, sub, ...rest] = argv
if (group === '--version') {
  out('herdr 0.9.3-fake')
  finish(0)
}
if (group === 'status') {
  out(state.serverDown ? 'client:\n  version: 0.9.3-fake\n\nserver:\n  status: stopped\n' : 'client:\n  version: 0.9.3-fake\n\nserver:\n  status: running\n  version: 0.9.3-fake\n')
  finish(0)
}

if (group === 'workspace') {
  if (sub === 'list') {
    out({ result: { workspaces: state.workspaces } })
  } else if (sub === 'create') {
    const workspace_id = id('w')
    state.workspaces.push({ workspace_id, label: flag('--label'), focused: false })
    const t = newTab(workspace_id, flag('--label'), flags('--env'))
    out({ result: { workspace: { workspace_id }, ...t } })
  } else if (sub === 'close') {
    const ws = rest[0]
    for (const t of Object.values(state.tabs)) if (t.workspace_id === ws) closeTab(t.tab_id)
    state.workspaces = state.workspaces.filter(w => w.workspace_id !== ws)
    out({ result: {} })
  } else fail('bad_command', `workspace ${sub}`)
  finish(0)
}

if (group === 'tab') {
  if (sub === 'create') {
    const ws = flag('--workspace')
    if (!state.workspaces.some(w => w.workspace_id === ws)) fail('workspace_not_found', ws)
    out({ result: newTab(ws, flag('--label'), flags('--env')) })
  } else if (sub === 'rename') {
    if (!state.tabs[rest[0]]) fail('tab_not_found', rest[0])
    state.tabs[rest[0]].label = rest[1]
    out({ result: {} })
  } else if (sub === 'close') {
    if (!state.tabs[rest[0]]) fail('tab_not_found', rest[0])
    closeTab(rest[0])
    out({ result: {} })
  } else fail('bad_command', `tab ${sub}`)
  finish(0)
}

if (group === 'pane') {
  if (sub === 'split') {
    const src = state.panes[rest[0]]
    if (!src) fail('pane_not_found', rest[0])
    const pane_id = newPane(src.workspace_id, src.tab_id, flags('--env'))
    state.panes[pane_id].splitFrom = rest[0]
    state.panes[pane_id].direction = flag('--direction')
    out({ result: { pane: { pane_id } } })
  } else if (sub === 'rename') {
    if (!state.panes[rest[0]]) fail('pane_not_found', rest[0])
    state.panes[rest[0]].label = rest[1]
    out({ result: {} })
  } else if (sub === 'close') {
    if (!state.panes[rest[0]]) fail('pane_not_found', rest[0])
    closePane(rest[0])
    out({ result: {} })
  } else if (sub === 'read') {
    const name = agentIn(rest[0])
    out(state.agents[name]?.screen ?? state.panes[rest[0]]?.screen ?? '')
  } else fail('bad_command', `pane ${sub}`)
  finish(0)
}

if (group === 'agent') {
  const describe = name => {
    const a = state.agents[name]
    return { name, agent_status: a.status, pane_id: a.pane_id, tab_id: state.panes[a.pane_id]?.tab_id, workspace_id: state.panes[a.pane_id]?.workspace_id }
  }
  if (sub === 'list') {
    const agents = Object.keys(state.agents).map(describe)
    if (state.unnamedPane) agents.push({ name: null, agent_status: 'working', pane_id: state.unnamedPane })
    out({ result: { agents } })
  } else if (sub === 'get') {
    const name = target(rest[0])
    if (!name) fail('agent_not_found', `agent target ${rest[0]} not found`)
    const a = state.agents[name]
    if (a.statusScript?.length) a.status = a.statusScript.shift()
    out({ result: { agent: describe(name) } })
  } else if (sub === 'read') {
    const name = target(rest[0])
    if (!name) fail('agent_not_found', `agent target ${rest[0]} not found`)
    out(state.agents[name].screen ?? '')
  } else if (sub === 'start') {
    const name = rest[0]
    const pane_id = flag('--pane')
    if (!state.panes[pane_id]) fail('pane_not_found', pane_id)
    if (state.agents[name]) fail('agent_exists', name)
    const claudeArgs = argv.slice(argv.indexOf('--') + 1)
    const behavior = state.startBehavior[name] ?? 'ok'
    if (behavior === 'ok') {
      state.agents[name] = { status: 'idle', pane_id, screen: 'Welcome to Claude Code\n\n❯ \n', claudeArgs, statusScript: ['working', 'idle'] }
      out({ result: { agent: describe(name) } })
    } else {
      state.startBehavior[name] = 'ok'
      const screen = behavior === 'trust' ? 'Do you trust the files in this folder?\n\n  1. Yes, proceed\n  2. No, exit\n' : 'Please log in to continue\n'
      state.agents[name] = { status: 'blocked', pane_id, screen, claudeArgs, answered: false }
      fail('agent_not_ready', `agent ${name} did not reach idle`)
    }
  } else if (sub === 'send-keys') {
    const name = target(rest[0])
    if (!name) fail('agent_not_found', `agent target ${rest[0]} not found`)
    const a = state.agents[name]
    a.keys = [...(a.keys ?? []), rest.slice(1)]
    if (a.status === 'blocked' && !a.answered) {
      a.answered = true
      // A just-answered dialog still reads as blocked for a moment, then the prompt box appears.
      a.statusScript = ['blocked', 'blocked', 'blocked', 'idle']
      a.screen = 'Welcome to Claude Code\n\n❯ \n'
    } else if (rest.slice(1).includes('enter') && a.pendingText) {
      a.status = 'working'
      a.screen = `${a.pendingText}\n\nworking...`
      a.pendingText = null
    }
    out({ result: {} })
  } else if (sub === 'prompt') {
    const name = target(rest[0])
    if (!name) fail('agent_not_found', `agent target ${rest[0]} not found`)
    const a = state.agents[name]
    const text = rest[1]
    a.prompts = [...(a.prompts ?? []), text]
    if (text === '/exit') {
      delete state.agents[name]
      out({ result: {} })
      finish(0)
    }
    const behavior = state.promptBehavior[name] ?? 'ok'
    if (argv.includes('--wait') && behavior !== 'ok') {
      state.promptBehavior[name] = 'ok'
      if (behavior === 'stall-typed') {
        a.pendingText = text
        a.screen = `❯ ${text}\n`
      }
      fail('agent_prompt_stalled', `agent ${name} did not change state`)
    }
    if (state.resendWorks === false && !argv.includes('--wait')) {
      out({ result: { agent: describe(name) } })
      finish(0)
    }
    a.status = 'working'
    a.screen = `${text}\n\nworking...`
    out({ result: { agent: describe(name) } })
  } else if (sub === 'wait') {
    const name = target(rest[0])
    if (!name) fail('agent_not_found', `agent target ${rest[0]} not found`)
    const a = state.agents[name]
    const until = flags('--until')
    if (until.length && !until.includes(a.status)) {
      if (a.pendingText && state.resendWorks !== false) {
        a.status = 'working'
        a.pendingText = null
      } else fail('agent_wait_timeout', `agent ${name} is ${a.status}`)
    }
    out({ result: { agent: describe(name) } })
  } else fail('bad_command', `agent ${sub}`)
  finish(0)
}

fail('bad_command', argv.join(' '), 2)
