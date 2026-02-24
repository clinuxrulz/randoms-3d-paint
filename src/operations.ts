import * as THREE from "three";
import { BrickMap } from "./BrickMap";
import { ReaderHelper } from "./ReaderHelper";

export class Operations {
  operations: Operation[] = [];
  bvh: OperationBVH = new OperationBVH();
  dirtyRegion: THREE.Box3 = new THREE.Box3();
  combineMode: "Add" | "Subtract" | "Paint" = "Add";
  colour = new THREE.Color().setRGB(1,1,1);
  softness = 0.0;
  dirtyTrackingEnabled = true;

  private _tmpBBox = new THREE.Box3();

  async load(version: number, reader: ReaderHelper) {
    this.operations.splice(0, this.operations.length);
    this.bvh.clear();
    this.dirtyRegion.makeEmpty();
    let numOperations = await reader.readU32();
    for (let i = 0; i < numOperations; ++i) {
      let op = await loadOperation(version, i, reader);
      let bbox = this._tmpBBox;
      getOperationWorldBounds(op, bbox);
      this.dirtyRegion.union(bbox);
      this.operations.push(op);
      this.bvh.insert(op);
    }
  }

  async save(version: number, writer: WritableStreamDefaultWriter<BufferSource>) {
    let countBuffer = new Uint8Array(4);
    (new DataView(countBuffer.buffer)).setUint32(0, this.operations.length, true);
    await writer.write(countBuffer);
    for (let operation of this.operations) {
      await saveOperation(version, operation, writer);
    }
  }

  insertEllipsoid(
    origin: THREE.Vector3,
    orientation: THREE.Quaternion,
    radius: THREE.Vector3,
  ): void {
    let baseOp: BaseOperation = {
      index: this.operations.length,
      origin: new THREE.Vector3().copy(origin),
      orientation: new THREE.Quaternion().copy(orientation),
      operationShape: {
        type: "Ellipsoid",
        radius: new THREE.Vector3().copy(radius),
      },
      softness: this.softness,
    };
    let op: Operation;
    if (this.combineMode == "Paint") {
      op = {
        ...baseOp,
        combinedType: this.combineMode,
        colour: new THREE.Color().copy(this.colour),
        opacity: 1.0,
      };
    } else {
      op = {
        ...baseOp,
        combinedType: this.combineMode,
      };
    }
    let bbox = this._tmpBBox;
    getOperationWorldBounds(op, bbox);
    if (this.dirtyTrackingEnabled) {
      this.dirtyRegion.union(bbox);
    }
    this.operations.push(op);
    this.bvh.insert(op);
  }

  insertBox(
    origin: THREE.Vector3,
    orientation: THREE.Quaternion,
    len: THREE.Vector3,
  ): void {
    let baseOp: BaseOperation = {
      index: this.operations.length,
      origin: new THREE.Vector3().copy(origin),
      orientation: new THREE.Quaternion().copy(orientation),
      operationShape: {
        type: "Box",
        len: new THREE.Vector3().copy(len),
      },
      softness: this.softness,
    };
    let op: Operation;
    if (this.combineMode == "Paint") {
      op = {
        ...baseOp,
        combinedType: this.combineMode,
        colour: new THREE.Color().copy(this.colour),
        opacity: 1.0,
      };
    } else {
      op = {
        ...baseOp,
        combinedType: this.combineMode,
      };
    }
    let bbox = this._tmpBBox;
    getOperationWorldBounds(op, bbox);
    if (this.dirtyTrackingEnabled) {
      this.dirtyRegion.union(bbox);
    }
    this.operations.push(op);
    this.bvh.insert(op);
  }

  insertCapsule(
    origin: THREE.Vector3,
    orientation: THREE.Quaternion,
    lenX: number,
    radius: number,
  ): void {
    let baseOp: BaseOperation = {
      index: this.operations.length,
      origin: new THREE.Vector3().copy(origin),
      orientation: new THREE.Quaternion().copy(orientation),
      operationShape: {
        type: "Capsule",
        lenX,
        radius,
      },
      softness: this.softness,
    };
    let op: Operation;
    if (this.combineMode == "Paint") {
      op = {
        ...baseOp,
        combinedType: this.combineMode,
        colour: new THREE.Color().copy(this.colour),
        opacity: 1.0,
      };
    } else {
      op = {
        ...baseOp,
        combinedType: this.combineMode,
      };
    }
    let bbox = this._tmpBBox;
    getOperationWorldBounds(op, bbox);
    if (this.dirtyTrackingEnabled) {
      this.dirtyRegion.union(bbox);
    }
    this.operations.push(op);
    this.bvh.insert(op);
  }

