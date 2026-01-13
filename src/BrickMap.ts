type BrickMapNode = number;
type BrickMapBrick = number;

/**
 * size in Uint32s
 * first is the parent pointer
 * next 8 are the child pointers
 */
const NODE_SIZE = 9;

const MAX_NODES = 100_000;
const MAX_BRICKS = 10_000;

const MAX_DEPTH = 10;
const BRICK_DEPTH = 3;
const STOP_DEPTH = MAX_DEPTH - BRICK_DEPTH;
const BRICK_DIM = (1 << BRICK_DEPTH);
const BRICK_SIZE = BRICK_DIM * BRICK_DIM * BRICK_DIM;
const RES_XYZ = 1 << (MAX_DEPTH - 1);

let ROOT_BRICK_NODE: BrickMapNode = 0;

export class BrickMap {
  nodes: Uint32Array = new Uint32Array(MAX_NODES * NODE_SIZE);
  brickParents: Uint32Array = new Uint32Array(MAX_BRICKS);
  bricks: Uint8Array = new Uint8Array(MAX_BRICKS * BRICK_SIZE);
  nodeFreeIndex: number = NODE_SIZE;
  brickFreeIndex: number = 0;

  set(xIdx: number, yIdx: number, zIdx: number, value: number) {
    this.set2(ROOT_BRICK_NODE, xIdx, yIdx, zIdx, 1, RES_XYZ, value);
  }

  get(xIdx: number, yIdx: number, zIdx: number): number {
    return this.get2(ROOT_BRICK_NODE, xIdx, yIdx, zIdx, 1, RES_XYZ);
  }

  private set2(atNode: BrickMapNode, xIdx: number, yIdx: number, zIdx: number, level: number, res: number, value: number) {
    let halfRes = res >> 1;
    let halfResMask = halfRes - 1;
    let childOffset = this.getChildOffset(xIdx, yIdx, zIdx, halfRes);
    if (level == STOP_DEPTH) {
      let brick: BrickMapBrick = this.nodes[atNode + childOffset];
      if (brick == 0 && value == 0) {
        return;
      }
      if (brick == 0) {
        brick = this.allocBrick();
        this.bricks[brick] = atNode;
        this.nodes[atNode + childOffset] = brick;
      }
      this.writeToBrick(brick, xIdx & halfResMask, yIdx & halfResMask, zIdx & halfResMask, value);
      if (value === 0) {
        if (this.isBrickEmpty(brick)) {
          this.freeBrick(brick);
        }
      }
    } else {
      let node: BrickMapNode = this.nodes[atNode + childOffset];
      if (node == 0 && value == 0) {
        return;
      }
      if (node == 0) {
        node = this.allocNode();
        this.nodes[node] = atNode;
        this.nodes[atNode + childOffset] = node;
      }
      this.set2(node, xIdx & halfResMask, yIdx & halfResMask, zIdx & halfResMask, level + 1, halfRes, value);
      if (value === 0) {
        if (this.isNodeEmpty(node)) {
          this.freeNode(node);
        }
      }
    }
  }

  private get2(atNode: BrickMapNode, xIdx: number, yIdx: number, zIdx: number, level: number, res: number): number {
    let halfRes = res >> 1;
    let halfResMask = halfRes - 1;
    let childOffset = this.getChildOffset(xIdx, yIdx, zIdx, halfRes);
    if (level == STOP_DEPTH) {
      let brick: BrickMapBrick = this.nodes[atNode + childOffset];
      if (brick == 0) {
        return 0;
      }
      if (brick == 0) {
        brick = this.allocBrick();
        this.bricks[brick] = atNode;
        this.nodes[atNode + childOffset] = brick;
      }
      return this.readFromBrick(brick, xIdx & halfResMask, yIdx & halfResMask, zIdx & halfResMask);
    } else {
      let node: BrickMapNode = this.nodes[atNode + childOffset];
      if (node == 0) {
        return 0;
      }
      return this.get2(node, xIdx & halfResMask, yIdx & halfResMask, zIdx & halfResMask, level + 1, halfRes);
    }
  }

