const HIGH_LEVEL_RES_BITS = 7;
const HIGH_LEVEL_RES = (1 << HIGH_LEVEL_RES_BITS);
const HIGH_LEVEL_RES_MASK = HIGH_LEVEL_RES - 1;
const LOW_LEVEL_RES_BITS = 3;
const LOW_LEVEL_RES = (1 << LOW_LEVEL_RES_BITS);
const LOW_LEVEL_RES_MASK = LOW_LEVEL_RES - 1;

const COMBINED_RES_BITS = HIGH_LEVEL_RES_BITS + LOW_LEVEL_RES_BITS;
const COMBINED_RES = (1 << COMBINED_RES_BITS);

const TEXTURE_RES_BITS = 12;
const TEXTURE_RES = (1 << TEXTURE_RES_BITS);
const TEXTURE_RES_MASK = TEXTURE_RES - 1;

const START_BRICKS_OFFSET = HIGH_LEVEL_RES * HIGH_LEVEL_RES * HIGH_LEVEL_RES;
// +1 for parent reference
const BRICK_SIZE = 1 + LOW_LEVEL_RES * LOW_LEVEL_RES * LOW_LEVEL_RES;

const VOXEL_SIZE = 10.0;

export type BrickMapV2Textures = {
  brickMapTexture: WebGLTexture,
};

export class BrickMapV2 {
  private data: Uint32Array = new Uint32Array(TEXTURE_RES * TEXTURE_RES * 4);
  private bricksEnd = START_BRICKS_OFFSET;
  
  get numBricks() {
    return (this.bricksEnd - START_BRICKS_OFFSET) / BRICK_SIZE;
  }

  get(xIdx: number, yIdx: number, zIdx: number): number {
    if (
      xIdx < 0 || xIdx >= COMBINED_RES ||
      yIdx < 0 || yIdx >= COMBINED_RES ||
      zIdx < 0 || zIdx >= COMBINED_RES
    ) {
      return 0.0;
    }
    let hiXIdx = xIdx >> LOW_LEVEL_RES_BITS;
    let hiYIdx = yIdx >> LOW_LEVEL_RES_BITS;
    let hiZIdx = zIdx >> LOW_LEVEL_RES_BITS;
    let hiIdx =
      (hiZIdx << (HIGH_LEVEL_RES_BITS << 1)) +
      (hiYIdx << HIGH_LEVEL_RES_BITS) +
      hiXIdx;
    let offset = this.data[hiIdx];
    if (offset == 0) {
      return 0;
    }
    let lowXIdx = xIdx & LOW_LEVEL_RES_MASK;
    let lowYIdx = yIdx & LOW_LEVEL_RES_MASK;
    let lowZIdx = zIdx & LOW_LEVEL_RES_MASK;
    let lowIdx =
      1 +
      (lowZIdx << (LOW_LEVEL_RES_BITS << 1)) +
      (lowYIdx << LOW_LEVEL_RES_BITS) +
      lowXIdx;
    return this.data[offset + lowIdx];
  }

  set(xIdx: number, yIdx: number, zIdx: number, value: number) {
    if (
      xIdx < 0 || xIdx >= COMBINED_RES ||
      yIdx < 0 || yIdx >= COMBINED_RES ||
      zIdx < 0 || zIdx >= COMBINED_RES
    ) {
      return;
    }
    let hiXIdx = xIdx >> LOW_LEVEL_RES_BITS;
    let hiYIdx = yIdx >> LOW_LEVEL_RES_BITS;
    let hiZIdx = zIdx >> LOW_LEVEL_RES_BITS;
    let hiIdx =
      (hiZIdx << (HIGH_LEVEL_RES_BITS << 1)) +
      (hiYIdx << HIGH_LEVEL_RES_BITS) +
      hiXIdx;
    let offset = this.data[hiIdx];
    if (offset == 0) {
      offset = this.allocBrick();
      this.data[hiIdx] = offset;
      this.data[offset] = hiIdx;
    }
    let lowXIdx = xIdx & LOW_LEVEL_RES_MASK;
    let lowYIdx = yIdx & LOW_LEVEL_RES_MASK;
    let lowZIdx = zIdx & LOW_LEVEL_RES_MASK;
    let lowIdx =
      1 +
      (lowZIdx << (LOW_LEVEL_RES_BITS << 1)) +
      (lowYIdx << LOW_LEVEL_RES_BITS) +
      lowXIdx;
    this.data[offset + lowIdx] = value;
    if (value == 0) {
      let allZero = true;
      for (let i = 1; i < BRICK_SIZE; ++i) {
        if (this.data[offset + i] != 0) {
          allZero = false;
          break;
        }
      }
      if (allZero) {
        this.freeBrick(offset);
      }
    }
  }

