import { Accessor, Component, createComputed, createMemo, on, untrack } from "solid-js";
import { BrickMap } from "../BrickMap";
import { Mode } from "./Mode";
import { ModeParams } from "./ModeParams";

export class DrawMode implements Mode {
  readonly instructions: Component;
  readonly disableOrbit = () => true;
  
  constructor(params: ModeParams) {
    let hasCanvasSize = createMemo(() => params.canvasSize() != undefined);
    let hasPointerPos = createMemo(() => params.pointerPos() != undefined);
    createComputed(on(
      [ hasCanvasSize, hasPointerPos, params.pointerDown, ],
      ([ hasCanvasSize, hasPointerPos, pointerDown, ]) => {
        if (!hasCanvasSize) {
          return;
        }
        if (!hasPointerPos) {
          return;
        }
        if (!pointerDown) {
          return;
        }
        let canvasSize = params.canvasSize as Accessor<NonNullable<ReturnType<typeof params.canvasSize>>>;
        let pointerPos = params.pointerPos as Accessor<NonNullable<ReturnType<typeof params.pointerPos>>>;
        let lastX: number;
        let lastY: number;
        {
          let canvasSize2 = untrack(canvasSize);
          let pointerPos2 = untrack(pointerPos);
          lastX = pointerPos2.x - 0.5 * canvasSize2.x;
          lastY = -pointerPos2.y + 0.5 * canvasSize2.y;
        }
        drawInBrickmap(params.brickMap, lastX, lastY);
        params.updateSdf();
        createComputed(on(
          pointerPos,
          (pointerPos) => {
            let canvasSize2 = untrack(canvasSize);
            let x = pointerPos.x - 0.5 * canvasSize2.x;
            let y = -pointerPos.y + 0.5 * canvasSize2.y;
            let dx = x - lastX;
            let dy = y - lastY;
            let distSquared = dx * dx + dy * dy;
            if (distSquared <= 5*5) {
              return;
            }
            strokeInBrickmap(params.brickMap, lastX, lastY, x, y);
            lastX = x;
            lastY = y;
            params.updateSdf();
          },
          { defer: true, },
        ));
      },
    ));
    let instructions: Component = () => (
      <button
        class="btn btn-primary"
        onClick={() => params.endMode()}
      >
        End Draw Mode
      </button>
    );
    //
    this.instructions = instructions;
  }
}

function drawInBrickmap(brickMap: BrickMap, x: number, y: number) {
  let cx = 512 + Math.round(x);
  let cy = 512 + Math.round(y);
  let cz = 512;
  let r = 20;
  for (let i = -r-2; i <= r+2; ++i) {
    for (let j = -r-2; j <= r+2; ++j) {
      for (let k = -r-2; k <= r+2; ++k) {
        let a = Math.sqrt(i*i + j*j + k*k) - r;
        a /= Math.sqrt(3);
        if (a < -1.0 || a > 1.0) {
          continue;
        }
        let val = 128 - Math.floor(Math.max(-1, Math.min(1, a)) * 127);
        if (val < 1) val = 1; 
        if (val > 255) val = 255;
        let x = cx + k;
        let y = cy + j;
        let z = cz + i;
        if (
          x < 0 || x >= 1024 ||
          y < 0 || y >= 1024 ||
          z < 0 || z >= 1024
        ) {
          continue;
        }
        brickMap.set(
          x,
          y,
          z,
          val,
        );
      }
    }
  }
};

function strokeInBrickmap(brickMap: BrickMap, x1: number, y1: number, x2: number, y2: number) {
  let pt1x = 512 + Math.round(x1);
  let pt1y = 512 + Math.round(y1);
  let pt1z = 512;
  let pt2x = 512 + Math.round(x2);
  let pt2y = 512 + Math.round(y2);
  let pt2z = 512;
  let r = 20;
  let ux = pt2x - pt1x;
  let uy = pt2y - pt1y;
  let uz = pt2z - pt1z;
  let uu = ux * ux + uy * uy + uz * uz;
  let sdf = (x: number, y: number, z: number) => {
    let t = ((x - pt1x) * ux + (y - pt1y) * uy + (z - pt1z) * uz) / uu;
    t = Math.max(0.0, Math.min(1.0, t));
    let px = pt1x + ux * t;
    let py = pt1y + uy * t;
    let pz = pt1z + uz * t;
    let dx = x - px;
    let dy = y - py;
    let dz = z - pz;
    return Math.sqrt(dx*dx + dy*dy + dz*dz) - r;
  };
  let min_x = Math.min(pt1x, pt2x) - r;
  let max_x = Math.max(pt1x, pt2x) + r;
  let min_y = Math.min(pt1y, pt2y) - r;
  let max_y = Math.max(pt1y, pt2y) + r;
  let min_z = Math.min(pt1z, pt2z) - r;
  let max_z = Math.max(pt1z, pt2z) + r;
  for (let i = min_z-2; i <= max_z+2; ++i) {
    for (let j = min_y-2; j <= max_y+2; ++j) {
      for (let k = min_x-2; k <= max_x+2; ++k) {
        if (
          i < 0 || i >= 1024 ||
          j < 0 || j >= 1024 ||
          k < 0 || k >= 1024
        ) {
          continue;
        }
        let a = sdf(k, j, i);
        a /= Math.sqrt(3);
        if (a < -1.0 || a > 1.0) {
          continue;
        }
        let val = 128 - Math.floor(Math.max(-1, Math.min(1, a)) * 127);
        if (val < 1) val = 1; 
        if (val > 255) val = 255;
        let oldVal = brickMap.get(k, j, i);
        if (oldVal != 0) {
          val = Math.max(val, oldVal);
        }
        brickMap.set(
          k,
          j,
          i,
          val,
        );
      }
    }
  }
};
