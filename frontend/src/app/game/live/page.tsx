"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Clock, Copy, Eye, Loader2, Radio, Share2, Spade, Trash2, Trophy } from "lucide-react";
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
  const [showAbandonDialog, setShowAbandonDialog] = useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);

  useEffect(() => {
    setGameCode(new URLSearchParams(window.location.search).get("code")?.toUpperCase() ?? "");
  }, []);

  const refresh = useCallback(async () => {
    if (!gameCode) return;
    try {
      setGame(await apiGameRepository.getGameView(gameCode));
      setConnection(navigator.onLine ? "LIVE" : "OFFLINE");
    } catch (refreshError) {
      if (refreshError instanceof Error && refreshError.message.toLowerCase().includes("not found")) setNotFound(true);
      setConnection(navigator.onLine ? "RECONNECTING" : "OFFLINE");
    }
  }, [gameCode]);

  useEffect(() => {
    if (!gameCode) return;
    void refresh();
    const interval = window.setInterval(() => void refresh(), 3000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [gameCode, refresh]);

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
        <div className="app-container max-w-md py-20 text-center text-[var(--muted)]">
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

  const liveRound = currentRoundOf(game);
  const selectedRound = game.rounds.find((round) => round.roundNumber === selectedRoundNumber) ?? liveRound;
  const isViewingHistory = selectedRound.roundNumber !== liveRound.roundNumber;
  const phase = selectedRound.phase;
  const field: EntryField = phase === "BIDDING" ? "bid" : "tricksWon";

  const revealedRounds = game.rounds.filter((round) => round.revealed);
  const totals = calculateGameTotals(
    revealedRounds.flatMap((round) => round.players.map(({ playerId, scoreTenths }) => ({ playerId, scoreTenths })))
  );
  const standings = calculateRankings(game.players, totals);

  const entered = game.players.filter((player) => valueOf(entryOf(liveRound, player.id), field) !== undefined).length;
  const trickTotal = game.players.reduce((sum, player) => sum + (entryOf(liveRound, player.id)?.tricksWon ?? 0), 0);
  const allTricksIn = game.players.every((player) => entryOf(liveRound, player.id)?.tricksWon !== undefined);
  const canScoreRound = phase === "TRICKS" && allTricksIn && trickTotal === 13;

  const draftKey = (playerId: string, entryField: EntryField) => `${liveRound.roundNumber}:${playerId}:${entryField}`;

  const displayValue = (player: Player, entryField: EntryField): string => {
    const key = draftKey(player.id, entryField);
    if (key in drafts) return drafts[key];
    const value = valueOf(entryOf(liveRound, player.id), entryField);
    return value === undefined ? "" : String(value);
  };

  const saveEntry = async (playerId: string, entryField: EntryField, raw: string) => {
    const key = draftKey(playerId, entryField);
    const value = Number(raw);
    const min = entryField === "bid" ? 1 : 0;
    if (raw.trim() === "" || !Number.isInteger(value) || value < min || value > 13) {
      setError(entryField === "bid" ? "A call must be a whole number between 1 and 13." : "Tricks must be a whole number between 0 and 13.");
      return;
    }
    if (value === valueOf(entryOf(liveRound, playerId), entryField)) {
      setDrafts((current) => { const next = { ...current }; delete next[key]; return next; });
      return;
    }

    setError(null);
    setBusyKey(key);
    try {
      const updated = await apiGameRepository.saveRoundEntry(gameCode, game.id, liveRound.roundNumber, {
        ...(isHost ? { playerId } : {}),
        [entryField]: value,
      });
      setGame(updated);
      setDrafts((current) => { const next = { ...current }; delete next[key]; return next; });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save that entry.");
    } finally {
      setBusyKey(null);
    }
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
    setError(null);
    setBusyKey("score");
    try {
      const updated = await apiGameRepository.completeRound(gameCode, game.id, liveRound.roundNumber);
      setGame(updated);
      setSelectedRoundNumber(null);
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
      <div className="app-container max-w-2xl">
        <div className="flex items-center justify-between">
          <Link className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--muted)] hover:text-[var(--primary)]" href="/">
            <Spade size={16} fill="currentColor" /> Home
          </Link>
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
        </div>

        <div className="surface-tint mt-5 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="eyebrow">Game code</p>
            <p className="score-number text-xl font-bold tracking-[0.16em] text-[var(--primary)]">{game.gameCode}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button className="btn-secondary min-h-10 px-3 py-2 text-sm" type="button" onClick={() => { void navigator.clipboard.writeText(game.gameCode); setCopied(true); }}>
              <Copy size={15} /> {copied ? "Copied" : "Copy"}
            </button>
            <button
              className="btn-secondary min-h-10 px-3 py-2 text-sm"
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
        </div>

        {game.status !== GameStatus.ACTIVE && (
          <section className="card mt-6 text-center">
            <Trophy className="mx-auto text-[var(--gold)]" />
            <p className="mt-2 font-bold">This game has finished.</p>
            <Link className="btn-secondary mt-4" href={`/game/results/?code=${game.gameCode}`}>View final results</Link>
          </section>
        )}

        <div className="mt-8">
          <p className="eyebrow">Round {selectedRound.roundNumber} of {game.rules.rounds}</p>
          <h1 className="mt-2 font-display text-4xl font-bold">
            {selectedRound.revealed ? "Round complete" : phase === "BIDDING" ? "Calls" : "Tricks"}
          </h1>
          {!selectedRound.revealed && (
            <p className="mt-2 text-sm text-[var(--muted)]" aria-live="polite">
              {phase === "BIDDING"
                ? `${entered} of ${game.players.length} calls in.`
                : `${game.players.filter((player) => entryOf(liveRound, player.id)?.tricksWon !== undefined).length} of ${game.players.length} trick counts in.`}
            </p>
          )}
        </div>

        {standings.length > 0 && revealedRounds.length > 0 && (
          <div className="card mt-5 p-4">
            <p className="eyebrow">Standings</p>
            <ol className="mt-3 space-y-1.5">
              {standings.map((entry) => (
                <li key={entry.playerId} className={`rank-row ${typeof entry.rank === "number" ? `rank-${entry.rank}` : ""}`}>
                  <span className="font-bold text-[var(--gold)]">{entry.rank}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{entry.playerName}</span>
                  <span className="score-number font-bold">{formatScore(entry.totalScoreTenths)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {!selectedRound.revealed && !isViewingHistory && (
          <section className="card mt-6 space-y-4">
            {game.players.map((player) => {
              const entry = entryOf(liveRound, player.id);
              const value = valueOf(entry, field);
              const source = sourceOf(entry, field);
              const isOwnRow = player.id === ownPlayerId;
              const isClaimed = game.claimedPlayerIds.includes(player.id);
              const canEdit = isHost || (isOwnRow && value === undefined);
              const key = draftKey(player.id, field);

              return (
                <div key={player.id} className="flex items-center gap-3 border-b border-[var(--border)] pb-4 last:border-0 last:pb-0">
                  <span className="flex-shrink-0">
                    {value === undefined
                      ? <Clock size={18} className="text-[var(--muted)]" aria-hidden="true" />
                      : <Check size={18} className="text-[var(--success)]" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {player.name}
                      {isOwnRow && <span className="ml-2 text-xs font-bold uppercase text-[var(--primary)]">You</span>}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">
                      {value === undefined
                        ? isClaimed ? "Waiting for their entry" : "Not joined — the scorer enters this"
                        : source === "HOST" ? "Entered by the scorer" : "Entered by the player"}
                    </span>
                    {phase === "TRICKS" && entry?.bid !== undefined && (
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">Called {entry.bid}</span>
                    )}
                    {entry?.punished && <span className="mt-0.5 block text-xs font-semibold text-[var(--danger)]">Disqualified</span>}
                  </span>

                  {canEdit ? (
                    <input
                      className="input-base score-number max-w-20 text-center text-lg font-semibold"
                      type="number"
                      inputMode="numeric"
                      min={field === "bid" ? 1 : 0}
                      max={13}
                      step={1}
                      aria-label={`${player.name} ${field === "bid" ? "call" : "tricks won"}`}
                      disabled={busyKey === key}
                      value={displayValue(player, field)}
                      onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
                      onBlur={(event) => void saveEntry(player.id, field, event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                    />
                  ) : (
                    <span className="score-number w-20 text-center text-lg font-bold">{value ?? "—"}</span>
                  )}

                  {isHost && phase === "TRICKS" && (
                    <button
                      className="text-xs font-semibold text-[var(--muted)] underline hover:text-[var(--danger)]"
                      type="button"
                      disabled={busyKey === `${player.id}:punished`}
                      onClick={() => void toggleDisqualified(player.id, !entry?.punished)}
                    >
                      {entry?.punished ? "Undo" : "Disqualify"}
                    </button>
                  )}
                </div>
              );
            })}

            {phase === "TRICKS" && (
              <div className={`flex items-center justify-between border-t border-[var(--border)] pt-4 text-sm font-bold ${trickTotal === 13 ? "text-[var(--success)]" : "text-[var(--muted)]"}`}>
                <span>Total tricks</span>
                <span className="score-number" aria-live="polite">{trickTotal} / 13</span>
              </div>
            )}

            {error && <p role="alert" className="status-alert">{error}</p>}

            {isHost && phase === "TRICKS" && (
              <>
                {allTricksIn && trickTotal !== 13 && (
                  <p className="status-alert">
                    The tricks add up to {trickTotal}, but a round has exactly 13. {trickTotal > 13 ? `Remove ${trickTotal - 13}` : `Add ${13 - trickTotal} more`} and try again.
                  </p>
                )}
                <button className="btn-primary min-h-14 w-full" type="button" disabled={!canScoreRound || busyKey === "score"} onClick={() => void scoreRound()}>
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
          <section className="card mt-6 space-y-4">
            {game.players.map((player) => {
              const playerRound = selectedRound.players.find((candidate) => candidate.playerId === player.id);
              if (!playerRound) return null;
              return (
                <div key={player.id} className="border-b border-[var(--border)] pb-4 last:border-0 last:pb-0">
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
          <section className="card mt-6">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--muted)]">Scoreboard</h2>
            <table className="mt-3 w-full text-left">
              <caption className="sr-only">Scores for each completed round</caption>
              <thead>
                <tr className="text-xs uppercase text-[var(--muted)]">
                  <th scope="col" className="py-1">Player</th>
                  {revealedRounds.map((round) => <th scope="col" key={round.roundNumber} className="py-1 text-right">R{round.roundNumber}</th>)}
                  <th scope="col" className="py-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {game.players.map((player) => (
                  <tr key={player.id} className="border-t border-[var(--border)]">
                    <th scope="row" className="py-2 font-semibold">{player.name}</th>
                    {revealedRounds.map((round) => {
                      const entry = round.players.find((candidate) => candidate.playerId === player.id);
                      return <td key={round.roundNumber} className="score-number py-2 text-right">{entry ? formatScore(entry.scoreTenths) : "—"}</td>;
                    })}
                    <td className="score-number py-2 text-right font-bold">{formatScore(totals[player.id] ?? 0)}</td>
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

        {isHost && game.status === GameStatus.ACTIVE && (
          <section className="mt-8 border-t border-[var(--border)] pt-5">
            <p className="text-sm font-bold uppercase tracking-wide text-[var(--muted)]">Abandon game</p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Stop scoring and discard this game. Every round recorded so far is deleted and followers lose access to the game code.
            </p>
            <button
              className="btn mt-4 border-[var(--danger-border)] bg-[var(--danger-surface)] text-[var(--danger-text)] hover:bg-[var(--danger)] hover:text-white focus-visible:ring-[var(--danger)]"
              type="button"
              onClick={() => { setError(null); setShowAbandonDialog(true); }}
            >
              <Trash2 size={18} /> Abandon game
            </button>
          </section>
        )}

        {showAbandonDialog && (
          <div className="fixed inset-0 z-10 flex items-end justify-center bg-black/30 px-4 pb-4 sm:items-center" role="presentation">
            <div className="card w-full max-w-sm" role="dialog" aria-modal="true" aria-labelledby="abandon-game-title">
              <h2 id="abandon-game-title" className="font-display text-2xl font-bold">Abandon this game?</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                {revealedRounds.length} of {game.rules.rounds} rounds have been scored. Abandoning deletes them permanently and cannot be undone.
              </p>
              {error && <p role="alert" className="status-alert mt-4">{error}</p>}
              <div className="mt-6 flex justify-end gap-3">
                <button className="btn-secondary" type="button" disabled={isAbandoning} onClick={() => setShowAbandonDialog(false)}>Keep scoring</button>
                <button className="btn-danger" type="button" disabled={isAbandoning} onClick={() => void abandonGame()}>
                  {isAbandoning ? "Abandoning…" : "Abandon game"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
