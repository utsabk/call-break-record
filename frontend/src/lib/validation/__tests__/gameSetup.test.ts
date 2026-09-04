import { validateGameSetup } from "../gameSetup";

describe("validateGameSetup", () => {
  const validNames = ["Rahul", "Suman", "Amit", "Raj"];

  it("allows a valid retry after an invalid base bid without retaining an error", () => {
    expect(validateGameSetup(validNames, "0").baseBidError).toBe("Base bid must be greater than 0.");
    expect(validateGameSetup(validNames, "2")).toEqual({ nameError: null, baseBidError: null });
  });

  it("requires four distinct player names", () => {
    expect(validateGameSetup(["Rahul", "Suman", "", "Raj"], "2").nameError).toBe("Enter a name for all four players.");
    expect(validateGameSetup(["Rahul", "Suman", "rahul", "Raj"], "2").nameError).toBe("Each player needs a different name.");
  });
});