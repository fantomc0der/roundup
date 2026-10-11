import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

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

function world(on: On, { manifest = MANIFEST as Record<string, unknown> | undefined, files = {} as Record<string, string>, process = okProcess } = {}) {
  const writes: Array<{ path: string; text: string }> = []
  const sent: Array<{ to: unknown; text: string }> = []
  const submitted: string[] = []
  const ran: string[][] = []
  const registered: string[] = []
  const tools: string[] = []
  const status: Array<string | undefined> = []
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('fs.read', (_$, e) => {
    const path = e.path.replace(/\\/g, '/')
    if (path.endsWith('/manifest.json') && manifest) return { value: JSON.stringify(manifest) }
    const hit = Object.entries(files).find(([p]) => p.replace(/\\/g, '/') === path)
    return hit ? { value: hit[1] } : { deny: `ENOENT ${e.path}` }
  })
  on('fs.write', (_$, e) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('fs.list', () => ({ value: [] }))
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
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('session.receive', (_$, e) => ({ text: e.text }))
  on('prompt.compose', () => ({ sections: [{ id: 'core', text: 'base', scope: 'shared' as const }] }))
  return { writes, sent, submitted, ran, registered, tools, status }
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
  test('registers /roundup and stays inert without a team', async ($, on) => {
    mock.env(on, {})
    mock.clock(on)
    const w = world(on, { manifest: undefined })
    await start($)
    expect(w.registered).toEqual(['roundup'])
    expect(w.submitted).toHaveLength(0)
    expect((await $.tool.check({ tool: 'Edit', input: { file_path: 'C:\\proj\\a.ts' } })).decision).toBe('allow')
    const help = await $.command.run({ command: 'roundup', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
    expect(help.text).toContain('/roundup status')
    const none = await $.command.run({ command: 'roundup', args: 'status', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
    expect(none.text).toContain('no active team')
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
    const out = await $.command.run({ command: 'roundup', args: 'init modal --lead lead-1 --size 2', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
    expect(out.text).toContain('team modal ready')
    await clock.settle()
    const init = w.ran.find(a => a.includes('init'))!
    expect(init[0]).toBe('node')
    expect(init.at(-2)).toBe('--lead-session-id')
    expect(init.at(-1)).toBe('lead-session')
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
