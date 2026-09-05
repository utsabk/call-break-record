import { Game, GameRules, GameSession, GameView, GameViewerRole, Player, PlayerRound, PunishmentReason } from "@call-break/shared";
import { localGameRepository } from "./LocalGameRepository";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
  };
}

interface CreateGameResponse {
  game: Game;
  hostToken: string;
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
const RECENT_GAME_CODES_KEY = "call-break:recent-game-codes";

/** Sessions live in localStorage so a player keeps their seat across refreshes and restarts. */
function sessionKey(gameCode: string): string {
  return `call-break:session:${gameCode.toUpperCase()}`;
}

function hostTokenKey(gameId: string): string {
  return `call-break:host-token:${gameId}`;
}

export function storeHostToken(gameId: string, hostToken: string): void {
  window.localStorage.setItem(hostTokenKey(gameId), hostToken);
}

/** Host rights must outlive the tab, so tokens saved in sessionStorage are migrated on read. */
export function getHostToken(gameId: string): string | null {
  const stored = window.localStorage.getItem(hostTokenKey(gameId));
  if (stored) return stored;

  const legacy = window.sessionStorage.getItem(hostTokenKey(gameId));
  if (legacy) {
    window.localStorage.setItem(hostTokenKey(gameId), legacy);
    return legacy;
  }
  return null;
}

export function forgetHostToken(gameId: string): void {
  window.localStorage.removeItem(hostTokenKey(gameId));
  window.sessionStorage.removeItem(hostTokenKey(gameId));
}

export function storeGameSession(gameCode: string, session: GameSession): void {
  window.localStorage.setItem(sessionKey(gameCode), JSON.stringify(session));
}

export function getGameSession(gameCode: string): GameSession | null {
  const raw = window.localStorage.getItem(sessionKey(gameCode));
  return raw ? (JSON.parse(raw) as GameSession) : null;
}

export function clearGameSession(gameCode: string): void {
  window.localStorage.removeItem(sessionKey(gameCode));
}

function rememberGameCode(gameCode: string): void {
  const codes = JSON.parse(window.localStorage.getItem(RECENT_GAME_CODES_KEY) || "[]") as string[];
  const nextCodes = [gameCode, ...codes.filter((code) => code !== gameCode)].slice(0, 20);
  window.localStorage.setItem(RECENT_GAME_CODES_KEY, JSON.stringify(nextCodes));
}

export function getRememberedGameCodes(): string[] {
  return JSON.parse(window.localStorage.getItem(RECENT_GAME_CODES_KEY) || "[]") as string[];
}

export function forgetGameCode(gameCode: string): void {
  window.localStorage.setItem(RECENT_GAME_CODES_KEY, JSON.stringify(getRememberedGameCodes().filter((code) => code !== gameCode)));
}

function hydrateGame(game: Game): Game {
  return {
    ...game,
    createdAt: new Date(game.createdAt),
    updatedAt: new Date(game.updatedAt),
    rounds: game.rounds.map((round) => ({
      ...round,
      completedAt: round.completedAt ? new Date(round.completedAt) : undefined,
    })),
  };
}

export class ApiGameRepository {
  async createGame(players: Player[], rules: GameRules): Promise<Game> {
    const response = await this.request<CreateGameResponse | Game>("/games", {
      method: "POST",
      body: JSON.stringify({ players, rules }),
    });
    const created = "game" in response ? response : { game: response, hostToken: undefined };
    if (created.hostToken) storeHostToken(created.game.id, created.hostToken);
    if (created.game.gameCode) rememberGameCode(created.game.gameCode);
    return hydrateGame(created.game);
  }

  async getGame(gameId: string): Promise<Game> {
    return this.request<Game>(`/games/${encodeURIComponent(gameId)}`);
  }

  async getGameByCode(gameCode: string): Promise<Game> {
    const game = await this.request<Game>(`/games/code/${encodeURIComponent(gameCode.trim().toUpperCase())}`, {
      headers: this.sessionHeaders(gameCode),
    });
    rememberGameCode(game.gameCode);
    return game;
  }

  async getGameView(gameCode: string): Promise<GameView> {
    const code = gameCode.trim().toUpperCase();
    const view = await this.request<GameView>(`/games/code/${encodeURIComponent(code)}`, {
      headers: this.sessionHeaders(code),
    });
    rememberGameCode(view.gameCode);
    return view;
  }

  async joinGame(gameCode: string, role: GameViewerRole, playerId?: string): Promise<{ session: GameSession; game: GameView }> {    const code = gameCode.trim().toUpperCase();
    const result = await this.request<{ session: GameSession; game: GameView }>("/games/join", {
      method: "POST",
      body: JSON.stringify({ gameCode: code, role, ...(playerId ? { playerId } : {}) }),
    });
    storeGameSession(code, result.session);
    rememberGameCode(code);
    return result;
  }

