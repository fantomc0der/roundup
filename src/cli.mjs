import { CliError, usage } from './errors.mjs'
import { parseArgs } from './args.mjs'
import * as herdr from './herdr.mjs'
import * as manifest from './manifest.mjs'
import * as team from './team.mjs'
import { spawn, typedPrompt } from './spawn.mjs'

const HELP = `roundup: a team of Claude Code sessions in herdr panes

  roundup preflight
  roundup init <team> --lead NAME [--lead-session-id ID] [--layout auto|split|tab|workspace] [--size N] [--cwd PATH] [--retention auto|dismiss|keep-for-review|build-together] [--default-layout L] [--default-retention R]
  roundup spawn <team> <name> --role "one line" [--kind advisor|builder|reviewer] [--brief FILE] [--agent DEF] [--model M] [--permission-mode P] [--auto-trust] [--no-kickoff] [-- extra claude args]
  roundup status <team>
  roundup list
  roundup read <team> <name> [--lines N] [--visible]
  roundup wait <team> <name> [--until STATE]... [--timeout MS]
  roundup prompt <team> <name> "text"
  roundup keys <team> <name> <key>...
  roundup release <team> <name>
  roundup close <team>
  roundup relead <team> --lead NAME [--lead-session-id ID]
  roundup task <team> add|claim|next|complete|list|block|unblock ...
  roundup dir <team>
  roundup doctor

Every command prints JSON on stdout, except read and doctor, which print text. Errors are JSON on stderr; exit 1 failed, 2 usage, 3 teammate spawned but not ready.`

// Git Bash (MSYS) rewrites an argument that starts with a slash into a Windows path
// before a native process sees it, so a typed "/exit" arrives as "C:/Program Files/Git/exit".
// Undo that for prompt text. EXEPATH is Git for Windows' install root or one of its bin
// folders, so the root is tried with those trailing segments stripped.
export function unmangle(text, env = process.env, platform = process.platform) {
  if (platform !== 'win32' || !env.EXEPATH) return text
  const base = env.EXEPATH.replace(/\\/g, '/').replace(/\/+$/, '')
  const roots = [base, base.replace(/\/(usr\/bin|mingw64\/bin|bin|cmd)$/i, '')]
  for (const root of roots) if (root && text.toLowerCase().startsWith(root.toLowerCase() + '/')) return text.slice(root.length)
  return text
}

const camel = s => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase())

const need = (positionals, n, what) => {
  if (positionals.length < n) throw usage(`missing ${what}`)
  return positionals
}

