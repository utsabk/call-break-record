/**
 * Multi-device game access: roles, per-player round entries, phase state.
 *
 * A round is filled in two phases. Each player who has joined enters their own bid,
 * then their own tricks; the host may enter or correct any value. Phase and entries
 * live on the server so every device agrees on the same state.
 */

import { Game, GameRules, Player, PlayerRound, Round } from "./types";

export enum GameViewerRole {
  HOST = "HOST",
  PLAYER = "PLAYER",
  VIEWER = "VIEWER",
}

export type SubmissionStatus = "PENDING" | "SUBMITTED";

/** Who supplied a value, so the UI can show a host correction for what it is. */
export type EntrySource = "PLAYER" | "HOST";

export type RoundPhase = "BIDDING" | "TRICKS" | "COMPLETED";

/**
 * One player's working values for a round. Both numbers are optional because a
 * round is assembled incrementally, bids first and tricks second.
 */
export interface RoundEntry {
  playerId: string;
  bid?: number;
  tricksWon?: number;
  punished?: boolean;
  bidSource?: EntrySource;
  tricksSource?: EntrySource;
  updatedAt?: Date;
}

export interface GameSession {
  sessionId: string;
  gameId: string;
  role: GameViewerRole;
  playerId?: string;
}

export interface PlayerSubmissionState {
  playerId: string;
  status: SubmissionStatus;
}

export interface RoundView {
  roundNumber: number;
  status: "ACTIVE" | "COMPLETED";
  phase: RoundPhase;
  revealed: boolean;
  /** Values entered so far. Bids are public once entered, as they are at a real table. */
  entries: RoundEntry[];
  /** Scored results, present only once the round is completed. */
  players: PlayerRound[];
  completedAt?: Date;
}

export interface GameView {
  id: string;
  gameCode: string;
  players: Player[];
  rules: GameRules;
  rounds: RoundView[];
  status: Game["status"];
  role: GameViewerRole;
  playerId?: string;
  claimedPlayerIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

function entriesOf(round: Round): RoundEntry[] {
  return round.entries ?? [];
}

export function findEntry(round: Round, playerId: string): RoundEntry | undefined {
  return entriesOf(round).find((entry) => entry.playerId === playerId);
}

/**
 * Rounds completed through the single-device host flow carry no reveal flag,
 * so a completed round that already holds scores counts as revealed.
 */
export function isRoundRevealed(round: Round): boolean {
  return round.revealed === true || (round.status === "COMPLETED" && round.players.length > 0);
}

export function hasAllBids(round: Round, players: Player[]): boolean {
  return players.every((player) => typeof findEntry(round, player.id)?.bid === "number");
}

export function hasAllTricks(round: Round, players: Player[]): boolean {
  return players.every((player) => typeof findEntry(round, player.id)?.tricksWon === "number");
}

export function totalTricksEntered(round: Round, players: Player[]): number {
  return players.reduce((total, player) => total + (findEntry(round, player.id)?.tricksWon ?? 0), 0);
}

/** Bidding gives way to tricks only when every seat has a bid, whoever entered it. */
export function getRoundPhase(round: Round, players: Player[]): RoundPhase {
  if (isRoundRevealed(round)) return "COMPLETED";
  return hasAllBids(round, players) ? "TRICKS" : "BIDDING";
}

export function canCompleteRound(round: Round, players: Player[]): boolean {
  if (isRoundRevealed(round)) return false;
  return hasAllBids(round, players) && hasAllTricks(round, players) && totalTricksEntered(round, players) === 13;
}

/** Reports who still owes a value for whichever phase the round is in. */
export function getSubmissionStates(round: Round, players: Player[]): PlayerSubmissionState[] {
  const phase = getRoundPhase(round, players);
  return players.map((player) => {
    const entry = findEntry(round, player.id);
    const value = phase === "BIDDING" ? entry?.bid : entry?.tricksWon;
    return { playerId: player.id, status: typeof value === "number" ? "SUBMITTED" : "PENDING" };
  });
}

/**
 * Projects a game into the slice a given role may see. Entered bids and tricks are
 * shared with everyone following the game; only values nobody has entered are absent.
 */
export function createGameView(
  game: Game,
  role: GameViewerRole,
  playerId?: string,
  claimedPlayerIds: string[] = []
): GameView {
  return {
    id: game.id,
    gameCode: game.gameCode,
    players: game.players,
    rules: game.rules,
    status: game.status,
    role,
    playerId,
    claimedPlayerIds,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    rounds: game.rounds.map((round) => createRoundView(round, game.players)),
  };
}

function createRoundView(round: Round, players: Player[]): RoundView {
  const revealed = isRoundRevealed(round);
  return {
    roundNumber: round.roundNumber,
    status: round.status,
    phase: getRoundPhase(round, players),
    revealed,
    entries: entriesOf(round),
    players: revealed ? round.players : [],
    completedAt: round.completedAt,
  };
}
