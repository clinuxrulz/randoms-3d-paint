import { Accessor } from "solid-js";
import * as THREE from "three";
import { BrickMap } from "../BrickMap";
import { Operations } from "../operations";

export type ModeParams = {
  endMode: () => void,
  operations: Operations,
  brickMap: BrickMap,
  canvasSize: Accessor<THREE.Vector2 | undefined>,
  pointerPos: Accessor<THREE.Vector2 | undefined>,
  pointerDown: Accessor<boolean>,
  currentColour: Accessor<THREE.Color | undefined>,
  updateSdf: () => void,
  updatePaint: () => void,
  rerender: () => void,
  screenCoordsToRay: (screenCoords: THREE.Vector2, out_ray: THREE.Ray) => void,
  getThreeObjectsUnderScreenCoords: (screenCoords: THREE.Vector2) => Generator<THREE.Object3D>,
};
