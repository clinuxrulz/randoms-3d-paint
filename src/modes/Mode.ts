import { Accessor, Component } from "solid-js";
import * as THREE from "three";

export interface Mode {
  readonly instructions?: Component;
  readonly disableOrbit?: Accessor<boolean>;
  readonly overlayObject3D?: Accessor<THREE.Object3D | undefined>;
  readonly useTransformControlOnObject3D?: Accessor<THREE.Object3D | undefined>;
  readonly onClick?: () => void;
}
