const TEXTURE_WIDTH_BITS = 9;
const TEXTURE_WIDTH = (1 << TEXTURE_WIDTH_BITS);
const TEXTURE_WIDTH_MASK = TEXTURE_WIDTH - 1;
const TEXTURE_HEIGHT_BITS = 9;
const TEXTURE_HEIGHT = (1 << TEXTURE_HEIGHT_BITS);
const TEXTURE_HEIGHT_MASK = TEXTURE_HEIGHT - 1;

const MAX_BRANCH_DEPTH = 7;

const BRICK_RES_BITS = 3;
const BRICK_RES = (1 << BRICK_RES_BITS);
const BRICK_RES_MASK = BRICK_RES - 1;

const BRICK_MAP_RES_BITS = MAX_BRANCH_DEPTH + BRICK_RES_BITS;
const BRICK_MAP_RES = 1 << BRICK_MAP_RES_BITS;

const VOXEL_SIZE = 10.0;

export type BrickMapV3Textures = {
  texture: WebGLTexture,
};

type BrickMapNode = {
  type: "Branch",
  // 8 children
  children: (BrickMapNode | undefined)[],
} | {
  type: "Leaf",
  // BRICK_RES*BRICK_RES*BRICK_RES cells
  cells: number[],
};

export class BrickMapV3 {
  private textureData = new Uint32Array(TEXTURE_WIDTH * TEXTURE_HEIGHT * 4);
  private root: BrickMapNode = {
    type: "Branch",
    children: [
      undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined,
    ],
  };
  private _numBricks = 0;

  get numBricks(): number {
    return this._numBricks;
  }

  set(xIdx: number, yIdx: number, zIdx: number, value: number) {
    this.set2(xIdx, yIdx, zIdx, value, this.root, 1, BRICK_MAP_RES);
  }

  get(xIdx: number, yIdx: number, zIdx: number): number {
    return this.get2(xIdx, yIdx, zIdx, this.root, BRICK_MAP_RES);
  }

  initTextures(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
  ): BrickMapV3Textures {
    let uBrickMapTex = gl.getUniformLocation(program, "uBrickMapTex");
    gl.uniform1i(uBrickMapTex, 0);
    let brickMapTextures: BrickMapV3Textures = {
      texture: gl.createTexture(),
    };
    this.updateTextures(gl, brickMapTextures);
    return brickMapTextures;
  }

