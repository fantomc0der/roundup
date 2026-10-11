import { spawnSync } from 'node:child_process'
import { CliError } from './errors.mjs'

export class HerdrError extends CliError {}

// Every herdr call goes through here as an argv array. ROUNDUP_HERDR_JS points the
// tests at a fake implemented in Node; ROUNDUP_HERDR or herdr's own HERDR_BIN_PATH
// (set inside its panes) name the real binary when it is not on PATH.
function executable() {
  if (process.env.ROUNDUP_HERDR_JS) return [process.execPath, process.env.ROUNDUP_HERDR_JS]
  return [process.env.ROUNDUP_HERDR || process.env.HERDR_BIN_PATH || 'herdr']
}

// Some herdr builds and shells hand back CRLF; a stray \r on an id or a name breaks every comparison.
const strip = s => (s ?? '').replace(/\r/g, '')

export function run(args, { timeoutMs = 130_000 } = {}) {
  const [cmd, ...pre] = executable()
  const r = spawnSync(cmd, [...pre, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  })
  if (r.error) {
    throw new HerdrError('herdr_unavailable', `could not run herdr: ${r.error.message}`, {
      hint: 'Install herdr and put it on PATH, or set ROUNDUP_HERDR to the binary.',
    })
  }
  return { status: r.status, stdout: strip(r.stdout), stderr: strip(r.stderr) }
}

function parseJson(text) {
  const start = text.indexOf('{')
  if (start < 0) return undefined
  try {
    return JSON.parse(text.slice(start))
  } catch {
    return undefined
  }
}

export function json(args, { allowError = false, timeoutMs } = {}) {
  const r = run(args, { timeoutMs })
  const parsed = parseJson(r.stdout) ?? parseJson(r.stderr)
  if (parsed?.error) {
    if (allowError) return parsed
    throw new HerdrError(parsed.error.code ?? 'herdr_error', `herdr ${args.join(' ')}: ${parsed.error.message ?? 'failed'}`)
  }
  if (!parsed) {
    if (r.status !== 0) {
      throw new HerdrError('herdr_failed', `herdr ${args.join(' ')} exited ${r.status}: ${(r.stderr || r.stdout).trim()}`)
    }
    return {}
  }
  return parsed
}

export function text(args, { allowError = false, timeoutMs } = {}) {
  const r = run(args, { timeoutMs })
  if (r.status !== 0) {
    if (allowError) return ''
    const parsed = parseJson(r.stdout) ?? parseJson(r.stderr)
    throw new HerdrError(parsed?.error?.code ?? 'herdr_failed', `herdr ${args.join(' ')}: ${parsed?.error?.message ?? (r.stderr || r.stdout).trim()}`)
  }
  return r.stdout
}

export const version = () => text(['--version']).trim().replace(/^herdr\s+/, '')

export function serverStatus() {
  const out = text(['status'], { allowError: true })
  const running = /server:\s*\n(?:.*\n)*?\s*status:\s*running/.test(out)
  const serverVersion = /server:\s*\n(?:.*\n)*?\s*version:\s*(\S+)/.exec(out)?.[1]
  return { running, serverVersion, raw: out }
}

export const agentList = () => json(['agent', 'list']).result?.agents ?? []

export const liveAgentNames = () => agentList().map(a => a.name).filter(n => typeof n === 'string' && n.length > 0)

export function agentState(name) {
  const r = json(['agent', 'get', name], { allowError: true })
  if (r.error) return 'gone'
  return r.result?.agent?.agent_status ?? 'unknown'
}

export const readVisible = name => text(['agent', 'read', name, '--source', 'visible'], { allowError: true })

export const readPane = paneId => text(['pane', 'read', paneId, '--source', 'visible'], { allowError: true })

export function focusedWorkspace() {
  const list = json(['workspace', 'list']).result?.workspaces ?? []
  return (list.find(w => w.focused) ?? list[0])?.workspace_id
}
