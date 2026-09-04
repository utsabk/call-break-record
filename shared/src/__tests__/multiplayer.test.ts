import {
  GameStatus,
  GameViewerRole,
  Game,
  Player,
  canRevealRound,
  createGameView,
  getSubmissionStates,
  hasAllSubmissions,
} from "../index";

const players: Player[] = [
  { id: "p1", name: "Alice", seat: 0 },
  { id: "p2", name: "Bob", seat: 1 },
  { id: "p3", name: "Charlie", seat: 2 },
  { id: "p4", name: "David", seat: 3 },
];

function buildGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "game-1",
    gameCode: "CB7K4P",
    players,
    rules: {
      rounds: 5,
      minimumCall: 1,
      maximumCall: 13,
      extraTrickBonus: 0.1,
      punishmentMode: "NEGATIVE_CALL",
      baseBid: 2,
    },
    rounds: [
      {
        roundNumber: 1,
        players: [],
        status: "ACTIVE",
        revealed: false,
        submissions: [
          { playerId: "p1", bid: 4, tricksWon: 5, submittedAt: new Date() },
          { playerId: "p2", bid: 5, tricksWon: 4, submittedAt: new Date() },
        ],
      },
    ],
    status: GameStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("submission state", () => {
  it("reports pending players before they submit", () => {
    const states = getSubmissionStates(buildGame().rounds[0], players);
    expect(states).toEqual([
      { playerId: "p1", status: "SUBMITTED" },
      { playerId: "p2", status: "SUBMITTED" },
      { playerId: "p3", status: "PENDING" },
      { playerId: "p4", status: "PENDING" },
    ]);
  });

  it("treats a round with no submissions as fully pending", () => {
    const round = { roundNumber: 1, players: [], status: "ACTIVE" as const };
    expect(hasAllSubmissions(round, players)).toBe(false);
    expect(getSubmissionStates(round, players).every((s) => s.status === "PENDING")).toBe(true);
  });

  it("only allows reveal once every player has submitted", () => {
    const game = buildGame();
    expect(canRevealRound(game.rounds[0], players)).toBe(false);

    game.rounds[0].submissions!.push(
      { playerId: "p3", bid: 3, tricksWon: 2, submittedAt: new Date() },
      { playerId: "p4", bid: 2, tricksWon: 2, submittedAt: new Date() }
    );
    expect(canRevealRound(game.rounds[0], players)).toBe(true);
  });

  it("does not allow revealing the same round twice", () => {
    const game = buildGame();
    game.rounds[0].submissions!.push(
      { playerId: "p3", bid: 3, tricksWon: 2, submittedAt: new Date() },
      { playerId: "p4", bid: 2, tricksWon: 2, submittedAt: new Date() }
    );
    game.rounds[0].revealed = true;
    expect(canRevealRound(game.rounds[0], players)).toBe(false);
  });
});

describe("game view redaction", () => {
  it("never sends other players' bids to a viewer before reveal", () => {
    const view = createGameView(buildGame(), GameViewerRole.VIEWER);
    const serialised = JSON.stringify(view);

    expect(view.rounds[0].players).toEqual([]);
    expect(view.rounds[0].ownSubmission).toBeUndefined();
    expect(serialised).not.toContain("tricksWon");
  });

  it("shows a player their own submission but no one else's", () => {
    const view = createGameView(buildGame(), GameViewerRole.PLAYER, "p1");

    expect(view.rounds[0].ownSubmission).toMatchObject({ playerId: "p1", bid: 4, tricksWon: 5 });
    expect(view.rounds[0].players).toEqual([]);
    expect(JSON.stringify(view)).not.toContain("\"bid\":5");
  });

  it("withholds other submissions from the host before reveal", () => {
    const view = createGameView(buildGame(), GameViewerRole.HOST);

    expect(view.rounds[0].players).toEqual([]);
    expect(view.rounds[0].submissions).toEqual([
      { playerId: "p1", status: "SUBMITTED" },
      { playerId: "p2", status: "SUBMITTED" },
      { playerId: "p3", status: "PENDING" },
      { playerId: "p4", status: "PENDING" },
    ]);
  });

  it("exposes full scores to everyone once revealed", () => {
    const game = buildGame();
    game.rounds[0].revealed = true;
    game.rounds[0].status = "COMPLETED";
    game.rounds[0].players = [
      { playerId: "p1", bid: 4, tricksWon: 5, punished: false, scoreTenths: 41 },
      { playerId: "p2", bid: 5, tricksWon: 4, punished: false, scoreTenths: -50 },
    ];

    const view = createGameView(game, GameViewerRole.VIEWER);
    expect(view.rounds[0].revealed).toBe(true);
    expect(view.rounds[0].players).toHaveLength(2);
    expect(view.rounds[0].players[0].scoreTenths).toBe(41);
  });

  it("keeps the game code and roster visible so viewers can follow along", () => {
    const view = createGameView(buildGame(), GameViewerRole.VIEWER, undefined, ["p1"]);
    expect(view.gameCode).toBe("CB7K4P");
    expect(view.players).toHaveLength(4);
    expect(view.claimedPlayerIds).toEqual(["p1"]);
  });

  it("still shows rounds recorded before the reveal flag existed", () => {
    const game = buildGame();
    game.rounds[0] = {
      roundNumber: 1,
      status: "COMPLETED",
      players: [{ playerId: "p1", bid: 4, tricksWon: 5, punished: false, scoreTenths: 41 }],
    };

    const view = createGameView(game, GameViewerRole.VIEWER);
    expect(view.rounds[0].revealed).toBe(true);
    expect(view.rounds[0].players[0].scoreTenths).toBe(41);
  });
});
