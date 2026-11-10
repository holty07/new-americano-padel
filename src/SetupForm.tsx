import { useMemo, useState, type FormEvent } from 'react';
import { buildSchedule, summarize } from './scheduler';
import { describeWindow, formatDuration } from './time';
import type { Tournament } from './types';

interface SetupFormProps {
  onGenerate: (tournament: Tournament) => void;
}

const SCORE_PRESETS = [16, 21, 24, 31, 32];

export function SetupForm({ onGenerate }: SetupFormProps) {
  const [namesText, setNamesText] = useState('');
  const [courts, setCourts] = useState(2);
  const [scoreChoice, setScoreChoice] = useState<number | 'custom'>(21);
  const [customScore, setCustomScore] = useState('21');
  const [minutesPerRound, setMinutesPerRound] = useState(15);
  const [error, setError] = useState<string | null>(null);

  const maxScore = scoreChoice === 'custom' ? Number(customScore) : scoreChoice;
  const validMaxScore = Number.isInteger(maxScore) && maxScore >= 1 && maxScore <= 99;

  const names = useMemo(() => parseNames(namesText), [namesText]);
  const duplicate = useMemo(() => findDuplicate(names), [names]);
  const preview = useMemo(() => summarize(names.length, courts), [names.length, courts]);
  const estimated = preview.targetRounds * minutesPerRound;
  const window = describeWindow(estimated);
  const hasPreview = names.length >= 4 && preview.matchesPerRound > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (names.length < 4) {
      setError('Add at least four players.');
      return;
    }
    if (duplicate) {
      setError(`Two players share the name "${duplicate}". Names need to be unique.`);
      return;
    }
    if (courts < 1) {
      setError('You need at least one court.');
      return;
    }
    if (!validMaxScore) {
      setError('Games need a whole-number max score between 1 and 99.');
      return;
    }
    if (minutesPerRound < 1) {
      setError('Minutes per round must be at least 1.');
      return;
    }

    setError(null);

    try {
      const schedule = buildSchedule({ players: names.length, courts, minutesPerRound });
      onGenerate({
        version: 1,
        createdAt: new Date().toISOString(),
        playerNames: names,
        courts,
        maxScore,
        minutesPerRound,
        rounds: schedule.rounds,
        scores: {},
        uncoveredPairs: schedule.uncoveredPairs,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not build a schedule.');
    }
  }

  return (
    <section className="panel">
      <form onSubmit={handleSubmit} className="setup">
        <div className="panel-head">
          <h2>Set up the draw</h2>
          <p>Paste the roster, pick your courts, and every player partners everyone else once.</p>
        </div>

        <label className="field">
          <span className="field-label">
            Players <em>{names.length}</em>
          </span>
          <textarea
            rows={7}
            value={namesText}
            onChange={(event) => setNamesText(event.target.value)}
            placeholder={'Ana\nBen\nCarla\nDiego\nElena\nFemi\nGus\nHana'}
            spellCheck={false}
            autoCapitalize="words"
          />
          <span className="field-hint">One name per line, or separated by commas.</span>
        </label>

        <div className="row">
          <label className="field">
            <span className="field-label">Courts</span>
            <input
              type="number"
              min={1}
              max={12}
              value={courts}
              onChange={(event) => setCourts(Math.max(1, Math.floor(Number(event.target.value) || 1)))}
            />
          </label>

          <label className="field">
            <span className="field-label">Minutes per round</span>
            <input
              type="number"
              min={5}
              max={45}
              value={minutesPerRound}
              onChange={(event) =>
                setMinutesPerRound(Math.max(1, Math.floor(Number(event.target.value) || 1)))
              }
            />
            <span className="field-hint">Only used for the time estimate.</span>
          </label>
        </div>

        <div className="field">
          <span className="field-label">Max score per game</span>
          <div className="choices" role="group" aria-label="Max score per game">
            {SCORE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className="choice"
                aria-pressed={scoreChoice === preset}
                onClick={() => setScoreChoice(preset)}
              >
                {preset}
              </button>
            ))}
            <button
              type="button"
              className="choice"
              aria-pressed={scoreChoice === 'custom'}
              onClick={() => setScoreChoice('custom')}
            >
              Custom
            </button>
          </div>
          {scoreChoice === 'custom' && (
            <input
              type="number"
              min={1}
              max={99}
              inputMode="numeric"
              value={customScore}
              aria-label="Custom max score per game"
              onChange={(event) => setCustomScore(event.target.value)}
            />
          )}
          <span className="field-hint">
            Each game ends when both teams&rsquo; points add up to {validMaxScore ? maxScore : 'this'}.
          </span>
        </div>

        {hasPreview && (
          <div className="preview">
            <p>
              <strong>
                {preview.matchesPerRound} court{preview.matchesPerRound === 1 ? '' : 's'}
              </strong>{' '}
              in play &middot; {preview.restingPerRound} resting each round
            </p>
            <p>
              Every pair partners once &rarr; <strong>{preview.targetRounds} rounds</strong> &middot;
              about {formatDuration(estimated)}
            </p>
            <span className={`badge badge-${window.tone}`}>{window.label}</span>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        <button className="btn btn-primary" type="submit">
          Build schedule
        </button>
      </form>
    </section>
  );
}

function parseNames(text: string): string[] {
  return text
    .split(/[\n,;]+/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
}

function findDuplicate(names: string[]): string | null {
  const seen = new Set<string>();

  for (const name of names) {
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) return name;
    seen.add(key);
  }

  return null;
}
