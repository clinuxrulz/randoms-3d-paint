import * as THREE from "three";

export type Operation = {
  combinedType: "Add" | "Subtract",
  transform: THREE.Matrix4,
  operationShape: OperationShape,
};

export type OperationShape = {
  type: "Ellipsoid",
  radius: THREE.Vector3,
} | {
  type: "Box",
  len: THREE.Vector3,
} | {
  type: "Capsule",
  lenX: number,
  radius: number,
};

let _isOperationPossiblyInAabb_vertices: [
  THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3,
  THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3,
] = [
  new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
  new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
];
export function isOperationPossiblyInAabb(
  operation: Operation,
  aabb: THREE.Box3,
): boolean {
  let vertices = _isOperationPossiblyInAabb_vertices;
  operationCornerPoints(operation, vertices);
  {
    let hasLessThanMaxX = false;
    let hasMoreThanMinX = false;
    for (let i = 0; i < vertices.length; ++i) {
      let pt = vertices[i];
      if (pt.x < aabb.max.x) {
        hasLessThanMaxX = true;
      }
      if (pt.x > aabb.min.x) {
        hasMoreThanMinX = true;
      }
    }
    if (!(hasLessThanMaxX && hasMoreThanMinX)) {
      return false;
    }
  }
  {
    let hasLessThanMaxY = false;
    let hasMoreThanMinY = false;
    for (let i = 0; i < vertices.length; ++i) {
      let pt = vertices[i];
      if (pt.y < aabb.max.y) {
        hasLessThanMaxY = true;
      }
      if (pt.y > aabb.min.y) {
        hasMoreThanMinY = true;
      }
    }
    if (!(hasLessThanMaxY && hasMoreThanMinY)) {
      return false;
    }
  }
  {
    let hasLessThanMaxZ = false;
    let hasMoreThanMinZ = false;
    for (let i = 0; i < vertices.length; ++i) {
      let pt = vertices[i];
      if (pt.z < aabb.max.z) {
        hasLessThanMaxZ = true;
      }
      if (pt.z > aabb.min.z) {
        hasMoreThanMinZ = true;
      }
    }
    if (!(hasLessThanMaxZ && hasMoreThanMinZ)) {
      return false;
    }
  }
  return true;
}

let _operationCornerPoints_aabb = new THREE.Box3();
export function operationCornerPoints(
  operation: Operation,
  out: [
    THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3,
    THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3,
  ],
) {
  let shape = operation.operationShape;
  let aabb = _operationCornerPoints_aabb;
  operationShapeBoundingBox(shape, aabb);
  out[0].set(aabb.min.x, aabb.min.y, aabb.min.z).applyMatrix4(operation.transform);
  out[1].set(aabb.min.x, aabb.min.y, aabb.max.z).applyMatrix4(operation.transform);
  out[2].set(aabb.min.x, aabb.max.y, aabb.min.z).applyMatrix4(operation.transform);
  out[3].set(aabb.min.x, aabb.max.y, aabb.max.z).applyMatrix4(operation.transform);
  out[4].set(aabb.max.x, aabb.min.y, aabb.min.z).applyMatrix4(operation.transform);
  out[5].set(aabb.max.x, aabb.min.y, aabb.max.z).applyMatrix4(operation.transform);
  out[6].set(aabb.max.x, aabb.max.y, aabb.min.z).applyMatrix4(operation.transform);
  out[7].set(aabb.max.x, aabb.max.y, aabb.max.z).applyMatrix4(operation.transform);
}

export function operationShapeBoundingBox(shape: OperationShape, out: THREE.Box3) {
  switch (shape.type) {
    case "Ellipsoid":
      return ellipsoidBoundingBox(shape.radius, out);
    case "Box":
      return boxBoundingBox(shape.len, out);
    case "Capsule":
      return capsuleBoundingBox(shape.lenX, shape.radius, out);
  }
}

function ellipsoidBoundingBox(radius: THREE.Vector3, out: THREE.Box3) {
  out.min.copy(radius).multiplyScalar(-1.0);
  out.max.copy(radius);
}

function boxBoundingBox(len: THREE.Vector3, out: THREE.Box3) {
  out.min.copy(len).multiplyScalar(-0.5);
  out.max.copy(len).multiplyScalar(0.5);
}

function capsuleBoundingBox(lenX: number, radius: number, out: THREE.Box3) {
  out.min.set(-radius, -radius, -radius);
  out.max.set(lenX + radius, radius, radius);
}
