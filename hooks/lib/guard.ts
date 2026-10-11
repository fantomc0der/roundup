import type { Identity } from './identity'

export type AdvisorBash = 'readonly-heuristic' | 'deny' | 'allow'

const WRITE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

export const isUnder = (path: string, dir: string) => {
  const a = normalize(path)
  const b = normalize(dir)
  return a === b || a.startsWith(b + '/')
}

// Conservative shapes of a shell command that changes files or repository state.
// A heuristic by design: advisors keep grep, git log, and test runs.
const WRITE_PATTERNS: Array<[RegExp, string]> = [
  [/(^|[;&|]\s*|\$\(\s*)(rm|rmdir|mv|cp|mkdir|touch|tee|truncate|dd|chmod|chown|ln)\s/i, 'file mutation'],
  [/(^|[;&|]\s*)sed\s+(-[a-z]*i|--in-place)/i, 'in-place edit'],
  [/(^|[;&|]\s*)git\s+(commit|push|add|rm|mv|checkout|switch|restore|reset|rebase|merge|cherry-pick|stash|clean|branch\s+-[dDm]|tag\s+-d|apply|am)\b/i, 'repository mutation'],
  [/(^|[;&|]\s*)(npm|pnpm|yarn|bun)\s+(install|i|add|remove|uninstall|ci|update|link|publish)\b/i, 'package mutation'],
  [/(^|[;&|]\s*)(pip|pip3|uv|poetry|cargo|go)\s+(install|add|remove|uninstall|publish)\b/i, 'package mutation'],
  [/(^|[^\d&>])>{1,2}\s*(?!&|\/dev\/null)[^\s|&;]/, 'output redirection'],
  [/(^|[;&|]\s*)(python|python3|node|ruby|perl)\s+-[ce]\s/i, 'inline script'],
]

export function bashWriteReason(command: string): string | undefined {
  const text = command.trim()
  for (const [pattern, reason] of WRITE_PATTERNS) if (pattern.test(text)) return reason
  return undefined
}

export type Verdict = { decision: 'deny'; reason: string }

export function roleVerdict(me: Identity | null, tool: string, input: unknown, advisorBash: AdvisorBash): Verdict | undefined {
  if (!me || me.kind === 'builder') return undefined
  const args = (input ?? {}) as Record<string, unknown>
  const who = `${me.name} is a ${me.kind} on team ${me.team}`
  if (WRITE_TOOLS.has(tool)) {
    const path = String(args.file_path ?? args.notebook_path ?? '')
    if (path && isUnder(path, me.dir)) return undefined
    return { decision: 'deny', reason: `${who}: project files are read-only for this role. Write notes under ${me.dir}/shared instead, or ask the lead to assign the change.` }
  }
  if (tool === 'Bash') {
    if (advisorBash === 'allow') return undefined
    const command = String(args.command ?? '')
    if (advisorBash === 'deny') return { decision: 'deny', reason: `${who}: Bash is disabled for this role by the roundup plugin's advisor_bash setting.` }
    if (command.includes(me.dir) || command.includes(me.dir.replace(/\\/g, '/'))) return undefined
    const why = bashWriteReason(command)
    if (why) return { decision: 'deny', reason: `${who}: this command looks like a ${why}, which this role may not do. Read and report instead, or ask the lead.` }
  }
  return undefined
}