  insertCapsulePointToPoint(
    pt1: THREE.Vector3,
    pt2: THREE.Vector3,
    radius: number,
  ): void {
    let lenX = pt1.distanceTo(pt2);
    let origin = pt1;
    let u = new THREE.Vector3().copy(pt2).sub(pt1).normalize();
    let ax = Math.abs(u.x);
    let ay = Math.abs(u.y);
    let az = Math.abs(u.z);
    let v: THREE.Vector3;
    {
      let w: THREE.Vector3;
      if (ax <= ay && ax <= az) {
        w = new THREE.Vector3(1.0, 0.0, 0.0);
      } else if (ay <= ax && ay <= az) {
        w = new THREE.Vector3(0.0, 1.0, 0.0);
      } else {
        w = new THREE.Vector3(0.0, 0.0, 1.0);
      }
      v = w.cross(u).normalize();
    }
    let w = new THREE.Vector3().copy(u).cross(v);
    let m = new THREE.Matrix4().makeBasis(u, v, w);
    let orientation = new THREE.Quaternion().setFromRotationMatrix(m);
    this.insertCapsule(
      origin,
      orientation,
      lenX,
      radius,
    );
  }

  updateBrickMap(brickMap: BrickMap): void {
    if (this.dirtyRegion.isEmpty()) {
      return;
    }
    /*
    let minXIdx = Math.floor(this.dirtyRegion.min.x / 10.0) + 512;
    let minYIdx = Math.floor(this.dirtyRegion.min.y / 10.0) + 512;
    let minZIdx = Math.floor(this.dirtyRegion.min.z / 10.0) + 512;
    let maxXIdx = Math.ceil(this.dirtyRegion.max.x / 10.0) + 512;
    let maxYIdx = Math.ceil(this.dirtyRegion.max.y / 10.0) + 512;
    let maxZIdx = Math.ceil(this.dirtyRegion.max.z / 10.0) + 512;
    */
    this.bvh.updateBrickMap(
      brickMap,
      this.dirtyRegion,
      /*
      minXIdx,
      minYIdx,
      minZIdx,
      maxXIdx,
      maxYIdx,
      maxZIdx,
      */
    );
    this.dirtyRegion.makeEmpty();
  }

  async* updateBrickMapAsyncGen(brickMap: BrickMap) {
    if (this.dirtyRegion.isEmpty()) {
      return;
    }
    yield* this.bvh.updateBrickMapAsyncGen(
      brickMap,
      this.dirtyRegion,
    );
    this.dirtyRegion.makeEmpty();
  }
}

type BaseOperation = {
  index: number;
  origin: THREE.Vector3;
  orientation: THREE.Quaternion;
  operationShape: OperationShape;
  softness: number;
};

export type Operation = BaseOperation & (
  | { combinedType: "Add" | "Subtract" }
  | { combinedType: "Paint"; colour: THREE.Color; opacity: number }
);

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

async function loadOperation(version: number, index: number, reader: ReaderHelper): Promise<Operation> {
  let combinedType = await reader.readU8();
  let combinedType2: Operation["combinedType"];
  switch (combinedType) {
    case 0:
      combinedType2 = "Add";
      break;
    case 1:
      combinedType2 = "Subtract";
      break;
    case 2:
      combinedType2 = "Paint";
      break;
    default:
      throw new Error("Invalid combined type");
  }
  let origin = new THREE.Vector3().set(
    await reader.readF32(),
    await reader.readF32(),
    await reader.readF32(),
  );
  let orientation = new THREE.Quaternion().set(
    await reader.readF32(),
    await reader.readF32(),
    await reader.readF32(),
    await reader.readF32(),
  );
  let operationShape = await loadOperationShape(version, reader);
  let softness = await reader.readF32();
  let baseOperation: BaseOperation = {
    index,
    origin,
    orientation,
    operationShape,
    softness,
  };
  let operation: Operation;
  if (combinedType2 == "Paint") {
    let colour = new THREE.Color().setRGB(
      (await reader.readU8()) / 255.0,
      (await reader.readU8()) / 255.0,
      (await reader.readU8()) / 255.0,
    );
    let opacity = (await reader.readU8()) / 255.0;
    operation = {
      ...baseOperation,
      combinedType: combinedType2,
      colour,
      opacity,
    };
  } else {
    operation = {
      ...baseOperation,
      combinedType: combinedType2,
    };
  }
  return operation;
}

