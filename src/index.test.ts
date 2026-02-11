import { describe, it, expect } from "vitest";
import Prando from "prando";
import { BrickMap } from "./BrickMap";

describe("BrickMap", () => {
  it("should read back the same values that were written", () => {
    let brickMap = new BrickMap();
    let rng = new Prando(12345);
    let pts: [ number, number, number, number, ][] = [];
    for (let i = 0; i < 50; ++i) {
      pts.push([
        rng.nextInt(0, 1023),
        rng.nextInt(0, 1023),
        rng.nextInt(0, 1023),
        rng.nextInt(0, 255),
      ]);
      brickMap.set(pts[i][0], pts[i][1], pts[i][2], pts[i][3]);
    }
    for (let i = 0; i < pts.length; ++i) {
      let val = brickMap.get(pts[i][0], pts[i][1], pts[i][2]);
      expect(val).toBe(pts[i][3]);
    }
  });
  it("should return to 0 bricks when everything is unset", () => {
    let brickMap = new BrickMap();
    let rng = new Prando(12345);
    let pts: [ number, number, number, number, ][] = [];
    for (let i = 0; i < 50; ++i) {
      pts.push([
        rng.nextInt(0, 1023),
        rng.nextInt(0, 1023),
        rng.nextInt(0, 1023),
        rng.nextInt(0, 255),
      ]);
      brickMap.set(pts[i][0], pts[i][1], pts[i][2], pts[i][3]);
    }
    for (let i = 0; i < pts.length; ++i) {
      brickMap.set(pts[i][0], pts[i][1], pts[i][2], 0);
    }
    expect(brickMap.numBricks).toBe(0);
  });
});
