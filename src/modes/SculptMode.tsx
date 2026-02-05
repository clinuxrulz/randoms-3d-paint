import { Accessor, Component, createComputed, createMemo, on, onCleanup } from "solid-js";
import * as THREE from "three";
import { Mode } from "./Mode";
import { ModeParams } from "./ModeParams";
import { BrickMap } from "../BrickMap";

export class SculptMode implements Mode {
  instructions: Component;
  disableOrbit: Accessor<boolean>;
  overlayObject3D: Accessor<THREE.Object3D<THREE.Object3DEventMap> | undefined>;

  constructor(params: ModeParams) {
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
        createComputed(on(
          pointUnderRay,
          (pointUnderRay) => {
            if (pointUnderRay == undefined) {
              return;
            }
            drawInBrickmap(params.brickMap, pointUnderRay);
            params.updateSdf();
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
      <button
        class="btn btn-primary"
        onClick={() => params.endMode()}
      >
        End Sculpt Mode
      </button>
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

function drawInBrickmap(brickMap: BrickMap, pt: THREE.Vector3) {
  let cx = 512 + Math.round(pt.x / 10.0);
  let cy = 512 + Math.round(pt.y / 10.0);
  let cz = 512 + Math.round(pt.z / 10.0);
  let r = 4;
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
        /*
        if (a < -1.0 || a > 1.0) {
          continue;
        }*/
        let val = 128 - Math.floor(Math.max(-1, Math.min(1, -a)) * 127);
        val = Math.min(val, b);
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
