import { CliError } from './errors.mjs'
import { LAYOUTS } from './manifest.mjs'

// Decides where a team lives. `requested` is the explicit --layout, `configured`
// the plugin's default_layout; `auto` in both falls through to the heuristics.
export function resolveLayout({ requested = 'auto', configured = 'auto', insideHerdr, size = 3, retention = 'auto', cwdDiffers = false }) {
  for (const value of [requested, configured]) {
    if (!LAYOUTS.includes(value)) throw new CliError('bad_layout', `layout must be one of ${LAYOUTS.join('|')}, got '${value}'`)
  }
  let layout = requested !== 'auto' ? requested : configured
  let note
  if (layout === 'auto') {
    if (insideHerdr && size <= 2) layout = 'split'
    else if (size <= 4) layout = 'tab'
    else layout = 'workspace'
    if (layout === 'tab' && (retention === 'build-together' || cwdDiffers)) {
      layout = 'workspace'
      note = retention === 'build-together' ? 'build-together teams get their own workspace' : 'a different cwd gets its own workspace'
    }
  }
  if (layout === 'split' && !insideHerdr) {
    layout = 'tab'
    note = 'not inside a herdr pane, so split fell back to tab'
  }
  return { layout, note }
}

// Where the next teammate's pane comes from. tab and workspace layouts own a fresh
// root pane the first teammate takes; split starts from the lead's pane, which
// stays the lead's, so every teammate there is a split. Later splits alternate
// right and down off earlier teammates so the tab fills as a grid.
export function placement({ layout, teammates, rootPaneId, rootPaneUsed }) {
  const k = teammates.length
  const earlier = () => teammates[Math.floor((k - 1) / 2)].paneId
  switch (layout) {
    case 'workspace':
      return rootPaneUsed ? { kind: 'tab' } : { kind: 'root', paneId: rootPaneId }
    case 'tab':
      if (!rootPaneUsed) return { kind: 'root', paneId: rootPaneId }
      return { kind: 'split', target: earlier(), direction: k % 2 === 1 ? 'right' : 'down' }
    case 'split':
      if (k === 0) return { kind: 'split', target: rootPaneId, direction: 'right' }
      return { kind: 'split', target: earlier(), direction: k % 2 === 1 ? 'down' : 'right' }
    default:
      throw new CliError('bad_layout', `unknown layout '${layout}'`)
  }
}
