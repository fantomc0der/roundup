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
