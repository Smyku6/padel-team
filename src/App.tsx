import { useState, useEffect, useMemo } from 'react'
import type { Match, SessionData } from './types'
import { generateMatches, saveToStorage, loadFromStorage, exportToJson } from './utils'

const STORAGE_KEY = 'padel-session'
const DEFAULT_NAMES = ['Dawid', 'Michał', 'Paweł', 'Adam', 'Bartosz', 'Stefan']

const PLAYER_COLORS = [
  { color: '#60a5fa', bg: '#0c1a2e', border: '#60a5fa44' }, // niebieski
  { color: '#f87171', bg: '#2a0d0d', border: '#f8717144' }, // czerwony
  { color: '#4ade80', bg: '#052e16', border: '#4ade8044' }, // zielony
  { color: '#fbbf24', bg: '#2a1f00', border: '#fbbf2444' }, // żółty
  { color: '#c084fc', bg: '#1e0a2e', border: '#c084fc44' }, // fioletowy
  { color: '#fb923c', bg: '#2a1100', border: '#fb923c44' }, // pomarańczowy
  { color: '#2dd4bf', bg: '#022a26', border: '#2dd4bf44' }, // teal
  { color: '#f472b6', bg: '#2a0d1a', border: '#f472b644' }, // róż
  { color: '#a3e635', bg: '#1a2a00', border: '#a3e63544' }, // limonka
  { color: '#38bdf8', bg: '#032233', border: '#38bdf844' }, // błękit
]

