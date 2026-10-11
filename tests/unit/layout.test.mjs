import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placement, resolveLayout } from '../../src/layout.mjs'

test('auto picks split beside the lead for a small team inside herdr', () => {
  assert.equal(resolveLayout({ insideHerdr: true, size: 2 }).layout, 'split')
  assert.equal(resolveLayout({ insideHerdr: true, size: 1 }).layout, 'split')
})

test('auto picks tab for three or four, workspace beyond', () => {
  assert.equal(resolveLayout({ insideHerdr: true, size: 3 }).layout, 'tab')
  assert.equal(resolveLayout({ insideHerdr: false, size: 2 }).layout, 'tab')
  assert.equal(resolveLayout({ insideHerdr: true, size: 5 }).layout, 'workspace')
})

test('auto upgrades tab to workspace for build-together teams and a different cwd', () => {
  assert.equal(resolveLayout({ insideHerdr: true, size: 3, retention: 'build-together' }).layout, 'workspace')
  assert.equal(resolveLayout({ insideHerdr: false, size: 2, cwdDiffers: true }).layout, 'workspace')
  assert.equal(resolveLayout({ insideHerdr: true, size: 2, retention: 'build-together' }).layout, 'split')
})

test('an explicit layout wins over the configured default, which wins over auto', () => {
  assert.equal(resolveLayout({ requested: 'workspace', configured: 'tab', insideHerdr: true, size: 2 }).layout, 'workspace')
  assert.equal(resolveLayout({ configured: 'tab', insideHerdr: true, size: 2 }).layout, 'tab')
})

test('split falls back to tab outside herdr with a note', () => {
  const r = resolveLayout({ requested: 'split', insideHerdr: false, size: 2 })
  assert.equal(r.layout, 'tab')
  assert.match(r.note, /fell back/)
})

test('rejects unknown layouts', () => {
  assert.throws(() => resolveLayout({ requested: 'floating', insideHerdr: true }), /layout must be one of/)
})

const mates = n => Array.from({ length: n }, (_, i) => ({ name: `m${i + 1}`, paneId: `p${i + 1}` }))

test('tab layout: first takes the root pane, later ones fill a grid', () => {
  assert.deepEqual(placement({ layout: 'tab', teammates: [], rootPaneId: 'root', rootPaneUsed: false }), { kind: 'root', paneId: 'root' })
  assert.deepEqual(placement({ layout: 'tab', teammates: mates(1), rootPaneId: 'root', rootPaneUsed: true }), { kind: 'split', target: 'p1', direction: 'right' })
  assert.deepEqual(placement({ layout: 'tab', teammates: mates(2), rootPaneId: 'root', rootPaneUsed: true }), { kind: 'split', target: 'p1', direction: 'down' })
  assert.deepEqual(placement({ layout: 'tab', teammates: mates(3), rootPaneId: 'root', rootPaneUsed: true }), { kind: 'split', target: 'p2', direction: 'right' })
})

test('split layout: every teammate splits, the first off the lead to the right, then stacked', () => {
  assert.deepEqual(placement({ layout: 'split', teammates: [], rootPaneId: 'lead', rootPaneUsed: false }), { kind: 'split', target: 'lead', direction: 'right' })
  assert.deepEqual(placement({ layout: 'split', teammates: mates(1), rootPaneId: 'lead', rootPaneUsed: true }), { kind: 'split', target: 'p1', direction: 'down' })
  assert.deepEqual(placement({ layout: 'split', teammates: mates(2), rootPaneId: 'lead', rootPaneUsed: true }), { kind: 'split', target: 'p1', direction: 'right' })
})

test('workspace layout: root tab first, then one tab per teammate', () => {
  assert.deepEqual(placement({ layout: 'workspace', teammates: [], rootPaneId: 'root', rootPaneUsed: false }), { kind: 'root', paneId: 'root' })
  assert.deepEqual(placement({ layout: 'workspace', teammates: mates(1), rootPaneId: 'root', rootPaneUsed: true }), { kind: 'tab' })
})
