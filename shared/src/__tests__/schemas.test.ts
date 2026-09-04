import { PunishmentReason, UpdateRoundRequestSchema } from "../index";

describe("UpdateRoundRequestSchema", () => {
  it("accepts a disqualified player without changing the recorded tricks", () => {
    const request = UpdateRoundRequestSchema.parse({
      players: [
        { playerId: "p1", bid: 4, tricksWon: 5 },
        { playerId: "p2", bid: 3, tricksWon: 3 },
        { playerId: "p3", bid: 5, tricksWon: 3, punished: true, punishmentReason: PunishmentReason.UNFAIR_PLAY },
        { playerId: "p4", bid: 2, tricksWon: 2 },
      ],
    });

    expect(request.players[2]).toMatchObject({ tricksWon: 3, punished: true, punishmentReason: PunishmentReason.UNFAIR_PLAY });
  });
});