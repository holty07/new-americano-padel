import type { Match, Round } from './types';

export interface ScheduleRequest {
  players: number;
  courts: number;
  minutesPerRound?: number;
}

export interface ScheduleSummary {
  matchesPerRound: number;
  targetRounds: number;
  totalPairs: number;
  restingPerRound: number;
}

export interface Schedule extends ScheduleSummary {
  rounds: Round[];
  restCounts: number[];
  restSpread: number;
  backToBackRests: number;
  duplicatePairs: number;
  uncoveredPairs: number;
  estimatedMinutes: number;
}

interface Attempt {
  rounds: Round[];
  uncovered: number;
  duplicates: number;
  restSpread: number;
  backToBackRests: number;
}

/**
 * Every player needs one new partner per round and has (players - 1) possible
 * partners, so a complete Americano needs at least (players - 1) rounds. Court
 * capacity can push that higher: each round schedules `2 * matches` partnerships,
 * and only whole matches (4 players) fit on a court.
 */
export function summarize(players: number, courts: number): ScheduleSummary {
  const n = Math.max(0, Math.floor(players));
  const c = Math.max(0, Math.floor(courts));
  const matchesPerRound = Math.min(c, Math.floor(n / 4));
  const totalPairs = (n * (n - 1)) / 2;
  const pairsPerRound = matchesPerRound * 2;
  const targetRounds = pairsPerRound > 0 ? Math.max(n - 1, Math.ceil(totalPairs / pairsPerRound)) : 0;

  return {
    matchesPerRound,
    targetRounds,
    totalPairs,
    restingPerRound: Math.max(0, n - matchesPerRound * 4),
  };
}

export function buildSchedule({
  players,
  courts,
  minutesPerRound = 15,
}: ScheduleRequest): Schedule {
  const n = Math.floor(players);
  const c = Math.floor(courts);

  if (n < 4) throw new Error('An Americano needs at least 4 players.');
  if (c < 1) throw new Error('Add at least one court.');

  const summary = summarize(n, c);
  const pairsPerRound = summary.matchesPerRound * 2;

  const perfect = perfectRoundRobin(n, summary.matchesPerRound);
  let rounds: Round[];
  let uncoveredPairs = 0;
  let duplicatePairs = 0;

  if (perfect) {
    rounds = finalizeRounds(perfect);
  } else {
    const attempts = n >= 20 ? 160 : n >= 14 ? 240 : 340;
    const allowedDuplicates = summary.totalPairs % 2 === 0 ? 0 : 1;
    let best: Attempt | null = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const candidate = runAttempt(
        n,
        pairsPerRound,
        summary.targetRounds,
        attempt * 2654435761,
      );

      if (!best || isBetter(candidate, best)) best = candidate;
      if (
        best.uncovered === 0 &&
        best.rounds.length === summary.targetRounds &&
        best.duplicates <= allowedDuplicates &&
        best.restSpread <= 1 &&
        best.backToBackRests === 0
      ) {
        break;
      }
    }

    if (!best) throw new Error('Could not build a schedule for this roster.');

    rounds = finalizeRounds(compactRounds(best.rounds, summary.matchesPerRound));
    uncoveredPairs = best.uncovered;
    duplicatePairs = best.duplicates;
  }

  const restStats = computeRests(rounds, n);
  let backToBackRests = restStats.backToBackRests;

  // Round order is free: reshuffle to reduce rests that land in consecutive rounds.
  if (rounds.length > 1 && backToBackRests > 0) {
    improveOrder(rounds, n);
    backToBackRests = countBackToBack(rounds, n);
  }

  return {
    ...summary,
    rounds,
    restCounts: restStats.restCounts,
    restSpread: restStats.restSpread,
    backToBackRests,
    duplicatePairs,
    uncoveredPairs,
    estimatedMinutes: rounds.length * Math.max(1, minutesPerRound),
  };
}

function isBetter(candidate: Attempt, current: Attempt): boolean {
  if (candidate.uncovered !== current.uncovered) return candidate.uncovered < current.uncovered;
  if (candidate.rounds.length !== current.rounds.length) return candidate.rounds.length < current.rounds.length;
  if (candidate.duplicates !== current.duplicates) return candidate.duplicates < current.duplicates;
  if (candidate.restSpread !== current.restSpread) return candidate.restSpread < current.restSpread;
  return candidate.backToBackRests < current.backToBackRests;
}

