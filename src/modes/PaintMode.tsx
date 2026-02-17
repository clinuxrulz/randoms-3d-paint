import { Accessor, Component, createComputed, createMemo, on, onCleanup, untrack } from "solid-js";
import * as THREE from "three";
import { Mode } from "./Mode";
import { ModeParams } from "./ModeParams";
import { BrickMap } from "../BrickMap";
import { createStore } from "solid-js/store";

export class PaintMode implements Mode {
  instructions: Component;
  disableOrbit: Accessor<boolean>;
  overlayObject3D: Accessor<THREE.Object3D<THREE.Object3DEventMap> | undefined>;

  constructor(params: ModeParams) {
    let [ state, setState, ] = createStore<{
      brushSize: number,
    }>({
      brushSize: 8.0,
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
    let defaultColour = new THREE.Color("blue");
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
            params.operations.combineMode = "Paint";
            params.operations.dirtyTrackingEnabled = false;
            params.operations.insertEllipsoid(untrack(pointUnderRay2), new THREE.Quaternion(), new THREE.Vector3().addScalar(0.5 * state.brushSize * 10.0));
            drawInBrickmap(params.brickMap, untrack(pointUnderRay2), state.brushSize, untrack(params.currentColour) ?? defaultColour);
            params.operations.dirtyTrackingEnabled = true;
            params.updatePaint();
            params.operations.combineMode = "Add";
            let lastPt = untrack(pointUnderRay2);
            createComputed(on(
              pointUnderRay2,
              (pointUnderRay) => {
                if (lastPt.distanceTo(pointUnderRay) < 15.0) {
                  return;
                }
                params.operations.combineMode = "Paint";
                params.operations.dirtyTrackingEnabled = false;
                params.operations.insertCapsulePointToPoint(lastPt, pointUnderRay, 0.5 * state.brushSize * 10.0);
                strokeInBrickmap(params.brickMap, lastPt, untrack(pointUnderRay2), state.brushSize, untrack(params.currentColour) ?? defaultColour);
                params.operations.dirtyTrackingEnabled = true;
                params.updatePaint();
                params.operations.combineMode = "Add";
                lastPt = pointUnderRay;
              },
              { defer: true, },
            ));
          },
        ));
      },
      { defer: true, },
    ));
    let geo = new THREE.SphereGeometry(0.5 * untrack(() => state.brushSize) * 10.0);
    let mat = new THREE.MeshStandardMaterial({ color: "blue", });
    let mesh = new THREE.Mesh(geo, mat);
    createComputed(on(
      () => state.brushSize,
      (brushSize) => {
        geo.dispose();
        geo = new THREE.SphereGeometry(0.5 * brushSize * 10.0);
        mesh = new THREE.Mesh(geo, mat);
        params.rerender();
      },
    ));
    onCleanup(() => {
      geo.dispose();
      mat.dispose();
    });
    let instructions: Component = () => (
      <>
        <label class="label">
          Brush Size:
          <input
            type="range"
            class="range"
            min="8"
            max="40"
            value={state.brushSize.toString()}
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
          End Paint Mode
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

function smoothUnion(a: number, b: number, k: number): number {
  if (k == 0.0) {
    return Math.min(a, b);
  }
  k *= 4.0;
  let h = Math.max(k - Math.abs(a - b), 0.0);
  return Math.min(a, b) - h*h*0.25/k;
}

function smoothSubtraction(a: number, b: number, k: number): number {
  return -smoothUnion(-a, b, k);
}

function brickMapReadSDF(brickMap: BrickMap, x: number, y: number, z: number): number {
  let val = brickMap.get(x, y, z);
  return (128.0 - val) / 127.0;
}

function brickMapWriteSDF(brickMap: BrickMap, x: number, y: number, z: number, a: number) {
  let val = 128 - Math.floor(Math.max(-1, Math.min(1, a)) * 127);
  if (val < 1) val = 1; 
  if (val > 255) val = 255;
  brickMap.set(x, y, z, val);
}

function drawInBrickmap(brickMap: BrickMap, pt: THREE.Vector3, brushSize: number, colour: THREE.Color) {
  let red = Math.floor(colour.r * 255.0);
  let green = Math.floor(colour.g * 255.0);
  let blue = Math.floor(colour.b * 255.0);
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
        if (a > 0.0) {
          continue;
        }
        brickMap.paint(x, y, z, red, green, blue);
      }
    }
  }
};

function strokeInBrickmap(brickMap: BrickMap, p1: THREE.Vector3, p2: THREE.Vector3, brushSize: number, colour: THREE.Color) {
  let red = Math.floor(colour.r * 255.0);
  let green = Math.floor(colour.g * 255.0);
  let blue = Math.floor(colour.b * 255.0);
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
        if (a > 0.0) {
          continue;
        }
        brickMap.paint(k, j, i, red, green, blue);
      }
    }
  }
};