  private allocBrick(): number {
    let brick = this.bricksEnd;
    this.bricksEnd += BRICK_SIZE;
    for (let i = 0; i < BRICK_SIZE; ++i) {
      this.data[brick + i] = 0;
    }
    return brick;
  }

  private freeBrick(brick: number) {
    {
      let parent = this.data[brick];
      this.data[parent] = 0;
    }
    if (this.bricksEnd > START_BRICKS_OFFSET + BRICK_SIZE) {
      let srcIdx = this.bricksEnd - BRICK_SIZE;
      let dstIdx = brick;
      if (srcIdx != dstIdx) {
        for (let i = 0; i < BRICK_SIZE; ++i) {
          this.data[dstIdx + i] = this.data[srcIdx + i];
        }
        let parent = this.data[dstIdx];
        this.data[parent] = dstIdx;
      }
    }
    this.bricksEnd -= BRICK_SIZE;
  }

  initTextures(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
  ): BrickMapV2Textures {
    let uBrickMapTex = gl.getUniformLocation(program, "uBrickMapTex");
    gl.uniform1i(uBrickMapTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    let brickMapTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, brickMapTexture);
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
      this.data,
    );
    return {
      brickMapTexture,
    };
  }

  updateTextures(
    gl: WebGL2RenderingContext,
    brickMapTextures: BrickMapV2Textures,
  ) {
    let {
      brickMapTexture,
    } = brickMapTextures;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, brickMapTexture);
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
      this.data,
    );
  }

  writeShaderCode(): string {
    return (
`uniform usampler2D uBrickMapTex;

const float VOXEL_SIZE=${VOXEL_SIZE.toFixed(1)};

uint read_tex_1d(uint index) {
  uint pixelIndex = index >> 2u;
  uint channel = index & 3u;
  ivec2 coord = ivec2(
    int(pixelIndex) & ${TEXTURE_RES_MASK},
    int(pixelIndex) >> ${TEXTURE_RES_BITS}
  );
  uvec4 data = texelFetch(uBrickMapTex, coord, 0);
  if (channel == 0u) return data.r;
  if (channel == 1u) return data.g;
  if (channel == 2u) return data.b;
  return data.a;
}

float read_brick_map(uvec3 p) {
  if (
    p.x >= ${COMBINED_RES}u ||
    p.y >= ${COMBINED_RES}u ||
    p.z >= ${COMBINED_RES}u
  ) {
    return 0.0;
  }
  uint hiXIdx = p.x >> ${LOW_LEVEL_RES_BITS}u;
  uint hiYIdx = p.y >> ${LOW_LEVEL_RES_BITS}u;
  uint hiZIdx = p.z >> ${LOW_LEVEL_RES_BITS}u;
  uint hiIdx = (
    (hiZIdx << ${HIGH_LEVEL_RES_BITS << 1}) +
    (hiYIdx << ${HIGH_LEVEL_RES_BITS}) +
    hiXIdx
  );
  uint offset = read_tex_1d(hiIdx);
  if (offset == 0u) {
    return VOXEL_SIZE;
  }
  uint lowXIdx = p.x & ${LOW_LEVEL_RES_MASK}u;
  uint lowYIdx = p.y & ${LOW_LEVEL_RES_MASK}u;
  uint lowZIdx = p.z & ${LOW_LEVEL_RES_MASK}u;
  uint lowIdx = (
    1u +
    (lowZIdx << ${LOW_LEVEL_RES_BITS << 1}) +
    (lowYIdx << ${LOW_LEVEL_RES_BITS}) +
    lowXIdx
  );
  uint r = read_tex_1d(offset + lowIdx);
  return (128.0 - float(r)) / 127.0 * VOXEL_SIZE;
}
`
    );
  }
}
