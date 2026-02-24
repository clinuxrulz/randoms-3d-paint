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
      softness: number,
    }>({
      brushSize: 8.0,
      softness: 0.0,
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
    let [ pointUnderRayAsync, ] = createResource(ray, async (ray) => {
      if (ray == undefined) {
        return { result: undefined, };
      }
      let { hit, t } = await params.model.march(ray.origin, ray.direction);
      if (!hit) {
        return { result: undefined, };
      }
      let pt = new THREE.Vector3()
        .copy(ray.direction)
        .multiplyScalar(t[0])
        .add(ray.origin);
      return { result: pt, };
    });
    let pointUnderRay = createMemo<THREE.Vector3|undefined>(on<{result:THREE.Vector3|undefined}|undefined,THREE.Vector3|undefined>(
      () => pointUnderRayAsync(),
      (pt, _, prev) => {
        if (pt == undefined) {
          return prev;
        }
        return pt.result;
      },
    ));
    let lastSeenPointUnderRayWhilePointerDown = createMemo<THREE.Vector3 | undefined>((prev) => {
      if (!params.pointerDown) {
        return undefined;
      }
      let pt = pointUnderRay();
      if (pt == undefined) {
        return prev;
      }
      return pt;
    });
    let defaultColour = new THREE.Color("blue");
    let lastPt: THREE.Vector3 | undefined = undefined;
    createComputed(on(
      params.pointerDown,
      (pointerDown) => {
        if (!pointerDown) {
          return;
        }
        onCleanup(() => lastPt = undefined);
        createComputed(on(
          lastSeenPointUnderRayWhilePointerDown,
          (nextPt: THREE.Vector3 | undefined) => {
            if (nextPt == undefined) {
              return;
            }
            if (lastPt == undefined) {
              params.model.setCombineMode("Paint");
              params.model.addOperation({
                operationShape: {
                  type: "Ellipsoid",
                  radius: new THREE.Vector3().addScalar(0.5 * state.brushSize * 10.0),
                },
                origin: nextPt,
                orientation: new THREE.Quaternion(),
                softness: state.softness * state.brushSize * 10.0,
              });
              params.updatePaint();
              lastPt = nextPt;
            } else {
              if (lastPt.distanceTo(nextPt) < 15.0) {
                return;
              }
              params.model.setCombineMode("Paint");
              params.model.addOperation({
                operationShape: {
                  type: "Capsule",
                  lenX: lastPt.distanceTo(nextPt),
                  radius: 0.5 * state.brushSize * 10.0,
                },
                origin: lastPt.clone(),
                orientation: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), nextPt.clone().sub(lastPt).normalize()),
                softness: state.softness * state.brushSize * 10.0,
              });
              params.updatePaint();
              lastPt = nextPt;
            }
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
          End Paint Mode
        </button>
      </>
    );
    let disableOrbit = () => true;
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



