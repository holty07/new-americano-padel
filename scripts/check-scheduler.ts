import { buildSchedule } from '../src/scheduler.ts';

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

let failures = 0;
const cases: Array<{ players: number; courts: number }> = [];

for (let players = 4; players <= 22; players += 1) {
  for (let courts = 1; courts <= 5; courts += 1) {
    cases.push({ players, courts });
  }
}

const started = Date.now();

for (const { players, courts } of cases) {
  const label = `${players}p/${courts}c`;

  try {
    const schedule = buildSchedule({ players, courts });
    assert(schedule.uncoveredPairs === 0, `uncovered pairs: ${schedule.uncoveredPairs}`);

    const pairCounts = new Map<string, number>();
    const appearances = new Array<number>(players).fill(0);
    let pairSlots = 0;

    for (const round of schedule.rounds) {
      const seen = new Set<number>();
      const playing = new Set<number>();
      assert(round.matches.length >= 1, 'kept an empty round');
      assert(round.matches.length <= courts, 'used more courts than available');

      for (const match of round.matches) {
        const four = [...match.teamA, ...match.teamB];
        assert(four.length === 4 && new Set(four).size === 4, 'match does not have four distinct players');

        for (const player of four) {
          assert(!seen.has(player), `player ${player} appears twice in the same round`);
          seen.add(player);
          playing.add(player);
          appearances[player] += 1;
        }

        for (const team of [match.teamA, match.teamB]) {
          const key = [...team].sort((left, right) => left - right).join('-');
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
          pairSlots += 1;
        }
      }

      for (let player = 0; player < players; player += 1) {
        if (!playing.has(player)) {
          assert(round.resting.includes(player), 'resting list omits a resting player');
        }
      }
      assert(round.resting.length === players - playing.size, 'resting list length mismatch');
    }

    const expectedPairs = (players * (players - 1)) / 2;
    assert(pairCounts.size === expectedPairs, `covered ${pairCounts.size} of ${expectedPairs} partnerships`);

    const duplicates = pairSlots - expectedPairs;
    assert(duplicates <= 1, `repeated ${duplicates} partnerships (expected at most 1)`);

    appearances.forEach((count, player) => {
      assert(count >= players - 1, `player ${player} played ${count} rounds, expected at least ${players - 1}`);
    });
    assert(
      appearances.reduce((total, count) => total + count, 0) === pairSlots * 2,
      'appearance total does not match scheduled pairs',
    );

    const restCounts = new Array<number>(players).fill(0);
    let backToBack = 0;
    const restedLast = new Array<boolean>(players).fill(false);

    for (const round of schedule.rounds) {
      const resting = new Set(round.resting);
      for (let player = 0; player < players; player += 1) {
        const rests = resting.has(player);
        if (rests) {
          restCounts[player] += 1;
          if (restedLast[player]) backToBack += 1;
        }
        restedLast[player] = rests;
      }
    }

    restCounts.forEach((count, player) => {
      assert(count === schedule.restCounts[player], `rest count mismatch for player ${player}`);
    });
    assert(
      Math.max(...restCounts) - Math.min(...restCounts) === schedule.restSpread,
      'reported rest spread does not match the schedule',
    );
    assert(backToBack === schedule.backToBackRests, 'reported back-to-back rests do not match');

    if (process.env.VERBOSE) {
      console.log(
        `${label}: ${schedule.rounds.length} rounds (target ${schedule.targetRounds}), rests ${Math.min(
          ...restCounts,
        )}-${Math.max(...restCounts)}, b2b ${schedule.backToBackRests}, repeats ${duplicates}`,
      );
    }
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${label}: ${(error as Error).message}`);
  }
}

for (const sampleCase of [
  { players: 10, courts: 2 },
  { players: 6, courts: 1 },
  { players: 9, courts: 3 },
]) {
  const schedule = buildSchedule(sampleCase);
  console.log(
    `\nSample ${sampleCase.players} players / ${sampleCase.courts} courts -> ${schedule.rounds.length} rounds, ${schedule.estimatedMinutes} min, rests ${Math.min(...schedule.restCounts)}-${Math.max(...schedule.restCounts)}, b2b ${schedule.backToBackRests}, repeats ${schedule.duplicatePairs}`,
  );
  schedule.rounds.slice(0, 4).forEach((round, index) => {
    const matches = round.matches
      .map((match) => `C${match.court} [${match.teamA.join('+')} v ${match.teamB.join('+')}]`)
      .join('  ');
    console.log(`R${index + 1}: ${matches} | rest ${round.resting.join(',') || '-'}`);
  });
}

console.log(`\n${cases.length} configurations checked in ${Date.now() - started} ms, ${failures} failures`);
if (failures > 0) process.exitCode = 1;