  /** Saves whichever fields are supplied; the host may target another player's seat. */
  async saveRoundEntry(
    gameCode: string,
    gameId: string,
    roundNumber: number,
    patch: { playerId?: string; bid?: number; tricksWon?: number; punished?: boolean }
  ): Promise<GameView> {
    return this.request<GameView>(`/games/${encodeURIComponent(gameId)}/rounds/${roundNumber}/submit`, {
      method: "POST",
      headers: { ...this.hostHeaders(gameId), ...this.sessionHeaders(gameCode) },
      body: JSON.stringify(patch),
    });
  }

  async completeRound(gameCode: string, gameId: string, roundNumber: number): Promise<GameView> {
    return this.request<GameView>(`/games/${encodeURIComponent(gameId)}/rounds/${roundNumber}/reveal`, {
      method: "POST",
      headers: { ...this.hostHeaders(gameId), ...this.sessionHeaders(gameCode) },
    });
  }

  private sessionHeaders(gameCode: string): HeadersInit {
    const session = getGameSession(gameCode);
    return session ? { "X-Session-Id": session.sessionId } : {};
  }

  async updateRound(gameId: string, roundNumber: number, players: PlayerRound[]): Promise<Game> {
    return this.request<Game>(`/games/${encodeURIComponent(gameId)}/rounds/${roundNumber}`, {
      method: "PUT",
      headers: this.hostHeaders(gameId),
      body: JSON.stringify({
        players: players.map(({ playerId, bid, tricksWon, punished, punishmentReason }) => ({ playerId, bid, tricksWon, punished, ...(punishmentReason ? { punishmentReason } : {}) })),
      }),
    });
  }

  async listGames(): Promise<Game[]> {
    return this.request<Game[]>("/games");
  }

  async markPunished(gameId: string, roundNumber: number, playerId: string, reason: PunishmentReason, note?: string): Promise<Game> {
    return this.request<Game>(`/games/${encodeURIComponent(gameId)}/rounds/${roundNumber}/players/${encodeURIComponent(playerId)}/punishment`, {
      method: "POST",
      headers: this.hostHeaders(gameId),
      body: JSON.stringify({ reason, ...(note ? { note } : {}) }),
    });
  }

  async removePunishment(gameId: string, roundNumber: number, playerId: string): Promise<Game> {
    return this.request<Game>(`/games/${encodeURIComponent(gameId)}/rounds/${roundNumber}/players/${encodeURIComponent(playerId)}/punishment`, {
      method: "DELETE",
      headers: this.hostHeaders(gameId),
    });
  }

  async completeGame(gameId: string): Promise<Game> {
    return this.request<Game>(`/games/${encodeURIComponent(gameId)}/complete`, { method: "POST", headers: this.hostHeaders(gameId) });
  }

  async deleteGame(gameId: string): Promise<void> {
    await this.request<{ gameId: string }>(`/games/${encodeURIComponent(gameId)}`, { method: "DELETE", headers: this.hostHeaders(gameId) });
    forgetHostToken(gameId);
    try {
      await localGameRepository.deleteGame(gameId);
    } catch {
      // A missing or unavailable local cache must not undo a completed server deletion.
    }
    window.localStorage.removeItem(`call-break:draft:${gameId}:1`);
    window.localStorage.removeItem(`call-break:draft:${gameId}:2`);
    window.localStorage.removeItem(`call-break:draft:${gameId}:3`);
    window.localStorage.removeItem(`call-break:draft:${gameId}:4`);
    window.localStorage.removeItem(`call-break:draft:${gameId}:5`);
  }

  private hostHeaders(gameId: string): HeadersInit {
    const token = getHostToken(gameId);
    return token ? { "X-Host-Token": token } : {};
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!apiBaseUrl) {
      throw new Error("The backend URL is not configured. Set NEXT_PUBLIC_API_BASE_URL before starting the frontend.");
    }

    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", ...init.headers },
      });
    } catch {
      throw new Error("Unable to reach the game server. Check your connection and try again.");
    }

    const payload = await response.json() as ApiResponse<T>;
    if (!response.ok || !payload.success || payload.data === undefined) {
      throw new Error(payload.error?.message || "The game server could not complete that request.");
    }

    if (Array.isArray(payload.data)) {
      return payload.data.map((game) => hydrateGame(game as Game)) as T;
    }
    if (typeof payload.data === "object" && payload.data !== null && "rounds" in payload.data) {
      return hydrateGame(payload.data as unknown as Game) as T;
    }
    return payload.data;
  }
}

export const apiGameRepository = new ApiGameRepository();
