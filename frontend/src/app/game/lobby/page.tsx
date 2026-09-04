"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Share2, Spade } from "lucide-react";
import { useGameStore } from "@/lib/hooks/useGameStore";

export default function GameLobbyPage() {
  const game = useGameStore((state) => state.currentGame);
  const loadGameByCode = useGameStore((state) => state.loadGameByCode);
  const [copied, setCopied] = useState(false);
  useEffect(() => { const code = new URLSearchParams(window.location.search).get("code"); if (code) void loadGameByCode(code).catch(() => undefined); }, [loadGameByCode]);
  if (!game) return <main className="app-shell"><div className="app-container text-[var(--muted)]">Loading game...</div></main>;
  const share = async () => { const text = `Join my Call Break game with code ${game.gameCode}`; if (navigator.share) await navigator.share({ title: "Call Break", text }); else { await navigator.clipboard.writeText(game.gameCode); setCopied(true); } };
  return <main className="app-shell"><div className="app-container max-w-md text-center"><header className="pt-10"><Spade className="mx-auto text-[var(--primary)]" size={30} fill="currentColor" /><p className="eyebrow mt-6">Game lobby</p><h1 className="mt-2 font-display text-4xl font-bold">Share this code</h1></header><section className="surface-tint mt-8 p-6"><p className="eyebrow">Game code</p><output className="score-number mt-3 block text-4xl font-bold tracking-[0.16em] text-[var(--primary)]">{game.gameCode}</output><div className="mt-6 flex gap-3"><button className="btn-secondary flex-1" onClick={() => { void navigator.clipboard.writeText(game.gameCode); setCopied(true); }}><Copy size={17} /> {copied ? "Copied" : "Copy"}</button><button className="btn-secondary flex-1" onClick={() => { void share(); }}><Share2 size={17} /> Share</button></div></section><p className="mt-6 text-sm text-[var(--muted)]">{game.players.map((player) => player.name).join(" · ")}</p><button className="btn-primary min-h-14 mt-8 w-full" onClick={() => window.location.assign(`/game/live/?code=${game.gameCode}`)}><Check size={18} /> Start live game</button><button className="btn-secondary min-h-12 mt-3 w-full" onClick={() => window.location.assign(`/game/?code=${game.gameCode}`)}>Score on this device</button></div></main>;
}