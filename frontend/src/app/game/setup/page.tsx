"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, Heart } from "lucide-react";
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
        <form className="hero-panel hero-spade-card new-game-card mt-4 space-y-4" onSubmit={startGame} aria-labelledby="new-game-title">
          <Heart className="hero-spade-card-mark" aria-hidden="true" fill="currentColor" />
          <div className="hero-spade-card-copy new-game-card-copy">
            <h1 id="new-game-title" className="font-display text-3xl font-black">New game</h1>
            <p>4 players · 5 rounds · 1 score</p>
          </div>
          <fieldset className="field-card space-y-3">
            <Heart className="field-card-watermark" aria-hidden="true" fill="currentColor" size={220} />
            <legend className="field-card-legend">Players</legend>
            {names.map((name, index) => <label key={index} className="block"><span className="sr-only">Player {index + 1}</span><input className="input-base" placeholder={`Player ${index + 1}`} value={name} maxLength={50} autoComplete="off" aria-invalid={Boolean(nameError)} onChange={(event) => updateName(index, event.target.value)} /></label>)}
            {nameError && <p role="alert" className="text-sm text-[var(--danger)]">{nameError}</p>}
          </fieldset>
          <fieldset className="field-card">
            <legend className="field-card-legend">Base bid</legend>
            <input className="input-base" type="number" inputMode="numeric" min="1" step="1" value={baseBid} aria-invalid={Boolean(baseBidError)} onChange={(event) => { setBaseBid(event.target.value); setBaseBidError(null); setSubmissionError(null); }} />
            {baseBidError && <span role="alert" className="mt-2 block text-sm text-[var(--danger)]">{baseBidError}</span>}
          </fieldset>
          {(submissionError || storeError) && <p role="alert" className="status-alert">{submissionError || storeError}</p>}
          <button className={`btn-primary min-h-14 w-full ${hasAllPlayerNames ? "action-button-ready" : ""}`} type="submit" disabled={isLoading}>{isLoading ? "Creating game..." : <>Start game <ArrowRight size={18} /></>}</button>
        </form>
      </div>
    </main>
  );
}