async function loadOperationShape(version: number, reader: ReaderHelper): Promise<OperationShape> {
  let type = await reader.readU8();
  let type2: OperationShape["type"];
  switch (type) {
    case 0: {
      type2 = "Ellipsoid";
      let radius = new THREE.Vector3().set(
        await reader.readF32(),
        await reader.readF32(),
        await reader.readF32(),
      );
      return {
        type: type2,
        radius,
      };
    }
    case 1: {
      type2 = "Box";
      let len = new THREE.Vector3().set(
        await reader.readF32(),
        await reader.readF32(),
        await reader.readF32(),
      );
      return {
        type: type2,
        len,
      };
    }
    case 2: {
      type2 = "Capsule";
      let lenX = await reader.readF32();
      let radius = await reader.readF32();
      return {
        type: type2,
        lenX,
        radius,
      };
    }
    default:
      throw new Error("Invalid type");
  }
}

let _saveOperation_buffer = new Uint8Array(29);
let _saveOperation_dataView = new DataView(_saveOperation_buffer.buffer);
async function saveOperation(version: number, operation: Operation, writer: WritableStreamDefaultWriter<BufferSource>) {
  let buffer = _saveOperation_buffer;
  let dataView = _saveOperation_dataView;
  switch (operation.combinedType) {
    case "Add":
      dataView.setUint8(0, 0);
      break;
    case "Subtract":
      dataView.setUint8(0, 1);
      break;
    case "Paint":
      dataView.setUint8(0, 2);
      break;
  }
  dataView.setFloat32(1, operation.origin.x, true);
  dataView.setFloat32(5, operation.origin.y, true);
  dataView.setFloat32(9, operation.origin.z, true);
  dataView.setFloat32(13, operation.orientation.x, true);
  dataView.setFloat32(17, operation.orientation.y, true);
  dataView.setFloat32(21, operation.orientation.z, true);
  dataView.setFloat32(25, operation.orientation.w, true);
  await writer.write(buffer.subarray(0, 29));
  await saveOperationShape(version, operation.operationShape, writer);

  let softnessBuffer = new Uint8Array(4);
  let softnessDataView = new DataView(softnessBuffer.buffer);
  softnessDataView.setFloat32(0, operation.softness, true);
  await writer.write(softnessBuffer);

  if (operation.combinedType == "Paint") {
    let colourBuffer = new Uint8Array(4);
    let colourDataView = new DataView(colourBuffer.buffer);
    let red = Math.max(0, Math.min(255, Math.round(operation.colour.r * 255)));
    let green = Math.max(0, Math.min(255, Math.round(operation.colour.g * 255)));
    let blue = Math.max(0, Math.min(255, Math.round(operation.colour.b * 255)));
    let opacity = Math.max(0, Math.min(255, Math.round(operation.opacity * 255)));
    colourDataView.setUint8(0, red);
    colourDataView.setUint8(1, green);
    colourDataView.setUint8(2, blue);
    colourDataView.setUint8(3, opacity);
    await writer.write(colourBuffer);
  }
}

let _saveOperationShape_buffer = new Uint8Array(1+12);
let _saveOperationShape_dataView = new DataView(_saveOperationShape_buffer.buffer);
async function saveOperationShape(version: number, shape: OperationShape, writer: WritableStreamDefaultWriter<BufferSource>) {
  let buffer = _saveOperationShape_buffer;
  let dataView = _saveOperationShape_dataView;
  switch (shape.type) {
    case "Ellipsoid":
      dataView.setUint8(0, 0);
      dataView.setFloat32(1, shape.radius.x, true);
      dataView.setFloat32(5, shape.radius.y, true);
      dataView.setFloat32(9, shape.radius.z, true);
      await writer.write(buffer.subarray(0, 1+12));
      break;
    case "Box":
      dataView.setUint8(0, 1);
      dataView.setFloat32(1, shape.len.x, true);
      dataView.setFloat32(5, shape.len.y, true);
      dataView.setFloat32(9, shape.len.z, true);
      await writer.write(buffer.subarray(0, 1+12));
      break;
    case "Capsule":
      dataView.setUint8(0, 2);
      dataView.setFloat32(1, shape.lenX, true);
      dataView.setFloat32(5, shape.radius, true);
      await writer.write(buffer.subarray(0, 9));
      break;
  }
}

