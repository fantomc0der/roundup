export type Kind = 'advisor' | 'builder' | 'reviewer'

export type Identity = {
  team: string
  name: string
  kind: Kind
  lead: string
  leadSessionId?: string
  dir: string
  brief?: string
}

export type ManifestTeammate = { name: string; kind: string; paneId: string; brief?: string | null; kickoff?: string }
export type Manifest = { team: string; lead: string; leadSessionId?: string | null; dir: string; status: string; teammates: ManifestTeammate[] }

// The variables the mod reads; register.tsx spells each as a literal for the validator.
export type TeammateEnv = {
  team?: string
  dir?: string
  lead?: string
  leadSessionId?: string
  name?: string
  kind?: string
  brief?: string
  paneId?: string
}

const asKind = (value: string | undefined): Kind => (value === 'builder' || value === 'reviewer' ? value : 'advisor')

export const manifestPath = (dir: string) => `${dir}/manifest.json`

export function parseManifest(text: string | undefined): Manifest | undefined {
  if (!text) return undefined
  try {
    return JSON.parse(text) as Manifest
  } catch {
    return undefined
  }
}

// A teammate spawned into a split pane carries its full identity in the pane's
// environment. The first teammate of a tab or workspace took the container's root
// pane, which only carries the team-level variables, so it is found in the
// manifest by the pane id herdr itself puts in every pane.
export function identityFrom(env: TeammateEnv, manifest: Manifest | undefined): Identity | null {
  if (!env.team || !env.dir) return null
  const leadSessionId = env.leadSessionId || undefined
  if (env.name) {
    return { team: env.team, name: env.name, kind: asKind(env.kind), lead: env.lead ?? '', leadSessionId, dir: env.dir, brief: env.brief || undefined }
  }
  if (!env.paneId) return null
  const entry = manifest?.teammates.find(t => t.paneId === env.paneId)
  if (!entry) return null
  return {
    team: env.team,
    name: entry.name,
    kind: asKind(entry.kind),
    lead: manifest?.lead || env.lead || '',
    leadSessionId: manifest?.leadSessionId || leadSessionId,
    dir: env.dir,
    brief: entry.brief || undefined,
  }
}

export const needsKickoff = (manifest: Manifest | undefined, name: string) => {
  const entry = manifest?.teammates.find(t => t.name === name)
  return !entry || entry.kickoff === 'pending'
}

// The manifest text with the teammate's kickoff marked as the mod's, or undefined when nothing changes.
export function withKickoffStamped(manifest: Manifest | undefined, name: string): string | undefined {
  const entry = manifest?.teammates.find(t => t.name === name)
  if (!manifest || !entry || entry.kickoff === 'mod') return undefined
  entry.kickoff = 'mod'
  return JSON.stringify(manifest, null, 2) + '\n'
}

export const kickoffText = (me: Identity) =>
  `Read your briefing at ${me.brief} and begin. Your lead is the session named ${me.lead}; report to it with SendMessage when you have something worth saying, and reply to teammates at the from address of their messages.`
