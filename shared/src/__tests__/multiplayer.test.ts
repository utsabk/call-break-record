import {
  GameStatus,
  GameViewerRole,
  Game,
  Player,
  canCompleteRound,
  createGameView,
  getRoundPhase,
  getSubmissionStates,
  hasAllBids,
  hasAllTricks,
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
        entries: [
          { playerId: "p1", bid: 4, bidSource: "PLAYER" },
          { playerId: "p2", bid: 5, bidSource: "PLAYER" },
        ],
      },
    ],
    status: GameStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("round phase", () => {
  it("reports who still owes a bid while bidding", () => {
    const states = getSubmissionStates(buildGame().rounds[0], players);
    expect(states).toEqual([
      { playerId: "p1", status: "SUBMITTED" },
      { playerId: "p2", status: "SUBMITTED" },
      { playerId: "p3", status: "PENDING" },
      { playerId: "p4", status: "PENDING" },
    ]);
  });

  it("treats a round with no entries as fully pending", () => {
    const round = { roundNumber: 1, players: [], status: "ACTIVE" as const };
    expect(hasAllBids(round, players)).toBe(false);
    expect(getRoundPhase(round, players)).toBe("BIDDING");
    expect(getSubmissionStates(round, players).every((s) => s.status === "PENDING")).toBe(true);
  });

  it("stays in bidding until every seat has a bid", () => {
    const game = buildGame();
    expect(getRoundPhase(game.rounds[0], players)).toBe("BIDDING");

    game.rounds[0].entries!.push({ playerId: "p3", bid: 3 }, { playerId: "p4", bid: 2 });
    expect(hasAllBids(game.rounds[0], players)).toBe(true);
    expect(getRoundPhase(game.rounds[0], players)).toBe("TRICKS");
  });

  it("advances to tricks on a host-entered bid just as readily as a player's", () => {
    const game = buildGame();
    game.rounds[0].entries!.push(
      { playerId: "p3", bid: 3, bidSource: "HOST" },
      { playerId: "p4", bid: 2, bidSource: "HOST" }
    );
    expect(getRoundPhase(game.rounds[0], players)).toBe("TRICKS");
  });

  it("switches the pending report to tricks once bidding is done", () => {
    const game = buildGame();
    game.rounds[0].entries!.push({ playerId: "p3", bid: 3 }, { playerId: "p4", bid: 2 });
    game.rounds[0].entries![0].tricksWon = 5;

    expect(getSubmissionStates(game.rounds[0], players)).toEqual([
      { playerId: "p1", status: "SUBMITTED" },
      { playerId: "p2", status: "PENDING" },
      { playerId: "p3", status: "PENDING" },
      { playerId: "p4", status: "PENDING" },
    ]);
  });
});

describe("round completion", () => {
  function fullyEnteredGame(tricks: number[]): Game {
    const game = buildGame();
    game.rounds[0].entries = players.map((player, index) => ({
      playerId: player.id,
      bid: 3,
      tricksWon: tricks[index],
    }));
    return game;
  }

  it("allows completion once every trick is in and they total thirteen", () => {
    const game = fullyEnteredGame([4, 3, 3, 3]);
    expect(hasAllTricks(game.rounds[0], players)).toBe(true);
    expect(canCompleteRound(game.rounds[0], players)).toBe(true);
  });

  it("refuses completion when the tricks do not total thirteen", () => {
    const game = fullyEnteredGame([4, 4, 3, 3]);
    expect(canCompleteRound(game.rounds[0], players)).toBe(false);
  });

  it("refuses completion while a trick entry is missing", () => {
    const game = fullyEnteredGame([4, 3, 3, 3]);
    delete game.rounds[0].entries![3].tricksWon;
    expect(canCompleteRound(game.rounds[0], players)).toBe(false);
  });

  it("does not allow completing the same round twice", () => {
    const game = fullyEnteredGame([4, 3, 3, 3]);
    game.rounds[0].revealed = true;
    expect(canCompleteRound(game.rounds[0], players)).toBe(false);
    expect(getRoundPhase(game.rounds[0], players)).toBe("COMPLETED");
  });
});

describe("game view", () => {
  it("shares bids that have been entered with everyone following the game", () => {
    const view = createGameView(buildGame(), GameViewerRole.VIEWER);

    expect(view.rounds[0].entries).toEqual([
      { playerId: "p1", bid: 4, bidSource: "PLAYER" },
      { playerId: "p2", bid: 5, bidSource: "PLAYER" },
    ]);
    expect(view.rounds[0].players).toEqual([]);
  });

  it("omits values nobody has entered yet", () => {
    const view = createGameView(buildGame(), GameViewerRole.PLAYER, "p1");
    const entries = view.rounds[0].entries;

    expect(entries.some((entry) => entry.playerId === "p3")).toBe(false);
    expect(entries.every((entry) => entry.tricksWon === undefined)).toBe(true);
  });

  it("reports the phase so every device agrees on what to ask for", () => {
    const game = buildGame();
    expect(createGameView(game, GameViewerRole.PLAYER, "p1").rounds[0].phase).toBe("BIDDING");

    game.rounds[0].entries!.push({ playerId: "p3", bid: 3 }, { playerId: "p4", bid: 2 });
    expect(createGameView(game, GameViewerRole.PLAYER, "p1").rounds[0].phase).toBe("TRICKS");
  });

  it("marks which values the host supplied", () => {
    const game = buildGame();
    game.rounds[0].entries![0] = { playerId: "p1", bid: 6, bidSource: "HOST" };

    const view = createGameView(game, GameViewerRole.PLAYER, "p1");
    expect(view.rounds[0].entries[0]).toMatchObject({ bid: 6, bidSource: "HOST" });
  });

  it("exposes full scores to everyone once completed", () => {
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
