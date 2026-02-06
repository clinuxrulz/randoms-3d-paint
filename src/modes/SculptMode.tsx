import { Accessor, Component, createComputed, createMemo, on, onCleanup } from "solid-js";
import * as THREE from "three";
import { Mode } from "./Mode";
import { ModeParams } from "./ModeParams";
import { BrickMap } from "../BrickMap";
import { createStore } from "solid-js/store";

export class SculptMode implements Mode {
  instructions: Component;
  disableOrbit: Accessor<boolean>;
  overlayObject3D: Accessor<THREE.Object3D<THREE.Object3DEventMap> | undefined>;

  constructor(params: ModeParams) {
    let [ state, setState, ] = createStore<{
      brushSize: number,
      isNegativeBrush: boolean,
    }>({
      brushSize: 8,
      isNegativeBrush: true,
    });
    let virtualBrickMap = new BrickMap().copy(params.brickMap);
    let ray = createMemo(() => {
      let pointerPos = params.pointerPos();
      if (pointerPos == undefined) {
        return;
      }
      let result = new THREE.Ray();
      params.screenCoordsToRay(pointerPos, result);
      return result;
    });
    let pointUnderRay = createMemo(() => {
      let ray2 = ray();
      if (ray2 == undefined) {
        return undefined;
      }
      let t: [ number, ] = [ 0.0, ];
      let hit = virtualBrickMap.march(ray2.origin, ray2.direction, t);
      if (!hit) {
        return undefined;
      }
      let pt = new THREE.Vector3()
        .copy(ray2.direction)
        .multiplyScalar(t[0])
        .add(ray2.origin);
      return pt;
    });
    createComputed(on(
      params.pointerDown,
      (pointerDown) => {
        if (!pointerDown) {
          virtualBrickMap.copy(params.brickMap);
          return;
        }
        let hasPointUnderRay = createMemo(() => pointUnderRay() != undefined);
        createComputed(on(
          hasPointUnderRay,
          (hasPointUnderRay) => {
            if (!hasPointUnderRay) {
              return;
            }
            let pointUnderRay2 = pointUnderRay as Accessor<NonNullable<ReturnType<typeof pointUnderRay>>>;
            drawInBrickmap(params.brickMap, pointUnderRay2(), state.isNegativeBrush, state.brushSize);
            params.updateSdf();
            let lastPt = pointUnderRay2();
            createComputed(on(
              pointUnderRay2,
              (pointUnderRay) => {
                if (lastPt.distanceTo(pointUnderRay) < 15.0) {
                  return;
                }
                strokeInBrickmap(params.brickMap, lastPt, pointUnderRay, state.isNegativeBrush, state.brushSize);
                params.updateSdf();
                lastPt = pointUnderRay;
              },
              { defer: true, },
            ));
          },
        ));
      },
      { defer: true, },
    ));
    let geo = new THREE.SphereGeometry(40.0);
    let mat = new THREE.MeshStandardMaterial({ color: "blue", });
    onCleanup(() => {
      geo.dispose();
      mat.dispose();
    });
    let mesh = new THREE.Mesh(geo, mat);
    let instructions: Component = () => (
      <>
        <div class="join">
          <label class="label">
            Brush
            <input
              type="radio"
              name="BrushSign"
              class="btn btn-sm join-item"
              aria-label="-"
              checked={state.isNegativeBrush}
              onChange={(e) => {
                if (e.currentTarget.checked) {
                  setState("isNegativeBrush", true);
                }
              }}
            />
            <input
              type="radio"
              name="BrushSign"
              class="btn btn-sm join-item"
              aria-label="+"
              checked={!state.isNegativeBrush}
              onChange={(e) => {
                if (e.currentTarget.checked) {
                  setState("isNegativeBrush", false);
                }
              }}
            />
          </label>
        </div>
        <label class="label">
          Brush Size:
          <input
            type="range"
            class="range"
            min="8"
            max="40"
            value={state.brushSize}
            onInput={(e) => {
              let x = Number.parseInt(e.currentTarget.value);
              if (Number.isNaN(x)) {
                return;
              }
              setState("brushSize", x);
            }}
          />
        </label>
        <button
          class="btn btn-primary ml-2"
          onClick={() => params.endMode()}
        >
          End Sculpt Mode
        </button>
      </>
    );
    let disableOrbit = createMemo(() => pointUnderRay() != undefined);
    let overlayObject3D = createMemo(() => {
      let pt = pointUnderRay();
      if (pt == undefined) {
        params.rerender();
        return undefined;
      }
      mesh.position.copy(pt);
      mesh.updateMatrix();
      mesh.matrixWorldNeedsUpdate = true;
      params.rerender();
      return mesh;
    });
    //
    this.instructions = instructions;
    this.disableOrbit = disableOrbit;
    this.overlayObject3D = overlayObject3D;
  }
}

function drawInBrickmap(brickMap: BrickMap, pt: THREE.Vector3, negative: boolean, brushSize: number) {
  let cx = 512 + Math.round(pt.x / 10.0);
  let cy = 512 + Math.round(pt.y / 10.0);
  let cz = 512 + Math.round(pt.z / 10.0);
  let r = Math.round(0.5 * brushSize);
  for (let i = -r-2; i <= r+2; ++i) {
    for (let j = -r-2; j <= r+2; ++j) {
      for (let k = -r-2; k <= r+2; ++k) {
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
        let a = Math.sqrt(i*i + j*j + k*k) - r;
        a /= Math.sqrt(3);
        let b = brickMap.get(x,y,z);
        if (negative) {
          a = -a;
        }
        let val = 128 - Math.floor(Math.max(-1, Math.min(1, a)) * 127);
        if (negative) {
          val = Math.min(val, b);
        } else {
          val = Math.max(val, b);
        }
        if (val < 1) val = 1; 
        if (val > 255) val = 255;
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

function strokeInBrickmap(brickMap: BrickMap, p1: THREE.Vector3, p2: THREE.Vector3, negative: boolean, brushSize: number) {
  let pt1x = 512 + Math.round(p1.x/10);
  let pt1y = 512 + Math.round(p1.y/10);
  let pt1z = 512 + Math.round(p1.z/10);
  let pt2x = 512 + Math.round(p2.x/10);
  let pt2y = 512 + Math.round(p2.y/10);
  let pt2z = 512 + Math.round(p2.z/10);
  let r = Math.round(0.5 * brushSize);
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
        if (negative) {
          a = -a;
        }
        let val = 128 - Math.floor(Math.max(-1, Math.min(1, a)) * 127);
        if (val < 1) val = 1; 
        if (val > 255) val = 255;
        let oldVal = brickMap.get(k, j, i);
        if (negative) {
          val = Math.min(val, oldVal);
        } else {
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

