"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Clock, Eye, Loader2, Radio, Trophy } from "lucide-react";
import {
  GameStatus,
  GameView,
  GameViewerRole,
  RoundView,
  calculateGameTotals,
} from "@call-break/shared";
import { apiGameRepository, getGameSession } from "@/lib/repositories/ApiGameRepository";

type Connection = "LIVE" | "RECONNECTING" | "OFFLINE";

function formatScore(scoreTenths: number): string {
  const sign = scoreTenths >= 0 ? "+" : "-";
  const absolute = Math.abs(scoreTenths);
  return `${sign}${Math.floor(absolute / 10)}.${absolute % 10}`;
}

function currentRoundOf(game: GameView): RoundView {
  return game.rounds.find((round) => !round.revealed) ?? game.rounds[game.rounds.length - 1];
}

export default function LiveGamePage() {
  const [game, setGame] = useState<GameView | null>(null);
  const [connection, setConnection] = useState<Connection>("LIVE");
  const [gameCode, setGameCode] = useState("");
  const [bid, setBid] = useState("");
  const [tricks, setTricks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setGameCode(new URLSearchParams(window.location.search).get("code")?.toUpperCase() ?? "");
  }, []);

  const refresh = useCallback(async () => {
    if (!gameCode) return;
    try {
      setGame(await apiGameRepository.getGameView(gameCode));
      setConnection(navigator.onLine ? "LIVE" : "OFFLINE");
    } catch {
      setConnection(navigator.onLine ? "RECONNECTING" : "OFFLINE");
    }
  }, [gameCode]);

  useEffect(() => {
    if (!gameCode) return;
    void refresh();
    const interval = window.setInterval(() => void refresh(), 4000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [gameCode, refresh]);

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
  const role = session?.role ?? game.role ?? GameViewerRole.VIEWER;
  const round = currentRoundOf(game);
  const isPlayer = role === GameViewerRole.PLAYER && Boolean(session?.playerId);
  const isHost = role === GameViewerRole.HOST;
  const mySubmission = round.ownSubmission;
  const allSubmitted = round.submissions.every((state) => state.status === "SUBMITTED");
  const revealedRounds = game.rounds.filter((item) => item.revealed);

  const totals = calculateGameTotals(
    revealedRounds.flatMap((item) => item.players.map(({ playerId, scoreTenths }) => ({ playerId, scoreTenths })))
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const numericBid = Number(bid);
    const numericTricks = Number(tricks);
    if (!Number.isInteger(numericBid) || numericBid < 1 || numericBid > 13) { setError("Your bid must be between 1 and 13."); return; }
    if (!Number.isInteger(numericTricks) || numericTricks < 0 || numericTricks > 13) { setError("Your tricks must be between 0 and 13."); return; }

    setBusy(true);
    try {
      setGame(await apiGameRepository.submitPlayerRound(gameCode, game.id, round.roundNumber, numericBid, numericTricks));
      setBid("");
      setTricks("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not save your entry.");
    } finally {
      setBusy(false);
    }
  };

  const reveal = async () => {
    setError(null);
    setBusy(true);
    try {
      setGame(await apiGameRepository.revealRound(gameCode, game.id, round.roundNumber));
    } catch (revealError) {
      setError(revealError instanceof Error ? revealError.message : "Could not reveal the round.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="app-shell">
      <div className="app-container max-w-2xl">
        <div className="flex items-center justify-between">
          <Link className="text-sm font-semibold text-[var(--muted)]" href="/">Home</Link>
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            <Radio size={14} aria-hidden="true" className={connection === "LIVE" ? "text-[var(--success)]" : "text-[var(--warning)]"} />
            {connection === "LIVE" ? "Live" : connection === "RECONNECTING" ? "Reconnecting…" : "Offline"}
          </span>
        </div>

        <header className="mt-6">
          <p className="eyebrow">Game code</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-[0.15em]">{game.gameCode}</h1>
          <p className="mt-2 text-[var(--muted)]">
            Round {round.roundNumber} of {game.rules.rounds}
            {role === GameViewerRole.VIEWER && <span className="ml-2 inline-flex items-center gap-1"><Eye size={14} /> Watching</span>}
          </p>
        </header>

        {game.status !== GameStatus.ACTIVE && (
          <section className="card mt-6 text-center">
            <Trophy className="mx-auto text-[var(--gold)]" />
            <p className="mt-2 font-bold">This game has finished.</p>
            <Link className="btn-secondary mt-4" href={`/game/results/?code=${game.gameCode}`}>View final results</Link>
          </section>
        )}

        <section className="card mt-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--muted)]">This round</h2>
          <ul className="mt-3 space-y-2">
            {game.players.map((player) => {
              const state = round.submissions.find((item) => item.playerId === player.id);
              const submitted = state?.status === "SUBMITTED";
              return (
                <li key={player.id} className="flex min-h-11 items-center gap-3">
                  {submitted
                    ? <Check size={18} className="text-[var(--success)]" aria-hidden="true" />
                    : <Clock size={18} className="text-[var(--muted)]" aria-hidden="true" />}
                  <span className="font-semibold">{player.name}</span>
                  <span className="ml-auto text-sm text-[var(--muted)]">{submitted ? "Submitted" : "Waiting"}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-[var(--muted)]">Bids and tricks stay hidden until the host reveals the round.</p>
        </section>

        {isPlayer && !round.revealed && (
          <section className="card mt-6">
            <h2 className="font-bold">You are playing as {game.players.find((player) => player.id === session?.playerId)?.name}</h2>
            {mySubmission ? (
              <div className="mt-3">
                <p className="inline-flex items-center gap-2 font-semibold text-[var(--success)]"><Check size={18} /> Submitted</p>
                <p className="mt-2 text-[var(--muted)]">Your bid {mySubmission.bid} · tricks {mySubmission.tricksWon}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">Waiting for the other players…</p>
              </div>
            ) : (
              <form className="mt-4 space-y-4" onSubmit={submit}>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold">Your bid</span>
                  <input className="input-base score-number" inputMode="numeric" type="number" min="1" max="13" value={bid} onChange={(event) => setBid(event.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold">Your tricks won</span>
                  <input className="input-base score-number" inputMode="numeric" type="number" min="0" max="13" value={tricks} onChange={(event) => setTricks(event.target.value)} />
                </label>
                {error && <p className="status-alert" role="alert">{error}</p>}
                <button className="btn-primary min-h-14 w-full" disabled={busy}>{busy ? "Saving…" : "Submit round"}</button>
              </form>
            )}
          </section>
        )}

        {isHost && !round.revealed && (
          <section className="card mt-6">
            <h2 className="font-bold">Host controls</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {allSubmitted ? "All players have submitted." : "Waiting for every player to submit."}
            </p>
            {error && <p className="status-alert mt-3" role="alert">{error}</p>}
            <button className="btn-primary min-h-14 mt-4 w-full" disabled={!allSubmitted || busy} onClick={reveal}>
              {busy ? "Revealing…" : "Reveal round"}
            </button>
          </section>
        )}

        {revealedRounds.length > 0 && (
          <section className="card mt-6">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--muted)]">Scoreboard</h2>
            <table className="mt-3 w-full text-left">
              <caption className="sr-only">Cumulative scores after each revealed round</caption>
              <thead>
                <tr className="text-xs uppercase text-[var(--muted)]">
                  <th scope="col" className="py-1">Player</th>
                  {revealedRounds.map((item) => <th scope="col" key={item.roundNumber} className="py-1 text-right">R{item.roundNumber}</th>)}
                  <th scope="col" className="py-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {game.players.map((player) => (
                  <tr key={player.id} className="border-t border-[var(--border)]">
                    <th scope="row" className="py-2 font-semibold">{player.name}</th>
                    {revealedRounds.map((item) => {
                      const entry = item.players.find((candidate) => candidate.playerId === player.id);
                      return <td key={item.roundNumber} className="score-number py-2 text-right">{entry ? formatScore(entry.scoreTenths) : "—"}</td>;
                    })}
                    <td className="score-number py-2 text-right font-bold">{formatScore(totals[player.id] ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </main>
  );
}