/**
 * When every round can seat whole matches for the entire roster, the circle
 * method gives a mathematically perfect draw: every pair partners once, every
 * player plays every round (or rests exactly once for odd rosters).
 */
function perfectRoundRobin(n: number, matchesPerRound: number): Round[] | null {
  if (n % 4 !== 0 && n % 4 !== 1) return null;

  const pairsPerRound = Math.floor(n / 2);
  if (pairsPerRound % 2 !== 0) return null;
  if (pairsPerRound / 2 > matchesPerRound) return null;

  const slots = n % 2 === 0 ? n : n + 1;
  const bye = n;
  const order = Array.from({ length: slots }, (_, index) => index);
  shuffle(order, Math.random);

  const rounds: Round[] = [];

  for (let roundIndex = 0; roundIndex < slots - 1; roundIndex += 1) {
    const pairs: Array<[number, number]> = [];

    for (let i = 0; i < slots / 2; i += 1) {
      const left = order[i];
      const right = order[slots - 1 - i];
      if (left === bye || right === bye) continue;
      pairs.push([Math.min(left, right), Math.max(left, right)]);
    }

    order.splice(1, 0, order.pop() as number);

    const matches: Match[] = [];
    for (let i = 0; i + 1 < pairs.length; i += 2) {
      matches.push({ court: matches.length + 1, teamA: pairs[i], teamB: pairs[i + 1] });
    }

    const playing = new Set<number>();
    for (const match of matches) {
      for (const player of match.teamA) playing.add(player);
      for (const player of match.teamB) playing.add(player);
    }

    rounds.push({
      matches,
      resting: Array.from({ length: n }, (_, player) => player).filter((player) => !playing.has(player)),
    });
  }

  return rounds;
}

/**
 * Greedy round-by-round construction, restarted with different tie-breaks.
 * Each round selects disjoint partnerships, prioritising players who still owe
 * partners, who have played less, and who rested last round.
 */
