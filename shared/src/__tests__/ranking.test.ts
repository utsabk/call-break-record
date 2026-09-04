import { calculateRankings, hasRankingTie, getNumericRankings } from "../ranking";

describe("Ranking Engine", () => {
  const players = [
    { id: "p1", name: "Rahul" },
    { id: "p2", name: "Suman" },
    { id: "p3", name: "Amit" },
    { id: "p4", name: "Raj" },
  ];

  describe("calculateRankings", () => {
    it("should rank players in descending order by score", () => {
      const gameTotals = {
        p1: 184,
        p2: 157,
        p3: 122,
        p4: 89,
      };

      const rankings = calculateRankings(players, gameTotals);

      expect(rankings[0].playerId).toBe("p1");
      expect(rankings[0].rank).toBe(1);
      expect(rankings[0].totalScoreTenths).toBe(184);

      expect(rankings[1].playerId).toBe("p2");
      expect(rankings[1].rank).toBe(2);
      expect(rankings[1].totalScoreTenths).toBe(157);

      expect(rankings[2].playerId).toBe("p3");
      expect(rankings[2].rank).toBe(3);
      expect(rankings[2].totalScoreTenths).toBe(122);

      expect(rankings[3].playerId).toBe("p4");
      expect(rankings[3].rank).toBe(4);
      expect(rankings[3].totalScoreTenths).toBe(89);
    });

    it("should handle negative scores", () => {
      const gameTotals = {
        p1: 50,
        p2: -10,
        p3: 20,
        p4: -30,
      };

      const rankings = calculateRankings(players, gameTotals);

      expect(rankings[0].playerId).toBe("p1");
      expect(rankings[0].totalScoreTenths).toBe(50);

      expect(rankings[1].playerId).toBe("p3");
      expect(rankings[1].totalScoreTenths).toBe(20);

      expect(rankings[2].playerId).toBe("p2");
      expect(rankings[2].totalScoreTenths).toBe(-10);

      expect(rankings[3].playerId).toBe("p4");
      expect(rankings[3].totalScoreTenths).toBe(-30);
    });

    it("should mark ties with NONE strategy", () => {
      const gameTotals = {
        p1: 100,
        p2: 100,
        p3: 50,
        p4: 50,
      };

      const rankings = calculateRankings(players, gameTotals, "NONE");

      // Both p1 and p2 are tied
      expect(rankings[0].rank).toBe("TIE");
      expect(rankings[1].rank).toBe("TIE");

      // Both p3 and p4 are tied
      expect(rankings[2].rank).toBe("TIE");
      expect(rankings[3].rank).toBe("TIE");
    });

    it("should assign sequential ranks with MANUAL strategy", () => {
      const gameTotals = {
        p1: 100,
        p2: 100,
        p3: 50,
        p4: 50,
      };

      const rankings = calculateRankings(players, gameTotals, "MANUAL");

      expect(rankings[0].rank).toBe(1);
      expect(rankings[1].rank).toBe(2);
      expect(rankings[2].rank).toBe(3);
      expect(rankings[3].rank).toBe(4);
    });

    it("should default to NONE strategy", () => {
      const gameTotals = {
        p1: 100,
        p2: 100,
        p3: 50,
        p4: 40,
      };

      const rankings = calculateRankings(players, gameTotals);

      // p1 and p2 should be tied
      expect(rankings[0].rank).toBe("TIE");
      expect(rankings[1].rank).toBe("TIE");

      // p3 should be 3rd
      expect(rankings[2].rank).toBe(3);

      // p4 should be 4th
      expect(rankings[3].rank).toBe(4);
    });

    it("should handle all players tied", () => {
      const gameTotals = {
        p1: 100,
        p2: 100,
        p3: 100,
        p4: 100,
      };

      const rankings = calculateRankings(players, gameTotals, "NONE");

      expect(rankings.every((r) => r.rank === "TIE")).toBe(true);
    });

    it("should handle zero scores", () => {
      const gameTotals = {
        p1: 0,
        p2: 0,
        p3: 0,
        p4: 0,
      };

      const rankings = calculateRankings(players, gameTotals, "NONE");

      expect(rankings.every((r) => r.rank === "TIE")).toBe(true);
    });

    it("should handle missing player scores", () => {
      const gameTotals = {
        p1: 100,
        p2: 50,
        p3: 25,
        // p4 missing
      };

      const rankings = calculateRankings(players, gameTotals);

      expect(rankings[0].playerId).toBe("p1");
      expect(rankings[1].playerId).toBe("p2");
      expect(rankings[2].playerId).toBe("p3");
      expect(rankings[3].playerId).toBe("p4");
      expect(rankings[3].totalScoreTenths).toBe(0); // default
    });
  });

  describe("hasRankingTie", () => {
    it("should return true when there are ties", () => {
      const rankings: any[] = [
        { playerId: "p1", playerName: "Rahul", totalScoreTenths: 100, rank: "TIE" },
        { playerId: "p2", playerName: "Suman", totalScoreTenths: 100, rank: "TIE" },
        { playerId: "p3", playerName: "Amit", totalScoreTenths: 50, rank: 3 },
        { playerId: "p4", playerName: "Raj", totalScoreTenths: 40, rank: 4 },
      ];

      expect(hasRankingTie(rankings)).toBe(true);
    });

    it("should return false when there are no ties", () => {
      const rankings: any[] = [
        { playerId: "p1", playerName: "Rahul", totalScoreTenths: 100, rank: 1 },
        { playerId: "p2", playerName: "Suman", totalScoreTenths: 90, rank: 2 },
        { playerId: "p3", playerName: "Amit", totalScoreTenths: 50, rank: 3 },
        { playerId: "p4", playerName: "Raj", totalScoreTenths: 40, rank: 4 },
      ];

      expect(hasRankingTie(rankings)).toBe(false);
    });

    it("should return true when all players are tied", () => {
      const rankings: any[] = [
        { playerId: "p1", playerName: "Rahul", totalScoreTenths: 100, rank: "TIE" },
        { playerId: "p2", playerName: "Suman", totalScoreTenths: 100, rank: "TIE" },
        { playerId: "p3", playerName: "Amit", totalScoreTenths: 100, rank: "TIE" },
        { playerId: "p4", playerName: "Raj", totalScoreTenths: 100, rank: "TIE" },
      ];

      expect(hasRankingTie(rankings)).toBe(true);
    });
  });

  describe("getNumericRankings", () => {
    it("should return only players with numeric ranks", () => {
      const rankings: any[] = [
        { playerId: "p1", playerName: "Rahul", totalScoreTenths: 100, rank: "TIE" },
        { playerId: "p2", playerName: "Suman", totalScoreTenths: 100, rank: "TIE" },
        { playerId: "p3", playerName: "Amit", totalScoreTenths: 50, rank: 3 },
        { playerId: "p4", playerName: "Raj", totalScoreTenths: 40, rank: 4 },
      ];

      const numeric = getNumericRankings(rankings);

      expect(numeric).toHaveLength(2);
      expect(numeric[0].playerId).toBe("p3");
      expect(numeric[1].playerId).toBe("p4");
    });

    it("should return empty array when all are tied", () => {
      const rankings: any[] = [
        { playerId: "p1", playerName: "Rahul", totalScoreTenths: 100, rank: "TIE" },
        { playerId: "p2", playerName: "Suman", totalScoreTenths: 100, rank: "TIE" },
        { playerId: "p3", playerName: "Amit", totalScoreTenths: 100, rank: "TIE" },
        { playerId: "p4", playerName: "Raj", totalScoreTenths: 100, rank: "TIE" },
      ];

      const numeric = getNumericRankings(rankings);

      expect(numeric).toHaveLength(0);
    });

    it("should return all rankings when none are tied", () => {
      const rankings: any[] = [
        { playerId: "p1", playerName: "Rahul", totalScoreTenths: 100, rank: 1 },
        { playerId: "p2", playerName: "Suman", totalScoreTenths: 90, rank: 2 },
        { playerId: "p3", playerName: "Amit", totalScoreTenths: 50, rank: 3 },
        { playerId: "p4", playerName: "Raj", totalScoreTenths: 40, rank: 4 },
      ];

      const numeric = getNumericRankings(rankings);

      expect(numeric).toHaveLength(4);
    });
  });
});
