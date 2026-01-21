const TEXTURE_WIDTH_BITS = 10;
const TEXTURE_WIDTH = (1 << TEXTURE_WIDTH_BITS);
const TEXTURE_WIDTH_MASK = TEXTURE_WIDTH - 1;
const TEXTURE_HEIGHT_BITS = 10;
const TEXTURE_HEIGHT = (1 << TEXTURE_HEIGHT_BITS);
const TEXTURE_HEIGHT_MASK = TEXTURE_HEIGHT - 1;

const FULL_RES_BITS = 10;
const FULL_RES = (1 << FULL_RES_BITS);
const FULL_RES_MASK = FULL_RES - 1;

const BRICK_RES_BITS = 3;
const BRICK_RES = (1 << BRICK_RES_BITS);
const BRICK_RES_MASK = BRICK_RES - 1;

const MIN_IDX_MASK = FULL_RES_MASK ^ BRICK_RES_MASK;

// first two values make up the min point of the brick
const BRICK_SIZE = BRICK_RES * BRICK_RES * BRICK_RES;

const VOXEL_SIZE = 10.0;

type Brick = {
  minXIdx: number,
  minYIdx: number,
  minZIdx: number,
  // BRICK_RES*BRICK_RES*BRICK_RES cells
  cells: number[];
};

export type BrickMapV4Textures = {
  texture: WebGLTexture,
};

export class BrickMapV4 {
  private textureData = new Uint32Array(TEXTURE_WIDTH * TEXTURE_HEIGHT * 4);
  private bricks: Brick[] = [];
  private brickMap = new Map<string,Brick>();

  get numBricks(): number {
    return this.bricks.length;
  }

  private mkKey(xIdx: number, yIdx: number, zIdx: number): string {
    return `${xIdx}_${yIdx}_${zIdx}`;
  }

  set(xIdx: number, yIdx: number, zIdx: number, value: number) {
    let minXIdx = xIdx & MIN_IDX_MASK;
    let minYIdx = yIdx & MIN_IDX_MASK;
    let minZIdx = zIdx & MIN_IDX_MASK;
    let key = this.mkKey(minXIdx, minYIdx, minZIdx);
    let brick = this.brickMap.get(key);
    if (brick == undefined) {
      brick = {
        minXIdx,
        minYIdx,
        minZIdx,
        cells: Array(BRICK_SIZE).fill(0)
      };
      this.brickMap.set(key, brick);
      this.bricks.push(brick);
    }
    let xIdx2 = xIdx & BRICK_RES_MASK;
    let yIdx2 = yIdx & BRICK_RES_MASK;
    let zIdx2 = zIdx & BRICK_RES_MASK;
    let offset = (
      (zIdx2 << (BRICK_RES_BITS + BRICK_RES_BITS)) |
      (yIdx2 << BRICK_RES_BITS) |
      xIdx2
    );
    brick.cells[offset] = value;
    if (value == 0) {
      let allZero = true;
      for (let cell of brick.cells) {
        if (cell != 0) {
          allZero = false;
          break;
        }
      }
      if (allZero) {
        this.brickMap.delete(key);
        let i = this.bricks.indexOf(brick);
        if (i != -1) {
          this.bricks.splice(i, 1);
        }
      }
    }
  }

  get(xIdx: number, yIdx: number, zIdx: number): number {
    let minXIdx = xIdx & MIN_IDX_MASK;
    let minYIdx = yIdx & MIN_IDX_MASK;
    let minZIdx = zIdx & MIN_IDX_MASK;
    let key = this.mkKey(minXIdx, minYIdx, minZIdx);
    let brick = this.brickMap.get(key);
    if (brick == undefined) {
      return 0;
    }
    let xIdx2 = xIdx & BRICK_RES_MASK;
    let yIdx2 = yIdx & BRICK_RES_MASK;
    let zIdx2 = zIdx & BRICK_RES_MASK;
    let offset = (
      (zIdx2 << (BRICK_RES_BITS + BRICK_RES_BITS)) |
      (yIdx2 << BRICK_RES_BITS) |
      xIdx2
    );
    return brick.cells[offset];
  }

