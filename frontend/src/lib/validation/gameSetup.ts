export interface GameSetupValidation {
  nameError: string | null;
  baseBidError: string | null;
}

export function validateGameSetup(names: string[], baseBid: string): GameSetupValidation {
  const trimmedNames = names.map((name) => name.trim());
  if (trimmedNames.some((name) => !name)) {
    return { nameError: "Enter a name for all four players.", baseBidError: null };
  }
  if (new Set(trimmedNames.map((name) => name.toLowerCase())).size !== 4) {
    return { nameError: "Each player needs a different name.", baseBidError: null };
  }
  const numericBaseBid = Number(baseBid);
  if (!Number.isInteger(numericBaseBid) || numericBaseBid < 1) {
    return { nameError: null, baseBidError: "Base bid must be greater than 0." };
  }
  return { nameError: null, baseBidError: null };
}