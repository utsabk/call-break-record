"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, Heart, Spade } from "lucide-react";
import Link from "next/link";
import { GameRules, Player } from "@call-break/shared";
import { useGameStore } from "@/lib/hooks/useGameStore";
import { validateGameSetup } from "@/lib/validation/gameSetup";

const DEFAULT_RULES: GameRules = {
  rounds: 5,
  minimumCall: 1,
  maximumCall: 13,
  extraTrickBonus: 0.1,
  punishmentMode: "NEGATIVE_CALL",
  baseBid: 2,
};

export default function GameSetupPage() {
  const createNewGame = useGameStore((state) => state.createNewGame);
  const isLoading = useGameStore((state) => state.isLoading);
  const storeError = useGameStore((state) => state.error);
  const [names, setNames] = useState(["", "", "", ""]);
  const [baseBid, setBaseBid] = useState("2");
  const [nameError, setNameError] = useState<string | null>(null);
  const [baseBidError, setBaseBidError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const hasAllPlayerNames = names.every((name) => name.trim().length > 0);

  const updateName = (index: number, value: string) => {
    setNameError(null);
    setSubmissionError(null);
    setNames((current) => current.map((name, nameIndex) => nameIndex === index ? value : name));
  };

  const startGame = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNameError(null);
    setBaseBidError(null);
    setSubmissionError(null);
    const validation = validateGameSetup(names, baseBid);
    setNameError(validation.nameError);
    setBaseBidError(validation.baseBidError);

    if (validation.nameError || validation.baseBidError) {
      return;
    }

    const trimmedNames = names.map((name) => name.trim());
    const numericBaseBid = Number(baseBid);
    const players: Player[] = trimmedNames.map((name, seat) => ({
      id: `player-${globalThis.crypto.randomUUID()}`,
      name,
      seat,
    }));
    try {
      const game = await createNewGame(players, { ...DEFAULT_RULES, baseBid: numericBaseBid });
      if (!game.gameCode) throw new Error("The game server did not return a game code. Deploy the latest backend and try again.");
      window.location.assign(`/game/lobby/?code=${game.gameCode}`);
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : "Unable to save the game. Check your connection and try again.");
    }
  };

  return (
    <main className="app-shell setup-shell">
      <div className="app-container max-w-xl">
        <Link href="/" className="table-nav inline-flex min-h-11 items-center gap-2 text-sm font-semibold"><ArrowLeft size={18} /> Home</Link>
        <header className="hero-panel hero-spade-card mt-8" aria-labelledby="new-game-title">
          <span className="hero-spade-card-corner" aria-hidden="true"><strong>A</strong><small>♠</small></span>
          <Spade className="hero-spade-card-mark" aria-hidden="true" fill="currentColor" />
          <div className="hero-spade-card-copy">
            <h1 id="new-game-title" className="font-display text-4xl font-black">New game</h1>
            <p>4 players · 5 rounds · 1 score</p>
          </div>
          <span className="hero-spade-card-corner hero-spade-card-corner-bottom" aria-hidden="true"><strong>A</strong><small>♠</small></span>
        </header>
        <form className="panel setup-heart-card mt-6 space-y-6" onSubmit={startGame}>
          <span className="setup-heart-card-corner" aria-hidden="true"><strong>A</strong><small>♥</small></span>
          <Heart className="setup-heart-card-mark" aria-hidden="true" fill="currentColor" />
          <div className="players-card">
            <Heart className="players-card-watermark" aria-hidden="true" fill="currentColor" size={220} />
            <fieldset className="space-y-4">
              <legend className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--muted)]">Players</legend>
              {names.map((name, index) => <label key={index} className="block"><span className="sr-only">Player {index + 1}</span><input className="input-base" placeholder={`Player ${index + 1}`} value={name} maxLength={50} autoComplete="off" aria-invalid={Boolean(nameError)} onChange={(event) => updateName(index, event.target.value)} /></label>)}
              {nameError && <p role="alert" className="text-sm text-[var(--danger)]">{nameError}</p>}
            </fieldset>
          </div>
          <label className="block"><span className="block text-sm font-bold uppercase tracking-wide text-[var(--muted)]">Base bid</span><input className="input-base mt-3" type="number" inputMode="numeric" min="1" step="1" value={baseBid} aria-invalid={Boolean(baseBidError)} onChange={(event) => { setBaseBid(event.target.value); setBaseBidError(null); setSubmissionError(null); }} />{baseBidError && <span role="alert" className="mt-2 block text-sm text-[var(--danger)]">{baseBidError}</span>}</label>
          {(submissionError || storeError) && <p role="alert" className="status-alert">{submissionError || storeError}</p>}
          <button className={`btn-primary setup-submit-button min-h-14 w-full ${hasAllPlayerNames ? "action-button-ready" : ""}`} type="submit" disabled={isLoading}>{isLoading ? "Creating game..." : <>Start game <ArrowRight size={18} /></>}</button>
          <span className="setup-heart-card-corner setup-heart-card-corner-bottom" aria-hidden="true"><strong>A</strong><small>♥</small></span>
        </form>
      </div>
    </main>
  );
}
