import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { messageBody, withLeadSessionId } from './lib/text'

const TEAMMATE_ENV = {
  ROUNDUP_TEAM: 'modal',
  ROUNDUP_NAME: 'modal-ux',
  ROUNDUP_KIND: 'advisor',
  ROUNDUP_LEAD: 'lead-1',
  ROUNDUP_LEAD_SESSION_ID: 'lead-session',
  ROUNDUP_DIR: 'C:\\teams\\modal',
}

const MANIFEST = {
  team: 'modal',
  lead: 'lead-1',
  leadSessionId: 'lead-session',
  dir: 'C:\\teams\\modal',
  status: 'open',
  teammates: [{ name: 'modal-ux', kind: 'advisor', paneId: 'w1:p9', brief: 'C:\\teams\\modal\\briefs\\modal-ux.md', kickoff: 'pending' }],
}

// The kit answers nothing beneath the plugins but state and session.append, so
// every noun the mod touches is answered here from memory.
type ProcessAnswer = (argv: readonly string[]) => { exitCode: number; stdout: string; stderr: string }
const okProcess: ProcessAnswer = () => ({ exitCode: 0, stdout: '{}', stderr: '' })

function world(on: On, { manifest = MANIFEST as Record<string, unknown> | undefined, manifests = {} as Record<string, Record<string, unknown>>, files = {} as Record<string, string>, process = okProcess, dirs = [] as string[] } = {}) {
  const writes: Array<{ path: string; text: string }> = []
  const sent: Array<{ to: unknown; text: string }> = []
  const submitted: string[] = []
  const ran: string[][] = []
  const registered: string[] = []
  const tools: string[] = []
  const status: Array<string | undefined> = []
  const bash: string[] = []
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('fs.read', (_$, e) => {
    const path = e.path.replace(/\\/g, '/')
    // A team's manifest by its directory name first, so a test can hold several open teams.
    const team = /\/([^/]+)\/manifest\.json$/.exec(path)?.[1]
    if (team && manifests[team]) return { value: JSON.stringify(manifests[team]) }
    if (path.endsWith('/manifest.json') && manifest) return { value: JSON.stringify(manifest) }
    // Suffix match: on Linux the engine resolves a Windows-style path against the cwd before the hook sees it.
    const hit = Object.entries(files).find(([p]) => path.endsWith(p.replace(/\\/g, '/')))
    return hit ? { value: hit[1] } : { deny: `ENOENT ${e.path}` }
  })
  on('fs.write', (_$, e) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('fs.list', () => ({ value: dirs.map(name => ({ name, kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false })) }))
  on('fs.exists', () => ({ value: false }))
  on('session.id', () => ({ value: 'lead-session' }))
  on('session.send', (_$, e) => {
    sent.push({ to: e.to, text: e.text })
    return { isDelivered: true as const }
  })
  on('prompt.submit', (_$, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  on('process.run', (_$, e) => {
    ran.push([...e.argv])
    return { value: { ...process(e.argv), isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('command.register', (_$, e) => {
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('tool.register', (_$, e) => {
    tools.push(e.name)
    return { value: { tool: `mcp__roundup__${e.name}` } }
  })
  on('ui.status', (_$, e) => {
    status.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('tool.check', () => ({ decision: 'allow' as const }))
  on('tool.call', { tool: 'Bash' }, (_$, e) => {
    bash.push(e.command)
    return { result: { stdout: '{}', stderr: '', interrupted: false } }
  })
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('session.receive', (_$, e) => ({ text: e.text }))
  on('prompt.compose', () => ({ sections: [{ id: 'core', text: 'base', scope: 'shared' as const }] }))
  return { writes, sent, submitted, ran, registered, tools, status, bash }
}

const start = ($: Engine) => $.session.start({ cwd: 'C:\\proj', surface: 'terminal', isInteractive: true })

describe('teammate', () => {
  test('submits the brief as the user and stamps the manifest', async ($, on) => {
    mock.env(on, { ...TEAMMATE_ENV, ROUNDUP_BRIEF: 'C:\\teams\\modal\\briefs\\modal-ux.md' })
    mock.clock(on)
    const w = world(on)
    await start($)
    expect(w.submitted).toHaveLength(1)
    expect(w.submitted[0]).toContain('Read your briefing at C:\\teams\\modal\\briefs\\modal-ux.md')
    expect(w.submitted[0]).toContain('lead-1')
    expect(w.writes).toHaveLength(1)
    expect(JSON.parse(w.writes[0]!.text).teammates[0].kickoff).toBe('mod')
    expect(w.status.at(-1)).toContain('modal-ux')
  })

  test('does not kick off twice when the CLI already typed the prompt', async ($, on) => {
    mock.env(on, { ...TEAMMATE_ENV, ROUNDUP_BRIEF: 'C:\\teams\\modal\\briefs\\modal-ux.md' })
    mock.clock(on)
    const typed = { ...MANIFEST, teammates: [{ ...MANIFEST.teammates[0], kickoff: 'working' }] }
    const w = world(on, { manifest: typed })
    await start($)
    expect(w.submitted).toHaveLength(0)
    expect(w.writes).toHaveLength(0)
  })

  test('finds a root-pane teammate through HERDR_PANE_ID and the manifest', async ($, on) => {
    mock.env(on, { ROUNDUP_TEAM: 'modal', ROUNDUP_DIR: 'C:\\teams\\modal', ROUNDUP_LEAD: 'lead-1', HERDR_PANE_ID: 'w1:p9' })
    mock.clock(on)
    const w = world(on)
    await start($)
    expect(w.submitted).toHaveLength(1)
    const verdict = await $.tool.check({ tool: 'Edit', input: { file_path: 'C:\\proj\\src\\a.ts' } })
    expect(verdict.decision).toBe('deny')
  })

  test('advisors cannot edit project files but may write under the team directory', async ($, on) => {
    mock.env(on, TEAMMATE_ENV)
    mock.clock(on)
    world(on)
    await start($)
    expect((await $.tool.check({ tool: 'Edit', input: { file_path: 'C:\\proj\\src\\a.ts' } })).decision).toBe('deny')
    expect((await $.tool.check({ tool: 'Write', input: { file_path: 'C:\\teams\\modal\\shared\\notes.md' } })).decision).toBe('allow')
    expect((await $.tool.check({ tool: 'Read', input: { file_path: 'C:\\proj\\src\\a.ts' } })).decision).toBe('allow')
  })

  test('builders are unrestricted', async ($, on) => {
    mock.env(on, { ...TEAMMATE_ENV, ROUNDUP_KIND: 'builder' })
    mock.clock(on)
    world(on)
    await start($)
    expect((await $.tool.check({ tool: 'Edit', input: { file_path: 'C:\\proj\\src\\a.ts' } })).decision).toBe('allow')
    expect((await $.tool.check({ tool: 'Bash', input: { command: 'git commit -m x' } })).decision).toBe('allow')
  })

  test('the Bash heuristic denies writes and allows reads', async ($, on) => {
    mock.env(on, TEAMMATE_ENV)
    mock.clock(on)
    world(on)
    await start($)
    const check = (command: string) => $.tool.check({ tool: 'Bash', input: { command } }).then(v => v.decision)
    expect(await check('git log --oneline | head')).toBe('allow')
    expect(await check('grep -rn modal src')).toBe('allow')
    expect(await check('npm test')).toBe('allow')
    expect(await check('cat a.txt 2>/dev/null')).toBe('allow')
    expect(await check('git commit -m "x"')).toBe('deny')
    expect(await check('rm -rf build')).toBe('deny')
    expect(await check('echo hi > out.txt')).toBe('deny')
    expect(await check('sed -i s/a/b/ file')).toBe('deny')
    expect(await check('npm install left-pad')).toBe('deny')
    expect(await check('echo note >> C:\\teams\\modal\\shared\\notes.md')).toBe('allow')
  })

  test('advisor_bash deny blocks every Bash call', { options: { advisor_bash: 'deny' } }, async ($, on) => {
    mock.env(on, TEAMMATE_ENV)
    mock.clock(on)
    world(on)
    await start($)
    expect((await $.tool.check({ tool: 'Bash', input: { command: 'git log' } })).decision).toBe('deny')
  })

  test('pings the lead when a turn completes, at most once per 20 seconds', async ($, on) => {
    mock.env(on, TEAMMATE_ENV)
    const clock = mock.clock(on, { now: 100_000 })
    const w = world(on)
    await start($)
    const turn = (answer: string) => $.turn.complete({ answer, durationMs: 10, isAborted: false, turnId: 't', reason: 'answer' })
    await turn('First line of the answer\nmore')
    expect(w.sent).toHaveLength(1)
    // The engine spells a plugin's { sessionId } before any hook beneath sees it.
    expect(w.sent[0]!.to).toBe('lead-session')
    expect(w.sent[0]!.text).toBe('[roundup] modal-ux finished a turn: First line of the answer')
    await turn('again')
    expect(w.sent).toHaveLength(1)
    await clock.advance(20_000)
    await turn('later')
    expect(w.sent).toHaveLength(2)
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer' })
    await $.turn.complete({ answer: 'sub', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer', agentId: 'a1' })
    expect(w.sent).toHaveLength(2)
  })

  test('pings by name when no lead session id is known', async ($, on) => {
    mock.env(on, { ...TEAMMATE_ENV, ROUNDUP_LEAD_SESSION_ID: '' })
    mock.clock(on, { now: 100_000 })
    const w = world(on)
    await start($)
    await $.turn.complete({ answer: 'done', durationMs: 10, isAborted: false, turnId: 't', reason: 'answer' })
    expect(w.sent[0]!.to).toBe('lead-1')
  })

  test('registers the task tools and serves them through the CLI as the teammate', async ($, on) => {
    mock.env(on, TEAMMATE_ENV)
    mock.clock(on)
    const w = world(on, { process: argv => ({ exitCode: 0, stderr: '', stdout: JSON.stringify({ ok: true, argv }) }) })
    await start($)
    expect(w.tools).toEqual(['task_list', 'task_claim_next', 'task_complete'])
    const claimed = await $.tool.call({ tool: 'mcp__roundup__task_claim_next' })
    expect(claimed.deny).toBeUndefined()
    const next = w.ran.find(a => a.includes('next'))!
    expect(next.slice(2)).toEqual(['task', 'modal', 'next', '--as', 'modal-ux'])
    await $.tool.call({ tool: 'mcp__roundup__task_complete', id: 3, notes: 'done it' })
    const complete = w.ran.find(a => a.includes('complete'))!
    expect(complete.slice(2)).toEqual(['task', 'modal', 'complete', '3', '--as', 'modal-ux', '--notes', 'done it'])
    const bad = await $.tool.call({ tool: 'mcp__roundup__task_complete' })
    expect(bad.deny).toContain('needs an id')
  })

  test('adds a teammate section to the system prompt', async ($, on) => {
    mock.env(on, TEAMMATE_ENV)
    mock.clock(on)
    world(on)
    await start($)
    const { sections } = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] })
    const mine = sections.find(s => s.id === 'roundup:teammate')
    expect(mine?.scope).toBe('session')
    expect(mine?.text).toContain("'modal-ux' (advisor)")
    expect(mine?.text).toContain('lead-1')
  })
})

describe('lead', () => {
  test('registers /corral and stays inert without a team', async ($, on) => {
    mock.env(on, {})
    mock.clock(on)
    const w = world(on, { manifest: undefined })
    await start($)
    expect(w.registered).toEqual(['corral'])
    expect(w.submitted).toHaveLength(0)
    expect((await $.tool.check({ tool: 'Edit', input: { file_path: 'C:\\proj\\a.ts' } })).decision).toBe('allow')
    const help = await $.command.run({ command: 'corral', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
    expect(help.text).toContain('/corral status')
    const none = await $.command.run({ command: 'corral', args: 'status', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
    expect(none.text).toContain('no active team')
  })

  test('a lead follows the only open team under the teams root at start', async ($, on) => {
    mock.env(on, { ROUNDUP_TEAMS_ROOT: 'C:\\teams' })
    const clock = mock.clock(on)
    const w = world(on, { manifest: { ...MANIFEST, leadSessionId: null }, dirs: ['modal'], process: statusProcess })
    await start($)
    await clock.settle()
    expect(w.ran.some(a => a.includes('status') && a.includes('modal'))).toBe(true)
    const out = await run($, 'status')
    expect(out.text).toContain('modal (split')
  })

  test('a Bash roundup init carries the lead session id and the team is followed without /corral use', async ($, on) => {
    mock.env(on, { ROUNDUP_TEAMS_ROOT: 'C:\\teams' })
    const clock = mock.clock(on)
    const dirs: string[] = []
    const w = world(on, { dirs, process: statusProcess })
    await start($)
    await clock.settle()
    expect(w.ran.some(a => a.includes('status'))).toBe(false)
    dirs.push('modal')
    const out = await $.tool.call({ tool: 'Bash', command: 'roundup init modal --lead lead-1 --size 2 && roundup dir modal' })
    expect(out.deny).toBeUndefined()
    expect(w.bash).toEqual(['roundup init --lead-session-id lead-session modal --lead lead-1 --size 2 && roundup dir modal'])
    await clock.settle()
    expect(w.ran.some(a => a.includes('status') && a.includes('modal'))).toBe(true)
    expect((await run($, 'status')).text).toContain('modal (split')
    expect(w.tools).toEqual(['task_list', 'task_claim_next', 'task_complete'])
  })

  test('a Bash command that is not a roundup init passes through untouched', async ($, on) => {
    mock.env(on, {})
    mock.clock(on)
    const w = world(on, { manifest: undefined })
    await start($)
    await $.tool.call({ tool: 'Bash', command: 'roundup status modal' })
    await $.tool.call({ tool: 'Bash', command: 'roundup init modal --lead lead-1 --lead-session-id other' })
    expect(w.bash).toEqual(['roundup status modal', 'roundup init modal --lead lead-1 --lead-session-id other'])
  })

  test('a Bash roundup relead carries the lead session id and the re-led team is followed', async ($, on) => {
    mock.env(on, { ROUNDUP_TEAMS_ROOT: 'C:\\teams' })
    const clock = mock.clock(on)
    // Two open teams, neither naming this session: nothing to follow until the relead names one.
    const manifests = {
      modal: { ...MANIFEST, leadSessionId: 'old-session' },
      other: { ...MANIFEST, team: 'other', leadSessionId: 'someone-else' },
    }
    const w = world(on, { manifests, dirs: ['modal', 'other'], process: statusProcess })
    await start($)
    await clock.settle()
    expect(w.ran.some(a => a.includes('status'))).toBe(false)
    manifests.modal.leadSessionId = 'lead-session'
    await $.tool.call({ tool: 'Bash', command: 'roundup relead modal --lead lead-2' })
    expect(w.bash).toEqual(['roundup relead --lead-session-id lead-session modal --lead lead-2'])
    await clock.settle()
    expect(w.ran.some(a => a.includes('status') && a.includes('modal'))).toBe(true)
  })

  test('a lead inside a herdr pane follows the team started from that pane', async ($, on) => {
    mock.env(on, { ROUNDUP_TEAMS_ROOT: 'C:\\teams', HERDR_PANE_ID: 'w1:p1' })
    const clock = mock.clock(on)
    const manifests = {
      modal: { ...MANIFEST, leadSessionId: null, herdr: { callerPaneId: 'w1:p1' } },
      other: { ...MANIFEST, team: 'other', leadSessionId: null, herdr: { callerPaneId: 'w9:p9' } },
    }
    const w = world(on, { manifests, dirs: ['other', 'modal'], process: statusProcess })
    await start($)
    await clock.settle()
    expect(w.ran.some(a => a.includes('status') && a.includes('modal'))).toBe(true)
    expect(w.ran.some(a => a.includes('other'))).toBe(false)
  })

  test('/corral pane looks for a team that appeared after the session started', async ($, on) => {
    mock.env(on, { ROUNDUP_TEAMS_ROOT: 'C:\\teams' })
    const clock = mock.clock(on)
    const dirs: string[] = []
    const w = world(on, { dirs, process: statusProcess })
    await start($)
    await clock.settle()
    dirs.push('modal')
    await run($, 'pane')
    await clock.settle()
    expect(w.ran.some(a => a.includes('status') && a.includes('modal'))).toBe(true)
  })

  test('the lead session id rides on roundup init and relead only when it can', () => {
    expect(withLeadSessionId('roundup init modal --lead me', 'abc-123')).toBe('roundup init --lead-session-id abc-123 modal --lead me')
    expect(withLeadSessionId('roundup relead modal --lead me-2', 'abc-123')).toBe('roundup relead --lead-session-id abc-123 modal --lead me-2')
    expect(withLeadSessionId('roundup init modal --lead-session-id x', 'abc')).toBe('roundup init modal --lead-session-id x')
    expect(withLeadSessionId('roundup init modal', null)).toBe('roundup init modal')
    expect(withLeadSessionId('roundup init modal', 'has space')).toBe('roundup init modal')
    expect(withLeadSessionId('roundup status modal', 'abc')).toBe('roundup status modal')
  })

  test('a message is shown without its cross-session envelope', () => {
    expect(messageBody('<cross-session-message from="uds:\\\\.\\pipe\\x" from-name="modal-ux">\nFirst line\nmore\n</cross-session-message>')).toBe('First line')
    expect(messageBody('plain text')).toBe('plain text')
  })

  test('init appends the lead session id and follows the new team', async ($, on) => {
    mock.env(on, {})
    const clock = mock.clock(on)
    const w = world(on, {
      manifest: undefined,
      process: argv => ({
        exitCode: 0,
        stderr: '',
        stdout: argv.includes('init') ? JSON.stringify({ team: 'modal', layout: 'split' }) : JSON.stringify({ team: 'modal', status: 'open', layout: 'split', retention: 'auto', lead: 'lead-1', dir: 'C:\\teams\\modal', teammates: [] }),
      }),
    })
    await start($)
    const out = await $.command.run({ command: 'corral', args: 'init modal --lead lead-1 --size 2', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
    expect(out.text).toContain('team modal ready')
    await clock.settle()
    const init = w.ran.find(a => a.includes('init'))!
    expect(init[0]).toBe('node')
    expect(init.at(-2)).toBe('--lead-session-id')
    expect(init.at(-1)).toBe('lead-session')
  })

  const STATUS = {
    team: 'modal',
    status: 'open',
    layout: 'split',
    retention: 'auto',
    lead: 'lead-1',
    dir: 'C:\\teams\\modal',
    teammates: [
      { name: 'modal-ux', kind: 'advisor', role: 'UX', state: 'idle', paneId: 'w1:p2', kickoff: 'mod' },
      { name: 'modal-engineer', kind: 'builder', role: 'Engineer', state: 'blocked', paneId: 'w1:p3', kickoff: 'mod' },
    ],
  }
  const BOARD = JSON.stringify({ tasks: [{ status: 'done' }, { status: 'done' }, { status: 'done' }, { status: 'in_progress' }, { status: 'pending' }, { status: 'blocked' }] })
  const statusProcess: ProcessAnswer = argv => ({ exitCode: 0, stderr: '', stdout: argv.includes('status') ? JSON.stringify(STATUS) : '{}' })
  const mountPane = ($: Engine, bodyColumns: number) =>
    $.ui.mount({ plugin: 'roundup', surface: 'terminal', component: 'Pane', requestId: 'roundup', props: { title: 'roundup', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} } })
  const run = ($: Engine, args: string) => $.command.run({ command: 'corral', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })

  test('the pane lays out a followed team in columns with a note under each teammate', async ($, on) => {
    mock.env(on, {})
    const clock = mock.clock(on)
    world(on, { manifest: undefined, files: { 'C:\\teams\\modal\\tasks.json': BOARD }, process: statusProcess })
    await start($)
    await run($, 'use modal')
    await clock.settle()
    const ui = await mountPane($, 80)
    expect(await ui.find({ type: 'Text', text: 'modal-engineer' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^builder$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^blocked$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /waiting on a prompt/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /no messages yet/ })).toBeDefined()
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(4)
    expect(await ui.find({ type: 'Text', text: '3/6 done' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 blocked/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /updated \d+s ago/ })).toBeDefined()
    await ui.unmount()
  })

  test('the pane stacks a row instead of cutting a name short', async ($, on) => {
    mock.env(on, {})
    const clock = mock.clock(on)
    world(on, { manifest: undefined, process: statusProcess })
    await start($)
    await run($, 'use modal')
    await clock.settle()
    // 36 columns: no room for name, state, and both buttons on one line, so kind and the buttons go under the name.
    const narrow = await mountPane($, 36)
    expect(await narrow.find({ type: 'Text', text: 'modal-engineer' })).toBeDefined()
    expect(await narrow.find({ type: 'Text', text: /^builder$/ })).toBeDefined()
    expect(await narrow.findAll({ type: 'Button' })).toHaveLength(4)
    await narrow.unmount()
    // 28 columns: the kind no longer fits beside the buttons, but the full name still shows.
    const tiny = await mountPane($, 28)
    expect(await tiny.find({ type: 'Text', text: 'modal-engineer' })).toBeDefined()
    expect(await tiny.find({ type: 'Text', text: /^builder$/ })).toBeUndefined()
    expect(await tiny.findAll({ type: 'Button' })).toHaveLength(4)
    await tiny.unmount()
  })

  test('the pane shows the body of a teammate message, not its envelope', async ($, on) => {
    mock.env(on, {})
    const clock = mock.clock(on)
    world(on, { manifest: undefined, process: statusProcess })
    await start($)
    await run($, 'use modal')
    await clock.settle()
    await $.session.receive({ text: '<cross-session-message from="uds:x" from-name="modal-ux">\nPosition: ship the modal\n</cross-session-message>', origin: { kind: 'peer-send-message' } })
    const ui = await mountPane($, 80)
    expect(await ui.find({ type: 'Text', text: /Position: ship the modal/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /cross-session/ })).toBeUndefined()
    await ui.unmount()
  })

  test('the pane drops the kind column when the body is too narrow for it', async ($, on) => {
    mock.env(on, {})
    const clock = mock.clock(on)
    world(on, { manifest: undefined, process: statusProcess })
    await start($)
    await run($, 'use modal')
    await clock.settle()
    const wide = await mountPane($, 80)
    expect(await wide.find({ type: 'Text', text: /^advisor$/ })).toBeDefined()
    await wide.unmount()
    // 50 columns: the full name, state, and buttons fit once the kind column goes.
    const narrow = await mountPane($, 50)
    expect(await narrow.find({ type: 'Text', text: /^advisor$/ })).toBeUndefined()
    expect(await narrow.find({ type: 'Text', text: 'modal-engineer' })).toBeDefined()
    expect(await narrow.findAll({ type: 'Button' })).toHaveLength(4)
    await narrow.unmount()
  })

  test('the pane says when the team is closed', async ($, on) => {
    mock.env(on, {})
    const clock = mock.clock(on)
    world(on, { manifest: undefined, process: statusProcess })
    await start($)
    await run($, 'use modal')
    await clock.settle()
    await run($, 'close')
    await clock.settle()
    const ui = await mountPane($, 80)
    expect(await ui.find({ type: 'Text', text: /Team closed/ })).toBeDefined()
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
    await ui.unmount()
  })

  test('the pane draws on terminal and desktop', async ($, on) => {
    mock.env(on, {})
    mock.clock(on)
    world(on, { manifest: undefined })
    await start($)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'roundup', surface, component: 'Pane', requestId: 'roundup', props: { title: 'roundup', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} } })
      expect(await ui.find({ type: 'Text', text: /No active roundup team/ })).toBeDefined()
      await ui.unmount()
    }
  })
})
