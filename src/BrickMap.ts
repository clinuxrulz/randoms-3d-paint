type BrickMapNode = number;
type BrickMapBrick = number;

/**
 * size in Uint32s
 * first is the parent pointer
 * next 8 are the child pointers
 */
const NODE_SIZE = 9;

const TEXTURE_RES = 2048;

const MAX_NODES = 2_000_000;
const MAX_BRICKS = 40_000;

const MAX_DEPTH = 11;
const BRICK_DEPTH = 3;
const BRICK_DIM = (1 << BRICK_DEPTH);
const BRICK_SIZE = BRICK_DIM * BRICK_DIM * BRICK_DIM;
const RES_XYZ = 1 << (MAX_DEPTH - 1);

let ROOT_BRICK_NODE: BrickMapNode = 0;

export class BrickMap {
  private nodes: Uint32Array = new Uint32Array(MAX_NODES * NODE_SIZE);
  private brickParents: Uint32Array = new Uint32Array(MAX_BRICKS);
  private bricks: Uint32Array = new Uint32Array(MAX_BRICKS * BRICK_SIZE);
  private nodeFreeIndex: number = NODE_SIZE;
  private brickFreeIndex: number = 0;

  get numNodes(): number {
    return this.nodeFreeIndex / NODE_SIZE;
  }

  get numBricks(): number {
    return this.brickFreeIndex;
  }

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
    if (halfRes === BRICK_DIM) {
      let brick: BrickMapBrick = this.nodes[atNode + childOffset];
      if (brick == 0 && value == 0) {
        return;
      }
      if (brick == 0) {
        brick = this.allocBrick();
        this.brickParents[brick - 1] = atNode;
        this.nodes[atNode + childOffset] = brick;
      }
      this.writeToBrick(brick, xIdx & halfResMask, yIdx & halfResMask, zIdx & halfResMask, value);
      if (value === 0) {
        if (this.isBrickEmpty(brick)) {
          this.freeBrick(brick);
          this.nodes[atNode + childOffset] = 0;
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
          this.nodes[atNode + childOffset] = 0;
        }
      }
    }
  }

  private get2(atNode: BrickMapNode, xIdx: number, yIdx: number, zIdx: number, level: number, res: number): number {
    let halfRes = res >> 1;
    let halfResMask = halfRes - 1;
    let childOffset = this.getChildOffset(xIdx, yIdx, zIdx, halfRes);
    if (halfRes === BRICK_DIM) {
      let brick: BrickMapBrick = this.nodes[atNode + childOffset];
      if (brick == 0) {
        return 0;
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
    let brick: BrickMapBrick = ++this.brickFreeIndex;
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
    this.brickParents[brick - 1] = 0;
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
    }
    this.brickFreeIndex--;
  }

  private freeNode(node: BrickMapNode) {
    this.nodes[node] = 0;
    if (this.nodeFreeIndex > NODE_SIZE) {
      let offsetSrc = this.nodeFreeIndex - NODE_SIZE;
      let parent = this.nodes[offsetSrc];
      this.nodes[node] = parent;
      for (let i = 0; i <= 8; ++i) {
        this.nodes[node + i] = this.nodes[offsetSrc + i];
      }
      for (let i = 1; i <= 8; ++i) {
        if (this.nodes[parent + i] === offsetSrc) {
          this.nodes[parent + i] = node;
        }
      }
    }
    this.nodeFreeIndex -= NODE_SIZE;
  }

  private getChildOffset(xIdx: number, yIdx: number, zIdx: number, halfRes: number): number {
    let off = 1;
    if (xIdx >= halfRes) off += 4;
    if (yIdx >= halfRes) off += 2;
    if (zIdx >= halfRes) off += 1;
    return off;
  }

  initTextures(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
  ) {
    let uNodesTex = gl.getUniformLocation(program, "uNodesTex");
    let uBricksTex = gl.getUniformLocation(program, "uBricksTex");
    gl.uniform1i(uNodesTex, 0);
    gl.uniform1i(uBricksTex, 1);
    gl.activeTexture(gl.TEXTURE0);
    let nodesTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, nodesTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32UI,
      TEXTURE_RES,
      TEXTURE_RES,
      0,
      gl.RGBA_INTEGER,
      gl.UNSIGNED_INT,
      this.nodes,
    );
    gl.activeTexture(gl.TEXTURE1);
    let bricksTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, bricksTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32UI,
      TEXTURE_RES,
      TEXTURE_RES,
      0,
      gl.RGBA_INTEGER,
      gl.UNSIGNED_INT,
      this.bricks,
    );
  }

  writeShaderCode(): string {
    return (
`uniform usampler2D uNodesTex;
uniform usampler2D uBricksTex;

const float VOXEL_SIZE = 10.0;

uint read_tex_1d(usampler2D tex, uint index) {
    int width = ${TEXTURE_RES}; 
    uint pixelIndex = index / 4u;
    uint channel = index % 4u;
    ivec2 coord = ivec2(int(pixelIndex) % width, int(pixelIndex) / width);
    uvec4 data = texelFetch(tex, coord, 0);
    if (channel == 0u) return data.r;
    if (channel == 1u) return data.g;
    if (channel == 2u) return data.b;
    return data.a;
}

uint get_child_offset(uvec3 p, uint half_res) {
  uint offset = 1u;
  if (p.x >= half_res) {
    offset += 4u;
  }
  if (p.y >= half_res) {
    offset += 2u;
  }
  if (p.z >= half_res) {
    offset += 1u;
  }
  return offset;
}

float read_from_brick(uint brick, uvec3 p) {
  uint local_idx = p.x + (p.y * ${BRICK_DIM}u) + (p.z * ${BRICK_DIM * BRICK_DIM}u);
  uint global_idx = (brick - 1u) * ${BRICK_SIZE}u + local_idx;
  uint r = read_tex_1d(uBricksTex, global_idx);
  if (r == 0u) {
    return VOXEL_SIZE;
  } if (r < 128u) {
    return VOXEL_SIZE * float(r) / 127.0;
  } else {
    uint r2 = (r ^ 255u) + 1u;
    return -VOXEL_SIZE * float(r2) / 128.0;
  }
}

float read_brick_map(uvec3 p) {
  if (false) {
    vec3 p2 = vec3(
      float(p.x) - 512.0,
      float(p.y) - 512.0,
      float(p.z) - 512.0
    );
    return (length(p2) - 100.0) * VOXEL_SIZE;
  }
  uint res = ${RES_XYZ}u;
  uint at_node = 0u;
  for (uint level = 0u; level < ${MAX_DEPTH - BRICK_DEPTH}u; ++level) {
    uint half_res = res >> 1u;
    uint half_res_mask = half_res - 1u;
    uint child_offset = get_child_offset(p, half_res);
    uint brick_or_node = read_tex_1d(uNodesTex, at_node + child_offset);
    if (half_res == ${BRICK_DIM}u) {
      uint brick = brick_or_node;
      if (brick == 0u) {
        return 0.5*float(half_res) * VOXEL_SIZE;
      }
      return read_from_brick(
        brick,
        uvec3(
          p.x & half_res_mask,
          p.y & half_res_mask,
          p.z & half_res_mask
        )
      );
    } else {
      uint node = brick_or_node;
      if (node == 0u) {
        return 0.5*float(half_res) * VOXEL_SIZE;
      }
      // tail recursion next params
      at_node = node;
      p = uvec3(
        p.x & half_res_mask,
        p.y & half_res_mask,
        p.z & half_res_mask
      );
      res = half_res;
    }
  }
  return 0.0;
}
`
    );
  }
}
