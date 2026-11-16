import { describe, expect, it } from "vitest";
import { fromPalm, jointCurl, palmOf, segment, toPalm } from "./hands";
import { syntheticHand } from "./solve";
import { toAvatarSpace } from "./space";

function avatarFrame(curl: number, straight?: Set<number>) {
  return syntheticHand(curl, straight).map((point) => toAvatarSpace(point));
}

describe("hand shapes from landmarks", () => {
  it("keeps a flat hand nearly straight", () => {
    expect(jointCurl(avatarFrame(0), 5, 6, 7)).toBeLessThan(0.2);
  });

  it("folds a fist", () => {
    const hand = avatarFrame(1.2);
    expect(jointCurl(hand, 5, 6, 7)).toBeGreaterThan(1);
    expect(jointCurl(hand, 9, 10, 11)).toBeGreaterThan(1);
  });

  it("keeps a pointing index straight and the other fingers folded", () => {
    const hand = avatarFrame(1.2, new Set([5, 6, 7, 8]));
    expect(jointCurl(hand, 5, 6, 7)).toBeLessThan(0.35);
    expect(jointCurl(hand, 9, 10, 11)).toBeGreaterThan(1);
  });

  it("puts the palm normal on the side a right fist curls toward", () => {
    const hand = avatarFrame(1.2);
    const local = toPalm(segment(hand, 5, 6), palmOf(hand));
    expect(local[2]).toBeGreaterThan(0.5);
  });

  it("round-trips a direction through the palm frame", () => {
    const palm = palmOf(avatarFrame(0.4));
    const back = fromPalm([0.3, 0.8, 0.52], palm);
    const again = toPalm(back, palm);
    expect(again[1]).toBeCloseTo(0.8 / Math.hypot(0.3, 0.8, 0.52), 4);
  });
});

describe("tracker space", () => {
  it("flips y and z into the avatar frame", () => {
    expect(toAvatarSpace([1, 2, 3], "image")).toEqual([1, -2, -3]);
    expect(toAvatarSpace([1, -0.44, -0.19], "world")).toEqual([1, 0.44, 0.19]);
  });
});