let _operationEvalSDF_pt = new THREE.Vector3();
let _operationEvalSDF_q = new THREE.Quaternion();
export function operationEvalSDF(operation: Operation, pt: THREE.Vector3): number {
  let q = _operationEvalSDF_q.copy(operation.orientation).conjugate();
  let pt2 = _operationEvalSDF_pt.copy(pt).sub(operation.origin).applyQuaternion(q);
  let shape = operation.operationShape;
  switch (shape.type) {
    case "Ellipsoid":
      return ellipsoidSDF(shape.radius, pt2);
    case "Box":
      return boxSDF(shape.len, pt2);
    case "Capsule":
      return capsuleSDF(shape.lenX, shape.radius, pt2);
  }
}

let _ellipsoidSDF_pt1 = new THREE.Vector3();
let _ellipsoidSDF_pt2 = new THREE.Vector3();
let _ellipsoidSDF_pt3 = new THREE.Vector3();
function ellipsoidSDF(radius: THREE.Vector3, pt: THREE.Vector3): number {
  let pt2 = _ellipsoidSDF_pt1.copy(pt).divide(radius);
  let rr = _ellipsoidSDF_pt2.copy(radius).multiply(radius);
  let pt3 = _ellipsoidSDF_pt3.copy(pt).divide(rr);
  let k1 = pt2.length();
  let k2 = pt3.length();
  return k1 * (k1 - 1.0) / k2;
}

let _boxSDF_b = new THREE.Vector3();
let _boxSDF_q = new THREE.Vector3();
function boxSDF(len: THREE.Vector3, pt: THREE.Vector3): number {
  let b = _boxSDF_b.copy(len).multiplyScalar(0.5);
  let q = _boxSDF_q.copy(pt);
  q.x = Math.abs(q.x);
  q.y = Math.abs(q.y);
  q.z = Math.abs(q.z);
  q.sub(b);
  let c = Math.min(Math.max(q.x, q.y, q.z), 0.0);
  q.x = Math.max(q.x, 0.0);
  q.y = Math.max(q.y, 0.0);
  q.z = Math.max(q.z, 0.0);
  return q.length() + c;
}

let _capsuleSDF_pt2 = new THREE.Vector3();
function capsuleSDF(lenX: number, radius: number, pt: THREE.Vector3): number {
  let pt2 = _capsuleSDF_pt2;
  pt2.x = Math.max(0.0, Math.min(lenX, pt.x));
  pt2.y = 0.0;
  pt2.z = 0.0;
  return pt.distanceTo(pt2) - radius;
}

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
  aabb.expandByScalar(operation.softness);
  out[0].set(aabb.min.x, aabb.min.y, aabb.min.z).applyQuaternion(operation.orientation).add(operation.origin);
  out[1].set(aabb.min.x, aabb.min.y, aabb.max.z).applyQuaternion(operation.orientation).add(operation.origin);
  out[2].set(aabb.min.x, aabb.max.y, aabb.min.z).applyQuaternion(operation.orientation).add(operation.origin);
  out[3].set(aabb.min.x, aabb.max.y, aabb.max.z).applyQuaternion(operation.orientation).add(operation.origin);
  out[4].set(aabb.max.x, aabb.min.y, aabb.min.z).applyQuaternion(operation.orientation).add(operation.origin);
  out[5].set(aabb.max.x, aabb.min.y, aabb.max.z).applyQuaternion(operation.orientation).add(operation.origin);
  out[6].set(aabb.max.x, aabb.max.y, aabb.min.z).applyQuaternion(operation.orientation).add(operation.origin);
  out[7].set(aabb.max.x, aabb.max.y, aabb.max.z).applyQuaternion(operation.orientation).add(operation.origin);
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
  out.min.x -= 20.0;
  out.min.y -= 20.0;
  out.min.z -= 20.0;
  out.max.x += 20.0;
  out.max.y += 20.0;
  out.max.z += 20.0;
}

function boxBoundingBox(len: THREE.Vector3, out: THREE.Box3) {
  out.min.copy(len).multiplyScalar(-0.5);
  out.max.copy(len).multiplyScalar(0.5);
  out.min.x -= 20.0;
  out.min.y -= 20.0;
  out.min.z -= 20.0;
  out.max.x += 20.0;
  out.max.y += 20.0;
  out.max.z += 20.0;
}

function capsuleBoundingBox(lenX: number, radius: number, out: THREE.Box3) {
  out.min.set(-radius, -radius, -radius);
  out.max.set(lenX + radius, radius, radius);
  out.min.x -= 20.0;
  out.min.y -= 20.0;
  out.min.z -= 20.0;
  out.max.x += 20.0;
  out.max.y += 20.0;
  out.max.z += 20.0;
}

let _getOperationWorldBounds_vertices: [
  THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3,
  THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3
] = [
  new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
  new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
];

