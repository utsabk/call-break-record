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
  canRevealRound,
  createGameView,
  hasRankingTie,
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
    const [submissionsByRound, claimedPlayerIds] = await Promise.all([
      gameRepository.listAllSubmissions(game.id),
      gameRepository.listClaimedPlayerIds(game.id),
    ]);

    const hydrated: Game = {
      ...game,
      rounds: game.rounds.map((round) => ({
        ...round,
        submissions: submissionsByRound.get(round.roundNumber) || [],
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

  /** The player is taken from the session, so nobody can submit for someone else. */
  async submitPlayerRound(
    gameId: string,
    sessionId: string | undefined,
    roundNumber: number,
    bid: number,
    tricksWon: number
  ): Promise<GameView> {
    const game = await this.getGame(gameId);
    const session = await this.resolveSession(gameId, sessionId, undefined);

    if (session.role !== GameViewerRole.PLAYER || !session.playerId) {
      throw new ValidationError("Join as a player before submitting a score", "NOT_A_PLAYER");
    }
    if (game.status !== GameStatus.ACTIVE) {
      throw new ValidationError("This game has finished", "GAME_COMPLETED");
    }
    if (roundNumber < 1 || roundNumber > game.rules.rounds) {
      throw new ValidationError("Invalid round number", "INVALID_ROUND");
    }
    if (game.rounds[roundNumber - 1].revealed) {
      throw new ValidationError("This round has already been revealed", "ROUND_REVEALED");
    }
    if (!Number.isInteger(bid) || bid < 1 || bid > 13) {
      throw new ValidationError("Bid must be between 1 and 13", "INVALID_BID");
    }
    if (!Number.isInteger(tricksWon) || tricksWon < 0 || tricksWon > 13) {
      throw new ValidationError("Tricks must be between 0 and 13", "INVALID_TRICKS");
    }

    await gameRepository.putSubmission(gameId, roundNumber, {
      playerId: session.playerId,
      bid,
      tricksWon,
      submittedAt: new Date(),
    });

    return this.getGameView(game, session);
  }

  /** Host-only. Scores are computed here from stored submissions, never trusted from a client. */
  async revealRound(gameId: string, roundNumber: number, hostToken: string | undefined): Promise<GameView> {
    await this.requireHost(gameId, hostToken);
    const game = await this.getGame(gameId);

    if (roundNumber < 1 || roundNumber > game.rules.rounds) {
      throw new ValidationError("Invalid round number", "INVALID_ROUND");
    }

    const submissions = await gameRepository.listSubmissions(gameId, roundNumber);
    const round = { ...game.rounds[roundNumber - 1], submissions };
    if (!canRevealRound(round, game.players)) {
      throw new ValidationError("Every player must submit before the round can be revealed", "SUBMISSIONS_INCOMPLETE");
    }

    const totalTricks = submissions.reduce((total, submission) => total + submission.tricksWon, 0);
    if (totalTricks !== 13) {
      throw new ValidationError(`The tricks entered add up to ${totalTricks}, not 13. Ask the players to check their entries.`, "INVALID_TRICKS_TOTAL");
    }

    const playerRounds: PlayerRound[] = game.players.map((player) => {
      const submission = submissions.find((candidate) => candidate.playerId === player.id)!;
      const { scoreTenths } = calculateRoundScore(submission.bid, submission.tricksWon, false);
      return {
        playerId: player.id,
        bid: submission.bid,
        tricksWon: submission.tricksWon,
        punished: false,
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
      throw new ValidationError("This round was already revealed", "ALREADY_REVEALED");
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
