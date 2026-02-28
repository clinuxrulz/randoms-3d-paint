import { Accessor, Component, createRenderEffect, createMemo, onCleanup, untrack } from "solid-js";
import * as THREE from "three";
import { Mode } from "./Mode";
import { ModeParams } from "./ModeParams";

import { createStore } from "solid-js";
import { throttle } from "../util";
import { BrickMap } from "../BrickMap";

export class SculptMode implements Mode {
  instructions: Component;
  disableOrbit: Accessor<boolean>;
  overlayObject3D: Accessor<THREE.Object3D<THREE.Object3DEventMap> | undefined>;

  constructor(params: ModeParams) {
    const throttledUpdateSdf = throttle(params.updateSdf, 50);
    let [ state, setState, ] = createStore<{
      brushSize: number,
      softness: number,
      isNegativeBrush: boolean,
    }>({
      brushSize: 8,
      softness: 0.0,
      isNegativeBrush: true,
    });
    let virtualBrickMap = new BrickMap().copy(params.model.brickMap);
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
    let lastSeenPoiuntUnderRayWhilePointerDown = createMemo<THREE.Vector3 | undefined>((prev) => {
      if (!params.pointerDown()) {
        return undefined;
      }
      let pt = pointUnderRay();
      if (pt == undefined) {
        return prev;
      }
      return pt;
    });
    let lastPt: THREE.Vector3 | undefined = undefined;
    createRenderEffect(
      () => params.pointerDown(),
      (pointerDown) => {
        if (!pointerDown) {
          virtualBrickMap.copy(params.model.brickMap);
          return;
        }
        onCleanup(() => lastPt = undefined);
        createRenderEffect(
          () => lastSeenPoiuntUnderRayWhilePointerDown(),
          (nextPt: THREE.Vector3 | undefined) => {
            if (nextPt == undefined) {
              return;
            }
            if (lastPt == undefined) {
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
                origin: nextPt,
                orientation: new THREE.Quaternion(),
                softness: state.softness * state.brushSize * 10.0,
                dirtyTrackingEnabled: state.softness !== 0.0,
              });
              params.model.setSoftness(0.0); // Reset softness after operation
              // Always call directDraw if softness is 0.0
              if (state.softness === 0.0) {
                params.model.directDraw({
                  pt: nextPt,
                  negative: state.isNegativeBrush,
                  brushSize: state.brushSize,
                });
              }

              // Conditionally update SDF
              if (state.softness === 0.0) {
                params.updateSdf(); // Direct update for zero softness
              } else {
                throttledUpdateSdf(); // Throttled update for softness > 0
              }
              lastPt = nextPt;
            } else {
              if (lastPt.distanceTo(nextPt) < 15.0) {
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
                  lenX: lastPt.distanceTo(nextPt),
                  radius: 0.5 * (state.brushSize - 4.0*state.softness) * 10.0,
                },
                origin: lastPt.clone(),
                orientation: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), nextPt.clone().sub(lastPt).normalize()),
                softness: state.softness * state.brushSize * 10.0,
                dirtyTrackingEnabled: state.softness !== 0.0,
              });
              params.model.setSoftness(0.0); // Reset softness after operation
              // Always call directStroke if softness is 0.0
              if (state.softness === 0.0) {
                params.model.directStroke({
                  p1: lastPt.clone(),
                  p2: nextPt,
                  negative: state.isNegativeBrush,
                  brushSize: state.brushSize,
                });
              }

              // Conditionally update SDF
              if (state.softness === 0.0) {
                params.updateSdf(); // Direct update for zero softness
              } else {
                throttledUpdateSdf(); // Throttled update for softness > 0
              }
              lastPt = nextPt;
            }
          }
        );
      },
    );
    let geo = new THREE.SphereGeometry(0.5 * untrack(() => state.brushSize) * 10.0);
    let mat = new THREE.MeshStandardMaterial({ color: "blue", });
    let mesh = new THREE.Mesh(geo, mat);
    createRenderEffect(
      () => state.brushSize,
      (brushSize) => {
        geo.dispose();
        geo = new THREE.SphereGeometry(0.5 * brushSize * 10.0);
        mesh = new THREE.Mesh(geo, mat);
        params.rerender();
      },
    );
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
                  setState((s) => { s.isNegativeBrush = true });
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
                  setState((s) => { s.isNegativeBrush = false });
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
              setState((s) => { s.brushSize = x });
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
              setState((s) => { s.softness = x });
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
    let disableOrbit = createMemo(() => true || pointUnderRay() != undefined);
    let overlayObject3D = createMemo(() => {
      let pt = pointUnderRay();
      if (pt == undefined) {
        params.rerender();
        return undefined;
      }
      mesh.position.copy(pt);
      mesh.updateMatrix();
      mesh.matrixWorldNeedsUpdate = true;
      return mesh;
    });
    //
    this.instructions = instructions;
    this.disableOrbit = disableOrbit;
    this.overlayObject3D = overlayObject3D;
  }
}