  updateTextures(
    gl: WebGL2RenderingContext,
    brickmapTextures: BrickMapV3Textures,
  ) {
    this.updateTextureData();
    let { texture, } = brickmapTextures;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32UI,
      TEXTURE_WIDTH,
      TEXTURE_HEIGHT,
      0,
      gl.RGBA_INTEGER,
      gl.UNSIGNED_INT,
      this.textureData,
    );
  }

  private set2(xIdx: number, yIdx: number, zIdx: number, value: number, atNode: BrickMapNode, atLevel: number, atRes: number): boolean {
    if (atNode.type == "Branch") {
      let halfRes = atRes >> 1;
      let halfResMask = halfRes - 1;
      let childIdx = this.getChildIndex(xIdx, yIdx, zIdx, halfRes);
      let child = atNode.children[childIdx];
      if (child == undefined) {
        if (atLevel == MAX_BRANCH_DEPTH) {
          child = {
            type: "Leaf",
            cells: Array(
              BRICK_RES * BRICK_RES * BRICK_RES
            ).fill(0)
          };
          this._numBricks++;
        } else {
          child = {
            type: "Branch",
            children: Array(8).fill(undefined)
          };
        }
        atNode.children[childIdx] = child;
      }
      let deleteIt = this.set2(
        xIdx & halfResMask,
        yIdx & halfResMask,
        zIdx & halfResMask,
        value,
        child,
        atLevel + 1,
        halfRes,
      );
      if (deleteIt) {
        let allUndefined = true;
        for (let child of atNode.children) {
          if (child !== undefined) {
            allUndefined = false;
            break;
          }
        }
        if (allUndefined) {
          atNode.children[childIdx] = undefined;
          return /*deleteIt=*/true;
        }
      }
    } else {
      atNode.cells[
        (zIdx << (BRICK_RES_BITS + BRICK_RES_BITS)) |
        (yIdx << BRICK_RES_BITS) |
        xIdx
      ] = value;
      if (value == 0) {
        let allZero = true;
        for (let cell of atNode.cells) {
          if (cell !== 0) {
            allZero = false;
            break;
          }
        }
        if (allZero) {
          this._numBricks--;
          return /*deleteIt=*/true;
        }
      }
    }
    return /*deleteIt=*/false;
  }

  private get2(xIdx: number, yIdx: number, zIdx: number, atNode: BrickMapNode, atRes: number): number {
    if (atNode.type == "Branch") {
      let halfRes = atRes >> 1;
      let halfResMask = halfRes - 1;
      let childIdx = this.getChildIndex(xIdx, yIdx, zIdx, halfRes);
      let child = atNode.children[childIdx];
      if (child == undefined) {
        return 0.0;
      }
      return this.get2(
        xIdx & halfResMask,
        yIdx & halfResMask,
        zIdx & halfResMask,
        child,
        halfRes
      );
    } else {
      return atNode.cells[
        (zIdx << (BRICK_RES_BITS + BRICK_RES_BITS)) |
        (yIdx << BRICK_RES_BITS) |
        xIdx
      ];
    }
  }

  private getChildIndex(xIdx: number, yIdx: number, zIdx: number, halfRes: number): number {
    // Morton Order zyx
    //   top slice
    //     110 111
    //     100 101
    //   bottom
    //     010 011
    //     000 001
    let idx = 0;
    if (xIdx >= halfRes) {
      idx |= 1;
    }
    if (yIdx >= halfRes) {
      idx |= 2;
    }
    if (zIdx >= halfRes) {
      idx |= 4;
    }
    return idx;
  }

  private updateTextureData() {
    this.updateTextureData2(0, this.root);
  }

  private updateTextureData2(idx: number, atNode: BrickMapNode): number {
    if (atNode.type == "Branch") {
      let childrenMask = 0;
      let childBit = 1;
      for (let i = 0; i < 8; ++i, childBit <<= 1) {
        if (atNode.children[i] !== undefined) {
          childrenMask |= childBit;
        }
      }
      this.textureData[idx++] = childrenMask;
      for (let child of atNode.children) {
        if (child === undefined) {
          continue;
        }
        let sizeIdx = idx++;
        let idx2 = this.updateTextureData2(idx, child);
        let size = idx2 - idx;
        this.textureData[sizeIdx] = size;
        idx = idx2;
      }
    } else {
      for (let cell of atNode.cells) {
        this.textureData[idx++] = cell;
      }
    }
    return idx;
  }

  writeShaderCode(): string {
    return (
`uniform usampler2D uBrickMapTex;

const float VOXEL_SIZE=${VOXEL_SIZE.toFixed(1)};

uint read_tex_1d(uint index) {
  uint pixelIndex = index >> 2u;
  uint channel = index & 3u;
  ivec2 coord = ivec2(
    int(pixelIndex) & ${TEXTURE_WIDTH_MASK},
    int(pixelIndex) >> ${TEXTURE_WIDTH_BITS}
  );
  uvec4 data = texelFetch(uBrickMapTex, coord, 0);
  if (channel == 0u) return data.r;
  if (channel == 1u) return data.g;
  if (channel == 2u) return data.b;
  return data.a;
}

uint get_child_index(uvec3 p, uint half_res) {
  // Morton Order zyx
  //   top slice
  //     110 111
  //     100 101
  //   bottom
  //     010 011
  //     000 001
  uint idx = 0u;
  if (p.x >= half_res) {
    idx |= 1u;
  }
  if (p.y >= half_res) {
    idx |= 2u;
  }
  if (p.z >= half_res) {
    idx |= 4u;
  }
  return idx;
}

float read_brick_map(uvec3 p) {
  uint res = ${BRICK_MAP_RES}u;
  uint half_res = res >> 1u;
  uint half_res_mask = half_res - 1;
  uint idx = 0;
  for (int i = 0; i < ${MAX_BRANCH_DEPTH}; ++i) {
    uint child_mask = read_tex_1d(idx++);
    if (child_mask == 0u) {
      let d = min(
        min(p.x, res - p.x),
        min(p.y, res - p.y),
        min(p.z, res - p.z)
      );
      return max(float(d) * VOXEL_SIZE, 0.5);
    }
    uint child_idx = get_child_index(p, half_res);
    for (int j = 0; j < 8; ++j) {
      bool has_child = (child_mask & 1u) != 0u;
      if (j != child_idx) {
        if (has_child) {
          uint child_size = read_tex_1d(idx++);
          idx += child_size;
        }
      } else {
        // skip size info
        ++idx;
        //
        if (!has_child) {
          p = uvec3(
            p.x & half_res_mask,
            p.y & half_res_mask,
            p.z & half_res_mash
          );
          let d = min(
            min(p.x, half_res - p.x),
            min(p.y, half_res - p.y),
            min(p.z, half_res - p.z)
          );
          return max(float(d) * VOXEL_SIZE, 0.5);
        } else {
          // setup next iteration
          p = uvec3(
            p.x & half_res_mask,
            p.y & half_res_mask,
            p.z & half_res_mash
          );
          res = half_res;
          half_res = res >> 1u;
          half_res_mask = half_res - 1;
          break;
        }
      }
      child_mask >>= 1u;
    }
  }
  // if we get to here we are at a leaf
  let offset = (
    (p.z << ${BRICK_RES_BITS + BRICK_RES_BITS}) +
    (p.y << ${BRICK_RES_BITS}) +
    p.z
  );
  let val = read_tex_1d(idx + offset);
  return (128.0 - float(val)) / 127.0 * VOXEL_SIZE;
}
`
    );
  }
}
