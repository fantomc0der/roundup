import { usage } from './errors.mjs'

// Minimal argv parser: --flag value, --flag=value, boolean flags, repeated flags, and
// everything after -- kept verbatim for claude.
export function parseArgs(argv, { booleans = [], repeated = [] } = {}) {
  const positionals = []
  const options = {}
  let extra = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') {
      extra = argv.slice(i + 1)
      break
    }
    if (a.startsWith('--')) {
      let [key, value] = a.slice(2).split(/=(.*)/s)
      if (key.startsWith('no-') && booleans.includes(key.slice(3))) {
        options[key.slice(3)] = false
        continue
      }
      if (booleans.includes(key)) {
        options[key] = value === undefined ? true : value !== 'false'
        continue
      }
      if (value === undefined) {
        if (i + 1 >= argv.length) throw usage(`--${key} needs a value`)
        value = argv[++i]
      }
      if (repeated.includes(key)) (options[key] ??= []).push(value)
      else options[key] = value
    } else {
      positionals.push(a)
    }
  }
  return { positionals, options, extra }
}
