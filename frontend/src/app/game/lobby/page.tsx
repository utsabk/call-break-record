"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Diamond, Share2 } from "lucide-react";
import { useGameStore } from "@/lib/hooks/useGameStore";

export default function GameLobbyPage() {
  const game = useGameStore((state) => state.currentGame);
  const loadGameByCode = useGameStore((state) => state.loadGameByCode);
  const [copied, setCopied] = useState(false);
  useEffect(() => { const code = new URLSearchParams(window.location.search).get("code"); if (code) void loadGameByCode(code).catch(() => undefined); }, [loadGameByCode]);
  if (!game) return <main className="app-shell"><div className="app-container table-note">Loading game...</div></main>;
  const share = async () => { const text = `Join my Call Break game with code ${game.gameCode}`; if (navigator.share) await navigator.share({ title: "Call Break", text }); else { await navigator.clipboard.writeText(game.gameCode); setCopied(true); } };
  return <main className="app-shell"><div className="app-container max-w-md text-center"><section className="hero-panel hero-spade-card lobby-code-card mt-8 space-y-4" aria-labelledby="share-code-title"><Diamond className="hero-spade-card-mark lobby-code-card-mark" aria-hidden="true" fill="currentColor" /><div className="hero-spade-card-copy lobby-code-card-copy"><h1 id="share-code-title" className="font-display text-4xl font-black">Share this code</h1><output className="lobby-code-value" aria-label="Game code">{game.gameCode}</output><div className="lobby-code-actions"><button className="btn-secondary flex-1" onClick={() => { void navigator.clipboard.writeText(game.gameCode); setCopied(true); }}><Copy size={17} /> {copied ? "Copied" : "Copy"}</button><button className="btn-secondary flex-1" onClick={() => { void share(); }}><Share2 size={17} /> Share</button></div></div><div className="lobby-players"><p className="lobby-players-list">{game.players.map((player) => player.name).join(" · ")}</p></div><button className="btn-primary action-button-ready min-h-14 w-full" onClick={() => window.location.assign(`/game/live/?code=${game.gameCode}`)}><Check size={18} /> Start scoring</button></section></div></main>;
}