export function getOperationWorldBounds(
  op: Operation,
  out: THREE.Box3,
) {
  out.makeEmpty();
  let vertices = _getOperationWorldBounds_vertices;
  operationCornerPoints(op, vertices);
  for (const v of vertices) {
    out.expandByPoint(v);
  }
}

type BVHNode = {
  bounds: THREE.Box3;
  parent: BVHNode | null;
  left: BVHNode | null;
  right: BVHNode | null;
   // Only non-null for leaf nodes
  operation: Operation | null;
};

export class OperationBVH {
  private root: BVHNode | null = null;
  private nodeMap = new Map<Operation, BVHNode>();

  constructor(initialOps: Operation[] = []) {
    for (const op of initialOps) {
      this.insert(op);
    }
  }

  clear() {
    this.root = null;
    this.nodeMap.clear();
  }

  insert(op: Operation) {
    let bounds = new THREE.Box3();
    getOperationWorldBounds(op, bounds);
    const newNode: BVHNode = {
      bounds,
      parent: null,
      left: null,
      right: null,
      operation: op
    };
    this.nodeMap.set(op, newNode);
    if (!this.root) {
      this.root = newNode;
      return;
    }
    let bestSibling = this.root;
    while (bestSibling.left && bestSibling.right) {
      const leftExpansion = this.getExpansionCost(bestSibling.left, bounds);
      const rightExpansion = this.getExpansionCost(bestSibling.right, bounds);
      bestSibling = leftExpansion < rightExpansion ? bestSibling.left : bestSibling.right;
    }
    const oldParent = bestSibling.parent;
    const newInternal: BVHNode = {
      bounds: new THREE.Box3().union(bestSibling.bounds).union(bounds),
      parent: oldParent,
      left: bestSibling,
      right: newNode,
      operation: null
    };
    bestSibling.parent = newInternal;
    newNode.parent = newInternal;
    if (oldParent) {
      if (oldParent.left === bestSibling) oldParent.left = newInternal;
      else oldParent.right = newInternal;
    } else {
      this.root = newInternal;
    }
    this.refitAncestors(newInternal);
  }

  remove(op: Operation) {
    const node = this.nodeMap.get(op);
    if (!node) return;
    this.nodeMap.delete(op);
    if (node === this.root) {
      this.root = null;
      return;
    }
    const parent = node.parent!;
    const sibling = parent.left === node ? parent.right! : parent.left!;
    const grandParent = parent.parent;
    if (grandParent) {
      if (grandParent.left === parent) grandParent.left = sibling;
      else grandParent.right = sibling;
      sibling.parent = grandParent;
      this.refitAncestors(grandParent);
    } else {
      this.root = sibling;
      sibling.parent = null;
    }
  }

  update(op: Operation) {
    const node = this.nodeMap.get(op);
    if (!node) return;
    let newBounds = new THREE.Box3();
    getOperationWorldBounds(op, newBounds);
    if (!node.bounds.containsBox(newBounds)) {
      this.remove(op);
      this.insert(op);
    }
  }

  query(aabb: THREE.Box3, result: Operation[] = []): Operation[] {
    if (this.root) this._queryRecursive(this.root, aabb, result);
    return result;
  }

  private _queryRecursive(node: BVHNode, aabb: THREE.Box3, result: Operation[]) {
    if (!node.bounds.intersectsBox(aabb)) return;
    if (node.operation) {
      if (isOperationPossiblyInAabb(node.operation, aabb)) {
        result.push(node.operation);
      }
    } else {
      if (node.left) this._queryRecursive(node.left, aabb, result);
      if (node.right) this._queryRecursive(node.right, aabb, result);
    }
  }

  private refitAncestors(node: BVHNode | null) {
    while (node) {
      node.bounds.copy(node.left!.bounds).union(node.right!.bounds);
      node = node.parent;
    }
  }

  private getExpansionCost(node: BVHNode, newBounds: THREE.Box3): number {
    const combined = new THREE.Box3().copy(node.bounds).union(newBounds);
    const size = new THREE.Vector3();
    combined.getSize(size);
    // Surface Area
    return 2 * (size.x * size.y + size.y * size.z + size.z * size.x);
  }

