/**
 * Core domain types for Call Break Scorekeeper
 * All scores are stored internally as integer "tenths" to avoid floating-point errors
 * Display: scoreTenths / 10
 */

export enum PunishmentReason {
  WRONG_CARD = "WRONG_CARD",
  REVOKE = "REVOKE",
  UNFAIR_PLAY = "UNFAIR_PLAY",
  OTHER = "OTHER",
}

export interface Player {
  id: string;
  name: string;
  seat: number; // 0-3, stable throughout game
}

export interface GameRules {
  rounds: number; // typically 5
  minimumCall: number; // typically 1
  maximumCall: number; // typically 13
  extraTrickBonus: number; // typically 0.1 (stored as 1 tenth)
  punishmentMode: "NEGATIVE_CALL"; // extensible for future variants
  baseBid: number; // used for final settlement
}

export interface PlayerRound {
  playerId: string;
  bid: number; // 1-13
  tricksWon: number; // 0-13
  punished: boolean;
  punishmentReason?: PunishmentReason;
  punishmentNote?: string;
  scoreTenths: number; // internal representation, -40 = -4.0, 41 = 4.1
}

export interface Round {
  roundNumber: number; // 1-5
  players: PlayerRound[];
  status: "ACTIVE" | "COMPLETED";
  /** Per-player working values, filled in bid-then-tricks order before the round is scored. */
  entries?: import("./multiplayer").RoundEntry[];
  revealed?: boolean;
  completedAt?: Date;
}

export enum GameStatus {
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED",
  TIE = "TIE",
}

export interface Game {
  id: string;
  gameCode: string;
  players: Player[];
  rules: GameRules;
  rounds: Round[];
  status: GameStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface GameSummary {
  gameId: string;
  players: Player[];
  status: GameStatus;
  createdAt: Date;
  completedAt?: Date;
  winner?: {
    playerId: string;
    name: string;
    totalScore: number; // displayed as totalScoreTenths / 10
  };
  finalSettlement?: FinalSettlementLine[];
}

export interface FinalSettlementLine {
  playerId: string;
  playerName: string;
  rank: number; // 1-4
  gameTotalScoreTenths: number;
  settlementAmount: number; // integer tenths
}

export interface RoundScore {
  playerId: string;
  scoreTenths: number;
  reason: "SUCCESS" | "FAILED_BID" | "PUNISHED";
}

export interface GameTotals {
  [playerId: string]: number; // cumulative score in tenths
}

export interface Ranking {
  playerId: string;
  playerName: string;
  totalScoreTenths: number;
  rank: number;
}
