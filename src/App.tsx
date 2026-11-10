import { useEffect, useState } from 'react';
import { SetupForm } from './SetupForm';
import { TournamentView } from './TournamentView';
import { buildSchedule } from './scheduler';
import type { Tournament } from './types';

const STORAGE_KEY = 'americano-padel.tournament.v1';

export default function App() {
  const [tournament, setTournament] = useState<Tournament | null>(loadTournament);

  useEffect(() => {
    try {
      if (tournament) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tournament));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage can be unavailable (private mode); the tournament still works in memory.
    }
  }, [tournament]);

  function handleRedraw() {
    if (!tournament) return;

    if (
      Object.keys(tournament.scores).length > 0 &&
      !window.confirm('Redraw the schedule? All entered scores will be cleared.')
    ) {
      return;
    }

    try {
      const schedule = buildSchedule({
        players: tournament.playerNames.length,
        courts: tournament.courts,
        minutesPerRound: tournament.minutesPerRound,
      });
      setTournament({
        ...tournament,
        createdAt: new Date().toISOString(),
        rounds: schedule.rounds,
        scores: {},
        uncoveredPairs: schedule.uncoveredPairs,
      });
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : 'Could not redraw the schedule.');
    }
  }

  function handleNew() {
    if (!tournament) return;

    if (
      Object.keys(tournament.scores).length > 0 &&
      !window.confirm('Start a new tournament? This schedule and its scores will be deleted.')
    ) {
      return;
    }

    setTournament(null);
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Padel &middot; Americano</p>
          <h1>Americano Padel</h1>
        </div>

        {tournament && (
          <div className="topbar-actions">
            <button type="button" className="btn btn-ghost" onClick={handleRedraw}>
              Redraw
            </button>
            <button type="button" className="btn btn-ghost" onClick={handleNew}>
              New tournament
            </button>
          </div>
        )}
      </header>

      {tournament ? (
        <TournamentView tournament={tournament} onChange={setTournament} />
      ) : (
        <SetupForm onGenerate={setTournament} />
      )}

      <footer className="foot">Saved automatically on this device.</footer>
    </div>
  );
}

function loadTournament(): Tournament | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<Tournament>;
    if (!parsed || !Array.isArray(parsed.playerNames) || !Array.isArray(parsed.rounds)) return null;
    if (typeof parsed.courts !== 'number' || typeof parsed.minutesPerRound !== 'number') return null;

    return {
      version: 1,
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date().toISOString(),
      playerNames: parsed.playerNames,
      courts: parsed.courts,
      maxScore: typeof parsed.maxScore === 'number' ? parsed.maxScore : 21,
      minutesPerRound: parsed.minutesPerRound,
      rounds: parsed.rounds,
      scores: parsed.scores ?? {},
      uncoveredPairs: parsed.uncoveredPairs ?? 0,
    };
  } catch {
    return null;
  }
}