  private _evalSDF_pt = new THREE.Vector3();
  private _evalSDF_ptLocal = new THREE.Vector3();
  private _evalSDF_chunkAabb = new THREE.Box3();
  private _evalSDF_operations: Operation[] = [];
  private _evalSDF_invRotCache = new Map<number, THREE.Quaternion>();
  evalSDF_start(): void {
    this._evalSDF_chunkAabb.makeEmpty();
    this._evalSDF_operations = [];
    this._evalSDF_invRotCache.clear();
  }
  evalSDF(x: number, y: number, z: number): number {
    let pt = this._evalSDF_pt.set(x, y, z);
    let chunkAabb = this._evalSDF_chunkAabb;
    let chunkOps: Operation[];
    if (chunkAabb.containsPoint(pt)) {
      chunkOps = this._evalSDF_operations;
    } else {
      chunkAabb.min.copy(pt);
      chunkAabb.max.copy(pt);
      chunkAabb.expandByScalar(100.0);
      this._evalSDF_operations.splice(0, this._evalSDF_operations.length);
      this.query(chunkAabb, this._evalSDF_operations);
      this._evalSDF_operations.sort((a, b) => a.index - b.index);
      chunkOps = this._evalSDF_operations;
    }
    const invRotCache = this._evalSDF_invRotCache;
    const sqrt3 = Math.sqrt(3.0);
    for (const op of chunkOps) {
      if (!invRotCache.has(op.index)) {
        invRotCache.set(op.index, op.orientation.clone().conjugate());
      }
    }
    if (chunkOps.length == 0) {
      return 100.0;
    }
    let dist = Number.POSITIVE_INFINITY;
    let ptLocal = this._evalSDF_ptLocal;
    for (let op of chunkOps) {
      const qInv = invRotCache.get(op.index)!; ptLocal.copy(pt).sub(op.origin).applyQuaternion(qInv);
      let sdf = 0;
      switch (op.operationShape.type) {
        case "Ellipsoid":
          sdf = ellipsoidSDF(op.operationShape.radius, ptLocal);
          break;
        case "Box":
          sdf = boxSDF(op.operationShape.len, ptLocal);
          break;
        case "Capsule":
          sdf = capsuleSDF(op.operationShape.lenX, op.operationShape.radius, ptLocal);
          break;
      }
      switch (op.combinedType) {
        case "Add":
          if (op.softness == 0.0) {
            dist = Math.min(dist, sdf);
          } else {
            let k = op.softness * 4.0;
            let h = Math.max(k - Math.abs(dist - sdf), 0.0);
            dist = Math.min(dist, sdf) - h*h*0.25/k;
          }
          break;
        case "Subtract":
          if (op.softness == 0.0) {
            dist = Math.max(dist, -sdf);
          } else {
            // return -opSmoothUnion(a,-b,k);
            let a = sdf;
            let b = -dist;
            let k = op.softness * 4.0;
            let h = Math.max(k - Math.abs(a - b), 0.0);
            dist = -(Math.min(a, b) - h*h*0.25/k);
          }
          break;
        case "Paint":
          break;
      }
    }
    if (!Number.isFinite(dist)) {
      return 100.0;
    }
    return dist;
  }

