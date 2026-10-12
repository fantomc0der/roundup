export const firstLine = (text: string, max = 200) => {
  const line = text.split('\n').map(l => l.trim()).find(l => l.length > 0) ?? ''
  return line.length > max ? line.slice(0, max - 1) + '…' : line
}

// The name a peer delivery was sent under, read off the envelope the model sees.
export const fromName = (text: string): string | undefined => /from-name="([^"]+)"/.exec(text)?.[1]

// Splits a slash command's argument string the way a shell would, honoring double quotes.
export function tokenize(args: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(args)) !== null) out.push(m[1] ?? m[2] ?? m[3] ?? '')
  return out
}

const INIT_RE = /\broundup\s+init\b/
const RELEAD_RE = /\broundup\s+relead\b/

// Whether a Bash command starts or re-leads a team, which is when the lead side should look for one to follow.
export const touchesTeamLead = (command: string) => INIT_RE.test(command) || RELEAD_RE.test(command)

// A Bash `roundup init` with this session's id added, so the manifest names the session the team belongs to
// the same way `/corral init` would. Unchanged when the command already carries one, or when the id could
// not be spelled bare on a shell command line.
export function withLeadSessionId(command: string, sessionId: string | null): string {
  if (!sessionId || !/^[A-Za-z0-9_.:-]+$/.test(sessionId)) return command
  if (command.includes('--lead-session-id')) return command
  return command.replace(new RegExp(INIT_RE.source, 'g'), m => `${m} --lead-session-id ${sessionId}`)
}

// A peer delivery's text as the person would read it: the first line of the body, without the
// cross-session envelope the engine wraps around it.
export const messageBody = (text: string, max = 200) =>
  firstLine(text.replace(/<cross-session-message\b[^>]*>/g, '').replace(/<\/cross-session-message>/g, ''), max)
