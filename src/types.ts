export interface Song {
  No: number;
  Composer: string;
  "Major Work": string;
  Selection: string;
  Notes: string;
  playable_url: string;
}

export interface GameState {
  phase: 'playing' | 'answered';
  currentSong: Song | null;
  startTime: number;
  userAnswers: {
    composer: string;
    majorWork: string;
  };
  score: {
    composer: boolean;
    majorWork: boolean;
  };
  totalScore: number;
  questionsAnswered: number;
}
