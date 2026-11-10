import type { Tournament } from './types';

export interface Standing {
  index: number;
  name: string;
  points: number;
  played: number;
  rests: number;
}

export function matchKey(roundIndex: number, court: number): string {
  return `${roundIndex}:${court}`;
}

export function computeStandings(tournament: Tournament): Standing[] {
  const rows: Standing[] = tournament.playerNames.map((name, index) => ({
    index,
    name,
    points: 0,
    played: 0,
    rests: 0,
  }));

  tournament.rounds.forEach((round, roundIndex) => {
    for (const match of round.matches) {
      const score = tournament.scores[matchKey(roundIndex, match.court)];
      if (!score || score.a === null || score.b === null) continue;

      rows[match.teamA[0]].points += score.a;
      rows[match.teamA[1]].points += score.a;
      rows[match.teamB[0]].points += score.b;
      rows[match.teamB[1]].points += score.b;

      for (const player of [...match.teamA, ...match.teamB]) rows[player].played += 1;
    }

    for (const player of round.resting) rows[player].rests += 1;
  });

  return rows.sort((left, right) => {
    if (right.points !== left.points) return right.points - left.points;
    if (right.played !== left.played) return right.played - left.played;
    return left.name.localeCompare(right.name);
  });
}