  private writeToBrick(brick: BrickMapBrick, xIdx: number, yIdx: number, zIdx: number, value: number) {
    const localIdx = xIdx + (yIdx * BRICK_DIM) + (zIdx * BRICK_DIM * BRICK_DIM);
    this.bricks[(brick - 1) * BRICK_SIZE + localIdx] = value;
  }

  private readFromBrick(brick: BrickMapBrick, xIdx: number, yIdx: number, zIdx: number) {
    const localIdx = xIdx + (yIdx * BRICK_DIM) + (zIdx * BRICK_DIM * BRICK_DIM);
    return this.bricks[(brick - 1) * BRICK_SIZE + localIdx];
  }

  private allocBrick(): BrickMapBrick {
    let brick: BrickMapBrick = this.brickFreeIndex++;
    this.brickParents[(brick - 1)] = 0;
    let offset = (brick - 1) * BRICK_SIZE;
    for (let i = 0; i < BRICK_SIZE; ++i) {
      this.bricks[offset + i] = 0;
    }
    return brick;
  }

  private allocNode(): BrickMapNode {
    let node: BrickMapNode = this.nodeFreeIndex;
    this.nodeFreeIndex += NODE_SIZE;
    for (let i = 0; i < NODE_SIZE; ++i) {
      this.nodes[node + i] = 0;
    }
    return node;
  }

  private isBrickEmpty(brick: BrickMapBrick): boolean {
    let offset = (brick - 1) * BRICK_SIZE;
    for (let i = 0; i < BRICK_SIZE; i++) {
      if (this.bricks[offset + i] !== 0) {
        return false;
      }
    }
    return true;
  }

  private isNodeEmpty(node: BrickMapNode) {
    for (let i = 1; i <= 8; ++i) {
      if (this.nodes[node + i] !== 0) {
        return false;
      }
    }
    return true;
  }

  private freeBrick(brick: BrickMapBrick) {
    {
      let parent = this.brickParents[brick - 1];
      if (parent !== 0) {
        for (let i = 1; i <= 8; ++i) {
          if (this.nodes[parent + i] === brick) {
            this.nodes[parent + i] = 0;
          }
        }
      }
    }
    if (this.brickFreeIndex > 1) {
      let parent = this.brickParents[this.brickFreeIndex - 1];
      this.brickParents[brick - 1] = parent;
      let offsetDst = (brick - 1) * BRICK_SIZE;
      let offsetSrc = (this.brickFreeIndex - 1) * BRICK_SIZE;
      for (let i = 0; i < BRICK_SIZE; ++i) {
        this.bricks[offsetDst + i] = this.bricks[offsetSrc + i];
      }
      for (let i = 1; i <= 8; ++i) {
        if (this.nodes[parent + i] == this.brickFreeIndex) {
          this.nodes[parent + i] = brick;
        }
      }
      this.brickFreeIndex--;
    }
  }

  private freeNode(node: BrickMapNode) {
    {
      let parent = this.nodes[node];
      if (parent !== 0) {
        for (let i = 1; i <= 8; ++i) {
          if (this.nodes[parent + i] === node) {
            this.nodes[parent + i] = 0;
          }
        }
      }
    }
    if (this.nodeFreeIndex > (NODE_SIZE << 1)) {
      let offsetSrc = this.nodeFreeIndex - NODE_SIZE;
      let parent = this.nodes[offsetSrc];
      for (let i = 0; i <= 8; ++i) {
        this.nodes[node + i] = this.nodes[offsetSrc + i];
      }
      for (let i = 1; i <= 8; ++i) {
        if (this.nodes[parent + i] === offsetSrc) {
          this.nodes[parent + i] = node;
        }
      }
    }
  }

  private getChildOffset(xIdx: number, yIdx: number, zIdx: number, halfRes: number): number {
    let off = 1;
    if (xIdx >= halfRes) off += 4;
    if (yIdx >= halfRes) off += 2;
    if (zIdx >= halfRes) off += 1;
    return off;
  }
}
