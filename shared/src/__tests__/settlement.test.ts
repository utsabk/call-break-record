import {
  calculateFinalSettlement,
  verifySettlementBalance,
  formatSettlementAmount,
} from "../settlement";

describe("Settlement Engine", () => {
  describe("calculateFinalSettlement", () => {
    it("should calculate settlement with baseBid=1", () => {
      const rankings = [
        { playerId: "p1", playerName: "Rahul", totalScoreTenths: 184 },
        { playerId: "p2", playerName: "Suman", totalScoreTenths: 157 },
        { playerId: "p3", playerName: "Amit", totalScoreTenths: 122 },
        { playerId: "p4", playerName: "Raj", totalScoreTenths: 89 },
      ];

      const settlement = calculateFinalSettlement(rankings, 1);

      // Rank 1: +6 * 1 = +6 (60 tenths)
      expect(settlement.lines[0].rank).toBe(1);
      expect(settlement.lines[0].settlementAmountTenths).toBe(60);
      expect(settlement.lines[0].playerId).toBe("p1");

      // Rank 2: -1 * 1 = -1 (- 10 tenths)
      expect(settlement.lines[1].rank).toBe(2);
      expect(settlement.lines[1].settlementAmountTenths).toBe(-10);
      expect(settlement.lines[1].playerId).toBe("p2");

      // Rank 3: -2 * 1 = -2 (-20 tenths)
      expect(settlement.lines[2].rank).toBe(3);
      expect(settlement.lines[2].settlementAmountTenths).toBe(-20);
      expect(settlement.lines[2].playerId).toBe("p3");

      // Rank 4: -3 * 1 = -3 (-30 tenths)
      expect(settlement.lines[3].rank).toBe(4);
      expect(settlement.lines[3].settlementAmountTenths).toBe(-30);
      expect(settlement.lines[3].playerId).toBe("p4");

      expect(settlement.winner.playerId).toBe("p1");
    });

    it("should calculate settlement with baseBid=2", () => {
      const rankings = [
        { playerId: "p1", playerName: "Rahul", totalScoreTenths: 184 },
        { playerId: "p2", playerName: "Suman", totalScoreTenths: 157 },
        { playerId: "p3", playerName: "Amit", totalScoreTenths: 122 },
        { playerId: "p4", playerName: "Raj", totalScoreTenths: 89 },
      ];

      const settlement = calculateFinalSettlement(rankings, 2);

      // Rank 1: +6 * 2 = +12
      expect(settlement.lines[0].settlementAmountTenths).toBe(120);

      // Rank 2: -1 * 2 = -2
      expect(settlement.lines[1].settlementAmountTenths).toBe(-20);

      // Rank 3: -2 * 2 = -4
      expect(settlement.lines[2].settlementAmountTenths).toBe(-40);

      // Rank 4: -3 * 2 = -6
      expect(settlement.lines[3].settlementAmountTenths).toBe(-60);
    });

    it("should calculate settlement with baseBid=5", () => {
      const rankings = [
        { playerId: "p1", playerName: "Rahul", totalScoreTenths: 184 },
        { playerId: "p2", playerName: "Suman", totalScoreTenths: 157 },
        { playerId: "p3", playerName: "Amit", totalScoreTenths: 122 },
        { playerId: "p4", playerName: "Raj", totalScoreTenths: 89 },
      ];

      const settlement = calculateFinalSettlement(rankings, 5);

      // Rank 1: +6 * 5 = +30
      expect(settlement.lines[0].settlementAmountTenths).toBe(300);

      // Rank 2: -1 * 5 = -5
      expect(settlement.lines[1].settlementAmountTenths).toBe(-50);

      // Rank 3: -2 * 5 = -10
      expect(settlement.lines[2].settlementAmountTenths).toBe(-100);

      // Rank 4: -3 * 5 = -15
      expect(settlement.lines[3].settlementAmountTenths).toBe(-150);
    });

    it("should calculate settlement with baseBid=10", () => {
      const rankings = [
        { playerId: "p1", playerName: "Rahul", totalScoreTenths: 184 },
        { playerId: "p2", playerName: "Suman", totalScoreTenths: 157 },
        { playerId: "p3", playerName: "Amit", totalScoreTenths: 122 },
        { playerId: "p4", playerName: "Raj", totalScoreTenths: 89 },
      ];

      const settlement = calculateFinalSettlement(rankings, 10);

      // Rank 1: +6 * 10 = +60
      expect(settlement.lines[0].settlementAmountTenths).toBe(600);

      // Rank 2: -1 * 10 = -10
      expect(settlement.lines[1].settlementAmountTenths).toBe(-100);

      // Rank 3: -2 * 10 = -20
      expect(settlement.lines[2].settlementAmountTenths).toBe(-200);

      // Rank 4: -3 * 10 = -30
      expect(settlement.lines[3].settlementAmountTenths).toBe(-300);
    });
  });

  describe("doubling rules", () => {
    const withScores = (fourth: number, winner = 184) => [
      { playerId: "p1", playerName: "Rahul", totalScoreTenths: winner },
      { playerId: "p2", playerName: "Suman", totalScoreTenths: 157 },
      { playerId: "p3", playerName: "Amit", totalScoreTenths: 122 },
      { playerId: "p4", playerName: "Raj", totalScoreTenths: fourth },
    ];

    it("doubles the last player's payment when they finish below zero", () => {
      const settlement = calculateFinalSettlement(withScores(-15), 2);

      // Normally 3 x 2 = 6, doubled to 12.
      expect(settlement.lines[3].settlementAmountTenths).toBe(-120);
      expect(settlement.lines[3].doubledForNegativeScore).toBe(true);
      expect(verifySettlementBalance(settlement)).toBe(true);
    });

    it("doubles third place when only that player is below zero", () => {
      const rankings = [
        { playerId: "p1", playerName: "Rahul", totalScoreTenths: 184 },
        { playerId: "p2", playerName: "Suman", totalScoreTenths: 157 },
        { playerId: "p3", playerName: "Amit", totalScoreTenths: -30 },
        { playerId: "p4", playerName: "Raj", totalScoreTenths: -40 },
      ];
      const settlement = calculateFinalSettlement(rankings, 2);

      expect(settlement.lines[1].settlementAmountTenths).toBe(-20);
      expect(settlement.lines[2].settlementAmountTenths).toBe(-80);
      expect(settlement.lines[3].settlementAmountTenths).toBe(-120);
      expect(settlement.lines[0].settlementAmountTenths).toBe(220);
      expect(verifySettlementBalance(settlement)).toBe(true);
    });

    it("leaves a player on exactly zero at the normal rate", () => {
      const settlement = calculateFinalSettlement(withScores(0), 2);
      expect(settlement.lines[3].settlementAmountTenths).toBe(-60);
      expect(settlement.lines[3].doubledForNegativeScore).toBe(false);
    });

    it("doubles every payment when the winner reaches 20 points", () => {
      const settlement = calculateFinalSettlement(withScores(89, 200), 2);

      expect(settlement.winnerBonusApplied).toBe(true);
      expect(settlement.lines[1].settlementAmountTenths).toBe(-40);
      expect(settlement.lines[2].settlementAmountTenths).toBe(-80);
      expect(settlement.lines[3].settlementAmountTenths).toBe(-120);
      expect(settlement.lines[0].settlementAmountTenths).toBe(240);
      expect(verifySettlementBalance(settlement)).toBe(true);
    });

    it("does not apply the winner bonus just below 20 points", () => {
      const settlement = calculateFinalSettlement(withScores(89, 199), 2);
      expect(settlement.winnerBonusApplied).toBe(false);
      expect(settlement.lines[3].settlementAmountTenths).toBe(-60);
    });

    it("stacks both penalties for a negative player when the winner reaches 20", () => {
      const settlement = calculateFinalSettlement(withScores(-15, 210), 2);

      // 3 x 2 = 6, doubled for the negative score and again for the winner bonus.
      expect(settlement.lines[3].settlementAmountTenths).toBe(-240);
      expect(verifySettlementBalance(settlement)).toBe(true);
    });
  });

  describe("verifySettlementBalance", () => {
    it("should verify settlement balances for baseBid=1", () => {
      const rankings = [
        { playerId: "p1", playerName: "Rahul", totalScoreTenths: 184 },
        { playerId: "p2", playerName: "Suman", totalScoreTenths: 157 },
        { playerId: "p3", playerName: "Amit", totalScoreTenths: 122 },
        { playerId: "p4", playerName: "Raj", totalScoreTenths: 89 },
      ];

      const settlement = calculateFinalSettlement(rankings, 1);
      expect(verifySettlementBalance(settlement)).toBe(true);
    });

    it("should verify settlement balances for baseBid=2", () => {
      const rankings = [
        { playerId: "p1", playerName: "Rahul", totalScoreTenths: 184 },
        { playerId: "p2", playerName: "Suman", totalScoreTenths: 157 },
        { playerId: "p3", playerName: "Amit", totalScoreTenths: 122 },
        { playerId: "p4", playerName: "Raj", totalScoreTenths: 89 },
      ];

      const settlement = calculateFinalSettlement(rankings, 2);
      expect(verifySettlementBalance(settlement)).toBe(true);
    });

    it("should verify settlement balances for baseBid=10", () => {
      const rankings = [
        { playerId: "p1", playerName: "Rahul", totalScoreTenths: 184 },
        { playerId: "p2", playerName: "Suman", totalScoreTenths: 157 },
        { playerId: "p3", playerName: "Amit", totalScoreTenths: 122 },
        { playerId: "p4", playerName: "Raj", totalScoreTenths: 89 },
      ];

      const settlement = calculateFinalSettlement(rankings, 10);
      expect(verifySettlementBalance(settlement)).toBe(true);
    });
  });

  describe("formatSettlementAmount", () => {
    it("should format positive amounts with + prefix", () => {
      expect(formatSettlementAmount(60)).toBe("+6.0");
      expect(formatSettlementAmount(120)).toBe("+12.0");
      expect(formatSettlementAmount(65)).toBe("+6.5");
    });

    it("should format negative amounts with - prefix", () => {
      expect(formatSettlementAmount(-10)).toBe("-1.0");
      expect(formatSettlementAmount(-20)).toBe("-2.0");
      expect(formatSettlementAmount(-15)).toBe("-1.5");
    });

    it("should format zero", () => {
      expect(formatSettlementAmount(0)).toBe("+0.0");
    });
  });
});
