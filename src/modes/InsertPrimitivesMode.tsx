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
        primitive: Primitive,
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
                primitive: primitive.primitive,
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
      let sdfs: ((p: THREE.Vector3) => number)[] = [];
      for (let primitive of state.existingPrimitives) {
        let primitive2 = primitive.value;
        let object = primitive2.object;
        let origin = new THREE.Vector3();
        let orientation = new THREE.Quaternion();
        let scale = new THREE.Vector3();
        object.matrix.decompose(
          origin,
          orientation,
          scale,
        );
        let sdf: (p: THREE.Vector3) => number;
        let q = new THREE.Quaternion();
        q.copy(orientation);
        q.conjugate();
        if (primitive2.primitive == "Sphere") {
          let r = new THREE.Vector3(INIT_SPHERE_RADIUS, INIT_SPHERE_RADIUS, INIT_SPHERE_RADIUS).multiply(scale);
          let p2 = new THREE.Vector3();
          let p3 = new THREE.Vector3();
          let rr = new THREE.Vector3().copy(r).multiply(r);
          /*
          float sdbEllipsoidV2( in vec3 p, in vec3 r )
          {
            float k1 = length(p/r);
            float k2 = length(p/(r*r));
            return k1*(k1-1.0)/k2;
          }
          */
          sdf = (p: THREE.Vector3) => {
            p2.copy(p);
            p2.sub(origin);
            p2.applyQuaternion(q);
            p3.copy(p2);
            p2.divide(r);
            p3.divide(rr);
            let k1 = p2.length();
            let k2 = p3.length();
            return k1 * (k1 - 1.0) / k2;
          };
        } else {
          let b = new THREE.Vector3(INIT_CUBE_SIZE, INIT_CUBE_SIZE, INIT_CUBE_SIZE).multiply(scale).multiplyScalar(0.5);
          let p2 = new THREE.Vector3();
          let q2 = new THREE.Vector3();
          /*
          float sdBox( vec3 p, vec3 b )
          {
            vec3 q = abs(p) - b;
            return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
          }
          */
          sdf = (p: THREE.Vector3) => {
            p2.copy(p);
            p2.sub(origin);
            p2.applyQuaternion(q);
            q2.copy(p2);
            q2.x = Math.abs(q2.x);
            q2.y = Math.abs(q2.y);
            q2.z = Math.abs(q2.z);
            q2.sub(b);
            let c = Math.min(Math.max(q2.x, q2.y, q2.z), 0.0);
            q2.x = Math.max(q2.x, 0.0);
            q2.y = Math.max(q2.y, 0.0);
            q2.z = Math.max(q2.z, 0.0);
            return q2.length() + c;
          };
        }
        sdfs.push(sdf);
      }
      let sdf = (p: THREE.Vector3) => {
        let d = sdfs[0](p);
        for (let i = 1; i < sdfs.length; ++i) {
          d = Math.min(d, sdfs[i](p));
        }
        return d;
      };
      let boundingBox = new THREE.Box3();
      {
        let first = true;
        let boundingBox2 = new THREE.Box3();
        for (let primitive of state.existingPrimitives) {
          let object = primitive.value.object;
          if (object instanceof THREE.Mesh) {
            if (object.geometry instanceof THREE.BufferGeometry) {
              object.geometry.computeBoundingBox();
            }
          }
          boundingBox2.setFromObject(object);
          if (first) {
            boundingBox.copy(boundingBox2);
            first = false;
          } else {
            boundingBox.union(boundingBox2);
          }
        }
      }
      let sqrt_3 = Math.sqrt(3);
      let p = new THREE.Vector3();
      let minI = Math.max(0, 512 + Math.floor(boundingBox.min.z / 10.0)) - 1;
      let maxI = Math.min(1023, 512 + Math.ceil(boundingBox.max.z / 10.0)) + 1;
      let minJ = Math.max(0, 512 + Math.floor(boundingBox.min.y / 10.0)) - 1;
      let maxJ = Math.min(1023, 512 + Math.ceil(boundingBox.max.y / 10.0)) + 1;
      let minK = Math.max(0, 512 + Math.floor(boundingBox.min.x / 10.0)) - 1;
      let maxK = Math.min(1023, 512 + Math.ceil(boundingBox.max.x / 10.0)) + 1;
      for (let i = minI; i <= maxI; ++i) {
        let z = (i - 512) * 10.0;
        for (let j = minJ; j <= maxJ; ++j) {
          let y = (j - 512) * 10.0;
          for (let k = minK; k <= maxK; ++k) {
            let x = (k - 512) * 10.0;
            p.set(x, y, z);
            let d = sdf(p) / (10.0 * sqrt_3);
            if (d < -1.0 || d > 1.0) {
              continue;
            }
            let val = 128 - Math.floor(Math.max(-1, Math.min(1, d)) * 127);
            if (val < 1) val = 1; 
            if (val > 255) val = 255;
            params.brickMap.set(
              k,
              j,
              i,
              val,
            );
          }
        }
      }
      params.updateSdf();
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
          primitive,
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
