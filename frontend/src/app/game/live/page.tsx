"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleDollarSign, Copy, Eye, Loader2, MoreVertical, Radio, Share2, Spade, Trash2, Trophy } from "lucide-react";
import {
  GameStatus,
  GameView,
  Player,
  PunishmentReason,
  RoundEntry,
  RoundView,
  calculateGameTotals,
  calculateRankings,
} from "@call-break/shared";
import { apiGameRepository, forgetGameCode, getGameSession, getHostToken } from "@/lib/repositories/ApiGameRepository";

type Connection = "LIVE" | "RECONNECTING" | "OFFLINE";
type EntryField = "bid" | "tricksWon";

const MEDALS = ["🥇", "🥈", "🥉", "4️⃣"];

const ACTIVE_POLL_MS = 3000;
const WATCHER_POLL_MS = 10000;
const IDLE_POLL_MS = 15000;
/** Polls without a change before backing off, roughly a minute of a still board. */
const IDLE_POLLS_BEFORE_BACKOFF = 20;

/** Entry writes do not touch the game's updatedAt, so compare what actually moves. */
function boardSignature(game: GameView): string {
  return JSON.stringify([game.status, game.claimedPlayerIds, game.rounds.map((round) => [round.phase, round.revealed, round.entries])]);
}

function formatScore(scoreTenths: number): string {
  const sign = scoreTenths >= 0 ? "+" : "-";
  const absolute = Math.abs(scoreTenths);
  return `${sign}${Math.floor(absolute / 10)}.${absolute % 10}`;
}

function currentRoundOf(game: GameView): RoundView {
  return game.rounds.find((round) => !round.revealed) ?? game.rounds[game.rounds.length - 1];
}

function entryOf(round: RoundView, playerId: string): RoundEntry | undefined {
  return round.entries.find((entry) => entry.playerId === playerId);
}

function valueOf(entry: RoundEntry | undefined, field: EntryField): number | undefined {
  return field === "bid" ? entry?.bid : entry?.tricksWon;
}

function sourceOf(entry: RoundEntry | undefined, field: EntryField): RoundEntry["bidSource"] {
  return field === "bid" ? entry?.bidSource : entry?.tricksSource;
}

