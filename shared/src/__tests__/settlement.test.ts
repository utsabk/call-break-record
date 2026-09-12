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

  describe("tie scenarios", () => {
    it("handles 1st + 2nd tie with baseBid=2", () => {
      // Both 1st and 2nd tied with same score
      const rankings = [
        { playerId: "p1", playerName: "Player1", totalScoreTenths: 185, isTied: true },
        { playerId: "p2", playerName: "Player2", totalScoreTenths: 185, isTied: true },
        { playerId: "p3", playerName: "Player3", totalScoreTenths: 120, isTied: false },
        { playerId: "p4", playerName: "Player4", totalScoreTenths: 89, isTied: false },
      ];

      const settlement = calculateFinalSettlement(rankings, 2);

      // Both winners split the pot: 1st gets 3*2=60, 2nd gets (3-1)*2=40
      expect(settlement.lines[0].rank).toBe("TIE");
      expect(settlement.lines[0].settlementAmountTenths).toBe(60);
      expect(settlement.lines[1].rank).toBe("TIE");
      expect(settlement.lines[1].settlementAmountTenths).toBe(40);
      // 3rd pays: 2 * 2 = 4 = 40 tenths
      expect(settlement.lines[2].rank).toBe(3);
      expect(settlement.lines[2].settlementAmountTenths).toBe(-40);
      // 4th pays: 3 * 2 = 6 = 60 tenths
      expect(settlement.lines[3].rank).toBe(4);
      expect(settlement.lines[3].settlementAmountTenths).toBe(-60);

      expect(settlement.tieScenario).toBe("FIRST_SECOND");
      expect(settlement.winners).toHaveLength(2);
      expect(verifySettlementBalance(settlement)).toBe(true);
    });

    it("handles 2nd + 3rd tie with baseBid=2", () => {
      // 2nd and 3rd tied with same score
      const rankings = [
        { playerId: "p1", playerName: "Player1", totalScoreTenths: 200, isTied: false },
        { playerId: "p2", playerName: "Player2", totalScoreTenths: 150, isTied: true },
        { playerId: "p3", playerName: "Player3", totalScoreTenths: 150, isTied: true },
        { playerId: "p4", playerName: "Player4", totalScoreTenths: 80, isTied: false },
      ];

      const settlement = calculateFinalSettlement(rankings, 2);

      // 1st (sole winner) gets: (1+2+3) * baseBid * 2 (bonus) = 6 * 2 * 2 = 240 tenths
      expect(settlement.lines[0].rank).toBe(1);
      expect(settlement.lines[0].settlementAmountTenths).toBe(240);
      expect(settlement.winnerBonusApplied).toBe(true);
      // 2nd and 3rd tied, each pays: ((1+2)/2) * baseBid * 2 (bonus) = 1.5 * 2 * 2 = 60 tenths
      expect(settlement.lines[1].rank).toBe("TIE");
      expect(settlement.lines[1].settlementAmountTenths).toBe(-60);
      expect(settlement.lines[2].rank).toBe("TIE");
      expect(settlement.lines[2].settlementAmountTenths).toBe(-60);
      // 4th pays: 3 * 2 * 2 (bonus) = 120 tenths
      expect(settlement.lines[3].rank).toBe(4);
      expect(settlement.lines[3].settlementAmountTenths).toBe(-120);

      expect(settlement.tieScenario).toBe("SECOND_THIRD");
      expect(verifySettlementBalance(settlement)).toBe(true);
    });

    it("handles 3rd + 4th tie with baseBid=2", () => {
      // 3rd and 4th tied with same score
      const rankings = [
        { playerId: "p1", playerName: "Player1", totalScoreTenths: 200, isTied: false },
        { playerId: "p2", playerName: "Player2", totalScoreTenths: 150, isTied: false },
        { playerId: "p3", playerName: "Player3", totalScoreTenths: 100, isTied: true },
        { playerId: "p4", playerName: "Player4", totalScoreTenths: 100, isTied: true },
      ];

      const settlement = calculateFinalSettlement(rankings, 2);

      // 1st (sole winner) gets: (1+2+3) * baseBid * 2 (bonus) = 6 * 2 * 2 = 240 tenths
      expect(settlement.lines[0].rank).toBe(1);
      expect(settlement.lines[0].settlementAmountTenths).toBe(240);
      expect(settlement.winnerBonusApplied).toBe(true);
      // 2nd pays: 1 * 2 * 2 (bonus) = 40 tenths
      expect(settlement.lines[1].rank).toBe(2);
      expect(settlement.lines[1].settlementAmountTenths).toBe(-40);
      // 3rd and 4th tied, each pays: ((2+3)/2) * baseBid * 2 (bonus) = 2.5 * 2 * 2 = 100 tenths
      expect(settlement.lines[2].rank).toBe("TIE");
      expect(settlement.lines[2].settlementAmountTenths).toBe(-100);
      expect(settlement.lines[3].rank).toBe("TIE");
      expect(settlement.lines[3].settlementAmountTenths).toBe(-100);

      expect(settlement.tieScenario).toBe("THIRD_FOURTH");
      expect(verifySettlementBalance(settlement)).toBe(true);
    });

    it("handles 1st + 2nd tie with negative score doubling", () => {
      // 1st and 2nd tied, 4th below zero for doubling
      const rankings = [
        { playerId: "p1", playerName: "Player1", totalScoreTenths: 185, isTied: true },
        { playerId: "p2", playerName: "Player2", totalScoreTenths: 185, isTied: true },
        { playerId: "p3", playerName: "Player3", totalScoreTenths: 120, isTied: false },
        { playerId: "p4", playerName: "Player4", totalScoreTenths: -30, isTied: false },
      ];

      const settlement = calculateFinalSettlement(rankings, 2);

      // Total pot: (1*2 + 2*2 + 3*2*2) = (20 + 40 + 120) = 180 tenths
      // Player 1: 180/2 = 90 tenths
      // Player 2: 180/2 - 20 = 70 tenths
      expect(settlement.lines[0].settlementAmountTenths).toBe(90);
      expect(settlement.lines[1].settlementAmountTenths).toBe(70);
      // 3rd: 2 * 2 = 40 tenths
      expect(settlement.lines[2].settlementAmountTenths).toBe(-40);
      // 4th (below zero): 3 * 2 * 2 = 120 tenths
      expect(settlement.lines[3].settlementAmountTenths).toBe(-120);
      expect(settlement.lines[3].doubledForNegativeScore).toBe(true);

      expect(verifySettlementBalance(settlement)).toBe(true);
    });

    it("handles 2nd + 3rd tie with winner bonus (20+)", () => {
      // 2nd and 3rd tied, 1st above 20 for winner bonus
      const rankings = [
        { playerId: "p1", playerName: "Player1", totalScoreTenths: 200, isTied: false },
        { playerId: "p2", playerName: "Player2", totalScoreTenths: 150, isTied: true },
        { playerId: "p3", playerName: "Player3", totalScoreTenths: 150, isTied: true },
        { playerId: "p4", playerName: "Player4", totalScoreTenths: 80, isTied: false },
      ];

      const settlement = calculateFinalSettlement(rankings, 2);

      expect(settlement.winnerBonusApplied).toBe(true);
      // 1st gets: 6 * 2 * 2 (bonus) = 240 tenths
      expect(settlement.lines[0].settlementAmountTenths).toBe(240);
      // 2nd and 3rd: each 1.5 * 2 = 3, doubled for winner bonus = 60 tenths
      expect(settlement.lines[1].settlementAmountTenths).toBe(-60);
      expect(settlement.lines[2].settlementAmountTenths).toBe(-60);
      // 4th: 3 * 2 * 2 (bonus) = 120 tenths
      expect(settlement.lines[3].settlementAmountTenths).toBe(-120);

      expect(verifySettlementBalance(settlement)).toBe(true);
    });

    it("handles 1st + 2nd tie with stacked doubling (winner 20+ and negative player)", () => {
      // 1st and 2nd tied with 20+ score, 4th below zero
      const rankings = [
        { playerId: "p1", playerName: "Player1", totalScoreTenths: 200, isTied: true },
        { playerId: "p2", playerName: "Player2", totalScoreTenths: 200, isTied: true },
        { playerId: "p3", playerName: "Player3", totalScoreTenths: 100, isTied: false },
        { playerId: "p4", playerName: "Player4", totalScoreTenths: -50, isTied: false },
      ];

      const settlement = calculateFinalSettlement(rankings, 2);

      expect(settlement.winnerBonusApplied).toBe(true);
      // Total pot: (1*2 + 2*2 + 3*2)*2 (bonus) + extra for 4th negative = (20 + 40)*2 + 240 = 120 + 240 = 360
      // Player 1: 360/2 = 180
      // Player 2: 360/2 - 40 = 140
      expect(settlement.lines[0].settlementAmountTenths).toBe(180);
      expect(settlement.lines[1].settlementAmountTenths).toBe(140);
      // 3rd: (2*2)*2 (bonus) = 80 tenths
      expect(settlement.lines[2].settlementAmountTenths).toBe(-80);
      // 4th (below zero + winner bonus): (3*2)*2*2 = 240 tenths
      expect(settlement.lines[3].settlementAmountTenths).toBe(-240);
      expect(settlement.lines[3].doubledForNegativeScore).toBe(true);

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