function runAttempt(n: number, pairsPerRound: number, targetRounds: number, seed: number): Attempt {
  const random = mulberry32(seed);
  const remaining: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const partnerCount = new Array<number>(n).fill(0);
  let pairsLeft = 0;

  for (let a = 0; a < n; a += 1) {
    for (let b = a + 1; b < n; b += 1) {
      remaining[a][b] = true;
      remaining[b][a] = true;
      partnerCount[a] += 1;
      partnerCount[b] += 1;
      pairsLeft += 1;
    }
  }

  const opponentCount: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const lastPartneredRound: number[][] = Array.from({ length: n }, () =>
    new Array<number>(n).fill(-1),
  );
  const appearances = new Array<number>(n).fill(0);
  const restCounts = new Array<number>(n).fill(0);
  const restedLast = new Array<boolean>(n).fill(false);
  const rounds: Round[] = [];
  let backToBackRests = 0;
  let duplicates = 0;
  const maxRounds = targetRounds + n + 6;

  // Committing a round updates every counter the heuristic and the report rely on.
  const commit = (
    matches: Match[],
    uniquePairs: Array<[number, number]>,
    duplicatePairs: Array<[number, number]>,
  ) => {
    const roundIndex = rounds.length;

    for (const [a, b] of uniquePairs) {
      remaining[a][b] = false;
      remaining[b][a] = false;
      partnerCount[a] -= 1;
      partnerCount[b] -= 1;
      pairsLeft -= 1;
    }

    for (const [a, b] of [...uniquePairs, ...duplicatePairs]) {
      lastPartneredRound[a][b] = roundIndex;
      lastPartneredRound[b][a] = roundIndex;
    }

    duplicates += duplicatePairs.length;

    const playing = new Set<number>();
    for (const match of matches) {
      for (const player of match.teamA) playing.add(player);
      for (const player of match.teamB) playing.add(player);
    }

    for (const player of playing) appearances[player] += 1;

    const resting: number[] = [];
    for (let p = 0; p < n; p += 1) {
      const rests = !playing.has(p);
      if (rests) {
        restCounts[p] += 1;
        if (restedLast[p]) backToBackRests += 1;
        resting.push(p);
      }
      restedLast[p] = rests;
    }

    rounds.push({ matches, resting });
  };

  while (pairsLeft > 0 && rounds.length < maxRounds) {
    const urgency = new Array<number>(n);
    for (let p = 0; p < n; p += 1) {
      urgency[p] =
        partnerCount[p] * 6 +
        (targetRounds - appearances[p]) * 3 -
        restCounts[p] * 4 +
        (restedLast[p] ? 5 : 0) +
        random() * 2;
    }

    const used = new Array<boolean>(n).fill(false);
    const selected: Array<[number, number]> = [];

    while (selected.length < pairsPerRound) {
      let chosenP = -1;
      let chosenQ = -1;
      let chosenScore = -Infinity;

      for (let p = 0; p < n; p += 1) {
        if (used[p] || partnerCount[p] === 0) continue;

        let bestQ = -1;
        let bestQScore = -Infinity;
        for (let q = 0; q < n; q += 1) {
          if (q === p || used[q] || !remaining[p][q]) continue;
          const score = urgency[q] + urgency[p] * 0.5 - opponentCount[p][q] * 1.2 + random();
          if (score > bestQScore) {
            bestQScore = score;
            bestQ = q;
          }
        }

        if (bestQ === -1) continue;
        if (bestQScore > chosenScore) {
          chosenScore = bestQScore;
          chosenP = p;
          chosenQ = bestQ;
        }
      }

      if (chosenP === -1) break;
      used[chosenP] = true;
      used[chosenQ] = true;
      selected.push([chosenP, chosenQ]);
    }

    // A match is two partnerships, so a lone leftover pair cannot be scheduled.
    if (selected.length % 2 === 1) selected.pop();
    if (selected.length < 2) break;

    commit(groupIntoMatches(selected, opponentCount, random), selected, []);
  }

  // Fill the last match when an odd number of partnerships leaves one pair without a partner pair.
  while (pairsLeft > 0 && rounds.length < maxRounds + 4) {
    const leftover: Array<[number, number]> = [];
    const taken = new Array<boolean>(n).fill(false);

    for (let a = 0; a < n && leftover.length < pairsPerRound; a += 1) {
      if (taken[a]) continue;
      for (let b = a + 1; b < n; b += 1) {
        if (taken[b] || !remaining[a][b]) continue;
        leftover.push([a, b]);
        taken[a] = true;
        taken[b] = true;
        break;
      }
    }

    if (leftover.length === 0) break;

    let unique = leftover;
    if (unique.length % 2 === 1) unique = unique.slice(0, -1);

    const duplicatePairs: Array<[number, number]> = [];
    if (unique.length === 0) {
      const duplicate = pickDuplicatePair(
        n,
        leftover[0],
        appearances,
        restedLast,
        lastPartneredRound,
        random,
      );
      if (!duplicate) break;
      duplicatePairs.push(duplicate);
      unique = leftover.slice(0, 1);
    }

    const allPairs = [...unique, ...duplicatePairs];
    commit(
      groupIntoMatches(allPairs, opponentCount, random),
      unique,
      duplicatePairs,
    );
  }

  return {
    rounds,
    uncovered: pairsLeft,
    duplicates,
    restSpread: Math.max(...restCounts) - Math.min(...restCounts),
    backToBackRests,
  };
}

function pickDuplicatePair(
  n: number,
  leftover: [number, number],
  appearances: number[],
  restedLast: boolean[],
  lastPartneredRound: number[][],
  random: () => number,
): [number, number] | null {
  const [a, b] = leftover;
  let best: [number, number] | null = null;
  let bestScore = -Infinity;

  for (let c = 0; c < n; c += 1) {
    if (c === a || c === b) continue;
    for (let d = c + 1; d < n; d += 1) {
      if (d === a || d === b) continue;

      const score =
        -(appearances[c] + appearances[d]) * 2 +
        (restedLast[c] ? 3 : 0) +
        (restedLast[d] ? 3 : 0) -
        lastPartneredRound[c][d] * 0.05 +
        random() * 0.5;

      if (score > bestScore) {
        bestScore = score;
        best = [c, d];
      }
    }
  }

  return best;
}

