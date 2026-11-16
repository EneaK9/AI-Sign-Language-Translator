import { Bone, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { aimBone, captureRest } from "./aim";

describe("aimBone", () => {
  it("turns a bone from up to the right", () => {
    const root = new Bone();
    const upper = new Bone();
    const child = new Bone();
    child.position.set(0, 1, 0);
    upper.add(child);
    root.add(upper);
    root.updateWorldMatrix(true, true);
    const rest = captureRest(root, [upper]);
    aimBone(upper, new Vector3(1, 0, 0), rest);
    upper.updateWorldMatrix(true, true);
    const origin = new Vector3();
    const end = new Vector3();
    upper.getWorldPosition(origin);
    child.getWorldPosition(end);
    const direction = end.sub(origin).normalize();
    expect(direction.x).toBeGreaterThan(0.9);
    expect(Math.abs(direction.y)).toBeLessThan(0.15);
  });
});
