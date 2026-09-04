/**
 * Frontend-specific types and interfaces
 */

import { Game } from "@call-break/shared";

export interface GameState {
  game: Game | null;
  loading: boolean;
  error: string | null;
}

export interface UIState {
  currentView: "home" | "game-setup" | "game-play" | "game-complete" | "history";
  selectedRound: number | null;
  editingRound: boolean;
}

export interface SyncState {
  isSynced: boolean;
  lastSyncTime: Date | null;
  pendingChanges: number;
  isOnline: boolean;
}