export default function LiveGamePage() {
  const [game, setGame] = useState<GameView | null>(null);
  const [connection, setConnection] = useState<Connection>("LIVE");
  const [gameCode, setGameCode] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedRoundNumber, setSelectedRoundNumber] = useState<number | null>(null);
  const [punishmentPlayerId, setPunishmentPlayerId] = useState<string | null>(null);
  const [punishmentReason, setPunishmentReason] = useState(PunishmentReason.WRONG_CARD);
  const [showPenaltyTools, setShowPenaltyTools] = useState(false);
  const [showAbandonDialog, setShowAbandonDialog] = useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tricksEntryRoundNumber, setTricksEntryRoundNumber] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const pollDelayRef = useRef(ACTIVE_POLL_MS);
  const signatureRef = useRef("");
  const idlePollsRef = useRef(0);

  useEffect(() => {
    setGameCode(new URLSearchParams(window.location.search).get("code")?.toUpperCase() ?? "");
  }, []);

  const refresh = useCallback(async () => {
    if (!gameCode) return;
    try {
      const next = await apiGameRepository.getGameView(gameCode);
      const signature = boardSignature(next);
      idlePollsRef.current = signature === signatureRef.current ? idlePollsRef.current + 1 : 0;
      signatureRef.current = signature;
      setGame(next);
      setConnection(navigator.onLine ? "LIVE" : "OFFLINE");
    } catch (refreshError) {
      if (refreshError instanceof Error && refreshError.message.toLowerCase().includes("not found")) setNotFound(true);
      setConnection(navigator.onLine ? "RECONNECTING" : "OFFLINE");
    }
  }, [gameCode]);

  useEffect(() => {
    if (!gameCode) return;
    let stopped = false;
    let timer = 0;

    const tick = async () => {
      // A hidden tab is throttled by the browser anyway, so skip the request entirely.
      if (!document.hidden) await refresh();
      if (!stopped) timer = window.setTimeout(tick, pollDelayRef.current);
    };

    const refreshNow = () => {
      if (document.hidden) return;
      idlePollsRef.current = 0;
      void refresh();
    };

    void tick();
    window.addEventListener("focus", refreshNow);
    document.addEventListener("visibilitychange", refreshNow);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.removeEventListener("focus", refreshNow);
      document.removeEventListener("visibilitychange", refreshNow);
    };
  }, [gameCode, refresh]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  if (notFound) {
    return (
      <main className="app-shell">
        <div className="app-container max-w-md py-20 text-center">
          <p role="alert" className="text-[var(--danger)]">That game code no longer exists.</p>
          <Link className="btn-secondary mt-5" href="/">Home</Link>
        </div>
      </main>
    );
  }

  if (!game) {
    return (
      <main className="app-shell">
        <div className="app-container table-note max-w-md py-20 text-center">
          <Loader2 className="mx-auto animate-spin" aria-hidden="true" />
          <p className="mt-3">Loading game…</p>
        </div>
      </main>
    );
  }

  const session = getGameSession(gameCode);
  const isHost = Boolean(getHostToken(game.id));
  const ownPlayerId = session?.playerId;
  const isPlayer = Boolean(ownPlayerId) && game.players.some((player) => player.id === ownPlayerId);
  const isWatcher = !isHost && !isPlayer;

  // Watchers and a settled board do not need the fast cadence a player entering a score does.
  pollDelayRef.current =
    game.status !== GameStatus.ACTIVE || idlePollsRef.current >= IDLE_POLLS_BEFORE_BACKOFF
      ? IDLE_POLL_MS
      : isWatcher
        ? WATCHER_POLL_MS
        : ACTIVE_POLL_MS;

  const liveRound = currentRoundOf(game);
  const selectedRound = game.rounds.find((round) => round.roundNumber === selectedRoundNumber) ?? liveRound;
  const isViewingHistory = selectedRound.roundNumber !== liveRound.roundNumber;
  const phase = selectedRound.phase;
  const hasEnteredTricks = game.players.some((player) => entryOf(liveRound, player.id)?.tricksWon !== undefined);
  const isReviewingCalls = phase === "TRICKS" && tricksEntryRoundNumber !== liveRound.roundNumber && !hasEnteredTricks;
  const field: EntryField = phase === "BIDDING" || isReviewingCalls ? "bid" : "tricksWon";

  const revealedRounds = game.rounds.filter((round) => round.revealed);
  const totals = calculateGameTotals(
    revealedRounds.flatMap((round) => round.players.map(({ playerId, scoreTenths }) => ({ playerId, scoreTenths })))
  );
  const standings = calculateRankings(game.players, totals);

  const draftKey = (playerId: string, entryField: EntryField) => `${liveRound.roundNumber}:${playerId}:${entryField}`;

  const effectiveValue = (playerId: string, entryField: EntryField): number | undefined => {
    const key = draftKey(playerId, entryField);
    if (!(key in drafts)) return valueOf(entryOf(liveRound, playerId), entryField);
    const value = Number(drafts[key]);
    const min = entryField === "bid" ? 1 : 0;
    return drafts[key].trim() !== "" && Number.isInteger(value) && value >= min && value <= 13 ? value : undefined;
  };

  const allCallsIn = game.players.every((player) => effectiveValue(player.id, "bid") !== undefined);
  const trickTotal = game.players.reduce((sum, player) => sum + (effectiveValue(player.id, "tricksWon") ?? 0), 0);
  const allTricksIn = game.players.every((player) => effectiveValue(player.id, "tricksWon") !== undefined);
  const canScoreRound = phase === "TRICKS" && allTricksIn && trickTotal === 13;

  const displayValue = (player: Player, entryField: EntryField): string => {
    const key = draftKey(player.id, entryField);
    if (key in drafts) return drafts[key];
    const value = valueOf(entryOf(liveRound, player.id), entryField);
    return value === undefined ? "" : String(value);
  };

  const entryInput = (player: Player, entryField: EntryField, disabled = false) => {
    const key = draftKey(player.id, entryField);
    return (
      <input
        className="input-base score-number w-20 text-center text-lg font-semibold"
        type="number"
        inputMode="numeric"
        min={entryField === "bid" ? 1 : 0}
        max={13}
        step={1}
        aria-label={`${player.name} ${entryField === "bid" ? "call" : "tricks won"}`}
        disabled={disabled || busyKey === key}
        value={displayValue(player, entryField)}
        onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
        onBlur={(event) => void saveEntry(player.id, entryField, event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
      />
    );
  };

  const saveEntry = async (playerId: string, entryField: EntryField, raw: string): Promise<boolean> => {
    const key = draftKey(playerId, entryField);
    const value = Number(raw);
    const min = entryField === "bid" ? 1 : 0;
    if (raw.trim() === "" || !Number.isInteger(value) || value < min || value > 13) {
      setError(entryField === "bid" ? "A call must be a whole number between 1 and 13." : "Tricks must be a whole number between 0 and 13.");
      return false;
    }
    if (value === valueOf(entryOf(liveRound, playerId), entryField)) {
      setDrafts((current) => { const next = { ...current }; delete next[key]; return next; });
      return true;
    }

    setError(null);
    setBusyKey(key);
    try {
      const updated = await apiGameRepository.saveRoundEntry(gameCode, game.id, liveRound.roundNumber, {
        ...(isHost ? { playerId } : {}),
        [entryField]: value,
      });
      setGame(updated);
      idlePollsRef.current = 0;
      setDrafts((current) => { const next = { ...current }; delete next[key]; return next; });
      return true;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save that entry.");
      return false;
    } finally {
      setBusyKey(null);
    }
  };

  const commitDrafts = async (entryField: EntryField): Promise<boolean> => {
    for (const player of game.players) {
      const key = draftKey(player.id, entryField);
      if (key in drafts && !await saveEntry(player.id, entryField, drafts[key])) return false;
    }
    return true;
  };

  const advanceToTricks = async () => {
    if (!await commitDrafts("bid")) return;
    setTricksEntryRoundNumber(liveRound.roundNumber);
  };

  const toggleDisqualified = async (playerId: string, punished: boolean) => {
    setError(null);
    setBusyKey(`${playerId}:punished`);
    try {
      setGame(await apiGameRepository.saveRoundEntry(gameCode, game.id, liveRound.roundNumber, { playerId, punished }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update that player.");
    } finally {
      setBusyKey(null);
    }
  };

  const scoreRound = async () => {
    if (!await commitDrafts("tricksWon")) return;
    setError(null);
    setBusyKey("score");
    try {
      const updated = await apiGameRepository.completeRound(gameCode, game.id, liveRound.roundNumber);
      setGame(updated);
      setSelectedRoundNumber(null);
      setShowPenaltyTools(false);
      setPunishmentPlayerId(null);
      if (updated.rounds.every((round) => round.revealed)) {
        await apiGameRepository.completeGame(updated.id);
        window.location.assign(`/game/results/?code=${updated.gameCode}`);
      }
    } catch (scoreError) {
      setError(scoreError instanceof Error ? scoreError.message : "Could not score the round.");
    } finally {
      setBusyKey(null);
    }
  };

  const changePunishment = async (playerId: string, punished: boolean) => {
    setError(null);
    try {
      if (punished) await apiGameRepository.markPunished(game.id, selectedRound.roundNumber, playerId, punishmentReason);
      else await apiGameRepository.removePunishment(game.id, selectedRound.roundNumber, playerId);
      setPunishmentPlayerId(null);
      await refresh();
    } catch (punishError) {
      setError(punishError instanceof Error ? punishError.message : "Could not update the penalty.");
    }
  };

  const abandonGame = async () => {
    setError(null);
    setIsAbandoning(true);
    try {
      await apiGameRepository.deleteGame(game.id);
      forgetGameCode(game.gameCode);
      window.location.assign("/");
    } catch (abandonFailure) {
      setError(abandonFailure instanceof Error ? abandonFailure.message : "Could not abandon the game.");
      setIsAbandoning(false);
    }
  };

  const roleLabel = isHost ? "Scoring" : isPlayer ? "Playing" : "Watching";

  return (
    <main className="app-shell">
      <div className="app-container wide-container">
        <div className="flex items-center justify-between gap-3">
          <Link className="brand-mark" href="/">
            <span className="brand-mark-icon"><Spade size={16} fill="currentColor" /></span> Home
          </Link>
          <div className="flex items-center gap-1">
            <span className="inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              <span className="inline-flex items-center gap-1">
                {isWatcher ? <Eye size={14} aria-hidden="true" /> : null}
                {roleLabel}
              </span>
              <span className="inline-flex items-center gap-1">
                <Radio size={14} aria-hidden="true" className={connection === "LIVE" ? "text-[var(--success)]" : "text-[var(--warning)]"} />
                {connection === "LIVE" ? "Live" : connection === "RECONNECTING" ? "Reconnecting…" : "Offline"}
              </span>
            </span>

            {isHost && (
              <div className="relative" ref={menuRef}>
                <button
                  ref={menuButtonRef}
                  className="icon-button"
                  type="button"
                  aria-label="Game options"
                  aria-expanded={menuOpen}
                  aria-controls="game-menu"
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  <MoreVertical size={20} />
                </button>

                {menuOpen && (
                  <div id="game-menu" role="group" aria-label="Game options" className="panel absolute right-0 top-12 z-20 w-72 p-4 text-left">
                    <p className="eyebrow">Game code</p>
                    <p className="score-number mt-1 text-xl font-bold tracking-[0.16em] text-[var(--primary)]">{game.gameCode}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">Share this with anyone who should play or follow along.</p>
                    <div className="mt-3 flex gap-2">
                      <button className="btn-secondary min-h-10 flex-1 px-3 py-2 text-sm" type="button" onClick={() => { void navigator.clipboard.writeText(game.gameCode); setCopied(true); }}>
                        <Copy size={15} /> {copied ? "Copied" : "Copy"}
                      </button>
                      <button
                        className="btn-secondary min-h-10 flex-1 px-3 py-2 text-sm"
                        type="button"
                        onClick={() => {
                          const text = `Join my Call Break game with code ${game.gameCode}`;
                          if (navigator.share) void navigator.share({ title: "Call Break", text }).catch(() => undefined);
                          else { void navigator.clipboard.writeText(game.gameCode); setCopied(true); }
                        }}
                      >
                        <Share2 size={15} /> Share
                      </button>
                    </div>
                    <div className="mt-4 border-t border-[var(--border)] pt-4">
                      <button
                        className="btn w-full border-[var(--danger-border)] bg-[var(--danger-surface)] text-[var(--danger-text)] hover:bg-[var(--danger)] hover:text-white focus-visible:ring-[var(--danger)]"
                        type="button"
                        onClick={() => { setMenuOpen(false); setError(null); setShowAbandonDialog(true); }}
                      >
                        <Trash2 size={18} /> Delete game
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {game.status !== GameStatus.ACTIVE && (
          <section className="card mt-6 text-center">
            <Trophy className="mx-auto text-[var(--gold)]" />
            <p className="mt-2 font-bold">This game has finished.</p>
            <Link className="btn-secondary mt-4" href={`/game/results/?code=${game.gameCode}`}>View final results</Link>
          </section>
        )}

        <div className="hero-panel round-summary mt-5">
          <div className="round-card-header">
            <h1 className="relative font-display text-3xl font-black sm:text-4xl">
              {selectedRound.revealed ? "Round complete" : field === "bid" ? "Calls" : "Tricks"}
            </h1>
            <span className="round-status-badge"><Spade size={13} fill="currentColor" /> Round {selectedRound.roundNumber}/{game.rules.rounds}</span>
          </div>
        </div>

        {!selectedRound.revealed && !isViewingHistory && (
          <section className="panel mt-4 space-y-3">
            {isHost && field === "tricksWon" && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Players</p>
                <button
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-xs font-bold text-[var(--muted)] hover:bg-[var(--surface-tint)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                  type="button"
                  aria-expanded={showPenaltyTools}
                  onClick={() => setShowPenaltyTools((open) => !open)}
                >
                  <CircleDollarSign size={14} /> Penalty
                </button>
              </div>
            )}
            {isHost && field === "tricksWon" && (
              <div className={showPenaltyTools ? "admin-action-strip" : "hidden"}>
                <label className="min-w-0 flex-1">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Disqualify</span>
                  <select className="input-base min-h-11" value={punishmentPlayerId ?? ""} onChange={(event) => setPunishmentPlayerId(event.target.value || null)}>
                    <option value="">Choose player</option>
                    {game.players.map((player) => {
                      const entry = entryOf(liveRound, player.id);
                      return <option key={player.id} value={player.id}>{entry?.punished ? `Undo ${player.name}` : player.name}</option>;
                    })}
                  </select>
                </label>
                <button
                  className="btn-secondary min-h-11 px-3 py-2 text-sm"
                  type="button"
                  disabled={!punishmentPlayerId || busyKey === `${punishmentPlayerId}:punished`}
                  onClick={() => {
                    if (!punishmentPlayerId) return;
                    const entry = entryOf(liveRound, punishmentPlayerId);
                    void toggleDisqualified(punishmentPlayerId, !entry?.punished);
                    setPunishmentPlayerId(null);
                    setShowPenaltyTools(false);
                  }}
                >
                  <CircleDollarSign size={16} /> Apply
                </button>
              </div>
            )}

            {game.players.map((player) => {
              const entry = entryOf(liveRound, player.id);
              const value = valueOf(entry, field);
              const source = sourceOf(entry, field);
              const isOwnRow = player.id === ownPlayerId;
              const isClaimed = game.claimedPlayerIds.includes(player.id);
              const canEdit = isOwnRow && value === undefined;

              return (
                <div key={player.id} className="compact-player-row" data-state={value === undefined ? "waiting" : "done"}>
                  <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-display text-lg font-bold">
                      {player.name}
                      </span>
                      {isOwnRow && <span className="ml-2 text-xs font-bold uppercase text-[var(--primary)]">You</span>}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                      <span className="player-state-badge" data-state={value === undefined ? "waiting" : "done"}>{value === undefined ? "Pending" : "Entered"}</span>
                      {!isClaimed && !isOwnRow && <span className="player-state-badge">Not joined</span>}
                      {value !== undefined && <span className="truncate">{source === "HOST" ? "Scorer" : "Player"}</span>}
                    </span>
                    {field === "tricksWon" && !isHost && entry?.bid !== undefined && (
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">Called {entry.bid}</span>
                    )}
                    {entry?.punished && <span className="mt-0.5 block text-xs font-semibold text-[var(--danger)]">Disqualified</span>}
                  </span>

                  {isHost ? (
                    <span className="entry-control-group current-entry-control">
                      <label className="entry-control-label">
                        <span>{field === "bid" ? "Call" : "Tricks"}</span>
                        {entryInput(player, field)}
                      </label>
                    </span>
                  ) : canEdit ? (
                    entryInput(player, field)
                  ) : (
                    <span className="score-number w-20 text-center text-lg font-bold">{value ?? "—"}</span>
                  )}

                </div>
              );
            })}

            {field === "tricksWon" && (
              <div className={`metric-tile flex items-center justify-between text-sm font-bold ${trickTotal === 13 ? "text-[var(--success)]" : "text-[var(--muted)]"}`}>
                <span>Total tricks</span>
                <span className="score-number" aria-live="polite">{trickTotal} / 13</span>
              </div>
            )}

            {error && <p role="alert" className="status-alert">{error}</p>}

            {field === "bid" && (
              <button
                className="btn-primary min-h-14 w-full"
                type="button"
                disabled={!allCallsIn || busyKey !== null}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => void advanceToTricks()}
              >
                Next <ArrowRight size={18} aria-hidden="true" />
              </button>
            )}

            {isHost && field === "tricksWon" && (
              <>
                {allTricksIn && trickTotal !== 13 && (
                  <p className="status-alert">
                    The tricks add up to {trickTotal}, but a round has exactly 13. {trickTotal > 13 ? `Remove ${trickTotal - 13}` : `Add ${13 - trickTotal} more`} and try again.
                  </p>
                )}
                <button className="btn-primary min-h-14 w-full" type="button" disabled={!canScoreRound || busyKey !== null} onPointerDown={(event) => event.preventDefault()} onClick={() => void scoreRound()}>
                  {busyKey === "score" ? "Scoring…" : "Score round"}
                </button>
              </>
            )}

            {!isHost && (
              <p className="text-sm text-[var(--muted)]">
                {isPlayer ? "The scorer can correct any entry before the round is scored." : "Only players and the scorer can enter values."}
              </p>
            )}
          </section>
        )}

        {selectedRound.revealed && (
          <section className="panel mt-6 space-y-3">
            {game.players.map((player) => {
              const playerRound = selectedRound.players.find((candidate) => candidate.playerId === player.id);
              if (!playerRound) return null;
              return (
                <div key={player.id} className="player-row">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold">{player.name}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">Called {playerRound.bid}, won {playerRound.tricksWon}</p>
                      {playerRound.punished && <p className="mt-1 text-sm font-semibold text-[var(--danger)]">Disqualified</p>}
                    </div>
                    <p className={`score-number font-bold ${playerRound.scoreTenths < 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>
                      {formatScore(playerRound.scoreTenths)}
                    </p>
                  </div>
                  {isHost && (
                    playerRound.punished
                      ? <button className="mt-2 text-sm text-[var(--primary)] underline" type="button" onClick={() => void changePunishment(player.id, false)}>Remove penalty</button>
                      : <button className="mt-2 text-sm text-[var(--primary)] underline" type="button" onClick={() => setPunishmentPlayerId(player.id)}>Mark punished</button>
                  )}
                  {punishmentPlayerId === player.id && (
                    <div className="mt-3 flex gap-2">
                      <select aria-label="Punishment reason" className="input-base min-h-10" value={punishmentReason} onChange={(event) => setPunishmentReason(event.target.value as PunishmentReason)}>
                        {Object.values(PunishmentReason).map((reason) => <option key={reason} value={reason}>{reason.replace("_", " ")}</option>)}
                      </select>
                      <button className="btn-primary min-h-10 px-3 py-2 text-sm" type="button" onClick={() => void changePunishment(player.id, true)}>Save</button>
                    </div>
                  )}
                </div>
              );
            })}
            {error && <p role="alert" className="status-alert">{error}</p>}
          </section>
        )}

        {revealedRounds.length > 0 && (
          <section className="panel mt-6 overflow-x-auto">
            <div className="flex items-center justify-between gap-3">
              <h2 className="kicker-pill">Standings</h2>
              <span className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">{revealedRounds.length} rounds scored</span>
            </div>
            <table className="score-table mt-3 w-full text-left">
              <caption className="sr-only">Ranking and round-by-round scores</caption>
              <thead>
                <tr className="text-xs uppercase text-[var(--muted)]">
                  <th scope="col" className="py-1 pl-2">Rank</th>
                  <th scope="col" className="py-1">Player</th>
                  {revealedRounds.map((round) => <th scope="col" key={round.roundNumber} className="py-1 text-right">R{round.roundNumber}</th>)}
                  <th scope="col" className="py-1 pr-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((standing, index) => (
                  <tr
                    key={standing.playerId}
                    className={typeof standing.rank === "number" ? `rank-edge rank-${standing.rank}` : ""}
                    data-current={standing.playerId === ownPlayerId}
                    data-leader={standing.rank === 1}
                  >
                    <td className="py-2 pl-2 font-bold text-[var(--gold)]">
                      <span aria-hidden="true">{MEDALS[index] ?? ""}</span> {standing.rank}
                    </td>
                    <th scope="row" className="max-w-32 truncate py-2 font-semibold">{standing.playerName}</th>
                    {revealedRounds.map((round) => {
                      const scored = round.players.find((candidate) => candidate.playerId === standing.playerId);
                      return <td key={round.roundNumber} className={`score-number py-2 text-right ${scored && scored.scoreTenths < 0 ? "text-[var(--danger)]" : scored && scored.scoreTenths > 0 ? "text-[var(--success)]" : "text-[var(--muted)]"}`}>{scored ? formatScore(scored.scoreTenths) : "—"}</td>;
                    })}
                    <td className={`score-number py-2 pr-2 text-right font-bold ${standing.totalScoreTenths < 0 ? "text-[var(--danger)]" : standing.totalScoreTenths > 0 ? "text-[var(--success)]" : "text-[var(--muted)]"}`}>{formatScore(standing.totalScoreTenths)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {revealedRounds.length > 0 && (
          <nav className="mt-8 border-t border-[var(--border)] pt-5" aria-label="Round history">
            <p className="text-sm font-bold uppercase tracking-wide text-[var(--muted)]">Rounds</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {revealedRounds.map((round) => (
                <button key={round.roundNumber} className="btn-secondary min-h-10 px-3 py-2 text-sm" type="button" onClick={() => setSelectedRoundNumber(round.roundNumber)}>
                  Round {round.roundNumber}
                </button>
              ))}
              {isViewingHistory && (
                <button className="btn-secondary min-h-10 px-3 py-2 text-sm" type="button" onClick={() => setSelectedRoundNumber(null)}>
                  Back to round {liveRound.roundNumber}
                </button>
              )}
            </div>
          </nav>
        )}

        {showAbandonDialog && (
          <div className="fixed inset-0 z-10 flex items-end justify-center bg-black/30 px-4 pb-4 sm:items-center" role="presentation">
            <div className="card w-full max-w-sm" role="dialog" aria-modal="true" aria-labelledby="abandon-game-title">
              <h2 id="abandon-game-title" className="font-display text-2xl font-bold">Delete this game?</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                {revealedRounds.length} of {game.rules.rounds} rounds have been scored. Deleting removes them permanently and cannot be undone.
              </p>
              {error && <p role="alert" className="status-alert mt-4">{error}</p>}
              <div className="mt-6 flex justify-end gap-3">
                <button className="btn-secondary" type="button" disabled={isAbandoning} onClick={() => setShowAbandonDialog(false)}>Keep game</button>
                <button className="btn-danger" type="button" disabled={isAbandoning} onClick={() => void abandonGame()}>
                  {isAbandoning ? "Deleting…" : "Delete game"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
