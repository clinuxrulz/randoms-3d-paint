const MAX_BRICK_MAP_STORAGE = 1_000_000;

type BrickMapNode = number;

const UNDEFINED_NODE = 0;
const PARENT_NODE_OFFSET = 0;
const MIN_X_MIN_Y_MIN_Z_NODE_OFFSET = 1;
const MIN_X_MIN_Y_MAX_Z_NODE_OFFSET = 2;
const MIN_X_MAX_Y_MIN_Z_NODE_OFFSET = 3;
const MIN_X_MAX_Y_MAX_Z_NODE_OFFSET = 4;
const MAX_X_MIN_Y_MIN_Z_NODE_OFFSET = 5;
const MAX_X_MIN_Y_MAX_Z_NODE_OFFSET = 6;
const MAX_X_MAX_Y_MIN_Z_NODE_OFFSET = 7;
const MAX_X_MAX_Y_MAX_Z_NODE_OFFSET = 8;
const NODE_SIZE = 9; // size in Uint32s

let ROOT_BRICK_NODE: BrickMapNode = 0;

export class BrickMap {
  storage: Uint32Array = new Uint32Array(MAX_BRICK_MAP_STORAGE);
  freeIndex: number = NODE_SIZE;

  constructor() {
    // root node
    this.setMinXminYMinZNode(ROOT_BRICK_NODE, UNDEFINED_NODE);
    this.setMinXminYMaxZNode(ROOT_BRICK_NODE, UNDEFINED_NODE);
    this.setMinXmaxYMinZNode(ROOT_BRICK_NODE, UNDEFINED_NODE);
    this.setMinXmaxYMaxZNode(ROOT_BRICK_NODE, UNDEFINED_NODE);
    this.setMaxXminYMinZNode(ROOT_BRICK_NODE, UNDEFINED_NODE);
    this.setMaxXminYMaxZNode(ROOT_BRICK_NODE, UNDEFINED_NODE);
    this.setMaxXmaxYMinZNode(ROOT_BRICK_NODE, UNDEFINED_NODE);
    this.setMaxXmaxYMaxZNode(ROOT_BRICK_NODE, UNDEFINED_NODE);
  }

  parentNode(n: BrickMapNode): BrickMapNode | undefined {
    let result = this.storage[n + PARENT_NODE_OFFSET];
    return result == UNDEFINED_NODE ? undefined : result;
  }

  minXminYMinZNode(n: BrickMapNode): BrickMapNode | undefined {
    let result = this.storage[n + MIN_X_MIN_Y_MIN_Z_NODE_OFFSET];
    return result == UNDEFINED_NODE ? undefined : result;
  }

  minXminYMaxZNode(n: BrickMapNode): BrickMapNode | undefined {
    let result = this.storage[n + MIN_X_MIN_Y_MAX_Z_NODE_OFFSET];
    return result == UNDEFINED_NODE ? undefined : result;
  }

  minXmaxYMinZNode(n: BrickMapNode): BrickMapNode | undefined {
    let result = this.storage[n + MIN_X_MAX_Y_MIN_Z_NODE_OFFSET];
    return result == UNDEFINED_NODE ? undefined : result;
  }

  minXmaxYMaxZNode(n: BrickMapNode): BrickMapNode | undefined {
    let result = this.storage[n + MIN_X_MAX_Y_MAX_Z_NODE_OFFSET];
    return result == UNDEFINED_NODE ? undefined : result;
  }

  maxXminYMinZNode(n: BrickMapNode): BrickMapNode | undefined {
    let result = this.storage[n + MAX_X_MIN_Y_MIN_Z_NODE_OFFSET];
    return result == UNDEFINED_NODE ? undefined : result;
  }

  maxXminYMaxZNode(n: BrickMapNode): BrickMapNode | undefined {
    let result = this.storage[n + MAX_X_MIN_Y_MAX_Z_NODE_OFFSET];
    return result == UNDEFINED_NODE ? undefined : result;
  }

  maxXmaxYMinZNode(n: BrickMapNode): BrickMapNode | undefined {
    let result = this.storage[n + MAX_X_MAX_Y_MIN_Z_NODE_OFFSET];
    return result == UNDEFINED_NODE ? undefined : result;
  }

  maxXmaxYMaxZNode(n: BrickMapNode): BrickMapNode | undefined {
    let result = this.storage[n + MAX_X_MAX_Y_MAX_Z_NODE_OFFSET];
    return result == UNDEFINED_NODE ? undefined : result;
  }

  setParentNode(n: BrickMapNode, rhs: BrickMapNode | undefined) {
    this.storage[n + PARENT_NODE_OFFSET] = rhs ?? UNDEFINED_NODE;
  }

  setMinXminYMinZNode(n: BrickMapNode, rhs: BrickMapNode | undefined) {
    this.storage[n + MIN_X_MIN_Y_MIN_Z_NODE_OFFSET] = rhs ?? UNDEFINED_NODE;
  }

  setMinXminYMaxZNode(n: BrickMapNode, rhs: BrickMapNode | undefined) {
    this.storage[n + MIN_X_MIN_Y_MAX_Z_NODE_OFFSET] = rhs ?? UNDEFINED_NODE;
  }

  setMinXmaxYMinZNode(n: BrickMapNode, rhs: BrickMapNode | undefined) {
    this.storage[n + MIN_X_MAX_Y_MIN_Z_NODE_OFFSET] = rhs ?? UNDEFINED_NODE;
  }

  setMinXmaxYMaxZNode(n: BrickMapNode, rhs: BrickMapNode | undefined) {
    this.storage[n + MIN_X_MAX_Y_MAX_Z_NODE_OFFSET] = rhs ?? UNDEFINED_NODE;
  }

  setMaxXminYMinZNode(n: BrickMapNode, rhs: BrickMapNode | undefined) {
    this.storage[n + MAX_X_MIN_Y_MIN_Z_NODE_OFFSET] = rhs ?? UNDEFINED_NODE;
  }

  setMaxXminYMaxZNode(n: BrickMapNode, rhs: BrickMapNode | undefined) {
    this.storage[n + MAX_X_MIN_Y_MAX_Z_NODE_OFFSET] = rhs ?? UNDEFINED_NODE;
  }

  setMaxXmaxYMinZNode(n: BrickMapNode, rhs: BrickMapNode | undefined) {
    this.storage[n + MAX_X_MAX_Y_MIN_Z_NODE_OFFSET] = rhs ?? UNDEFINED_NODE;
  }

  setMaxXmaxYMaxZNode(n: BrickMapNode, rhs: BrickMapNode | undefined) {
    this.storage[n + MAX_X_MAX_Y_MAX_Z_NODE_OFFSET] = rhs ?? UNDEFINED_NODE;
  }
}