function App() {
  const [step, setStep] = useState<'setup' | 'matches'>('setup')
  const [playerCount, setPlayerCount] = useState<number>(6)
  const [playerNames, setPlayerNames] = useState<string[]>(DEFAULT_NAMES)
  const [matches, setMatches] = useState<Match[]>([])
  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all')
  const [tab, setTab] = useState<'matches' | 'ranking' | 'chart' | 'pairs'>('matches')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [endedAt, setEndedAt] = useState<number | null>(null)
  const [showEndModal, setShowEndModal] = useState(false)
  const [readOnly, setReadOnly] = useState(false)
  const [shareId, setShareId] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)

  const colorOf = (name: string) => {
    const idx = playerNames.indexOf(name)
    return PLAYER_COLORS[idx % PLAYER_COLORS.length]
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sid = params.get('s')
    if (sid) {
      setShareId(sid)
      setReadOnly(true)
      fetch(`${import.meta.env.BASE_URL}sessions/${sid}.json`)
        .then(r => { if (!r.ok) throw new Error(); return r.json() })
        .then((data: SessionData) => {
          setPlayerNames(data.players)
          setPlayerCount(data.players.length)
          setMatches(data.matches)
          setStartedAt(data.startedAt ?? null)
          setEndedAt(data.endedAt ?? null)
          setStep('matches')
        })
        .catch(() => alert('Nie znaleziono sesji o podanym ID.'))
      return
    }
    const saved = loadFromStorage<SessionData>(STORAGE_KEY)
    if (saved) {
      setPlayerNames(saved.players)
      setPlayerCount(saved.players.length)
      setMatches(saved.matches)
      setStartedAt(saved.startedAt ?? null)
      setEndedAt(saved.endedAt ?? null)
      setStep('matches')
    }
  }, [])

  function handlePlayerCountChange(count: number) {
    setPlayerCount(count)
    setPlayerNames(prev => {
      if (count <= prev.length) return prev.slice(0, count)
      return [...prev, ...DEFAULT_NAMES.slice(prev.length, count), ...Array(Math.max(0, count - DEFAULT_NAMES.length)).fill('')]
    })
  }

  function handleNameChange(index: number, value: string) {
    setPlayerNames(prev => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  function handleStart() {
    const trimmed = playerNames.map(n => n.trim())
    const generated = generateMatches(trimmed)
    const now = Date.now()
    const session: SessionData = {
      players: trimmed,
      matches: generated,
      createdAt: now,
      startedAt: now,
      endedAt: null,
    }
    saveToStorage(STORAGE_KEY, session)
    setMatches(generated)
    setStartedAt(now)
    setEndedAt(null)
    setStep('matches')
  }

  function handleScoreChange(id: string, field: 'score1' | 'score2', value: string) {
    setMatches(prev => {
      const next = prev.map(m => {
        if (m.id !== id) return m
        const updated = { ...m }

        if (value === '') {
          updated.score1 = ''
          updated.score2 = ''
          updated.startTimestamp = null
          updated.timestamp = null
          return updated
        }

        const num = parseInt(value)
        if (isNaN(num) || num < 0 || num > 21) return m

        const other = String(21 - num)
        updated.score1 = field === 'score1' ? String(num) : other
        updated.score2 = field === 'score2' ? String(num) : other

        if (updated.timestamp === null) {
          const now = Date.now()
          const completedTimestamps = prev
            .filter(m2 => m2.id !== id && m2.timestamp !== null)
            .map(m2 => m2.timestamp as number)
          updated.startTimestamp = completedTimestamps.length > 0
            ? Math.max(...completedTimestamps)
            : (startedAt ?? now)
          updated.timestamp = now
        }

        return updated
      })
      const session: SessionData = {
        players: playerNames,
        matches: next,
        createdAt: Date.now(),
        startedAt,
        endedAt,
      }
      saveToStorage(STORAGE_KEY, session)
      return next
    })
  }

  function handleReset() {
    if (!confirm('Na pewno reset? Wyniki zostaną usunięte.')) return
    localStorage.removeItem(STORAGE_KEY)
    setStep('setup')
    setMatches([])
    setStartedAt(null)
    setEndedAt(null)
    setPlayerNames(Array(playerCount).fill(''))
  }

  function handleEndTournament() {
    const now = Date.now()
    setEndedAt(now)
    setShowEndModal(false)
    const saved = loadFromStorage<SessionData>(STORAGE_KEY)
    const updated = { ...saved, endedAt: now }
    saveToStorage(STORAGE_KEY, updated)
    exportToJson(updated, `padel-wyniki-${new Date(now).toISOString().slice(0, 10)}.json`)
  }

  function handleExport() {
    const saved = loadFromStorage<SessionData>(STORAGE_KEY)
    exportToJson(saved, `padel-wyniki-${new Date().toISOString().slice(0, 10)}.json`)
  }

  function handleImport() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string) as SessionData
          if (!data.players || !data.matches) throw new Error()
          saveToStorage(STORAGE_KEY, data)
          setPlayerNames(data.players)
          setPlayerCount(data.players.length)
          setMatches(data.matches)
          setStartedAt(data.startedAt ?? null)
          setEndedAt(data.endedAt ?? null)
          setStep('matches')
        } catch {
          alert('Nieprawidłowy plik JSON — brak wymaganych pól players/matches.')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  const allFilled = playerNames.every(n => n.trim().length > 0)
  const uniqueNames = new Set(playerNames.map(n => n.trim().toLowerCase()))
  const hasDuplicates = uniqueNames.size !== playerNames.length
  const previewMatchCount = allFilled && !hasDuplicates
    ? generateMatches(playerNames.map(n => n.trim())).length
    : null

  const donCount = matches.filter(m => m.timestamp !== null).length
  const filtered = matches.filter(m => {
    if (filter === 'pending') return m.timestamp === null
    if (filter === 'done') return m.timestamp !== null
    return true
  })

  const courtTime = useMemo(() => {
    const time: Record<string, number> = {}
    playerNames.forEach(p => (time[p] = 0))
    for (const m of matches) {
      if (m.timestamp && m.startTimestamp) {
        const dur = m.timestamp - m.startTimestamp
        ;[...m.team1, ...m.team2].forEach(p => (time[p] += dur))
      }
    }
    return time
  }, [matches, playerNames])

  const pauseTime = useMemo(() => {
    const time: Record<string, number> = {}
    const count: Record<string, number> = {}
    playerNames.forEach(p => { time[p] = 0; count[p] = 0 })
    for (const m of matches) {
      if (m.timestamp && m.startTimestamp) {
        const dur = m.timestamp - m.startTimestamp
        const playing = new Set([...m.team1, ...m.team2])
        playerNames.forEach(p => {
          if (!playing.has(p)) {
            time[p] += dur
            count[p]++
          }
        })
      }
    }
    return { time, count }
  }, [matches, playerNames])

  const PAUSE_POINTS = 11

  const ranking = useMemo(() => {
    const stats: Record<string, { wins: number; points: number; pauses: number; played: number }> = {}
    playerNames.forEach(p => (stats[p] = { wins: 0, points: 0, pauses: 0, played: 0 }))

    for (const m of matches) {
      const playing = new Set([m.team1[0], m.team1[1], m.team2[0], m.team2[1]])
      const isCompleted = m.timestamp !== null && m.score1 !== '' && m.score2 !== ''

      if (isCompleted) {
        const s1 = parseInt(m.score1)
        const s2 = parseInt(m.score2)
        const t1won = s1 > s2

        for (const p of m.team1) {
          stats[p].played++
          stats[p].points += s1
          if (t1won) stats[p].wins++
        }
        for (const p of m.team2) {
          stats[p].played++
          stats[p].points += s2
          if (!t1won) stats[p].wins++
        }
        for (const p of playerNames) {
          if (!playing.has(p)) {
            stats[p].pauses++
            stats[p].points += PAUSE_POINTS
          }
        }
      }
    }

    return playerNames
      .map(p => ({ name: p, ...stats[p], total: stats[p].points }))
      .sort((a, b) => b.total - a.total || b.wins - a.wins)
  }, [matches, playerNames])

  const pairStats = useMemo(() => {
    const stats: Record<string, { played: number; wins: number; points: number; against: number }> = {}
    const pairKey = (a: string, b: string) => [a, b].sort().join('|')

    for (const m of matches) {
      const isCompleted = m.timestamp !== null && m.score1 !== '' && m.score2 !== ''
      if (!isCompleted) continue
      const s1 = parseInt(m.score1)
      const s2 = parseInt(m.score2)
      const t1won = s1 > s2

      const key1 = pairKey(m.team1[0], m.team1[1])
      const key2 = pairKey(m.team2[0], m.team2[1])

      if (!stats[key1]) stats[key1] = { played: 0, wins: 0, points: 0, against: 0 }
      if (!stats[key2]) stats[key2] = { played: 0, wins: 0, points: 0, against: 0 }

      stats[key1].played++
      stats[key1].points += s1
      stats[key1].against += s2
      if (t1won) stats[key1].wins++

      stats[key2].played++
      stats[key2].points += s2
      stats[key2].against += s1
      if (!t1won) stats[key2].wins++
    }

    return Object.entries(stats)
      .map(([key, s]) => {
        const [a, b] = key.split('|')
        const winRate = s.played > 0 ? (s.wins / s.played) * 100 : 0
        return { key, a, b, ...s, winRate }
      })
      .sort((x, y) => y.winRate - x.winRate || y.wins - x.wins || y.played - x.played)
  }, [matches])

  const fmtMs = (ms: number) => {
    const s = Math.floor(ms / 1000)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) return `${h}h ${m}min`
    if (m > 0) return `${m}min ${sec}s`
    return `${sec}s`
  }

  if (step === 'setup') {
    return (
      <div className="container">
        <h1>Padel Team</h1>
        <p className="subtitle">Generuj mecze 2v2 dla całej grupy</p>

        <div className="card">
          <label className="section-label">Ilu graczy?</label>
          <div className="count-buttons">
            {[4, 5, 6, 7, 8, 9, 10].map(n => (
              <button
                key={n}
                className={`count-btn ${playerCount === n ? 'active' : ''}`}
                onClick={() => handlePlayerCountChange(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <label className="section-label">Nazwy graczy</label>
          <div className="players-grid">
            {playerNames.map((name, i) => (
              <input
                key={i}
                className="player-input"
                type="text"
                placeholder={`Gracz ${i + 1}`}
                value={name}
                onChange={e => handleNameChange(i, e.target.value)}
              />
            ))}
          </div>
          {hasDuplicates && (
            <p className="error">Nazwy graczy muszą być unikalne!</p>
          )}
        </div>

        <button
          className="btn-primary"
          onClick={handleStart}
          disabled={!allFilled || hasDuplicates}
        >
          Generuj mecze{previewMatchCount !== null ? ` (${previewMatchCount})` : ''}
        </button>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="header-row">
        <h1>Padel Team {readOnly && <span className="readonly-badge">tylko do odczytu</span>}</h1>
        <div className="header-actions">
          {!readOnly && <button className="btn-secondary" onClick={handleImport}>Import JSON</button>}
          {!readOnly && <button className="btn-secondary" onClick={handleExport}>Eksport JSON</button>}
          {!readOnly && <button className="btn-danger" onClick={handleReset}>Reset</button>}
        </div>
      </div>

      <div className="players-bar">
        {playerNames.map((name, i) => {
          const c = PLAYER_COLORS[i % PLAYER_COLORS.length]
          return (
            <span key={i} className="player-tag" style={{ color: c.color, background: c.bg, borderColor: c.border }}>
              {name}
            </span>
          )
        })}
      </div>

      <div className="progress-bar-wrap">
        <div className="progress-info">
          <span>Ukończone: <strong>{donCount}</strong> / {matches.length}</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${matches.length ? (donCount / matches.length) * 100 : 0}%` }} />
        </div>
      </div>

      {startedAt && (
        <div className="tournament-times">
          <div className="tournament-started">
            <span className="tournament-started-label">Start</span>
            <span className="tournament-started-time">
              {new Date(startedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          {endedAt ? (
            <div className="tournament-ended">
              <span className="tournament-started-label">Koniec</span>
              <span className="tournament-ended-time">
                {new Date(endedAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          ) : (
            !readOnly && (
              <button className="btn-end-tournament" onClick={() => setShowEndModal(true)}>
                Zakończ turniej
              </button>
            )
          )}
        </div>
      )}

      {showEndModal && (
        <div className="modal-overlay" onClick={() => setShowEndModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Zakończyć turniej?</h2>
            <p className="modal-desc">Wyniki zostaną automatycznie wyeksportowane do pliku JSON.</p>
            <div className="modal-actions">
              <button className="modal-btn-cancel" onClick={() => setShowEndModal(false)}>Anuluj</button>
              <button className="modal-btn-confirm" onClick={handleEndTournament}>Zakończ i eksportuj</button>
            </div>
          </div>
        </div>
      )}

      <div className="tab-row">
        <button className={`tab-btn ${tab === 'matches' ? 'active' : ''}`} onClick={() => setTab('matches')}>Mecze</button>
        <button className={`tab-btn ${tab === 'ranking' ? 'active' : ''}`} onClick={() => setTab('ranking')}>Ranking</button>
        <button className={`tab-btn ${tab === 'chart' ? 'active' : ''}`} onClick={() => setTab('chart')}>Czas na korcie</button>
        <button className={`tab-btn ${tab === 'pairs' ? 'active' : ''}`} onClick={() => setTab('pairs')}>Pary</button>
      </div>

      {tab === 'matches' && (
        <>
          <div className="filter-row">
            {(['all', 'pending', 'done'] as const).map(f => (
              <button key={f} className={`filter-btn ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? 'Wszystkie' : f === 'pending' ? 'Do rozegrania' : 'Zakończone'}
              </button>
            ))}
          </div>

          <div className="matches-list">
            {filtered.map((match) => {
              const playing = new Set([match.team1[0], match.team1[1], match.team2[0], match.team2[1]])
              const pausing = playerNames.filter(p => !playing.has(p))
              const matchIdx = matches.indexOf(match)
              const pausingWithStreak = pausing.map(p => {
                let streak = 0
                for (let i = matchIdx - 1; i >= 0; i--) {
                  const prev = matches[i]
                  if ([prev.team1[0], prev.team1[1], prev.team2[0], prev.team2[1]].includes(p)) {
                    streak++
                  } else {
                    break
                  }
                }
                return { name: p, streak }
              })
              return (
                <div key={match.id}>
                  {pausing.length > 0 && (
                    <div className="pausing-bar">
                      <span className="pausing-label">pauzuje:</span>
                      <span className="pausing-names">
                        {pausingWithStreak.map(({ name, streak }, idx) => {
                          const note = streak === 0
                            ? 'pauzował'
                            : streak === 1
                              ? 'grał 1 raz'
                              : `grał ${streak} razy z rzędu`
                          return (
                            <span key={name}>
                              {idx > 0 && ', '}
                              {name} <span className="pausing-streak">({note})</span>
                            </span>
                          )
                        })}
                      </span>
                    </div>
                  )}
                  {(() => {
                    const s1 = match.score1 !== '' ? parseInt(match.score1) : null
                    const s2 = match.score2 !== '' ? parseInt(match.score2) : null
                    const hasResult = s1 !== null && s2 !== null
                    const t1wins = hasResult && s1! > s2!
                    const t2wins = hasResult && s2! > s1!
                    const timeInfo = match.timestamp && match.startTimestamp ? (() => {
                      const secs = Math.round((match.timestamp - match.startTimestamp) / 1000)
                      const mm = Math.floor(secs / 60)
                      const ss = secs % 60
                      const fmt = (ts: number) => new Date(ts).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
                      return {
                        duration: mm > 0 ? `${mm}min ${ss}s` : `${ss}s`,
                        start: fmt(match.startTimestamp),
                        end: fmt(match.timestamp),
                      }
                    })() : null
                    return (
                      <div className="match-card">
                        <div className="match-header">
                          <span className="match-header-num">Mecz #{matches.indexOf(match) + 1}</span>
                          {timeInfo && (
                            <span className="match-header-time">
                              <span className="match-time-range">{timeInfo.start} – {timeInfo.end}</span>
                              <span className="match-time-duration">{timeInfo.duration}</span>
                            </span>
                          )}
                        </div>
                        <div className="match-halves">
                          <div className={`match-half ${hasResult ? (t1wins ? 'half-win' : 'half-loss') : ''}`}>
                            <div className="half-players">
                              <span className="half-player" style={{ color: colorOf(match.team1[0]).color }}>{match.team1[0]}</span>
                              <span className="half-amp">&</span>
                              <span className="half-player" style={{ color: colorOf(match.team1[1]).color }}>{match.team1[1]}</span>
                            </div>
                            {readOnly
                              ? <span className="half-score-ro">{match.score1 !== '' ? match.score1 : '–'}</span>
                              : <input className="half-score" type="number" min="0" max="21" placeholder="–"
                                  value={match.score1} onChange={e => handleScoreChange(match.id, 'score1', e.target.value)} />}
                          </div>
                          <div className="match-divider">
                            <span className="divider-vs">vs</span>
                          </div>
                          <div className={`match-half ${hasResult ? (t2wins ? 'half-win' : 'half-loss') : ''}`}>
                            <div className="half-players">
                              <span className="half-player" style={{ color: colorOf(match.team2[0]).color }}>{match.team2[0]}</span>
                              <span className="half-amp">&</span>
                              <span className="half-player" style={{ color: colorOf(match.team2[1]).color }}>{match.team2[1]}</span>
                            </div>
                            {readOnly
                              ? <span className="half-score-ro">{match.score2 !== '' ? match.score2 : '–'}</span>
                              : <input className="half-score" type="number" min="0" max="21" placeholder="–"
                                  value={match.score2} onChange={e => handleScoreChange(match.id, 'score2', e.target.value)} />}
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        </>
      )}

      {tab === 'ranking' && (
        <div className="ranking-wrap">
          <table className="ranking-table">
            <thead>
              <tr>
                <th className="rank-col-pos">#</th>
                <th className="rank-col-name">Gracz</th>
                <th className="rank-col-num" title="Rozegrane mecze">Mecze</th>
                <th className="rank-col-num" title="Zwycięstwa">Wygrane</th>
                <th className="rank-col-num" title="Przegrane">Przegrane</th>
                <th className="rank-col-num" title={`Pauzy (każda = ${PAUSE_POINTS} pkt)`}>Pauzy</th>
                <th className="rank-col-num" title="Łączne punkty (mecze + pauzy)">Punkty</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r, i) => {
                const c = colorOf(r.name)
                const isFirst = i === 0 && r.total > 0
                return (
                  <tr key={r.name} className={`rank-row ${isFirst ? 'rank-row-first' : ''}`}>
                    <td className="rank-pos">
                      {i === 0 && r.total > 0 ? '🥇' : i === 1 && r.total > 0 ? '🥈' : i === 2 && r.total > 0 ? '🥉' : i + 1}
                    </td>
                    <td className="rank-name">
                      <span className="rank-dot" style={{ background: c.color }} />
                      {r.name}
                    </td>
                    <td className="rank-num">{r.played}</td>
                    <td className="rank-num rank-wins">{r.wins}</td>
                    <td className="rank-num rank-losses">{r.played - r.wins}</td>
                    <td className="rank-num rank-pauses">{r.pauses || '–'}</td>
                    <td className="rank-num rank-total">{r.total}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="ranking-note">Pauza = {PAUSE_POINTS} pkt (standard Americano)</p>

          {(() => {
            const played = matches.filter(m => m.timestamp !== null && m.score1 !== '' && m.score2 !== '')
            if (played.length === 0) return null
            return (
              <div className="history-wrap">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th className="history-name-col">Gracz</th>
                      {played.map((m, i) => (
                        <th key={m.id} className="history-round-col" title={`Mecz #${matches.indexOf(m) + 1}`}>
                          #{matches.indexOf(m) + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map(r => r.name).map(p => {
                      const c = colorOf(p)
                      return (
                        <tr key={p}>
                          <td className="history-name">
                            <span className="rank-dot" style={{ background: c.color }} />
                            {p}
                          </td>
                          {played.map(m => {
                            const s1 = parseInt(m.score1)
                            const s2 = parseInt(m.score2)
                            const inTeam1 = m.team1.includes(p)
                            const inTeam2 = m.team2.includes(p)

                            if (!inTeam1 && !inTeam2) {
                              return (
                                <td key={m.id} className="history-cell">
                                  <span className="hcell hcell-pause" title="Pauza">
                                    {PAUSE_POINTS}
                                  </span>
                                </td>
                              )
                            }

                            const pts = inTeam1 ? s1 : s2
                            const won = inTeam1 ? s1 > s2 : s2 > s1
                            return (
                              <td key={m.id} className="history-cell">
                                <span className={`hcell ${won ? 'hcell-win' : 'hcell-loss'}`}>
                                  {pts}
                                </span>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })()}
        </div>
      )}

      {tab === 'pairs' && (
        <div className="pairs-tab">
          {pairStats.length === 0 ? (
            <div className="chart-empty">
              <p>Zagraj pierwsze mecze, aby zobaczyć statystyki par.</p>
            </div>
          ) : (
            <table className="court-stats-table pairs-table">
              <thead>
                <tr>
                  <th className="cst-name">Para</th>
                  <th className="cst-num">Mecze</th>
                  <th className="cst-num">Wygrane</th>
                  <th className="cst-num">% wygranych</th>
                  <th className="cst-num">Pkt zdobyte</th>
                  <th className="cst-num">Pkt stracone</th>
                  <th className="cst-num">Śr. wynik</th>
                </tr>
              </thead>
              <tbody>
                {pairStats.map(({ key, a, b, played, wins, points, against, winRate }) => {
                  const ca = colorOf(a)
                  const cb = colorOf(b)
                  const avgFor = played > 0 ? (points / played).toFixed(1) : '–'
                  const avgAgainst = played > 0 ? (against / played).toFixed(1) : '–'
                  return (
                    <tr key={key} className="cst-row">
                      <td className="cst-name pair-names">
                        <span className="rank-dot" style={{ background: ca.color }} />
                        <span style={{ color: ca.color }}>{a}</span>
                        <span className="pair-amp">&amp;</span>
                        <span className="rank-dot" style={{ background: cb.color }} />
                        <span style={{ color: cb.color }}>{b}</span>
                      </td>
                      <td className="cst-num">{played}</td>
                      <td className="cst-num cst-total">{wins}</td>
                      <td className="cst-num">
                        <span className={`pair-rate ${winRate >= 50 ? 'pair-rate-win' : 'pair-rate-lose'}`}>
                          {winRate.toFixed(0)}%
                        </span>
                      </td>
                      <td className="cst-num">{points}</td>
                      <td className="cst-num cst-pause">{against}</td>
                      <td className="cst-num pair-avg-score">
                        <span className="pair-rate-win">{avgFor}</span>
                        <span className="pair-avg-sep"> : </span>
                        <span className="pair-rate-lose">{avgAgainst}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'chart' && (() => {
        const totalMs = Object.values(courtTime).reduce((s, v) => s + v, 0)
        const sessionMs = matches
          .filter(m => m.timestamp && m.startTimestamp)
          .reduce((s, m) => s + (m.timestamp! - m.startTimestamp!), 0)

        if (totalMs === 0) return (
          <div className="chart-empty">
            <p>Zagraj pierwsze mecze, aby zobaczyć statystyki czasu na korcie.</p>
          </div>
        )

        const cx = 150, cy = 150, outerR = 120, innerR = 60
        let angle = -Math.PI / 2
        const slices = playerNames
          .filter(p => courtTime[p] > 0)
          .map(p => {
            const sweep = (courtTime[p] / totalMs) * 2 * Math.PI
            const a0 = angle
            angle += sweep
            const a1 = angle
            const large = sweep > Math.PI ? 1 : 0
            const path = [
              `M ${cx + outerR * Math.cos(a0)} ${cy + outerR * Math.sin(a0)}`,
              `A ${outerR} ${outerR} 0 ${large} 1 ${cx + outerR * Math.cos(a1)} ${cy + outerR * Math.sin(a1)}`,
              `L ${cx + innerR * Math.cos(a1)} ${cy + innerR * Math.sin(a1)}`,
              `A ${innerR} ${innerR} 0 ${large} 0 ${cx + innerR * Math.cos(a0)} ${cy + innerR * Math.sin(a0)}`,
              'Z',
            ].join(' ')
            return { p, path, color: colorOf(p).color }
          })

        const courtStats = playerNames
          .map(p => {
            const count = matches.filter(m =>
              m.timestamp && m.startTimestamp &&
              (m.team1.includes(p) || m.team2.includes(p))
            ).length
            return {
              p,
              total: courtTime[p],
              count,
              avg: count > 0 ? courtTime[p] / count : 0,
              pauseTotal: pauseTime.time[p],
              pauseCount: pauseTime.count[p],
            }
          })
          .sort((a, b) => b.total - a.total)

        return (
          <div className="chart-wrap">
            <div className="chart-donut-wrap">
              <svg viewBox="0 0 300 300" className="chart-svg">
                {slices.map(s => (
                  <path key={s.p} d={s.path} fill={s.color} stroke="#0f0f0f" strokeWidth="3" />
                ))}
                <text x={cx} y={cy - 10} className="chart-center-label">czas sesji</text>
                <text x={cx} y={cy + 14} className="chart-center-value">{fmtMs(sessionMs)}</text>
              </svg>
            </div>
            <table className="court-stats-table">
              <thead>
                <tr>
                  <th className="cst-name">Gracz</th>
                  <th className="cst-num">Na korcie</th>
                  <th className="cst-num">Mecze</th>
                  <th className="cst-num">Śr. / mecz</th>
                  <th className="cst-num cst-pause">Pauzy</th>
                  <th className="cst-num cst-pause">Czas pauz</th>
                </tr>
              </thead>
              <tbody>
                {courtStats.map(({ p, total, count, avg, pauseTotal, pauseCount }) => {
                  const c = colorOf(p)
                  return (
                    <tr key={p} className="cst-row">
                      <td className="cst-name">
                        <span className="rank-dot" style={{ background: c.color }} />
                        {p}
                      </td>
                      <td className="cst-num cst-total">{fmtMs(total)}</td>
                      <td className="cst-num">{count}</td>
                      <td className="cst-num cst-avg">{count > 0 ? fmtMs(avg) : '–'}</td>
                      <td className="cst-num cst-pause">{pauseCount}</td>
                      <td className="cst-num cst-pause">{pauseTotal > 0 ? fmtMs(pauseTotal) : '–'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })()}
    </div>
  )
}

export default App
