import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as herdr from './herdr.mjs'
import * as manifest from './manifest.mjs'
import { resolveLayout } from './layout.mjs'
import { sameDir, toNative } from './paths.mjs'
import { CliError } from './errors.mjs'
import { sleep } from './clock.mjs'

export function teamEnv({ team, dir, lead, leadSessionId }) {
  const env = { ROUNDUP_TEAM: team, ROUNDUP_DIR: dir, ROUNDUP_LEAD: lead }
  if (leadSessionId) env.ROUNDUP_LEAD_SESSION_ID = leadSessionId
  return Object.entries(env).flatMap(([k, v]) => ['--env', `${k}=${v}`])
}

export function insideHerdr() {
  return process.env.HERDR_ENV === '1' && Boolean(process.env.HERDR_PANE_ID)
}

export function preflight() {
  const inside = insideHerdr()
  let clientVersion
  let server = { running: false }
  let liveAgentNames = []
  let error
  try {
    clientVersion = herdr.version()
    server = herdr.serverStatus()
    if (server.running) liveAgentNames = herdr.liveAgentNames()
  } catch (e) {
    error = { code: e.code ?? 'herdr_failed', message: e.message }
  }
  return {
    herdr: { clientVersion, serverVersion: server.serverVersion, running: server.running, error },
    insideHerdr: inside,
    workspaceId: process.env.HERDR_WORKSPACE_ID ?? null,
    tabId: process.env.HERDR_TAB_ID ?? null,
    paneId: process.env.HERDR_PANE_ID ?? null,
    liveAgentNames,
    teamsRoot: manifest.teamsRoot(),
    node: process.version,
    platform: process.platform,
  }
}

export function init({ team, lead, leadSessionId, layout = 'auto', defaultLayout = 'auto', size = 3, cwd, retention = 'auto', defaultRetention = 'auto' }) {
  if (!manifest.TEAM_RE.test(team)) throw new CliError('bad_team', `team slug '${team}' must match ${manifest.TEAM_RE}`)
  if (!lead) throw new CliError('usage', 'init needs --lead <your session name from ListAgents> so teammates know whom to report to', { exitCode: 2 })
  if (manifest.exists(team) && manifest.load(team).status === 'open') {
    throw new CliError('team_exists', `team '${team}' is already open`, { hint: `Run roundup close ${team} first, or pick another slug.` })
  }
  if (retention === 'auto') retention = defaultRetention
  if (!manifest.RETENTIONS.includes(retention)) throw new CliError('bad_retention', `retention must be one of ${manifest.RETENTIONS.join('|')}`)

  const inside = insideHerdr()
  const teamCwd = toNative(cwd || process.cwd())
  const resolved = resolveLayout({ requested: layout, configured: defaultLayout, insideHerdr: inside, size, retention, cwdDiffers: !sameDir(teamCwd, process.cwd()) })
  layout = resolved.layout

  let workspaceId = null
  let tabId = null
  let rootPaneId = null
  const created = { workspace: false, tab: false }
  const label = `team:${team}`
  const dir = manifest.teamDir(team)
  // The container's root pane goes to the first teammate, whose name is not known yet.
  // Team-level variables let the mod find that teammate in the manifest by its HERDR_PANE_ID.
  const envArgs = teamEnv({ team, dir, lead, leadSessionId })
  const createWorkspace = () => {
    const r = herdr.json(['workspace', 'create', '--cwd', teamCwd, '--label', label, ...envArgs, '--no-focus']).result
    workspaceId = r.workspace.workspace_id
    tabId = r.tab.tab_id
    rootPaneId = r.root_pane.pane_id
    created.workspace = true
  }
  if (layout === 'split') {
    workspaceId = process.env.HERDR_WORKSPACE_ID
    tabId = process.env.HERDR_TAB_ID
    rootPaneId = process.env.HERDR_PANE_ID
  } else if (layout === 'tab') {
    workspaceId = process.env.HERDR_WORKSPACE_ID || herdr.focusedWorkspace()
    if (!workspaceId) {
      createWorkspace()
      layout = 'workspace'
      resolved.note = 'no herdr workspace was open, so a new one was created'
    } else {
      const r = herdr.json(['tab', 'create', '--workspace', workspaceId, '--cwd', teamCwd, '--label', label, ...envArgs, '--no-focus']).result
      tabId = r.tab.tab_id
      rootPaneId = r.root_pane.pane_id
      created.tab = true
    }
  } else {
    createWorkspace()
  }

  mkdirSync(join(dir, 'briefs'), { recursive: true })
  mkdirSync(join(dir, 'shared'), { recursive: true })
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ crossSessionInbound: 'accept' }) + '\n')

  let herdrVersion
  try {
    herdrVersion = herdr.version()
  } catch {
    herdrVersion = null
  }

  return manifest.save(team, {
    team,
    version: 0,
    status: 'open',
    layout,
    layoutNote: resolved.note ?? null,
    retention,
    cwd: teamCwd,
    lead,
    leadSessionId: leadSessionId ?? null,
    dir,
    herdr: { workspaceId, tabId, rootPaneId, insideHerdr: inside, callerPaneId: process.env.HERDR_PANE_ID ?? null, version: herdrVersion },
    created,
    rootPaneUsed: false,
    teammates: [],
    released: [],
    createdAt: new Date().toISOString(),
    closedAt: null,
  })
}