  private _chunkAABB = new THREE.Box3();
  private _pt = new THREE.Vector3();
  private _ptLocal = new THREE.Vector3();
  updateBrickMap(brickMap: BrickMap, dirtyRegion: THREE.Box3): void {
    if (dirtyRegion.isEmpty()) {
      return;
    }
    let _chunkAABB = this._chunkAABB;
    let _pt = this._pt;
    let _ptLocal = this._ptLocal;
    const minXIdx = Math.floor(dirtyRegion.min.x / 10.0) + 512;
    const minYIdx = Math.floor(dirtyRegion.min.y / 10.0) + 512;
    const minZIdx = Math.floor(dirtyRegion.min.z / 10.0) + 512;
    const maxXIdx = Math.ceil(dirtyRegion.max.x / 10.0) + 512;
    const maxYIdx = Math.ceil(dirtyRegion.max.y / 10.0) + 512;
    const maxZIdx = Math.ceil(dirtyRegion.max.z / 10.0) + 512;
    const CHUNK_SIZE = 8;
    const chunkOps: Operation[] = [];
    const invRotCache = new Map<number, THREE.Quaternion>();
    const sqrt3 = Math.sqrt(3.0);
    for (let cz = minZIdx; cz < maxZIdx; cz += CHUNK_SIZE) {
      for (let cy = minYIdx; cy < maxYIdx; cy += CHUNK_SIZE) {
        for (let cx = minXIdx; cx < maxXIdx; cx += CHUNK_SIZE) {
          const cMaxX = Math.min(cx + CHUNK_SIZE, maxXIdx);
          const cMaxY = Math.min(cy + CHUNK_SIZE, maxYIdx);
          const cMaxZ = Math.min(cz + CHUNK_SIZE, maxZIdx);
          _chunkAABB.min.set((cx - 512) * 10.0, (cy - 512) * 10.0, (cz - 512) * 10.0);
          _chunkAABB.max.set((cMaxX - 512) * 10.0, (cMaxY - 512) * 10.0, (cMaxZ - 512) * 10.0);
          chunkOps.length = 0;
          this.query(_chunkAABB, chunkOps);
          chunkOps.sort((a, b) => a.index - b.index);
          if (chunkOps.length === 0) {
            for (let k = cz; k < cMaxZ; ++k) {
              for (let j = cy; j < cMaxY; ++j) {
                for (let i = cx; i < cMaxX; ++i) {
                  brickMap.set(i, j, k, 0);
                }
              }
            }
            continue;
          }
          for (const op of chunkOps) {
            if (!invRotCache.has(op.index)) {
              invRotCache.set(op.index, op.orientation.clone().conjugate());
            }
          }
          for (let k = cz; k < cMaxZ; ++k) {
            const atMinZ = (k - 512) * 10.0;
            for (let j = cy; j < cMaxY; ++j) {
              const atMinY = (j - 512) * 10.0;
              for (let i = cx; i < cMaxX; ++i) {
                const atMinX = (i - 512) * 10.0;
                _pt.set(atMinX, atMinY, atMinZ);
                let dist = Number.POSITIVE_INFINITY;
                let colour: THREE.Color | undefined = undefined;
                for (let op of chunkOps) {
                  const qInv = invRotCache.get(op.index)!; _ptLocal.copy(_pt).sub(op.origin).applyQuaternion(qInv);
                  let sdf = 0;
                  switch (op.operationShape.type) {
                    case "Ellipsoid":
                      sdf = ellipsoidSDF(op.operationShape.radius, _ptLocal);
                      break;
                    case "Box":
                      sdf = boxSDF(op.operationShape.len, _ptLocal);
                      break;
                    case "Capsule":
                      sdf = capsuleSDF(op.operationShape.lenX, op.operationShape.radius, _ptLocal);
                      break;
                  }
                  switch (op.combinedType) {
                    case "Add":
                      if (op.softness == 0.0) {
                        dist = Math.min(dist, sdf);
                      } else {
                        let k = op.softness * 4.0;
                        let h = Math.max(k - Math.abs(dist - sdf), 0.0);
                        dist = Math.min(dist, sdf) - h*h*0.25/k;
                      }
                      break;
                    case "Subtract":
                      if (op.softness == 0.0) {
                        dist = Math.max(dist, -sdf);
                      } else {
                        // return -opSmoothUnion(a,-b,k);
                        let a = sdf;
                        let b = -dist;
                        let k = op.softness * 4.0;
                        let h = Math.max(k - Math.abs(a - b), 0.0);
                        dist = -(Math.min(a, b) - h*h*0.25/k);
                      }
                      break;
                    case "Paint":
                      if (sdf <= 0.0) {
                        colour = op.colour ?? colour; 
                      }
                      break;
                  }
                }
                if (Number.isFinite(dist)) {
                  dist /= 10.0 * sqrt3;
                  let a = Math.max(1, Math.min(255, 128 - Math.floor(127.0 * dist)));
                  brickMap.set(i, j, k, a);
                } else {
                  brickMap.set(i, j, k, 0);
                }
                if (colour != undefined) {
                  brickMap.paint(
                    i, j, k,
                    Math.floor(colour.r * 255.0),
                    Math.floor(colour.g * 255.0),
                    Math.floor(colour.b * 255.0),
                  );
                }
              }
            }
          }
        }
      }
    }
    dirtyRegion.makeEmpty();
  }

