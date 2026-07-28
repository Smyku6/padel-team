export interface Match {
  id: string
  team1: [string, string]
  team2: [string, string]
  score1: string
  score2: string
  startTimestamp: number | null
  timestamp: number | null
}

export interface SessionData {
  players: string[]
  matches: Match[]
  createdAt: number
  startedAt: number | null
  endedAt: number | null
}
