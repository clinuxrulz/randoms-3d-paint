import { Accessor, batch, Component, createComputed, createMemo, Match, on, onCleanup, Switch } from "solid-js";
import * as THREE from "three";
import { Mode } from "./Mode";
import { ModeParams } from "./ModeParams";
import { createStore } from "solid-js/store";
import { NoTrack } from "../util";

type Primitive = "Sphere" | "Cube";

const INIT_CUBE_SIZE = 1500.0;
const INIT_SPHERE_RADIUS = 1000.0;

export class InsertPrimitivesMode implements Mode {
  readonly instructions: Component;
  readonly overlayObject3D: Accessor<THREE.Object3D | undefined>;
  readonly useTransformControlOnObject3D: Accessor<THREE.Object3D | undefined>;
  readonly onClick: () => void;

  constructor(params: ModeParams) {
    let [ state, setState, ] = createStore<{
      existingPrimitives: NoTrack<{
        object: THREE.Object3D,
        cleanup: () => void,
      }>[],
      movingExistingPrimitive: THREE.Object3D | undefined,
      insertingPrimitive: Primitive | undefined,
    }>({
      existingPrimitives: [],
      movingExistingPrimitive: undefined,
      insertingPrimitive: undefined,
    });
    onCleanup(() => {
      for (let primitive of state.existingPrimitives) {
        primitive.value.cleanup();
      }
      setState("existingPrimitives", []);
    });
    let insert = (primitive: Primitive) => {
      setState("insertingPrimitive", primitive);
    };
    let placeIt = () => {
      let primitive = threePrimitive();
      if (primitive != undefined) {
        primitive.autoCleanup = false;
        batch(() => {
          setState("insertingPrimitive", undefined);
          setState(
            "existingPrimitives",
            (x) => [
              ...x,
              new NoTrack({
                object: primitive.object,
                cleanup: primitive.cleanup,
              }),
            ],
          );
        });
      } else if (state.movingExistingPrimitive != undefined) {
        setState("movingExistingPrimitive", undefined);
      }
    };
    let finished = () => {
      params.endMode();
    };
    let threePrimitive = createMemo(on(
      () => state.insertingPrimitive,
      (primitive) => {
        if (primitive == undefined) {
          return undefined;
        }
        let geo: THREE.BufferGeometry;
        let mat = new THREE.MeshStandardMaterial({ color: "blue", });
        switch (primitive) {
          case "Cube": {
            geo = new THREE.BoxGeometry(INIT_CUBE_SIZE, INIT_CUBE_SIZE, INIT_CUBE_SIZE);
            break;
          }
          case "Sphere": {
            geo = new THREE.SphereGeometry(INIT_SPHERE_RADIUS);
            break;
          }
          default:
            throw new Error("Unreachable");
        }
        let mesh = new THREE.Mesh(geo, mat);
        let result = {
          autoCleanup: true,
          cleanup: () => {
            geo.dispose();
            mat.dispose();
          },
          object: mesh,
        };
        onCleanup(() => {
          if (result.autoCleanup) {
            result.cleanup();
          }
        });
        return result;
      },
    ));
    let instructions: Component = () => (
      <Switch>
        <Match when={state.insertingPrimitive == undefined && state.movingExistingPrimitive == undefined}>
          <div>
            <label
              class="label bg-base-100"
            >
              Select a primitive to insert, OR select an existing primitive on the screen to transform:
            </label>
          </div>
          <button
            class="btn btn-primary"
            onClick={() => insert("Sphere")}
          >
            Sphere
          </button>
          <button
            class="btn btn-primary ml-2"
            onClick={() => insert("Cube")}
          >
            Cube
          </button>
          <div>
            <label
              class="label bg-base-100"
            >
              Otherwise if your finish, press the I am finished button:
            </label>
          </div>
          <button
            class="btn btn-primary"
            onClick={() => finished()}
          >
            I am finished
          </button>
        </Match>
        <Match when={state.insertingPrimitive != undefined || state.movingExistingPrimitive != undefined}>
          <div>
            <label
              class="label bg-base-100"
            >
              Transform the primitive, then click place it:
            </label>
          </div>
          <button
            class="btn btn-primary"
            onClick={() => placeIt()}
          >
            Place It
          </button>
        </Match>
      </Switch>
    );
    let overlayObject3D = createMemo(() => {
      let currentPrimitive = threePrimitive()?.object;
      if (currentPrimitive == undefined && state.existingPrimitives.length == 0) {
        return undefined;
      }
      let group = new THREE.Group();
      if (currentPrimitive != undefined) {
        group.add(currentPrimitive);
      }
      for (let primitive of state.existingPrimitives) {
        group.add(primitive.value.object);
      }
      return group;
    });;
    let useTransformControlOnObject3D = createMemo(() => threePrimitive()?.object ?? state.movingExistingPrimitive);
    let onClick = () => {
      if (state.movingExistingPrimitive != undefined) {
        return;
      }
      if (state.insertingPrimitive != undefined) {
        return;
      }
      let pt = params.pointerPos();
      if (pt != undefined) {
        let existingPrimitiveSet = new Set<THREE.Object3D>();
        for (let primitive of state.existingPrimitives) {
          existingPrimitiveSet.add(primitive.value.object);
        }
        for (let object of params.getThreeObjectsUnderScreenCoords(pt)) {
          if (existingPrimitiveSet.has(object)) {
            setState("movingExistingPrimitive", object);
            break;
          }
        }
      }
    };
    //
    this.instructions = instructions;
    this.overlayObject3D = overlayObject3D;
    this.useTransformControlOnObject3D = useTransformControlOnObject3D;
    this.onClick = onClick;
  }
}