export function status(team) {
  const m = manifest.load(team)
  const live = new Map()
  if (m.status === 'open') {
    // The lead's own pane shows up in the list with a null name and must be skipped, not keyed.
    for (const a of herdr.agentList()) if (typeof a.name === 'string' && a.name) live.set(a.name, a.agent_status)
  }
  return {
    team: m.team,
    status: m.status,
    layout: m.layout,
    retention: m.retention,
    lead: m.lead,
    leadSessionId: m.leadSessionId,
    dir: m.dir,
    herdr: m.herdr,
    teammates: m.teammates.map(t => ({ ...t, state: live.get(t.name) ?? 'gone' })),
    released: m.released.map(t => t.name),
  }
}

export async function release(team, name) {
  const m = manifest.load(team)
  const entry = manifest.findTeammate(m, name)
  if (!entry) throw new CliError('no_teammate', `no teammate '${name}' in team '${team}'`)
  // A typed /exit lets the session flush its transcript; closing the pane is what actually ends it.
  if (herdr.agentState(name) !== 'gone') {
    herdr.json(['agent', 'prompt', name, '/exit'], { allowError: true })
    for (let i = 0; i < 10; i++) {
      if (!herdr.liveAgentNames().includes(name)) break
      await sleep(1)
    }
  }
  if (m.layout === 'workspace' && entry.tabId) {
    const closed = herdr.json(['tab', 'close', entry.tabId], { allowError: true })
    if (closed.error) herdr.json(['pane', 'close', entry.paneId], { allowError: true })
  } else {
    herdr.json(['pane', 'close', entry.paneId], { allowError: true })
  }
  manifest.update(team, current => {
    const i = current.teammates.findIndex(t => t.name === name)
    if (i >= 0) {
      const [gone] = current.teammates.splice(i, 1)
      current.released.push({ ...gone, releasedAt: new Date().toISOString() })
    }
  })
  return status(team)
}

export async function close(team) {
  const m = manifest.load(team)
  for (const t of [...m.teammates]) await release(team, t.name)
  const after = manifest.load(team)
  if (after.status === 'open') {
    if (after.created.workspace) herdr.json(['workspace', 'close', after.herdr.workspaceId], { allowError: true })
    else if (after.created.tab) herdr.json(['tab', 'close', after.herdr.tabId], { allowError: true })
  }
  manifest.update(team, current => {
    current.status = 'closed'
    current.closedAt = new Date().toISOString()
  })
  return status(team)
}

export function relead(team, { lead, leadSessionId }) {
  if (!lead) throw new CliError('usage', 'relead needs --lead <session name>', { exitCode: 2 })
  manifest.update(team, m => {
    m.lead = lead
    if (leadSessionId !== undefined) m.leadSessionId = leadSessionId
  })
  return status(team)
}
