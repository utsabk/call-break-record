import {
  calculateRoundScore,
  calculateGameTotals,
  validateRound,
} from "../scoring";

describe("Scoring Engine", () => {
  describe("calculateRoundScore", () => {
    it("should handle bid 1, tricks 0 -> -1.0", () => {
      const result = calculateRoundScore(1, 0, false);
      expect(result.scoreTenths).toBe(-10);
      expect(result.reason).toBe("FAILED_BID");
    });

    it("should handle bid 1, tricks 1 -> +1.0", () => {
      const result = calculateRoundScore(1, 1, false);
      expect(result.scoreTenths).toBe(10);
      expect(result.reason).toBe("SUCCESS");
    });

    it("should handle bid 1, tricks 2 -> +1.1", () => {
      const result = calculateRoundScore(1, 2, false);
      expect(result.scoreTenths).toBe(11);
      expect(result.reason).toBe("SUCCESS");
    });

    it("should handle bid 4, tricks 3 -> -4.0", () => {
      const result = calculateRoundScore(4, 3, false);
      expect(result.scoreTenths).toBe(-40);
      expect(result.reason).toBe("FAILED_BID");
    });

    it("should handle bid 4, tricks 4 -> +4.0", () => {
      const result = calculateRoundScore(4, 4, false);
      expect(result.scoreTenths).toBe(40);
      expect(result.reason).toBe("SUCCESS");
    });

    it("should handle bid 4, tricks 5 -> +4.1", () => {
      const result = calculateRoundScore(4, 5, false);
      expect(result.scoreTenths).toBe(41);
      expect(result.reason).toBe("SUCCESS");
    });

    it("should handle bid 4, tricks 6 -> +4.2", () => {
      const result = calculateRoundScore(4, 6, false);
      expect(result.scoreTenths).toBe(42);
      expect(result.reason).toBe("SUCCESS");
    });

    it("should handle bid 4, tricks 7 -> +4.3", () => {
      const result = calculateRoundScore(4, 7, false);
      expect(result.scoreTenths).toBe(43);
      expect(result.reason).toBe("SUCCESS");
    });

    it("should handle bid 4, tricks 13 -> +4.9", () => {
      const result = calculateRoundScore(4, 13, false);
      expect(result.scoreTenths).toBe(49);
      expect(result.reason).toBe("SUCCESS");
    });

    it("should handle bid 13, tricks 13 -> +13.0", () => {
      const result = calculateRoundScore(13, 13, false);
      expect(result.scoreTenths).toBe(130);
      expect(result.reason).toBe("SUCCESS");
    });

    it("should handle punishment override: bid 5, tricks 7, punished -> -5.0", () => {
      const result = calculateRoundScore(5, 7, true);
      expect(result.scoreTenths).toBe(-50);
      expect(result.reason).toBe("PUNISHED");
    });

    it("should handle punishment override: bid 13, tricks 13, punished -> -13.0", () => {
      const result = calculateRoundScore(13, 13, true);
      expect(result.scoreTenths).toBe(-130);
      expect(result.reason).toBe("PUNISHED");
    });

    it("should handle bid 5, tricks 2 -> -5.0", () => {
      const result = calculateRoundScore(5, 2, false);
      expect(result.scoreTenths).toBe(-50);
      expect(result.reason).toBe("FAILED_BID");
    });

    it("should handle bid 8, tricks 9 -> +8.1", () => {
      const result = calculateRoundScore(8, 9, false);
      expect(result.scoreTenths).toBe(81);
      expect(result.reason).toBe("SUCCESS");
    });

    it("should handle bid 8, tricks 8 -> +8.0", () => {
      const result = calculateRoundScore(8, 8, false);
      expect(result.scoreTenths).toBe(80);
      expect(result.reason).toBe("SUCCESS");
    });
  });

  describe("validateRound", () => {
    it("should accept valid round with tricks totaling 13", () => {
      const errors = validateRound([
        { bid: 4, tricksWon: 4 },
        { bid: 3, tricksWon: 3 },
        { bid: 5, tricksWon: 4 },
        { bid: 2, tricksWon: 2 },
      ]);
      expect(errors).toHaveLength(0);
    });

    it("should reject round with tricks totaling 14", () => {
      const errors = validateRound([
        { bid: 4, tricksWon: 4 },
        { bid: 3, tricksWon: 4 },
        { bid: 5, tricksWon: 3 },
        { bid: 2, tricksWon: 3 },
      ]);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("Total tricks must equal 13");
    });

    it("should reject round with tricks totaling 12", () => {
      const errors = validateRound([
        { bid: 4, tricksWon: 3 },
        { bid: 3, tricksWon: 3 },
        { bid: 5, tricksWon: 3 },
        { bid: 2, tricksWon: 1 },
      ]);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("Total tricks must equal 13");
    });

    it("should reject round with wrong number of players", () => {
      const errors = validateRound([
        { bid: 4, tricksWon: 4 },
        { bid: 3, tricksWon: 3 },
        { bid: 5, tricksWon: 4 },
      ]);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain("exactly 4 players");
    });

    it("should reject bid of 0", () => {
      const errors = validateRound([
        { bid: 0, tricksWon: 0 },
        { bid: 3, tricksWon: 3 },
        { bid: 5, tricksWon: 5 },
        { bid: 2, tricksWon: 5 },
      ]);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes("Bid"))).toBe(true);
    });

    it("should reject bid of 14", () => {
      const errors = validateRound([
        { bid: 14, tricksWon: 4 },
        { bid: 3, tricksWon: 3 },
        { bid: 5, tricksWon: 5 },
        { bid: 2, tricksWon: 1 },
      ]);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes("Bid"))).toBe(true);
    });

    it("should reject negative tricks", () => {
      const errors = validateRound([
        { bid: 4, tricksWon: -1 },
        { bid: 3, tricksWon: 3 },
        { bid: 5, tricksWon: 5 },
        { bid: 2, tricksWon: 6 },
      ]);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes("Tricks"))).toBe(true);
    });

    it("should reject tricks > 13", () => {
      const errors = validateRound([
        { bid: 4, tricksWon: 14 },
        { bid: 3, tricksWon: 0 },
        { bid: 5, tricksWon: 0 },
        { bid: 2, tricksWon: 0 },
      ]);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes("Tricks"))).toBe(true);
    });
  });

  describe("calculateGameTotals", () => {
    it("should sum scores across rounds", () => {
      const totals = calculateGameTotals([
        { playerId: "p1", scoreTenths: 40 }, // 4.0
        { playerId: "p2", scoreTenths: 30 }, // 3.0
        { playerId: "p1", scoreTenths: 41 }, // 4.1
        { playerId: "p2", scoreTenths: -40 }, // -4.0
      ]);

      expect(totals["p1"]).toBe(81); // 4.0 + 4.1 = 8.1
      expect(totals["p2"]).toBe(-10); // 3.0 - 4.0 = -1.0
    });

    it("should handle empty round scores", () => {
      const totals = calculateGameTotals([]);
      expect(Object.keys(totals)).toHaveLength(0);
    });

    it("should handle multiple players and rounds", () => {
      const totals = calculateGameTotals([
        // Round 1
        { playerId: "p1", scoreTenths: 30 },
        { playerId: "p2", scoreTenths: 40 },
        { playerId: "p3", scoreTenths: -20 },
        { playerId: "p4", scoreTenths: 50 },
        // Round 2
        { playerId: "p1", scoreTenths: 41 },
        { playerId: "p2", scoreTenths: 30 },
        { playerId: "p3", scoreTenths: 52 },
        { playerId: "p4", scoreTenths: -20 },
      ]);

      expect(totals["p1"]).toBe(71); // 3.0 + 4.1
      expect(totals["p2"]).toBe(70); // 4.0 + 3.0
      expect(totals["p3"]).toBe(32); // -2.0 + 5.2
      expect(totals["p4"]).toBe(30); // 5.0 - 2.0
    });
  });
});
