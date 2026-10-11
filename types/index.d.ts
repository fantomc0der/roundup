export type TeammateRow = {
  name: string
  kind: string
  role: string
  state: string
  paneId: string
  kickoff: string
  lastMessage?: string
  lastMessageAt?: number
}

export type TaskSummary = {
  total: number
  pending: number
  inProgress: number
  done: number
  blocked: number
}

export type TeamView = {
  team: string
  status: string
  layout: string
  retention: string
  lead: string
  dir: string
  teammates: TeammateRow[]
  tasks?: TaskSummary
  polledAt: number
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    roundup: { team: TeamView | null }
  }
}
