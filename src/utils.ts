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

  return assignSides(players, scheduleMatches(players, matches))
}

function getPlaying(m: Match): string[] {
  return [m.team1[0], m.team1[1], m.team2[0], m.team2[1]]
}

function scheduleMatches(players: string[], unscheduled: Match[]): Match[] {
  if (unscheduled.length === 0) return []

  const remaining = [...unscheduled]
  const result: Match[] = []

  // satCount[p] = how many times p has sat out so far (primary fairness metric)
  const satCount: Record<string, number> = {}
  players.forEach(p => (satCount[p] = 0))

  // lastSatOut[p] = step when p last sat out (tie-break within same satCount)
  const lastSatOut: Record<string, number> = {}
  players.forEach(p => (lastSatOut[p] = -Infinity))

  // streak[p] = how many consecutive matches p has played in a row
  const streak: Record<string, number> = {}
  players.forEach(p => (streak[p] = 0))

  // lastPaired["A|B"] = step when this pair last played together (quaternary)
  const lastPaired: Record<string, number> = {}
  const pairKey = (a: string, b: string) => [a, b].sort().join('|')

  const recordMatch = (m: Match, step: number) => {
    const playing = new Set(getPlaying(m))
    players.forEach(p => {
      if (playing.has(p)) {
        streak[p]++
      } else {
        satCount[p]++
        lastSatOut[p] = step
        streak[p] = 0
      }
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

    // Fallback: minimize violations by picking matches with most mustPlay players
    const pool = (() => {
      if (valid.length > 0) return valid
      const best = Math.max(...remaining.map(m => mustPlay.filter(p => getPlaying(m).includes(p)).length))
      return remaining.filter(m => mustPlay.filter(p => getPlaying(m).includes(p)).length === best)
    })()

    // Ideal streak before sitting = playing slots / sitting slots per match.
    // 5 players → 4, 6 players → 2, 7+ → 1
    const sittersPerMatch = players.length - 4
    const idealStreak = Math.max(1, Math.round(4 / sittersPerMatch))

    const score = (m: Match) => {
      const sittingOut = players.filter(p => !getPlaying(m).includes(p))
      // Primary: avoid over-sitting anyone (don't let max satCount grow unevenly)
      const sitCountMax = Math.max(...sittingOut.map(p => satCount[p]))
      // Secondary: actively catch up under-paused players (prefer group containing
      // the player who has sat the fewest times so far)
      const sitCountMin = Math.min(...sittingOut.map(p => satCount[p]))
      // Tertiary: penalise making someone sit before they've hit their ideal streak
      // (too early = bad). Overdue players get penalty 0 — never avoid them.
      const streakScore = Math.max(...sittingOut.map(p => Math.max(0, idealStreak - streak[p])))
      // Quaternary: prefer those who sat out longest ago
      const sitRecencyScore = Math.max(...sittingOut.map(p => lastSatOut[p]))
      // Quinary: prefer pairs that haven't played together recently
      const pairScore = Math.max(
        lastPaired[pairKey(m.team1[0], m.team1[1])] ?? -Infinity,
        lastPaired[pairKey(m.team2[0], m.team2[1])] ?? -Infinity,
      )
      return { sitCountMax, sitCountMin, streakScore, sitRecencyScore, pairScore }
    }

    const chosen = pool.reduce((best, m) => {
      const ms = score(m)
      const bs = score(best)
      if (ms.sitCountMax !== bs.sitCountMax) return ms.sitCountMax < bs.sitCountMax ? m : best
      if (ms.sitCountMin !== bs.sitCountMin) return ms.sitCountMin < bs.sitCountMin ? m : best
      if (ms.streakScore !== bs.streakScore) return ms.streakScore < bs.streakScore ? m : best
      if (ms.sitRecencyScore !== bs.sitRecencyScore) return ms.sitRecencyScore < bs.sitRecencyScore ? m : best
      return ms.pairScore < bs.pairScore ? m : best
    })

    remaining.splice(remaining.indexOf(chosen), 1)
    result.push(chosen)
    recordMatch(chosen, result.length - 1)
  }

  return result
}

// Assigns which team plays on which side of the court so that every player
// ends up with (nearly) equal left-side and right-side match counts.
function assignSides(players: string[], scheduled: Match[]): Match[] {
  // sideBalance[p] = leftCount[p] - rightCount[p]; target: 0 for everyone
  const sideBalance: Record<string, number> = {}
  players.forEach(p => (sideBalance[p] = 0))

  return scheduled.map(m => {
    // Sum of |balance + delta| for each player given a side assignment
    const cost = (leftTeam: [string, string], rightTeam: [string, string]) =>
      leftTeam.reduce((s, p) => s + Math.abs(sideBalance[p] + 1), 0) +
      rightTeam.reduce((s, p) => s + Math.abs(sideBalance[p] - 1), 0)

    const swapped = cost(m.team2, m.team1) < cost(m.team1, m.team2)
    const leftTeam  = swapped ? m.team2 : m.team1
    const rightTeam = swapped ? m.team1 : m.team2

    leftTeam.forEach(p  => sideBalance[p]++)
    rightTeam.forEach(p => sideBalance[p]--)

    if (!swapped) return m
    return {
      ...m,
      id: `${leftTeam[0]}-${leftTeam[1]}_vs_${rightTeam[0]}-${rightTeam[1]}`,
      team1: leftTeam,
      team2: rightTeam,
    }
  })
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
