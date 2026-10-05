import { describe, expect, it } from "vitest";
import { engagementStyle, isContest, reactionsFor } from "./engagement";

describe("engagement helpers", () => {
  it("defaults to SIMPLE when the event has no style or is missing", () => {
    expect(engagementStyle({})).toBe("SIMPLE");
    expect(engagementStyle(null)).toBe("SIMPLE");
    expect(engagementStyle(undefined)).toBe("SIMPLE");
  });

  it("returns reactions only for REACTION events", () => {
    expect(reactionsFor({ engagementStyle: "REACTION", reactionEmojis: ["like", "👍"] })).toEqual(["like", "👍"]);
    expect(reactionsFor({ engagementStyle: "REACTION" })).toEqual([]);
    expect(reactionsFor({ engagementStyle: "CONTEST", reactionEmojis: ["like"] })).toEqual([]);
    expect(reactionsFor({ engagementStyle: "SIMPLE", reactionEmojis: ["like"] })).toEqual([]);
    expect(reactionsFor(null)).toEqual([]);
  });

  it("detects contest events", () => {
    expect(isContest({ engagementStyle: "CONTEST" })).toBe(true);
    expect(isContest({ engagementStyle: "REACTION" })).toBe(false);
    expect(isContest(undefined)).toBe(false);
  });
});
