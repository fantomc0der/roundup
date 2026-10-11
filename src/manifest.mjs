import { homedir } from 'node:os'
import { join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { CliError } from './errors.mjs'

export const TEAM_RE = /^[a-z][a-z0-9_-]{0,15}$/
export const NAME_RE = /^[a-z][a-z0-9_-]{0,31}$/
export const KINDS = ['advisor', 'builder', 'reviewer']
export const LAYOUTS = ['auto', 'split', 'tab', 'workspace']
export const RETENTIONS = ['auto', 'dismiss', 'keep-for-review', 'build-together']

export const teamsRoot = () => process.env.ROUNDUP_TEAMS_ROOT || join(homedir(), '.claude', 'roundup')

export const teamDir = team => join(teamsRoot(), team)

export const manifestPath = team => join(teamDir(team), 'manifest.json')

export const exists = team => existsSync(manifestPath(team))

export function load(team) {
  if (!TEAM_RE.test(team)) throw new CliError('bad_team', `team slug '${team}' must match ${TEAM_RE}`)
  if (!exists(team)) throw new CliError('no_team', `no team '${team}' under ${teamsRoot()}`, { hint: 'Run roundup init first.' })
  return JSON.parse(readFileSync(manifestPath(team), 'utf8'))
}

// Whole-file replacement through a temp file so a reader never sees a half-written manifest.
export function save(team, m) {
  m.version = (m.version ?? 0) + 1
  m.updatedAt = new Date().toISOString()
  const path = manifestPath(team)
  mkdirSync(teamDir(team), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(m, null, 2) + '\n')
  renameSync(tmp, path)
  return m
}

export function update(team, fn) {
  const m = load(team)
  const out = fn(m)
  save(team, m)
  return out ?? m
}

export function listTeams() {
  const root = teamsRoot()
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter(d => d.isDirectory() && TEAM_RE.test(d.name) && exists(d.name))
    .map(d => {
      const m = load(d.name)
      return { team: m.team, status: m.status, layout: m.layout, lead: m.lead, teammates: m.teammates.map(t => t.name) }
    })
}

export function findTeammate(m, name) {
  return m.teammates.find(t => t.name === name)
}

export function requireOpen(m) {
  if (m.status !== 'open') throw new CliError('team_closed', `team '${m.team}' is closed`)
  return m
}
