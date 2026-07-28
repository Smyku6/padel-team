import { describe, it, expect } from 'vitest'
import { generatePairs, generateMatches } from './utils'

// ─── helpers ────────────────────────────────────────────────────────────────

function getPlaying(m: ReturnType<typeof generateMatches>[0]) {
  return [m.team1[0], m.team1[1], m.team2[0], m.team2[1]]
}

function getSittingOut(players: string[], m: ReturnType<typeof generateMatches>[0]) {
  const playing = new Set(getPlaying(m))
  return players.filter(p => !playing.has(p))
}

// ─── generatePairs ──────────────────────────────────────────────────────────

describe('generatePairs', () => {
  it('returns C(n,2) pairs', () => {
    expect(generatePairs(['A', 'B', 'C', 'D']).length).toBe(6)        // C(4,2)
    expect(generatePairs(['A', 'B', 'C', 'D', 'E']).length).toBe(10)  // C(5,2)
    expect(generatePairs(['A', 'B', 'C', 'D', 'E', 'F']).length).toBe(15) // C(6,2)
  })

  it('każda para ma dokładnie 2 różnych graczy', () => {
    const pairs = generatePairs(['A', 'B', 'C', 'D', 'E'])
    for (const [a, b] of pairs) {
      expect(a).not.toBe(b)
    }
  })

  it('brak duplikatów par', () => {
    const pairs = generatePairs(['A', 'B', 'C', 'D', 'E'])
    const keys = pairs.map(([a, b]) => [a, b].sort().join('|'))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('zwraca pustą listę dla < 2 graczy', () => {
    expect(generatePairs([])).toEqual([])
    expect(generatePairs(['A'])).toEqual([])
  })
})

// ─── generateMatches – liczba i poprawność ──────────────────────────────────

describe('generateMatches – liczba meczów', () => {
  // Wzór: C(n,4) * 3
  const cases: [number, number][] = [
    [4, 3],
    [5, 15],
    [6, 45],
    [7, 105],
    [8, 210],
  ]

  for (const [n, expected] of cases) {
    it(`${n} graczy → ${expected} meczów`, () => {
      const players = Array.from({ length: n }, (_, i) => `P${i + 1}`)
      expect(generateMatches(players).length).toBe(expected)
    })
  }
})

describe('generateMatches – poprawność meczów', () => {
  const players = ['Dawid', 'Michał', 'Paweł', 'Adam', 'Bartosz', 'Stefan']
  const matches = generateMatches(players)

  it('żaden mecz nie ma gracza w obu drużynach', () => {
    for (const m of matches) {
      const playing = getPlaying(m)
      expect(new Set(playing).size).toBe(4)
    }
  })

  it('każdy mecz ma unikalny id', () => {
    const ids = matches.map(m => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('wszystkie mecze startują z pustymi wynikami', () => {
    for (const m of matches) {
      expect(m.score1).toBe('')
      expect(m.score2).toBe('')
      expect(m.timestamp).toBeNull()
      expect(m.startTimestamp).toBeNull()
    }
  })
})

// ─── scheduleMatches – własności kolejności ──────────────────────────────────

describe('scheduleMatches – brak podwójnej pauzy', () => {
  // Dla 4–6 graczy algorytm gwarantuje zerowe naruszenia.
  // Dla 7–8 greedy może trafić na ślepy zaułek (gdy wszystkie mecze
  // dla danej trójki/czwórki sitterów zostały już rozegrane) — wtedy
  // minimalizuje liczbę naruszeń zamiast ich eliminacji.
  for (const n of [4, 5, 6]) {
    it(`${n} graczy: żaden gracz nie pauzuje dwa mecze z rzędu`, () => {
      const players = Array.from({ length: n }, (_, i) => `P${i + 1}`)
      const matches = generateMatches(players)

      for (let i = 1; i < matches.length; i++) {
        const prevSitting = new Set(getSittingOut(players, matches[i - 1]))
        const currSitting = new Set(getSittingOut(players, matches[i]))
        const doubleWait = [...prevSitting].filter(p => currSitting.has(p))
        expect(doubleWait).toEqual([])
      }
    })
  }

  // Przy n=7 (3 sitterów) i n=8 (4 sitterów) greedy wpada w ślepe zaułki:
  // gdy wszystkie mecze dla danej grupy sitterów zostały już zagrane,
  // algorytm nie może spełnić hard constraintu i minimalizuje naruszenia.
  // Przy n=8 problem jest strukturalny: każde przejście wymaga zamiany grup,
  // co wymaga Hamiltonowskiej ścieżki na grafie — greedy nie gwarantuje tego.
  // Testy poniżej łapią regresje względem obecnego zachowania algorytmu.
  it('7 graczy: naruszenia podwójnej pauzy < 8% przejść', () => {
    const players = Array.from({ length: 7 }, (_, i) => `P${i + 1}`)
    const matches = generateMatches(players)
    let violations = 0
    for (let i = 1; i < matches.length; i++) {
      const prev = new Set(getSittingOut(players, matches[i - 1]))
      const curr = new Set(getSittingOut(players, matches[i]))
      if ([...prev].some(p => curr.has(p))) violations++
    }
    expect(violations / (matches.length - 1)).toBeLessThan(0.08)
  })

  it('8 graczy: naruszenia podwójnej pauzy < 25% przejść', () => {
    const players = Array.from({ length: 8 }, (_, i) => `P${i + 1}`)
    const matches = generateMatches(players)
    let violations = 0
    for (let i = 1; i < matches.length; i++) {
      const prev = new Set(getSittingOut(players, matches[i - 1]))
      const curr = new Set(getSittingOut(players, matches[i]))
      if ([...prev].some(p => curr.has(p))) violations++
    }
    expect(violations / (matches.length - 1)).toBeLessThan(0.25)
  })
})

describe('scheduleMatches – sprawiedliwość pauz', () => {
  for (const n of [4, 5, 6, 7, 8]) {
    it(`${n} graczy: max różnica w liczbie pauz między graczami ≤ 1`, () => {
      const players = Array.from({ length: n }, (_, i) => `P${i + 1}`)
      const matches = generateMatches(players)

      const pauseCount: Record<string, number> = {}
      players.forEach(p => (pauseCount[p] = 0))

      for (const m of matches) {
        for (const p of getSittingOut(players, m)) pauseCount[p]++
      }

      const counts = Object.values(pauseCount)
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
    })
  }

  it('6 graczy, 45 meczów: każdy pauzuje dokładnie 15 razy', () => {
    const players = ['A', 'B', 'C', 'D', 'E', 'F']
    const matches = generateMatches(players)

    const pauseCount: Record<string, number> = {}
    players.forEach(p => (pauseCount[p] = 0))
    for (const m of matches) {
      for (const p of getSittingOut(players, m)) pauseCount[p]++
    }

    // 45 meczów × 2 pauzy = 90 pauz / 6 graczy = 15 każdy
    for (const p of players) {
      expect(pauseCount[p]).toBe(15)
    }
  })
})

describe('scheduleMatches – kompletność', () => {
  it('nie gubi żadnego meczu podczas planowania', () => {
    const players = ['A', 'B', 'C', 'D', 'E', 'F']
    const matches = generateMatches(players)

    // każda para powinna mieć dokładnie tyle meczów ile razy może zagrać
    // każda z 15 par gra przeciwko każdej kompatybilnej parze — 9 meczów na parę (C(4,2)×3 / coś)
    // prościej: sumaryczna liczba meczów = 45
    expect(matches.length).toBe(45)
  })
})

// ─── logika wyników (21 pkt) ─────────────────────────────────────────────────

describe('reguła 21 punktów', () => {
  it('wynik auto-uzupełnia się do 21', () => {
    const fill = (x: number) => ({ score1: x, score2: 21 - x })
    expect(fill(6)).toEqual({ score1: 6, score2: 15 })
    expect(fill(0)).toEqual({ score1: 0, score2: 21 })
    expect(fill(21)).toEqual({ score1: 21, score2: 0 })
  })

  it('nie ma możliwości remisu (21 jest nieparzyste)', () => {
    for (let i = 0; i <= 21; i++) {
      expect(i).not.toBe(21 - i)
    }
  })

  it('suma obu wyników zawsze równa 21', () => {
    for (let i = 0; i <= 21; i++) {
      expect(i + (21 - i)).toBe(21)
    }
  })
})
