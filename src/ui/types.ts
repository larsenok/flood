import type { UiAction } from '../Input';
import type { LeaderboardEntry } from '../Leaderboard';

export interface UiState {
  levelLabel: string;
  displayDate: string;
  wallBudget: number;
  placementsRemaining: number;
  score: number;
  floodedTiles: number;
  totalTiles: number;
  hoverX: number;
  hoverY: number;
  timeMs: number;
  hasContainedArea: boolean;
  leaderboardOpen: boolean;
  leaderboardLoading: boolean;
  leaderboardError: string | null;
  leaderboardEntries: LeaderboardEntry[];
  scoreSubmitted: boolean;
  scoreSubmitting: boolean;
  copyScoreLabel: string;
  submitModalOpen: boolean;
  submitNameDraft: string;
}

export type DrawButton = (x: number, y: number, width: number, height: number, label: string, key: UiAction, fill?: string) => void;
