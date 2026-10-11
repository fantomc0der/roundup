import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const fakeHerdr = join(root, 'tests', 'fake-herdr', 'fake.mjs')
export const bin = join(root, 'bin', 'roundup')

export function sandbox({ inside = true, state = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'roundup-'))
  const stateFile = join(dir, 'herdr-state.json')
  const seed = {
    workspaces: [{ workspace_id: 'w1', label: 'main', focused: true }],
    tabs: { 'w1:t1': { tab_id: 'w1:t1', workspace_id: 'w1', label: 'main' } },
    panes: { 'w1:p1': { pane_id: 'w1:p1', tab_id: 'w1:t1', workspace_id: 'w1' } },
    unnamedPane: 'w1:p1',
    ...state,
  }
  writeFileSync(stateFile, JSON.stringify(seed))
  const env = {
    ...process.env,
    ROUNDUP_HERDR_JS: fakeHerdr,
    ROUNDUP_FAKE_STATE: stateFile,
    ROUNDUP_TEAMS_ROOT: join(dir, 'teams'),
    ROUNDUP_TICK_MS: '2',
  }
  for (const k of ['HERDR_ENV', 'HERDR_PANE_ID', 'HERDR_TAB_ID', 'HERDR_WORKSPACE_ID', 'HERDR_BIN_PATH']) delete env[k]
  if (inside) Object.assign(env, { HERDR_ENV: '1', HERDR_PANE_ID: 'w1:p1', HERDR_TAB_ID: 'w1:t1', HERDR_WORKSPACE_ID: 'w1' })
  const run = (...args) => {
    const r = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env, cwd: dir })
    let json
    try {
      json = JSON.parse(r.stdout)
    } catch {
      json = undefined
    }
    let error
    try {
      error = JSON.parse(r.stderr).error
    } catch {
      error = undefined
    }
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, json, error }
  }
  const herdrState = () => JSON.parse(readFileSync(stateFile, 'utf8'))
  const patchState = fn => {
    const s = herdrState()
    fn(s)
    writeFileSync(stateFile, JSON.stringify(s))
  }
  const manifest = team => JSON.parse(readFileSync(join(dir, 'teams', team, 'manifest.json'), 'utf8'))
  const brief = (name, text = `# Brief: ${name}\n`) => {
    const p = join(dir, `${name}.md`)
    writeFileSync(p, text)
    return p
  }
  return { dir, run, herdrState, patchState, manifest, brief, env }
}

export const calls = (state, group, sub) => state.calls.filter(c => c[0] === group && (sub === undefined || c[1] === sub))
