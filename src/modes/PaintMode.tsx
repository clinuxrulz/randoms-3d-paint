import { Accessor, Component, createComputed, createMemo, createResource, on, onCleanup, untrack } from "solid-js";
import * as THREE from "three";
import { Mode } from "./Mode";
import { ModeParams } from "./ModeParams";

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
    let ray = createMemo(() => {
      let pointerPos = params.pointerPos();
      if (pointerPos == undefined) {
        return;
      }
      let result = new THREE.Ray();
      params.screenCoordsToRay(pointerPos, result);
      return result;
    });
    let [ pointUnderRay, { refetch: refetchPointUnderRay }, ] = createResource(async () => {
      let ray2 = ray();
      if (ray2 == undefined) {
        return undefined;
      }
      let { hit, t } = await params.model.march(ray2.origin, ray2.direction);
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
            params.model.setCombineMode("Paint");
            params.model.addOperation({
              operationShape: {
                type: "Ellipsoid",
                radius: new THREE.Vector3().addScalar(0.5 * state.brushSize * 10.0),
              },
              origin: untrack(pointUnderRay2),
              orientation: new THREE.Quaternion(),
              softness: 0,
            });
            params.updatePaint();
            params.model.setCombineMode("Add");
            let lastPt = untrack(pointUnderRay2);
            createComputed(on(
              pointUnderRay2,
              (pointUnderRay) => {
                if (lastPt.distanceTo(pointUnderRay) < 15.0) {
                  return;
                }
                params.model.setCombineMode("Paint");
                params.model.addOperation({
                  operationShape: {
                    type: "Capsule",
                    lenX: lastPt.distanceTo(pointUnderRay),
                    radius: 0.5 * state.brushSize * 10.0,
                  },
                  origin: lastPt.clone().lerp(pointUnderRay, 0.5),
                  orientation: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), pointUnderRay.clone().sub(lastPt).normalize()),
                  softness: 0,
                });
                params.updatePaint();
                params.model.setCombineMode("Add");
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



