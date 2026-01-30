import { Accessor } from "solid-js";
import * as THREE from "three";
import { BrickMap } from "../BrickMap";

export type ModeParams = {
  endMode: () => void,
  brickMap: BrickMap,
  canvasSize: Accessor<THREE.Vector2 | undefined>,
  pointerPos: Accessor<THREE.Vector2 | undefined>,
  pointerDown: Accessor<boolean>,
  updateSdf: () => void,
  getThreeObjectsUnderScreenCoords: (screenCoords: THREE.Vector2) => Generator<THREE.Object3D>,
};
