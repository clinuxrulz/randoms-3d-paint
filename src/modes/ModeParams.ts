import { Accessor } from "solid-js";
import * as THREE from "three";
import { AsyncSdfModel } from "../AsyncSdfModel";

export type ModeParams = {
  endMode: () => void,
  model: AsyncSdfModel,
  canvasSize: Accessor<THREE.Vector2 | undefined>,
  pointerPos: Accessor<THREE.Vector2 | undefined>,
  pointerDown: Accessor<boolean>,
  currentColour: Accessor<THREE.Color | undefined>,
  updateSdf: () => Promise<void>,
  updatePaint: () => Promise<void>,
  rerender: () => void,
  screenCoordsToRay: (screenCoords: THREE.Vector2, out_ray: THREE.Ray) => void,
  getThreeObjectsUnderScreenCoords: (screenCoords: THREE.Vector2) => Generator<THREE.Object3D>,
};
