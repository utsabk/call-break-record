/**
 * Game Service
 * Orchestrates game operations and enforces business rules
 */

import {
  Game,
  Player,
  GameRules,
  Round,
  PlayerRound,
  GameStatus,
  GameSession,
  GameView,
  GameViewerRole,
  PunishmentReason,
  calculateGameTotals,
  calculateRankings,
  createGameView,
  findEntry,
  getRoundPhase,
  hasAllBids,
  hasAllTricks,
  hasRankingTie,
  isRoundRevealed,
  totalTricksEntered,
  calculateRoundScore,
} from "@call-break/shared";
import { gameRepository } from "../repositories/GameRepository";
import { ValidationError } from "../validation";
import { randomBytes, randomUUID } from "crypto";

const GAME_CODE_ALPHABET = "ABCDEFGHJKLMNPQRTUVWXYZ2346789";

function createGameCode(): string {
  return Array.from(randomBytes(8), (byte) => GAME_CODE_ALPHABET[byte % GAME_CODE_ALPHABET.length]).join("");
}

export class GameService {
  async createGame(
    players: Player[],
    rules: GameRules
  ): Promise<{ game: Game; hostToken: string }> {
    // Validate
    if (players.length !== 4) {
      throw new ValidationError("Game must have exactly 4 players", "INVALID_PLAYER_COUNT");
    }

    if (rules.rounds !== 5) {
      throw new ValidationError("Game must have exactly 5 rounds", "INVALID_ROUND_COUNT");
    }

    if (rules.baseBid < 1) {
      throw new ValidationError("Base bid must be positive", "INVALID_BASE_BID");
    }

    // Create game
    const gameId = `game-${randomUUID()}`;
    let gameCode = createGameCode();
    while (await gameRepository.getGameByCode(gameCode)) gameCode = createGameCode();
    const hostToken = randomUUID();
    const game: Game = {
      id: gameId,
      gameCode,
      players: players.map((p, i) => ({ ...p, seat: i })),
      rules,
      rounds: Array.from({ length: rules.rounds }, (_, i) => ({
        roundNumber: i + 1,
        players: [],
        status: "ACTIVE" as const,
      })),
      status: GameStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await gameRepository.createGame({ ...game, hostToken });
    return { game, hostToken };
  }

  async getGame(gameId: string): Promise<Game> {
    const game = await gameRepository.getGame(gameId);
    if (!game) {
      throw new ValidationError("Game not found", "NOT_FOUND");
    }
    return game;
  }

  async getGameByCode(gameCode: string): Promise<Game> {
    const game = await gameRepository.getGameByCode(gameCode);
    if (!game) throw new ValidationError("Game not found", "NOT_FOUND");
    return game;
  }

  async requireHost(gameId: string, hostToken: string | undefined): Promise<void> {
    const storedToken = await gameRepository.getHostToken(gameId);
    if (!storedToken || !hostToken || storedToken !== hostToken) throw new ValidationError("Only the host can change this game", "UNAUTHORIZED");
  }

  /** Joins by code as a player (claiming a seat) or as a read-only viewer. */
  async joinGame(
    gameCode: string,
    role: GameViewerRole,
    playerId: string | undefined
  ): Promise<{ session: GameSession; view: GameView }> {
    const game = await this.getGameByCode(gameCode);
    const sessionId = randomUUID();

    if (role === GameViewerRole.PLAYER) {
      if (!playerId) throw new ValidationError("Choose which player you are", "PLAYER_REQUIRED");
      if (!game.players.some((player) => player.id === playerId)) {
        throw new ValidationError("That player is not in this game", "PLAYER_NOT_FOUND");
      }
      const claimed = await gameRepository.claimSeat(game.id, playerId, sessionId);
      if (!claimed) {
        throw new ValidationError("Another device is already playing as this player", "SEAT_TAKEN");
      }
    }

    const session: GameSession = { sessionId, gameId: game.id, role, playerId: role === GameViewerRole.PLAYER ? playerId : undefined };
    await gameRepository.putSession(session);

    return { session, view: await this.getGameView(game, session) };
  }

  /** Resolves the caller's role from their session or host token, never from the request body. */
  async resolveSession(
    gameId: string,
    sessionId: string | undefined,
    hostToken: string | undefined
  ): Promise<GameSession> {
    if (sessionId) {
      const session = await gameRepository.getSession(gameId, sessionId);
      if (session) return session;
    }
    const storedToken = await gameRepository.getHostToken(gameId);
    if (hostToken && storedToken && hostToken === storedToken) {
      return { sessionId: "host", gameId, role: GameViewerRole.HOST };
    }
    return { sessionId: "anonymous", gameId, role: GameViewerRole.VIEWER };
  }

  async getGameView(game: Game, session: GameSession): Promise<GameView> {
    const [entriesByRound, claimedPlayerIds] = await Promise.all([
      gameRepository.listAllEntries(game.id),
      gameRepository.listClaimedPlayerIds(game.id),
    ]);

    const hydrated: Game = {
      ...game,
      rounds: game.rounds.map((round) => ({
        ...round,
        entries: entriesByRound.get(round.roundNumber) || [],
      })),
    };

    return createGameView(hydrated, session.role, session.playerId, claimedPlayerIds);
  }

  async getGameViewByCode(
    gameCode: string,
    sessionId: string | undefined,
    hostToken: string | undefined
  ): Promise<GameView> {
    const game = await this.getGameByCode(gameCode);
    const session = await this.resolveSession(game.id, sessionId, hostToken);
    return this.getGameView(game, session);
  }

  /**
   * A player fills in their own values; the host may fill in or correct anyone's.
   * The seat is taken from the session, so nobody can enter a score for someone else.
   */
  async setRoundEntry(
    gameId: string,
    roundNumber: number,
    input: { playerId?: string; bid?: number; tricksWon?: number; punished?: boolean },
    sessionId: string | undefined,
    hostToken: string | undefined
  ): Promise<GameView> {
    const game = await this.getGame(gameId);
    const session = await this.resolveSession(gameId, sessionId, hostToken);
    const isHost = session.role === GameViewerRole.HOST;

    if (!isHost && session.role !== GameViewerRole.PLAYER) {
      throw new ValidationError("Join as a player before entering a score", "NOT_A_PLAYER");
    }
    if (game.status !== GameStatus.ACTIVE) {
      throw new ValidationError("This game has finished", "GAME_COMPLETED");
    }
    if (roundNumber < 1 || roundNumber > game.rules.rounds) {
      throw new ValidationError("Invalid round number", "INVALID_ROUND");
    }
    if (!isHost && input.playerId && input.playerId !== session.playerId) {
      throw new ValidationError("You can only enter your own score", "NOT_YOUR_SEAT");
    }

    const targetPlayerId = isHost ? input.playerId : session.playerId;
    if (!targetPlayerId) {
      throw new ValidationError("Choose which player this entry is for", "PLAYER_REQUIRED");
    }
    if (!game.players.some((player) => player.id === targetPlayerId)) {
      throw new ValidationError("That player is not in this game", "PLAYER_NOT_FOUND");
    }
    if (input.bid === undefined && input.tricksWon === undefined && input.punished === undefined) {
      throw new ValidationError("Nothing to save", "EMPTY_ENTRY");
    }
    if (input.punished !== undefined && !isHost) {
      throw new ValidationError("Only the scorer can disqualify a player", "UNAUTHORIZED");
    }

    const entries = await gameRepository.listEntries(gameId, roundNumber);
    const round: Round = { ...game.rounds[roundNumber - 1], entries };
    if (isRoundRevealed(round)) {
      throw new ValidationError("This round has already been scored", "ROUND_COMPLETED");
    }
    const existing = findEntry(round, targetPlayerId);

    if (input.bid !== undefined) {
      if (!Number.isInteger(input.bid) || input.bid < 1 || input.bid > 13) {
        throw new ValidationError("Bid must be between 1 and 13", "INVALID_BID");
      }
      // A player's own call stands once made; only the scorer may revise it.
      if (!isHost && typeof existing?.bid === "number") {
        throw new ValidationError("Your bid is already in. Ask the scorer to change it.", "BID_ALREADY_SET");
      }
    }

    if (input.tricksWon !== undefined) {
      if (!Number.isInteger(input.tricksWon) || input.tricksWon < 0 || input.tricksWon > 13) {
        throw new ValidationError("Tricks must be between 0 and 13", "INVALID_TRICKS");
      }
      // Players follow the two-step flow; the host may fill a seat in one pass.
      if (!isHost && getRoundPhase(round, game.players) === "BIDDING") {
        throw new ValidationError("Every player must bid before tricks are entered", "BIDDING_INCOMPLETE");
      }
      if (!isHost && typeof existing?.tricksWon === "number") {
        throw new ValidationError("Your tricks are already in. Ask the scorer to change them.", "TRICKS_ALREADY_SET");
      }
    }

    await gameRepository.saveEntry(gameId, roundNumber, targetPlayerId, {
      ...(input.bid !== undefined ? { bid: input.bid } : {}),
      ...(input.tricksWon !== undefined ? { tricksWon: input.tricksWon } : {}),
      ...(input.punished !== undefined ? { punished: input.punished } : {}),
      source: isHost ? "HOST" : "PLAYER",
    });

    return this.getGameView(game, session);
  }

  /** Host-only. Scores are computed here from stored entries, never trusted from a client. */
  async completeRound(gameId: string, roundNumber: number, hostToken: string | undefined): Promise<GameView> {
    await this.requireHost(gameId, hostToken);
    const game = await this.getGame(gameId);

    if (roundNumber < 1 || roundNumber > game.rules.rounds) {
      throw new ValidationError("Invalid round number", "INVALID_ROUND");
    }

    const entries = await gameRepository.listEntries(gameId, roundNumber);
    const round: Round = { ...game.rounds[roundNumber - 1], entries };

    if (isRoundRevealed(round)) {
      throw new ValidationError("This round was already scored", "ALREADY_REVEALED");
    }
    if (!hasAllBids(round, game.players)) {
      throw new ValidationError("Every player needs a bid before the round can be scored", "BIDS_INCOMPLETE");
    }
    if (!hasAllTricks(round, game.players)) {
      throw new ValidationError("Every player needs their tricks before the round can be scored", "TRICKS_INCOMPLETE");
    }

    const total = totalTricksEntered(round, game.players);
    if (total !== 13) {
      throw new ValidationError(`The tricks entered add up to ${total}, not 13. Check the entries and try again.`, "INVALID_TRICKS_TOTAL");
    }

    const playerRounds: PlayerRound[] = game.players.map((player) => {
      const entry = findEntry(round, player.id)!;
      const punished = entry.punished ?? false;
      const { scoreTenths } = calculateRoundScore(entry.bid!, entry.tricksWon!, punished);
      return {
        playerId: player.id,
        bid: entry.bid!,
        tricksWon: entry.tricksWon!,
        punished,
        ...(punished ? { punishmentReason: PunishmentReason.UNFAIR_PLAY } : {}),
        scoreTenths,
      };
    });

    const updatedRounds = [...game.rounds];
    updatedRounds[roundNumber - 1] = {
      ...game.rounds[roundNumber - 1],
      players: playerRounds,
      status: "COMPLETED",
      revealed: true,
      completedAt: new Date(),
    };

    const updatedGame: Game = { ...game, rounds: updatedRounds, updatedAt: new Date() };
    const revealed = await gameRepository.revealRound(updatedGame, roundNumber);
    if (!revealed) {
      throw new ValidationError("This round was already scored", "ALREADY_REVEALED");
    }

    return this.getGameView(updatedGame, { sessionId: "host", gameId, role: GameViewerRole.HOST });
  }

  async updateRound(
    gameId: string,
    roundNumber: number,
    playerRounds: Array<{
      playerId: string;
      bid: number;
      tricksWon: number;
      punished?: boolean;
      punishmentReason?: PunishmentReason;
    }>,
    hostToken: string | undefined
  ): Promise<Game> {
    await this.requireHost(gameId, hostToken);
    const game = await this.getGame(gameId);

    // Validate round number
    if (roundNumber < 1 || roundNumber > game.rules.rounds) {
      throw new ValidationError("Invalid round number", "INVALID_ROUND");
    }

    // Validate and calculate scores
    const existingRound = game.rounds[roundNumber - 1];
    const updatedPlayerRounds: PlayerRound[] = playerRounds.map((p) => {
      const player = game.players.find((gp) => gp.id === p.playerId);
      if (!player) {
        throw new ValidationError("Player not found", "PLAYER_NOT_FOUND");
      }

      const existingPlayerRound = existingRound.players.find(
        (playerRound) => playerRound.playerId === p.playerId
      );
      const punished = p.punished ?? existingPlayerRound?.punished ?? false;
      const { scoreTenths } = calculateRoundScore(p.bid, p.tricksWon, punished);

      return {
        playerId: p.playerId,
        bid: p.bid,
        tricksWon: p.tricksWon,
        punished,
        punishmentReason: punished ? (p.punishmentReason || existingPlayerRound?.punishmentReason || PunishmentReason.UNFAIR_PLAY) : undefined,
        punishmentNote: punished ? existingPlayerRound?.punishmentNote : undefined,
        scoreTenths,
      };
    });

    // Update round
    const updatedRounds = [...game.rounds];
    updatedRounds[roundNumber - 1] = {
      ...existingRound,
      players: updatedPlayerRounds,
      status: GameStatus.COMPLETED,
      revealed: true,
      completedAt: new Date(),
    };

    const updatedGame: Game = {
      ...game,
      rounds: updatedRounds,
      updatedAt: new Date(),
    };

    await gameRepository.updateGame(updatedGame);
    return updatedGame;
  }

  async markPunished(
    gameId: string,
    roundNumber: number,
    playerId: string,
    reason: PunishmentReason,
    note: string | undefined,
    hostToken: string | undefined
  ): Promise<Game> {
    await this.requireHost(gameId, hostToken);
    const game = await this.getGame(gameId);

    // Validate round exists
    if (roundNumber < 1 || roundNumber > game.rounds.length) {
      throw new ValidationError("Invalid round number", "INVALID_ROUND");
    }

    const round = game.rounds[roundNumber - 1];
    const playerRound = round.players.find((p) => p.playerId === playerId);

    if (!playerRound) {
      throw new ValidationError("Player not in this round", "PLAYER_NOT_IN_ROUND");
    }

    // Mark as punished
    playerRound.punished = true;
    playerRound.punishmentReason = reason;
    playerRound.punishmentNote = note;
    playerRound.scoreTenths = -playerRound.bid * 10;

    const updatedGame: Game = {
      ...game,
      updatedAt: new Date(),
    };

    await gameRepository.updateGame(updatedGame);
    return updatedGame;
  }

  async removePunishment(
    gameId: string,
    roundNumber: number,
    playerId: string,
    hostToken: string | undefined
  ): Promise<Game> {
    await this.requireHost(gameId, hostToken);
    const game = await this.getGame(gameId);

    // Validate round exists
    if (roundNumber < 1 || roundNumber > game.rounds.length) {
      throw new ValidationError("Invalid round number", "INVALID_ROUND");
    }

    const round = game.rounds[roundNumber - 1];
    const playerRound = round.players.find((p) => p.playerId === playerId);

    if (!playerRound) {
      throw new ValidationError("Player not in this round", "PLAYER_NOT_IN_ROUND");
    }

    if (!playerRound.punished) {
      throw new ValidationError("Player is not punished", "NOT_PUNISHED");
    }

    // Remove punishment and recalculate score
    playerRound.punished = false;
    playerRound.punishmentReason = undefined;
    playerRound.punishmentNote = undefined;

    const { scoreTenths } = calculateRoundScore(
      playerRound.bid,
      playerRound.tricksWon,
      false
    );
    playerRound.scoreTenths = scoreTenths;

    const updatedGame: Game = {
      ...game,
      updatedAt: new Date(),
    };

    await gameRepository.updateGame(updatedGame);
    return updatedGame;
  }

  async completeGame(gameId: string, hostToken: string | undefined): Promise<Game> {
    await this.requireHost(gameId, hostToken);
    const game = await this.getGame(gameId);

    // Validate all rounds completed
    const allComplete = game.rounds.every((r) => r.status === "COMPLETED");
    if (!allComplete) {
      throw new ValidationError(
        "All rounds must be completed",
        "INCOMPLETE_ROUNDS"
      );
    }

    const gameTotals = calculateGameTotals(
      game.rounds.flatMap((round) =>
        round.players.map(({ playerId, scoreTenths }) => ({ playerId, scoreTenths }))
      )
    );
    const rankings = calculateRankings(game.players, gameTotals);

    const updatedGame: Game = {
      ...game,
      status: hasRankingTie(rankings) ? GameStatus.TIE : GameStatus.COMPLETED,
      updatedAt: new Date(),
    };

    await gameRepository.updateGame(updatedGame);
    return updatedGame;
  }

  async listGames(): Promise<Game[]> {
    return gameRepository.listGames();
  }

  async listCompletedGames(): Promise<Game[]> {
    return gameRepository.listGamesByStatus(GameStatus.COMPLETED);
  }

  async deleteGame(gameId: string, hostToken: string | undefined): Promise<void> {
    await this.requireHost(gameId, hostToken);
    await gameRepository.deleteGame(gameId);
  }
}

export const gameService = new GameService();
