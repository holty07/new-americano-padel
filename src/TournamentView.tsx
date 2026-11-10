import { useMemo, useState } from 'react';
import { computeStandings, matchKey } from './standings';
import { describeWindow, formatDuration } from './time';
import type { Round, Tournament } from './types';

interface TournamentViewProps {
  tournament: Tournament;
  onChange: (next: Tournament) => void;
}

type Tab = 'schedule' | 'standings';

export function TournamentView({ tournament, onChange }: TournamentViewProps) {
  const [tab, setTab] = useState<Tab>('schedule');
  const [openScore, setOpenScore] = useState<string | null>(null);
  const names = tournament.playerNames;
  const standings = useMemo(() => computeStandings(tournament), [tournament]);
  const totalMinutes = tournament.rounds.length * tournament.minutesPerRound;
  const window = describeWindow(totalMinutes);

  const { minRest, maxRest, backToBackRests } = useMemo(
    () => restSummary(tournament.rounds, names.length),
    [tournament.rounds, names.length],
  );

  const partnershipRepeats = useMemo(() => countRepeatPairings(tournament.rounds), [tournament.rounds]);
  const hasScores = standings.some((row) => row.played > 0);
  const nameFor = (index: number) => names[index] ?? `Player ${index + 1}`;

  function setScore(roundIndex: number, court: number, a: number, b: number) {
    onChange({
      ...tournament,
      scores: { ...tournament.scores, [matchKey(roundIndex, court)]: { a, b } },
    });
  }

  function clearScore(roundIndex: number, court: number) {
    const scores = { ...tournament.scores };
    delete scores[matchKey(roundIndex, court)];
    onChange({ ...tournament, scores });
  }

  return (
    <div className="tournament">
      <section className="tournament-head">
        <div>
          <p className="eyebrow">Current draw</p>
          <h2>
            {names.length} players &middot; {tournament.courts} court
            {tournament.courts === 1 ? '' : 's'} &middot; games to {tournament.maxScore}
          </h2>
        </div>
        <span className={`badge badge-${window.tone}`}>{window.label}</span>
      </section>

      <div className="stats">
        <Stat label="Rounds" value={String(tournament.rounds.length)} />
        <Stat
          label="Est. time"
          value={formatDuration(totalMinutes)}
          hint={`${tournament.minutesPerRound} min per round`}
        />
        <Stat label="Rests per player" value={`${minRest}–${maxRest}`} hint={`${backToBackRests} back-to-back`} />
        <Stat
          label="Partnerships"
          value={partnershipRepeats === 0 ? 'All unique' : `${partnershipRepeats} repeat${partnershipRepeats === 1 ? '' : 's'}`}
          hint="Every pair partners at least once"
        />
      </div>

      {totalMinutes > 120 && (
        <p className="notice">
          Full partner coverage needs {tournament.rounds.length} rounds &mdash; about{' '}
          {formatDuration(totalMinutes)}, roughly {formatDuration(totalMinutes - 120)} past two hours.
          Add a court or trim the roster to shorten the night.
        </p>
      )}

      {partnershipRepeats > 0 && (
        <p className="notice notice-soft">
          Every player partners everyone else at least once. {partnershipRepeats} pairing
          {partnershipRepeats === 1 ? '' : 's'} had to repeat to complete a match &mdash; an odd number
          of partnerships cannot be split into four-player games.
        </p>
      )}

      {maxRest - minRest > 1 && (
        <p className="notice notice-soft">
          Rest counts run from {minRest} to {maxRest}. A perfectly even split is not possible with{' '}
          {names.length} players on {tournament.courts} court{tournament.courts === 1 ? '' : 's'}.
        </p>
      )}

      {backToBackRests > 0 && (
        <p className="notice notice-soft">
          {backToBackRests} back-to-back rest{backToBackRests === 1 ? ' was' : 's were'} unavoidable
          with this roster size.
        </p>
      )}

      {tournament.uncoveredPairs > 0 && (
        <p className="notice notice-danger">
          {tournament.uncoveredPairs} partnership{tournament.uncoveredPairs === 1 ? '' : 's'} could not
          be scheduled. Redraw, add a court, or adjust the roster.
        </p>
      )}

      <div className="tabs" role="tablist" aria-label="Tournament views">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'schedule'}
          className={`tab${tab === 'schedule' ? ' active' : ''}`}
          onClick={() => setTab('schedule')}
        >
          Schedule
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'standings'}
          className={`tab${tab === 'standings' ? ' active' : ''}`}
          onClick={() => setTab('standings')}
        >
          Standings
        </button>
      </div>

      {tab === 'schedule' ? (
        <div className="rounds">
          {tournament.rounds.map((round, roundIndex) => (
            <article className="round" key={roundIndex}>
              <header className="round-head">
                <h3>Round {roundIndex + 1}</h3>
                <p className="rest-line">
                  {round.resting.length === 0
                    ? 'Everyone plays'
                    : `Resting: ${round.resting.map(nameFor).join(', ')}`}
                </p>
              </header>

              {round.matches.map((match) => {
                const key = matchKey(roundIndex, match.court);
                const score = tournament.scores[key] ?? { a: null, b: null };
                const complete = score.a !== null && score.b !== null;
                const isOpen = openScore === key;

                return (
                  <div className="match-block" key={match.court}>
                    <div className="match">
                      <span className="court">Court {match.court}</span>
                      <div className="team team-a">
                        <span>{nameFor(match.teamA[0])}</span>
                        <span className="amp">&amp;</span>
                        <span>{nameFor(match.teamA[1])}</span>
                      </div>
                      <button
                        type="button"
                        className={`score-chip${complete ? ' filled' : ''}`}
                        aria-expanded={isOpen}
                        aria-label={
                          complete
                            ? `Round ${roundIndex + 1}, court ${match.court}, score ${score.a} to ${score.b}. Change score`
                            : `Enter score for round ${roundIndex + 1}, court ${match.court}`
                        }
                        onClick={() => setOpenScore(isOpen ? null : key)}
                      >
                        {complete ? `${score.a} – ${score.b}` : 'Enter score'}
                      </button>
                      <div className="team team-b">
                        <span>{nameFor(match.teamB[0])}</span>
                        <span className="amp">&amp;</span>
                        <span>{nameFor(match.teamB[1])}</span>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="score-picker">
                        <p className="score-picker-label">
                          Pick the final score &mdash; {tournament.maxScore} points in total
                        </p>
                        <div className="score-options">
                          {scoreOptions(tournament.maxScore).map(([a, b]) => (
                            <button
                              key={`${a}-${b}`}
                              type="button"
                              className={`score-option${
                                score.a === a && score.b === b ? ' selected' : ''
                              }`}
                              aria-label={`Round ${roundIndex + 1}, court ${match.court}: ${a} to ${b}`}
                              onClick={() => {
                                setScore(roundIndex, match.court, a, b);
                                setOpenScore(null);
                              }}
                            >
                              {a}–{b}
                            </button>
                          ))}
                        </div>
                        {complete && (
                          <button
                            type="button"
                            className="score-clear"
                            onClick={() => {
                              clearScore(roundIndex, match.court);
                              setOpenScore(null);
                            }}
                          >
                            Clear score
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </article>
          ))}
        </div>
      ) : (
        <section className="panel">
          <div className="panel-head">
            <h2>Standings</h2>
            <p>Each player collects their team&apos;s points from every game.</p>
          </div>

          <table className="standings">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col">Played</th>
                <th scope="col">Rests</th>
                <th scope="col" className="points">
                  Points
                </th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, position) => (
                <tr key={row.index} className={position === 0 && hasScores ? 'leader' : undefined}>
                  <td className="rank">{position + 1}</td>
                  <td>{row.name}</td>
                  <td>{row.played}</td>
                  <td>{row.rests}</td>
                  <td className="points">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {!hasScores && <p className="empty">No scores yet &mdash; enter them on the Schedule tab.</p>}
        </section>
      )}
    </div>
  );
}

function scoreOptions(maxScore: number): Array<[number, number]> {
  const total = Math.max(0, Math.floor(maxScore));
  return Array.from({ length: total + 1 }, (_, index) => [total - index, index] as [number, number]);
}

function countRepeatPairings(rounds: Round[]): number {
  const counts = new Map<string, number>();

  for (const round of rounds) {
    for (const match of round.matches) {
      for (const team of [match.teamA, match.teamB]) {
        const key = team[0] < team[1] ? `${team[0]}-${team[1]}` : `${team[1]}-${team[0]}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }

  let repeats = 0;
  for (const count of counts.values()) if (count > 1) repeats += count - 1;
  return repeats;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

function restSummary(rounds: Round[], playerCount: number) {
  const restCounts = new Array<number>(playerCount).fill(0);
  let backToBackRests = 0;
  const restedLast = new Array<boolean>(playerCount).fill(false);

  for (const round of rounds) {
    const resting = new Set(round.resting);
    for (let player = 0; player < playerCount; player += 1) {
      const rests = resting.has(player);
      if (rests) {
        restCounts[player] += 1;
        if (restedLast[player]) backToBackRests += 1;
      }
      restedLast[player] = rests;
    }
  }

  return {
    minRest: Math.min(...restCounts),
    maxRest: Math.max(...restCounts),
    backToBackRests,
  };
}