  async* updateBrickMapAsyncGen(brickMap: BrickMap, dirtyRegion: THREE.Box3) {
    if (dirtyRegion.isEmpty()) {
      return;
    }
    let _chunkAABB = this._chunkAABB;
    let _pt = this._pt;
    let _ptLocal = this._ptLocal;
    const minXIdx = Math.floor(dirtyRegion.min.x / 10.0) + 512;
    const minYIdx = Math.floor(dirtyRegion.min.y / 10.0) + 512;
    const minZIdx = Math.floor(dirtyRegion.min.z / 10.0) + 512;
    const maxXIdx = Math.ceil(dirtyRegion.max.x / 10.0) + 512;
    const maxYIdx = Math.ceil(dirtyRegion.max.y / 10.0) + 512;
    const maxZIdx = Math.ceil(dirtyRegion.max.z / 10.0) + 512;
    const CHUNK_SIZE = 8;
    const chunkOps: Operation[] = [];
    const invRotCache = new Map<number, THREE.Quaternion>();
    const sqrt3 = Math.sqrt(3.0);
    let totalWork = maxZIdx - minZIdx + 1;
    for (let cz = minZIdx; cz < maxZIdx; cz += CHUNK_SIZE, yield { workDone: cz - minZIdx, totalWork, }) {
      for (let cy = minYIdx; cy < maxYIdx; cy += CHUNK_SIZE) {
        for (let cx = minXIdx; cx < maxXIdx; cx += CHUNK_SIZE) {
          const cMaxX = Math.min(cx + CHUNK_SIZE, maxXIdx);
          const cMaxY = Math.min(cy + CHUNK_SIZE, maxYIdx);
          const cMaxZ = Math.min(cz + CHUNK_SIZE, maxZIdx);
          _chunkAABB.min.set((cx - 512) * 10.0, (cy - 512) * 10.0, (cz - 512) * 10.0);
          _chunkAABB.max.set((cMaxX - 512) * 10.0, (cMaxY - 512) * 10.0, (cMaxZ - 512) * 10.0);
          chunkOps.length = 0;
          this.query(_chunkAABB, chunkOps);
          chunkOps.sort((a, b) => a.index - b.index);
          if (chunkOps.length === 0) {
            for (let k = cz; k < cMaxZ; ++k) {
              for (let j = cy; j < cMaxY; ++j) {
                for (let i = cx; i < cMaxX; ++i) {
                  brickMap.set(i, j, k, 0);
                }
              }
            }
            continue;
          }
          for (const op of chunkOps) {
            if (!invRotCache.has(op.index)) {
              invRotCache.set(op.index, op.orientation.clone().conjugate());
            }
          }
          for (let k = cz; k < cMaxZ; ++k) {
            const atMinZ = (k - 512) * 10.0;
            for (let j = cy; j < cMaxY; ++j) {
              const atMinY = (j - 512) * 10.0;
              for (let i = cx; i < cMaxX; ++i) {
                const atMinX = (i - 512) * 10.0;
                _pt.set(atMinX, atMinY, atMinZ);
                let dist = Number.POSITIVE_INFINITY;
                let colour: THREE.Color | undefined = undefined;
                for (let op of chunkOps) {
                  const qInv = invRotCache.get(op.index)!; _ptLocal.copy(_pt).sub(op.origin).applyQuaternion(qInv);
                  let sdf = 0;
                  switch (op.operationShape.type) {
                    case "Ellipsoid":
                      sdf = ellipsoidSDF(op.operationShape.radius, _ptLocal);
                      break;
                    case "Box":
                      sdf = boxSDF(op.operationShape.len, _ptLocal);
                      break;
                    case "Capsule":
                      sdf = capsuleSDF(op.operationShape.lenX, op.operationShape.radius, _ptLocal);
                      break;
                  }
                  switch (op.combinedType) {
                    case "Add":
                      if (op.softness == 0.0) {
                        dist = Math.min(dist, sdf);
                      } else {
                        let k = op.softness * 4.0;
                        let h = Math.max(k - Math.abs(dist - sdf), 0.0);
                        dist = Math.min(dist, sdf) - h*h*0.25/k;
                      }
                      break;
                    case "Subtract":
                      if (op.softness == 0.0) {
                        dist = Math.max(dist, -sdf);
                      } else {
                        // return -opSmoothUnion(a,-b,k);
                        let a = sdf;
                        let b = -dist;
                        let k = op.softness * 4.0;
                        let h = Math.max(k - Math.abs(a - b), 0.0);
                        dist = -(Math.min(a, b) - h*h*0.25/k);
                      }
                      break;
                    case "Paint":
                      if (sdf <= 0.0) {
                        colour = op.colour ?? colour; 
                      }
                      break;
                  }
                }
                if (Number.isFinite(dist)) {
                  dist /= 10.0 * sqrt3;
                  let a = Math.max(1, Math.min(255, 128 - Math.floor(127.0 * dist)));
                  brickMap.set(i, j, k, a);
                } else {
                  brickMap.set(i, j, k, 0);
                }
                if (colour != undefined) {
                  brickMap.paint(
                    i, j, k,
                    Math.floor(colour.r * 255.0),
                    Math.floor(colour.g * 255.0),
                    Math.floor(colour.b * 255.0),
                  );
                }
              }
            }
          }
        }
      }
    }
    dirtyRegion.makeEmpty();
  }
}
