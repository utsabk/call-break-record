"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, Lock, Share2, Spade } from "lucide-react";
import Link from "next/link";
import { calculateRankings, calculateRoundScore, PlayerRound, PunishmentReason } from "@call-break/shared";
import { useGameStore } from "@/lib/hooks/useGameStore";
import { getHostToken } from "@/lib/repositories/ApiGameRepository";
import { useGamePolling } from "@/lib/hooks/useGamePolling";

type RoundPhase = "CALLS" | "TRICKS" | "COMPLETED";

interface RoundDraft {
  phase: Exclude<RoundPhase, "COMPLETED">;
  calls: string[];
  tricks: string[];
  punished: boolean[];
}

const emptyDraft = (): RoundDraft => ({
  phase: "CALLS",
  calls: ["", "", "", ""],
  tricks: ["", "", "", ""],
  punished: [false, false, false, false],
});

const formatScore = (scoreTenths: number): string => `${scoreTenths >= 0 ? "+" : ""}${(scoreTenths / 10).toFixed(1)}`;
const draftKey = (gameId: string, roundNumber: number): string => `call-break:draft:${gameId}:${roundNumber}`;

export default function GamePage() {
  const currentGame = useGameStore((state) => state.currentGame);
  const isLoading = useGameStore((state) => state.isLoading);
  const loadGame = useGameStore((state) => state.loadGame);
  const saveRound = useGameStore((state) => state.saveRound);
  const markPunished = useGameStore((state) => state.markPunished);
  const removePunishment = useGameStore((state) => state.removePunishment);
  const completeGame = useGameStore((state) => state.completeGame);
  const getGameTotals = useGameStore((state) => state.getGameTotals);
  const [isReady, setIsReady] = useState(false);
  const [selectedRoundNumber, setSelectedRoundNumber] = useState<number | null>(null);
  const [draft, setDraft] = useState<RoundDraft>(emptyDraft);
  const [hydratedDraftRound, setHydratedDraftRound] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [punishmentPlayerId, setPunishmentPlayerId] = useState<string | null>(null);
  const [punishmentReason, setPunishmentReason] = useState(PunishmentReason.WRONG_CARD);
  const [isHost, setIsHost] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const selectedRound = currentGame?.rounds.find((round) => round.roundNumber === selectedRoundNumber);
  // Rounds are created upfront, so the round being scored is the first one still active.
  const activeRound = currentGame?.rounds.find((round) => round.status === "ACTIVE");
  const phase: RoundPhase = selectedRound?.status === "COMPLETED" ? "COMPLETED" : draft.phase;
  const totals = getGameTotals();
  const standings = currentGame ? calculateRankings(currentGame.players, totals) : [];
  const standingsTied = standings.some((entry) => entry.rank === "TIE");
  useGamePolling(currentGame?.gameCode, Boolean(currentGame && !isHost));

  useEffect(() => {
    setIsHost(Boolean(currentGame && getHostToken(currentGame.id)));
  }, [currentGame]);

  useEffect(() => {
    const gameCode = new URLSearchParams(window.location.search).get("code");
    const gameId = new URLSearchParams(window.location.search).get("id");
    if (!gameCode && !gameId) {
      setLocalError("Game not found.");
      setIsReady(true);
      return;
    }
    const load = gameCode ? useGameStore.getState().loadGameByCode : loadGame;
    void load(gameCode || gameId || "").catch((error: unknown) => {
      setLocalError(error instanceof Error ? error.message : "Could not load game.");
    }).finally(() => setIsReady(true));
  }, [loadGame]);

  useEffect(() => {
    if (!currentGame || selectedRoundNumber !== null) return;
    const activeRound = currentGame.rounds.find((round) => round.status === "ACTIVE");
    setSelectedRoundNumber((activeRound || currentGame.rounds[currentGame.rounds.length - 1]).roundNumber);
  }, [currentGame, selectedRoundNumber]);

  useEffect(() => {
    if (!currentGame || !selectedRound) return;
    setLocalError(null);
    setPunishmentPlayerId(null);
    if (selectedRound.status === "COMPLETED") return;
    setHydratedDraftRound(null);
    const stored = window.localStorage.getItem(draftKey(currentGame.id, selectedRound.roundNumber));
    if (!stored) {
      setDraft(emptyDraft());
      setHydratedDraftRound(selectedRound.roundNumber);
      return;
    }
    try {
      const parsed = JSON.parse(stored) as RoundDraft;
      if ((parsed.phase === "CALLS" || parsed.phase === "TRICKS") && parsed.calls.length === 4 && parsed.tricks.length === 4) {
        setDraft({ ...parsed, punished: Array.isArray(parsed.punished) && parsed.punished.length === 4 ? parsed.punished : [false, false, false, false] });
      }
      else setDraft(emptyDraft());
    } catch {
      setDraft(emptyDraft());
    }
    setHydratedDraftRound(selectedRound.roundNumber);
  }, [currentGame, selectedRound]);

  useEffect(() => {
    if (currentGame && selectedRound?.status === "ACTIVE" && hydratedDraftRound === selectedRound.roundNumber) {
      window.localStorage.setItem(draftKey(currentGame.id, selectedRound.roundNumber), JSON.stringify(draft));
    }
  }, [currentGame, selectedRound, draft, hydratedDraftRound]);

  const updateDraft = (field: "calls" | "tricks", index: number, value: string) => {
    setLocalError(null);
    setDraft((current) => ({ ...current, [field]: current[field].map((entry, entryIndex) => entryIndex === index ? value : entry) }));
  };

  const toggleDisqualification = (index: number) => {
    setDraft((current) => ({ ...current, punished: current.punished.map((punished, playerIndex) => playerIndex === index ? !punished : punished) }));
  };

  const calls = draft.calls.map(Number);
  const tricks = draft.tricks.map(Number);
  const callErrors = draft.calls.map((value) => value === "" || !Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 13);
  const trickErrors = draft.tricks.map((value) => value === "" || !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 13);
  const totalTricks = tricks.reduce((sum, tricksWon) => sum + tricksWon, 0);

  const lockCalls = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    if (callErrors.some(Boolean)) {
      setLocalError("Each call must be between 1 and 13.");
      return;
    }
    setDraft((current) => ({ ...current, phase: "TRICKS" }));
  };

  const completeRound = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    if (trickErrors.some(Boolean)) {
      setLocalError("Enter the tricks won for every player, between 0 and 13.");
      return;
    }
    if (totalTricks !== 13) {
      const difference = Math.abs(totalTricks - 13);
      setLocalError(`Tricks add up to ${totalTricks}, but a round has exactly 13. ${totalTricks > 13 ? `Remove ${difference}` : `Add ${difference} more`} and try again.`);
      return;
    }
    if (!currentGame || !selectedRound) return;
    const playerRounds: PlayerRound[] = currentGame.players.map((player, index) => ({ playerId: player.id, bid: calls[index], tricksWon: tricks[index], punished: draft.punished[index], punishmentReason: draft.punished[index] ? PunishmentReason.UNFAIR_PLAY : undefined, scoreTenths: 0 }));
    try {
      const savedGame = await saveRound(selectedRound.roundNumber, playerRounds);
      window.localStorage.removeItem(draftKey(savedGame.id, selectedRound.roundNumber));
      const nextRound = savedGame.rounds.find((round) => round.status === "ACTIVE");
      if (nextRound) setSelectedRoundNumber(nextRound.roundNumber);
      else {
        const completedGame = await completeGame();
        window.location.assign(`/game/results/?id=${completedGame.id}`);
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Could not save round. Try again.");
    }
  };

  const applyPunishment = async (playerId: string) => {
    if (!selectedRound) return;
    try {
      await markPunished(selectedRound.roundNumber, playerId, punishmentReason);
      setPunishmentPlayerId(null);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Could not save punishment. Try again.");
    }
  };

  const clearPunishment = async (playerId: string) => {
    if (!selectedRound) return;
    try {
      await removePunishment(selectedRound.roundNumber, playerId);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Could not remove punishment. Try again.");
    }
  };

  if (!isReady || (isLoading && !currentGame)) return <main className="min-h-screen px-4 py-10"><p className="mx-auto max-w-xl text-[var(--muted)]">Loading game...</p></main>;
  if (!currentGame || !selectedRound) return <main className="min-h-screen px-4 py-10"><div className="mx-auto max-w-xl"><p role="alert" className="text-[var(--danger)]">{localError || "Game not found."}</p><Link href="/" className="btn-secondary mt-5"><ArrowLeft size={18} /> Home</Link></div></main>;

  return <main className="app-shell"><div className="app-container max-w-xl"><header className="flex items-center justify-between"><Link href="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--muted)] hover:text-[var(--primary)]"><ArrowLeft size={18} /> Home</Link><span className="inline-flex items-center gap-2 text-sm font-bold tracking-wide text-[var(--primary)]"><Spade size={18} fill="currentColor" /> CALL BREAK</span></header><div className="surface-tint mt-5 flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="eyebrow">Game code</p><p className="score-number text-xl font-bold tracking-[0.16em] text-[var(--primary)]">{currentGame.gameCode}</p><p className="mt-1 text-xs text-[var(--muted)]">Anyone with this code can follow the scoring.</p></div><div className="flex shrink-0 gap-2"><button className="btn-secondary min-h-10 px-3 py-2 text-sm" type="button" onClick={() => { void navigator.clipboard.writeText(currentGame.gameCode); setCopiedCode(true); }}><Copy size={15} /> {copiedCode ? "Copied" : "Copy"}</button><button className="btn-secondary min-h-10 px-3 py-2 text-sm" type="button" onClick={() => { const text = `Join my Call Break game with code ${currentGame.gameCode}`; if (navigator.share) void navigator.share({ title: "Call Break", text }).catch(() => undefined); else { void navigator.clipboard.writeText(currentGame.gameCode); setCopiedCode(true); } }}><Share2 size={15} /> Share</button></div></div><div className="mt-8"><p className="eyebrow">Round {selectedRound.roundNumber} / {currentGame.rules.rounds}</p><h1 className="mt-2 font-display text-4xl font-bold">{phase === "CALLS" ? "Calls" : phase === "TRICKS" ? "Tricks" : `Round ${selectedRound.roundNumber}`}</h1></div><div className="card mt-5 p-4"><div className="flex items-center justify-between"><p className="eyebrow">Standings</p><p className="text-xs font-semibold text-[var(--muted)]">After {currentGame.rounds.filter((round) => round.status === "COMPLETED").length} of {currentGame.rules.rounds}</p></div><ol className="mt-3 space-y-1.5">{standings.map((entry, index) => { const leader = entry.rank === 1; const tied = entry.rank === "TIE"; const medal = ["🥇", "🥈", "🥉", "4️⃣"][index] ?? ""; return <li key={entry.playerId} className={`rank-row ${tied ? "" : `rank-${index + 1}`}`}><span aria-hidden="true" className="text-lg leading-none">{medal}</span><span className={`score-number w-4 shrink-0 text-sm font-bold ${leader ? "text-[var(--success)]" : "text-[var(--muted)]"}`}>{tied ? "–" : entry.rank}</span><span className="truncate font-semibold">{entry.playerName}</span><span className="ml-auto flex items-center gap-2"><span className={`score-number font-bold ${leader ? "text-[var(--success)]" : entry.totalScoreTenths < 0 ? "text-[var(--danger)]" : "text-[var(--foreground)]"}`}>{formatScore(entry.totalScoreTenths)}</span><span className={`w-16 shrink-0 text-right text-xs font-semibold ${leader ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{tied ? "tied" : leader ? "collects" : entry.totalScoreTenths < 0 ? "pays 2x" : "pays"}</span></span></li>; })}</ol>{standingsTied && <p className="mt-2 px-3 text-xs text-[var(--muted)]">Scores are level, so places are still open.</p>}</div>{activeRound && activeRound.roundNumber !== selectedRound.roundNumber && <div className="card mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[var(--muted)]">You are viewing round {selectedRound.roundNumber}. Scoring is on round {activeRound.roundNumber}.</p><button className="btn-primary" type="button" onClick={() => setSelectedRoundNumber(activeRound.roundNumber)}>Continue scoring <ArrowRight size={18} /></button></div>}

    {phase === "CALLS" && (isHost ? <form className="mt-7" onSubmit={lockCalls}><div className="card space-y-4">{currentGame.players.map((player, index) => <label key={player.id} className="block"><span className="mb-2 block font-semibold">{player.name}</span><input aria-label={`${player.name} call`} aria-invalid={callErrors[index]} className="input-base text-lg font-semibold" type="number" inputMode="numeric" min="1" max="13" step="1" value={draft.calls[index]} onChange={(event) => updateDraft("calls", index, event.target.value)} />{callErrors[index] && localError && <span className="mt-1 block text-sm text-[var(--danger)]">Call must be between 1 and 13.</span>}</label>)}</div>{localError && <p role="alert" className="status-alert mt-4">{localError}</p>}<button className="btn-primary min-h-14 mt-6 w-full" type="submit"><Lock size={18} /> Lock calls</button></form> : <p className="surface-tint mt-7 p-4 text-sm text-[var(--muted)]">Waiting for the host to enter calls.</p>)}

    {phase === "TRICKS" && (isHost ? <form className="mt-7" onSubmit={completeRound}><div className="card space-y-5"><div className="surface-tint flex items-center gap-2 px-3 py-2 text-sm font-bold uppercase tracking-wide text-[var(--primary)]"><Lock size={16} /> Calls locked</div>{currentGame.players.map((player, index) => { const validTricks = !trickErrors[index]; const score = validTricks ? calculateRoundScore(calls[index], tricks[index], draft.punished[index]).scoreTenths : null; return <div key={player.id} className="block border-t border-[var(--border)] pt-4"><p className="font-semibold">{player.name}</p><p className="mt-1 text-sm text-[var(--muted)]">Call {calls[index]}</p><label className="mb-2 mt-3 block text-sm font-semibold" htmlFor={`tricks-${player.id}`}>Tricks won</label><div className="flex items-center gap-3"><input id={`tricks-${player.id}`} aria-invalid={trickErrors[index]} className="input-base max-w-28 text-lg font-semibold" type="number" inputMode="numeric" min="0" max="13" step="1" value={draft.tricks[index]} onChange={(event) => updateDraft("tricks", index, event.target.value)} />{score !== null && <output className={`score-number text-lg font-bold ${score < 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>{formatScore(score)}</output>}</div><button className="mt-3 text-sm font-semibold text-[var(--muted)] underline hover:text-[var(--danger)]" type="button" onClick={() => toggleDisqualification(index)}>{draft.punished[index] ? "Remove disqualification" : "Disqualify"}</button>{draft.punished[index] && <p className="mt-2 text-sm font-semibold text-[var(--danger)]">Disqualified</p>}</div>; })}<div className={`flex items-center justify-between border-t border-[var(--border)] pt-4 text-sm font-bold ${totalTricks === 13 ? "text-[var(--success)]" : "text-[var(--muted)]"}`}><span>Total tricks</span><span className="score-number" aria-live="polite">{totalTricks} / 13</span></div></div>{localError && <p role="alert" className="status-alert mt-4">{localError}</p>}<button className="btn-primary min-h-14 mt-6 w-full" type="submit" disabled={isLoading}>{isLoading ? "Saving..." : <><Check size={18} /> Complete round</>}</button></form> : <p className="surface-tint mt-7 p-4 text-sm text-[var(--muted)]">Waiting for the host to record tricks.</p>)}

    {phase === "COMPLETED" && <section className="mt-7"><div className="card space-y-4">{currentGame.players.map((player) => { const playerRound = selectedRound.players.find((entry) => entry.playerId === player.id); if (!playerRound) return null; return <div key={player.id} className="border-b border-[var(--border)] pb-4 last:border-0 last:pb-0"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold">{player.name}</p><p className="mt-1 text-sm text-[var(--muted)]">{playerRound.bid} to {playerRound.tricksWon}</p>{playerRound.punished && <p className="mt-1 text-sm font-semibold text-[var(--danger)]">Disqualified</p>}</div><p className={playerRound.scoreTenths < 0 ? "font-bold text-[var(--danger)]" : "font-bold text-[var(--success)]"}>{formatScore(playerRound.scoreTenths)}</p></div>{playerRound.punished ? <button className="mt-2 text-sm text-[var(--primary)] underline" type="button" disabled={isLoading} onClick={() => clearPunishment(player.id)}>Remove penalty</button> : <button className="mt-2 text-sm text-[var(--primary)] underline" type="button" disabled={isLoading} onClick={() => setPunishmentPlayerId(player.id)}>Mark punished</button>}{punishmentPlayerId === player.id && <div className="mt-3 flex gap-2"><select aria-label="Punishment reason" className="input-base min-h-10" value={punishmentReason} onChange={(event) => setPunishmentReason(event.target.value as PunishmentReason)}>{Object.values(PunishmentReason).map((reason) => <option key={reason} value={reason}>{reason.replace("_", " ")}</option>)}</select><button className="btn-primary min-h-10 px-3 py-2 text-sm" type="button" disabled={isLoading} onClick={() => applyPunishment(player.id)}>Save</button></div>}</div>; })}</div>{localError && <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{localError}</p>}</section>}

    <nav className="mt-8 border-t border-[var(--border)] pt-5" aria-label="Round history"><p className="text-sm font-bold uppercase tracking-wide text-[var(--muted)]">Rounds</p><div className="mt-3 flex flex-wrap gap-2">{currentGame.rounds.filter((round) => round.status === "COMPLETED").map((round) => <button key={round.roundNumber} className="btn-secondary min-h-10 px-3 py-2 text-sm" type="button" onClick={() => setSelectedRoundNumber(round.roundNumber)}>Round {round.roundNumber}</button>)}</div></nav></div></main>;
}