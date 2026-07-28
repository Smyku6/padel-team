import type { Match } from './types'

export function generatePairs(players: string[]): [string, string][] {
  const pairs: [string, string][] = []
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      pairs.push([players[i], players[j]])
    }
  }
  return pairs
}

export function generateMatches(players: string[]): Match[] {
  const pairs = generatePairs(players)
  const matches: Match[] = []

  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const team1 = pairs[i]
      const team2 = pairs[j]
      const t1Set = new Set(team1)
      if (t1Set.has(team2[0]) || t1Set.has(team2[1])) continue

      matches.push({
        id: `${team1[0]}-${team1[1]}_vs_${team2[0]}-${team2[1]}`,
        team1,
        team2,
        score1: '',
        score2: '',
        startTimestamp: null,
        timestamp: null,
      })
    }
  }

  return scheduleMatches(players, matches)
}

function getPlaying(m: Match): string[] {
  return [m.team1[0], m.team1[1], m.team2[0], m.team2[1]]
}

function scheduleMatches(players: string[], unscheduled: Match[]): Match[] {
  if (unscheduled.length === 0) return []

  const remaining = [...unscheduled]
  const result: Match[] = []

  // lastSatOut[p]  = step index when p last sat out  (-Infinity = never)
  // satCount[p]  = how many times p has sat out so far (primary fairness metric)
  const satCount: Record<string, number> = {}
  players.forEach(p => (satCount[p] = 0))

  // lastSatOut[p] = step when p last sat out (tie-break within same satCount)
  const lastSatOut: Record<string, number> = {}
  players.forEach(p => (lastSatOut[p] = -Infinity))

  // lastPaired["A|B"] = step when this pair last played together (tertiary)
  const lastPaired: Record<string, number> = {}
  const pairKey = (a: string, b: string) => [a, b].sort().join('|')

  const recordMatch = (m: Match, step: number) => {
    const playing = new Set(getPlaying(m))
    players.filter(p => !playing.has(p)).forEach(p => {
      satCount[p]++
      lastSatOut[p] = step
    })
    lastPaired[pairKey(m.team1[0], m.team1[1])] = step
    lastPaired[pairKey(m.team2[0], m.team2[1])] = step
  }

  const first = remaining.splice(0, 1)[0]
  result.push(first)
  recordMatch(first, 0)

  while (remaining.length > 0) {
    const prev = result[result.length - 1]
    const prevPlaying = new Set(getPlaying(prev))
    const mustPlay = players.filter(p => !prevPlaying.has(p))

    const valid = remaining.filter(m => mustPlay.every(p => getPlaying(m).includes(p)))
    const pool = valid.length > 0 ? valid : remaining

    const score = (m: Match) => {
      const sittingOut = players.filter(p => !getPlaying(m).includes(p))
      // Primary: prefer sitters who have paused LEAST (equalize sit-outs)
      const sitCountScore = Math.max(...sittingOut.map(p => satCount[p]))
      // Secondary: among equal count, prefer those who sat out longest ago
      const sitRecencyScore = Math.max(...sittingOut.map(p => lastSatOut[p]))
      // Tertiary: prefer pairs that haven't played together recently
      const pairScore = Math.max(
        lastPaired[pairKey(m.team1[0], m.team1[1])] ?? -Infinity,
        lastPaired[pairKey(m.team2[0], m.team2[1])] ?? -Infinity,
      )
      return { sitCountScore, sitRecencyScore, pairScore }
    }

    const chosen = pool.reduce((best, m) => {
      const ms = score(m)
      const bs = score(best)
      if (ms.sitCountScore !== bs.sitCountScore) return ms.sitCountScore < bs.sitCountScore ? m : best
      if (ms.sitRecencyScore !== bs.sitRecencyScore) return ms.sitRecencyScore < bs.sitRecencyScore ? m : best
      return ms.pairScore < bs.pairScore ? m : best
    })

    remaining.splice(remaining.indexOf(chosen), 1)
    result.push(chosen)
    recordMatch(chosen, result.length - 1)
  }

  return result
}

export function saveToStorage(key: string, data: unknown) {
  localStorage.setItem(key, JSON.stringify(data))
}

export function loadFromStorage<T>(key: string): T | null {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function exportToJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
