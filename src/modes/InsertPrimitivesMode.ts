import { Accessor, createMemo, onCleanup } from "solid-js";
import * as THREE from "three";
import { Mode } from "./Mode";
import { ModeParams } from "./ModeParams";

export class InsertPrimitivesMode implements Mode {
  overlayObject3D: Accessor<THREE.Object3D | undefined>;

  constructor(params: ModeParams) {
    //
    this.overlayObject3D = createMemo(() => {
      let geo = new THREE.BoxGeometry(1500,1500,1500);
      let mat = new THREE.MeshStandardMaterial({
        color: "blue",
      });
      onCleanup(() => {
        geo.dispose();
        mat.dispose();
      });
      return new THREE.Mesh(geo, mat);
    });
  }
}