function groupIntoMatches(
  pairs: Array<[number, number]>,
  opponentCount: number[][],
  random: () => number,
): Match[] {
  const pool = pairs.slice();
  const matches: Match[] = [];

  while (pool.length >= 2) {
    const [a, b] = pool.shift() as [number, number];
    let bestIndex = 0;
    let bestGroupScore = Infinity;

    for (let i = 0; i < pool.length; i += 1) {
      const [x, y] = pool[i];
      const score =
        opponentCount[a][x] +
        opponentCount[a][y] +
        opponentCount[b][x] +
        opponentCount[b][y] +
        random() * 0.6;
      if (score < bestGroupScore) {
        bestGroupScore = score;
        bestIndex = i;
      }
    }

    const [x, y] = pool.splice(bestIndex, 1)[0];
    matches.push({ court: matches.length + 1, teamA: [a, b], teamB: [x, y] });

    opponentCount[a][x] += 1;
    opponentCount[x][a] += 1;
    opponentCount[a][y] += 1;
    opponentCount[y][a] += 1;
    opponentCount[b][x] += 1;
    opponentCount[x][b] += 1;
    opponentCount[b][y] += 1;
    opponentCount[y][b] += 1;
  }

  return matches;
}

/**
 * Late rounds can be left half empty while earlier rounds had to stop short.
 * Move whole matches earlier where four free players and a free court exist.
 */
function compactRounds(rounds: Round[], matchesPerRound: number): Round[] {
  const copy = rounds.map((round) => ({ matches: [...round.matches], resting: [] as number[] }));

  for (let r = copy.length - 1; r > 0; r -= 1) {
    for (const match of [...copy[r].matches]) {
      const players = [...match.teamA, ...match.teamB];

      for (let t = 0; t < r; t += 1) {
        const target = copy[t];
        if (target.matches.length >= matchesPerRound) continue;

        const busy = new Set<number>();
        for (const scheduled of target.matches) {
          for (const player of scheduled.teamA) busy.add(player);
          for (const player of scheduled.teamB) busy.add(player);
        }
        if (players.some((player) => busy.has(player))) continue;

        target.matches.push(match);
        copy[r].matches = copy[r].matches.filter((candidate) => candidate !== match);
        break;
      }
    }
  }

  return copy.filter((round) => round.matches.length > 0);
}

function finalizeRounds(rounds: Round[]): Round[] {
  return rounds.map((round) => ({
    matches: round.matches.map((match, index) => ({ ...match, court: index + 1 })),
    resting: [],
  }));
}

function computeRests(rounds: Round[], n: number) {
  const restCounts = new Array<number>(n).fill(0);
  const restedLast = new Array<boolean>(n).fill(false);
  let backToBackRests = 0;

  for (const round of rounds) {
    const playing = new Set<number>();
    for (const match of round.matches) {
      for (const player of match.teamA) playing.add(player);
      for (const player of match.teamB) playing.add(player);
    }

    const resting: number[] = [];
    for (let p = 0; p < n; p += 1) {
      const restingThisRound = !playing.has(p);
      if (restingThisRound) {
        restCounts[p] += 1;
        if (restedLast[p]) backToBackRests += 1;
        resting.push(p);
      }
      restedLast[p] = restingThisRound;
    }
    round.resting = resting;
  }

  return {
    restCounts,
    backToBackRests,
    restSpread: Math.max(...restCounts) - Math.min(...restCounts),
  };
}

function countBackToBack(rounds: Round[], n: number): number {
  const restedLast = new Array<boolean>(n).fill(false);
  let total = 0;

  for (const round of rounds) {
    const resting = new Set(round.resting);
    for (let player = 0; player < n; player += 1) {
      const rests = resting.has(player);
      if (rests && restedLast[player]) total += 1;
      restedLast[player] = rests;
    }
  }

  return total;
}

/** Reordering rounds keeps every matchup, rest count and court assignment intact. */
function improveOrder(rounds: Round[], n: number): void {
  let best = countBackToBack(rounds, n);

  for (let pass = 0; pass < 4 && best > 0; pass += 1) {
    let improved = false;

    for (let i = 0; i + 1 < rounds.length; i += 1) {
      [rounds[i], rounds[i + 1]] = [rounds[i + 1], rounds[i]];
      const candidate = countBackToBack(rounds, n);

      if (candidate < best) {
        best = candidate;
        improved = true;
      } else {
        [rounds[i], rounds[i + 1]] = [rounds[i + 1], rounds[i]];
      }
    }

    if (!improved) break;
  }
}

function shuffle<T>(items: T[], random: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