  initTextures(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
  ): BrickMapV4Textures {
    let uBrickMapTex = gl.getUniformLocation(program, "uBrickMapTex");
    gl.uniform1i(uBrickMapTex, 0);
    let brickMapTextures: BrickMapV4Textures = {
      texture: gl.createTexture(),
    };
    this.updateTextures(gl, brickMapTextures);
    return brickMapTextures;
  }

  updateTextures(
    gl: WebGL2RenderingContext,
    brickMapTextures: BrickMapV4Textures,
  ) {
    this.updateTextureData();
    let { texture, } = brickMapTextures;
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

  private updateTextureData() {
    let idx = 0;
    this.textureData[idx++] = this.bricks.length;
    let valuesPerBrick = BRICK_RES * BRICK_RES * BRICK_RES;
    let bricksStart = idx;
    {
      let offset = idx;
      for (let brick of this.bricks) {
        this.textureData[idx++] = brick.minXIdx;
        this.textureData[idx++] = brick.minYIdx;
        this.textureData[idx++] = brick.minZIdx;
        this.textureData[idx++] = offset;
        offset += valuesPerBrick;
      }
    }
    let bricksEnd = idx;
    let bricksShift = bricksEnd - bricksStart;
    idx = bricksStart;
    for (let i = 0; i < this.bricks.length; ++i) {
      this.textureData[idx + 3] += bricksShift;
      idx += 4;
    }
    for (let brick of this.bricks) {
      for (let cell of brick.cells) {
        this.textureData[idx++] = cell;
      }
    }
  }

  writeShaderCode(): string {
    return (
`uniform usampler2D uBrickMapTex;

const float VOXEL_SIZE=${VOXEL_SIZE.toFixed(1)};
const float BRICK_SIZE=${(BRICK_RES * VOXEL_SIZE).toFixed(1)};

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

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
}

const uint MAX_ITER = 100u;

float read_brick_map(uvec3 p) {
  vec3 fp = vec3(
    float(p.x) * VOXEL_SIZE,
    float(p.y) * VOXEL_SIZE,
    float(p.z) * VOXEL_SIZE
  );
  uvec3 min_p = uvec3(
    p.x & ${MIN_IDX_MASK}u,
    p.y & ${MIN_IDX_MASK}u,
    p.z & ${MIN_IDX_MASK}u
  );
  uint idx = 0u;
  uint num_bricks = read_tex_1d(idx++);
  float dist = 10000.0;
  for (uint i = 0u; i < MAX_ITER; ++i) {
    uint brick_min_x = read_tex_1d(idx++);
    uint brick_min_y = read_tex_1d(idx++);
    uint brick_min_z = read_tex_1d(idx++);
    uint brick_offset = read_tex_1d(idx++);
    if (
      min_p.x == brick_min_x &&
      min_p.y == brick_min_y &&
      min_p.z == brick_min_z
    ) {
      uint x_idx = p.x & ${BRICK_RES_MASK}u;
      uint y_idx = p.y & ${BRICK_RES_MASK}u;
      uint z_idx = p.z & ${BRICK_RES_MASK}u;
      uint offset = (
        (z_idx << ${BRICK_RES_BITS + BRICK_RES_BITS}) |
        (y_idx << ${BRICK_RES_BITS}) |
        x_idx
      );
      uint val = read_tex_1d(brick_offset + offset);
      return (128.0 - float(val)) / 127.0 * VOXEL_SIZE;
    }
    vec3 brick_centre = vec3(
      float(brick_min_x + ${BRICK_RES >> 1}u) * VOXEL_SIZE,
      float(brick_min_y + ${BRICK_RES >> 1}u) * VOXEL_SIZE,
      float(brick_min_z + ${BRICK_RES >> 1}u) * VOXEL_SIZE
    );
    dist = min(dist, sdBox(fp - brick_centre, vec3(0.5 * BRICK_SIZE)-10.0));
    if (i >= num_bricks) {
      break;
    }
  }
  return dist;
}
`
    );
  }
}