async function dispatch(argv) {
  const [cmd, ...rest] = argv
  switch (cmd) {
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      return { text: HELP, exitCode: cmd === undefined ? 2 : 0 }
    case 'preflight':
      return { json: team.preflight() }
    case 'init': {
      const { positionals, options } = parseArgs(rest)
      const [slug] = need(positionals, 1, '<team>')
      const opts = Object.fromEntries(Object.entries(options).map(([k, v]) => [camel(k), v]))
      if (opts.size !== undefined) opts.size = Number(opts.size)
      return { json: team.init({ team: slug, ...opts }) }
    }
    case 'spawn': {
      const { positionals, options, extra } = parseArgs(rest, { booleans: ['auto-trust', 'kickoff'] })
      const [slug, name] = need(positionals, 2, '<team> <name>')
      const opts = Object.fromEntries(Object.entries(options).map(([k, v]) => [camel(k), v]))
      return { json: await spawn({ team: slug, name, ...opts, extra }) }
    }
    case 'status': {
      const [slug] = need(rest, 1, '<team>')
      return { json: team.status(slug) }
    }
    case 'list':
      return { json: { teams: manifest.listTeams() } }
    case 'read': {
      const { positionals, options } = parseArgs(rest, { booleans: ['visible'] })
      const [slug, name] = need(positionals, 2, '<team> <name>')
      manifest.load(slug)
      const lines = options.lines ?? '120'
      if (options.visible) return { text: herdr.readVisible(name) }
      const out = herdr.json(['agent', 'read', name, '--source', 'recent-unwrapped', '--lines', String(lines)], { allowError: true })
      if (out.error?.code === 'agent_not_idle') return { text: herdr.readVisible(name) }
      return { text: herdr.text(['agent', 'read', name, '--source', 'recent-unwrapped', '--lines', String(lines)]) }
    }
    case 'wait': {
      const { positionals, options } = parseArgs(rest, { repeated: ['until'] })
      const [slug, name] = need(positionals, 2, '<team> <name>')
      manifest.load(slug)
      const args = ['agent', 'wait', name]
      for (const u of options.until ?? []) args.push('--until', u)
      if (options.timeout) args.push('--timeout', String(options.timeout))
      const r = herdr.json(args, { allowError: true, timeoutMs: Number(options.timeout ?? 600000) + 5000 })
      if (r.error) return { json: { name, state: herdr.agentState(name), error: r.error }, exitCode: 1 }
      return { json: { name, state: r.result?.agent?.agent_status ?? 'unknown' } }
    }
    case 'prompt': {
      const [slug, name, text] = need(rest, 3, '<team> <name> "text"')
      manifest.load(slug)
      const state = await typedPrompt(name, unmangle(text))
      return { json: { name, state }, exitCode: state === 'stalled' ? 1 : 0 }
    }
    case 'keys': {
      const [slug, name, ...keys] = need(rest, 3, '<team> <name> <key>...')
      manifest.load(slug)
      herdr.json(['agent', 'send-keys', name, ...keys])
      return { json: { name, sent: keys, state: herdr.agentState(name) } }
    }
    case 'release': {
      const [slug, name] = need(rest, 2, '<team> <name>')
      return { json: await team.release(slug, name) }
    }
    case 'close': {
      const [slug] = need(rest, 1, '<team>')
      return { json: await team.close(slug) }
    }
    case 'relead': {
      const { positionals, options } = parseArgs(rest)
      const [slug] = need(positionals, 1, '<team>')
      return { json: team.relead(slug, { lead: options.lead, leadSessionId: options['lead-session-id'] }) }
    }
    case 'task': {
      const [slug, sub, ...taskArgs] = need(rest, 2, '<team> <subcommand>')
      const { tasks } = await import('./tasks.mjs')
      return { json: await tasks(slug, sub, taskArgs) }
    }
    case 'dir': {
      const [slug] = need(rest, 1, '<team>')
      return { json: { dir: manifest.teamDir(slug), exists: manifest.exists(slug) } }
    }
    case 'doctor':
      return { text: doctor() }
    default:
      throw usage(`unknown command '${cmd}'`, 'Run roundup help.')
  }
}

function doctor() {
  const p = team.preflight()
  const lines = []
  const ok = (cond, good, bad) => lines.push(`${cond ? 'ok  ' : 'FAIL'} ${cond ? good : bad}`)
  ok(p.herdr.clientVersion, `herdr client ${p.herdr.clientVersion}`, `herdr client not found: ${p.herdr.error?.message ?? 'not on PATH'}`)
  ok(p.herdr.running, `herdr server running (${p.herdr.serverVersion ?? 'version unknown'})`, 'herdr server not running; start herdr first')
  if (p.herdr.clientVersion && p.herdr.serverVersion && p.herdr.clientVersion !== p.herdr.serverVersion) {
    lines.push(`warn herdr server ${p.herdr.serverVersion} differs from client ${p.herdr.clientVersion}; restart the server after an update`)
  }
  lines.push(`info ${p.insideHerdr ? `inside herdr pane ${p.paneId} (workspace ${p.workspaceId}, tab ${p.tabId})` : 'not inside a herdr pane; split layout falls back to tab'}`)
  lines.push(`info node ${p.node} on ${p.platform}`)
  lines.push(`info team state under ${p.teamsRoot}`)
  lines.push(`info live herdr agents: ${p.liveAgentNames.length ? p.liveAgentNames.join(', ') : 'none'}`)
  const teams = manifest.listTeams()
  lines.push(`info teams on disk: ${teams.length ? teams.map(t => `${t.team} (${t.status}, ${t.teammates.length} live)`).join(', ') : 'none'}`)
  lines.push('info cross-session messaging is checked from Claude itself: ListAgents must list this session with a name')
  return lines.join('\n')
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const out = await dispatch(argv)
    if (out.text !== undefined) process.stdout.write(out.text.endsWith('\n') ? out.text : out.text + '\n')
    else process.stdout.write(JSON.stringify(out.json, null, 2) + '\n')
    return out.exitCode ?? 0
  } catch (e) {
    const err = e instanceof CliError ? e : new CliError('internal', e?.stack ?? String(e))
    process.stderr.write(JSON.stringify(err.toJSON(), null, 2) + '\n')
    return err.exitCode
  }
}
