import { isAbsolute, resolve } from 'node:path'

// A lead running under Git Bash hands over POSIX spellings of Windows paths. The
// teammate's claude runs natively, so every path that reaches it must be native.
export function toNative(p) {
  if (!p) return p
  if (process.platform === 'win32') {
    const m = /^\/(?:cygdrive\/)?([a-zA-Z])(\/.*)?$/.exec(p)
    if (m) return `${m[1].toUpperCase()}:${(m[2] ?? '/').replace(/\//g, '\\')}`
  }
  return isAbsolute(p) ? p : resolve(p)
}

export const sameDir = (a, b) => normalize(toNative(a)) === normalize(toNative(b))

const normalize = p => (process.platform === 'win32' ? p.toLowerCase() : p).replace(/[\\/]+$/, '')
