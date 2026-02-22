import { Accessor, Component, createComputed, createMemo, createResource, on, onCleanup, untrack } from "solid-js";
import * as THREE from "three";
import { Mode } from "./Mode";
import { ModeParams } from "./ModeParams";

import { createStore } from "solid-js/store";

export class SculptMode implements Mode {
  instructions: Component;
  disableOrbit: Accessor<boolean>;
  overlayObject3D: Accessor<THREE.Object3D<THREE.Object3DEventMap> | undefined>;

  constructor(params: ModeParams) {
    let [ state, setState, ] = createStore<{
      brushSize: number,
      softness: number,
      isNegativeBrush: boolean,
    }>({
      brushSize: 8,
      softness: 0.0,
      isNegativeBrush: true,
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
            if (state.isNegativeBrush) {
              params.model.setCombineMode("Subtract");
            } else {
              params.model.setCombineMode("Add");
            }
            params.model.setSoftness(state.softness * state.brushSize * 10.0);
            params.model.addOperation({
              operationShape: {
                type: "Ellipsoid",
                radius: new THREE.Vector3().addScalar(0.5 * (state.brushSize - 4.0*state.softness) * 10.0),
              },
              origin: untrack(pointUnderRay2),
              orientation: new THREE.Quaternion(),
              softness: state.softness * state.brushSize * 10.0,
            });
            params.model.setSoftness(0.0);
            params.updateSdf();
            params.model.setCombineMode("Add");
            let lastPt = untrack(pointUnderRay2);
            createComputed(on(
              pointUnderRay2,
              (pointUnderRay) => {
                if (lastPt.distanceTo(pointUnderRay) < 15.0) {
                  return;
                }
                if (state.isNegativeBrush) {
                  params.model.setCombineMode("Subtract");
                } else {
                  params.model.setCombineMode("Add");
                }
                params.model.setSoftness(state.softness * state.brushSize * 10.0);
                params.model.addOperation({
                  operationShape: {
                    type: "Capsule",
                    lenX: lastPt.distanceTo(pointUnderRay),
                    radius: 0.5 * (state.brushSize - 4.0*state.softness) * 10.0,
                  },
                  origin: lastPt.clone().lerp(pointUnderRay, 0.5),
                  orientation: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), pointUnderRay.clone().sub(lastPt).normalize()),
                  softness: state.softness * state.brushSize * 10.0,
                });
                params.model.setSoftness(0.0);
                params.updateSdf();
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
        <label class="label">
          Softness:
          <input
            type="range"
            class="range"
            min="0"
            max="0.18"
            step="0.05"
            value={state.softness}
            onInput={(e) => {
              let x = Number.parseFloat(e.currentTarget.value);
              if (Number.isNaN(x)) {
                return;
              }
              setState("softness", x);
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



