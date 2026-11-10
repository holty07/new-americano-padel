export interface Match {
  court: number;
  teamA: [number, number];
  teamB: [number, number];
}

export interface Round {
  matches: Match[];
  resting: number[];
}

export interface ScoreEntry {
  a: number | null;
  b: number | null;
}

export interface Tournament {
  version: 1;
  createdAt: string;
  playerNames: string[];
  courts: number;
  maxScore: number;
  minutesPerRound: number;
  rounds: Round[];
  scores: Record<string, ScoreEntry>;
  uncoveredPairs: number;
}
