/**
 * Multi-device game access: roles, per-player submissions, reveal state.
 *
 * Redaction lives here as pure functions so the backend can decide what leaves
 * the server, rather than the UI hiding values it already received.
 */

import { Game, GameRules, Player, PlayerRound, Round } from "./types";

export enum GameViewerRole {
  HOST = "HOST",
  PLAYER = "PLAYER",
  VIEWER = "VIEWER",
}

export type SubmissionStatus = "PENDING" | "SUBMITTED";

export interface PlayerRoundSubmission {
  playerId: string;
  bid: number;
  tricksWon: number;
  submittedAt: Date;
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
  revealed: boolean;
  submissions: PlayerSubmissionState[];
  /** Populated only once the round is revealed. */
  players: PlayerRound[];
  /** The requesting player's own submission, visible to them before reveal. */
  ownSubmission?: PlayerRoundSubmission;
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

export function getSubmissionStates(round: Round, players: Player[]): PlayerSubmissionState[] {
  const submitted = new Set((round.submissions ?? []).map((submission) => submission.playerId));
  return players.map((player) => ({
    playerId: player.id,
    status: submitted.has(player.id) ? "SUBMITTED" : "PENDING",
  }));
}

/**
 * Rounds completed through the single-device host flow carry no reveal flag,
 * so a completed round that already holds scores counts as revealed.
 */
export function isRoundRevealed(round: Round): boolean {
  return round.revealed === true || (round.status === "COMPLETED" && round.players.length > 0);
}

export function hasAllSubmissions(round: Round, players: Player[]): boolean {
  return getSubmissionStates(round, players).every((state) => state.status === "SUBMITTED");
}

export function canRevealRound(round: Round, players: Player[]): boolean {
  return !isRoundRevealed(round) && hasAllSubmissions(round, players);
}

/**
 * Projects a game into the slice a given role is allowed to see. Unrevealed
 * bids and tricks are dropped entirely rather than masked.
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
    rounds: game.rounds.map((round) => createRoundView(round, game.players, playerId)),
  };
}

function createRoundView(round: Round, players: Player[], playerId?: string): RoundView {
  const revealed = isRoundRevealed(round);
  const view: RoundView = {
    roundNumber: round.roundNumber,
    status: round.status,
    revealed,
    submissions: getSubmissionStates(round, players),
    players: revealed ? round.players : [],
    completedAt: round.completedAt,
  };

  if (!revealed && playerId) {
    const own = (round.submissions ?? []).find((submission) => submission.playerId === playerId);
    if (own) view.ownSubmission = own;
  }

  return view;
}
