import * as THREE from "three";

const RES_BITS = 10;
const RES = (1 << RES_BITS);
const BRICK_L_RES_BITS = 3;
const BRICK_L_RES = (1 << BRICK_L_RES_BITS);
const BRICK_L_RES_MASK = BRICK_L_RES - 1;
const GRID_RES_BITS = RES_BITS - BRICK_L_RES_BITS;
const GRID_RES = (1 << GRID_RES_BITS);
const BRICK_P_RES = BRICK_L_RES + 2; // +2 for gutter
const ATLAS_RES_BITS = 9;
const ATLAS_RES = (1 << ATLAS_RES_BITS);
const BRICKS_PER_RES = Math.floor(ATLAS_RES / BRICK_P_RES);
const MAX_BRICKS = BRICKS_PER_RES * BRICKS_PER_RES * BRICKS_PER_RES;
  // [x, y, z, active, ...]
const GRID_DATA_SIZE = (GRID_RES * GRID_RES * GRID_RES) * 4

const VOXEL_SIZE = 10.0;
const HALF_VOLUME_SIZE = (RES >> 1) * VOXEL_SIZE;

export type BrickMapTHREETextures = {
  iTex: THREE.Data3DTexture,
  aTex: THREE.Data3DTexture,
};

export type BrickMapTextures = {
  iTex: WebGLTexture,
  aTex: WebGLTexture,
};

export class BrickMap {
  private indirectionData = new Uint8Array(GRID_DATA_SIZE);
  // holds the 8x8x8 bricks
  private atlasData = new Uint8Array(ATLAS_RES ** 3);
  
  private freeBricks: number[] = [];
  // GridIdx -> AtlasIdx
  private brickMap = new Map<number, number>();

  constructor() {
    for (let i = 0; i < MAX_BRICKS; i++) {
      this.freeBricks.push(i);
    }
  }

  private getGridIdx(gx: number, gy: number, gz: number) {
    return (gz * GRID_RES * GRID_RES) + (gy * GRID_RES) + gx;
  }

  copy(other: BrickMap): this {
    for (let i = 0; i < this.indirectionData.length; ++i) {
      this.indirectionData[i] = other.indirectionData[i];
    }
    for (let i = 0; i < this.atlasData.length; ++i) {
      this.atlasData[i] = other.atlasData[i];
    }
    this.freeBricks.splice(0, this.freeBricks.length);
    for (let i = 0; i < other.freeBricks.length; ++i) {
      this.freeBricks.push(other.freeBricks[i]);
    }
    this.brickMap.clear();
    for (let entry of other.brickMap) {
      this.brickMap.set(entry[0], entry[1]);
    }
    return this;
  }

  get(x: number, y: number, z: number): number {
    const gx = x >> BRICK_L_RES_BITS;
    const gy = y >> BRICK_L_RES_BITS;
    const gz = z >> BRICK_L_RES_BITS;
    const gIdx = this.getGridIdx(gx, gy, gz);
    
    let aIdx = this.brickMap.get(gIdx);
    if (aIdx == undefined) {
      return 0;
    }

    const ax = aIdx % BRICKS_PER_RES;
    const ay = Math.floor(aIdx / BRICKS_PER_RES) % BRICKS_PER_RES;
    const az = Math.floor(aIdx / (BRICKS_PER_RES * BRICKS_PER_RES));
    
    const lx = (x & BRICK_L_RES_MASK) + 1;
    const ly = (y & BRICK_L_RES_MASK) + 1;
    const lz = (z & BRICK_L_RES_MASK) + 1;

    const atlasPos = (
      (az * BRICK_P_RES + lz) * ATLAS_RES * ATLAS_RES +
      (ay * BRICK_P_RES + ly) * ATLAS_RES +
      (ax * BRICK_P_RES + lx)
    );
    return this.atlasData[atlasPos];
  }

  set(x: number, y: number, z: number, value: number) {
    // sweep adjacent bricks incase coord lands on a gutter
    const minGx = (x - 1) >> BRICK_L_RES_BITS;
    const maxGx = (x + 1) >> BRICK_L_RES_BITS;
    const minGy = (y - 1) >> BRICK_L_RES_BITS;
    const maxGy = (y + 1) >> BRICK_L_RES_BITS;
    const minGz = (z - 1) >> BRICK_L_RES_BITS;
    const maxGz = (z + 1) >> BRICK_L_RES_BITS;
    for (let gz = minGz; gz <= maxGz; gz++) {
      for (let gy = minGy; gy <= maxGy; gy++) {
        for (let gx = minGx; gx <= maxGx; gx++) {
          if (gx < 0 || gx >= GRID_RES || gy < 0 || gy >= GRID_RES || gz < 0 || gz >= GRID_RES) continue;
          // get the local coords within the brick
          const gIdx = this.getGridIdx(gx, gy, gz);
          const lx = x - (gx * BRICK_L_RES) + 1;
          const ly = y - (gy * BRICK_L_RES) + 1;
          const lz = z - (gz * BRICK_L_RES) + 1;
          // if coords are outside of the brick and its gutter, skip it
          if (
            lx < 0 || lx >= BRICK_P_RES ||
            ly < 0 || ly >= BRICK_P_RES ||
            lz < 0 || lz >= BRICK_P_RES
          ) {
            continue;
          }
          // otherwise write to it
          this.ensureBrickAllocated(gx, gy, gz);
          if (this.brickMap.has(gIdx)) {
            const aIdx = this.brickMap.get(gIdx)!;
            this.writeToAtlas(aIdx, lx, ly, lz, value);
          }
        }
      }
    }
  }

  private _march_tmpV3_1 = new THREE.Vector3();
  march(ro: THREE.Vector3, rd: THREE.Vector3, t: [ number, ]): boolean {
    const MAX_STEPS = 200;
    const MIN_DIST = 5.0;
    const MAX_DIST = 10000.0;
    t[0] = 0.0;
    for (let i = 0; i < MAX_STEPS; ++i) {
      let p = this._march_tmpV3_1.copy(rd).multiplyScalar(t[0]).add(ro);
      let d = this.map(p, rd);
      if (d < MIN_DIST) {
        return true;
      }
      t[0] += d;
      if (t[0] > MAX_DIST) {
        break;
      }
    }
    return false;
  }

  private _map_tmpV3_1 = new THREE.Vector3();
  private _map_tmpV3_2 = new THREE.Vector3();
  private _map_tmpV3_3 = new THREE.Vector3();
  private _map_tmpV3_4 = new THREE.Vector3();
  private _map_tmpV3_5 = new THREE.Vector3();
  private _map_tmpV3_6 = new THREE.Vector3();
  private _map_tmpV3_7 = new THREE.Vector3();
  private _map_tmpV3_8 = new THREE.Vector3();
  private _map_tmpV4_1 = new THREE.Vector4();
  map(p: THREE.Vector3, rd: THREE.Vector3): number {
    let p_local = this._map_tmpV3_1.copy(p).addScalar(HALF_VOLUME_SIZE);
    let uvw = this._map_tmpV3_2.copy(p_local).multiplyScalar(1.0 / (GRID_RES * BRICK_L_RES * VOXEL_SIZE));
    let brickInfo = this._map_tmpV4_1;
    this.readIndirectionTexture01(uvw, brickInfo);
    let cellLocal = this._map_tmpV3_3.copy(uvw).multiplyScalar(GRID_RES);
    cellLocal.set(
      cellLocal.x - Math.floor(cellLocal.x),
      cellLocal.y - Math.floor(cellLocal.y),
      cellLocal.z - Math.floor(cellLocal.z),
    );
    // _map_tmpV3_[4,5,6,7] used
    if (brickInfo.w == 0.0) {
      let p2 = this._map_tmpV3_4.copy(cellLocal).subScalar(0.5);
      let m = this._map_tmpV3_5.copy(rd);
      m.x = 1.0 / m.x;
      m.y = 1.0 / m.y;
      m.z = 1.0 / m.z;
      let n = this._map_tmpV3_6.copy(p2).multiply(m);
      let k = this._map_tmpV3_7.copy(m).multiplyScalar(0.5);
      k.x = Math.abs(k.x);
      k.y = Math.abs(k.y);
      k.z = Math.abs(k.z);
      let t = this._map_tmpV3_8.copy(n).negate().add(k);
      let t2 = Math.min(t.x, t.y, t.z);
      return Math.max(
        VOXEL_SIZE,
        t2 * (BRICK_L_RES * VOXEL_SIZE),
      );
    }
    // _map_tmpV3_[4,5,6,7] released
    let brickBase = this._map_tmpV3_4.copy(brickInfo).multiplyScalar(255.0 * 10.0);
    // _map_tmpV3_6 used
    let atlasVoxelPos = this._map_tmpV3_5.copy(brickBase).addScalar(1.0).add(this._map_tmpV3_6.copy(cellLocal).multiplyScalar(8.0));
    // _map_tmpV3_6 released
    let atlasUVW = this._map_tmpV3_6.copy(atlasVoxelPos).divideScalar(ATLAS_RES);
    let val = this.readAtlasTexture01(atlasUVW);
    return (0.5 - val) * 2.0 * VOXEL_SIZE;
  }

  private readIndirectionTexture01(uvw: THREE.Vector3, out: THREE.Vector4) {
    let xIdx = Math.max(0.0, Math.min(GRID_RES-1, Math.floor(uvw.x * GRID_RES)));
    let yIdx = Math.max(0.0, Math.min(GRID_RES-1, Math.floor(uvw.y * GRID_RES)));
    let zIdx = Math.max(0.0, Math.min(GRID_RES-1, Math.floor(uvw.z * GRID_RES)));
    let idx =
      (
        (zIdx << (GRID_RES_BITS + GRID_RES_BITS)) |
        (yIdx << GRID_RES_BITS) |
        xIdx
      ) << 2;
    out.x = this.indirectionData[idx + 0] / 255.0;
    out.y = this.indirectionData[idx + 1] / 255.0;
    out.z = this.indirectionData[idx + 2] / 255.0;
    out.w = this.indirectionData[idx + 3] / 255.0;
  }

  private readAtlasTexture01(uvw: THREE.Vector3): number {
    let xIdx = Math.max(0.0, Math.min(ATLAS_RES-1, Math.floor(uvw.x * ATLAS_RES)));
    let yIdx = Math.max(0.0, Math.min(ATLAS_RES-1, Math.floor(uvw.y * ATLAS_RES)));
    let zIdx = Math.max(0.0, Math.min(ATLAS_RES-1, Math.floor(uvw.z * ATLAS_RES)));
    return this.atlasData[
      (zIdx << (ATLAS_RES_BITS + ATLAS_RES_BITS)) |
      (yIdx << ATLAS_RES_BITS) |
      xIdx
    ] / 255.0;
  }

  private ensureBrickAllocated(gx: number, gy: number, gz: number) {
    const gIdx = this.getGridIdx(gx, gy, gz);
    if (!this.brickMap.has(gIdx)) {
      const aIdx = this.freeBricks.pop();
      if (aIdx === undefined) return;

      this.brickMap.set(gIdx, aIdx);
      
      // Update Indirection Texture Data
      const iOffset = gIdx * 4;
      this.indirectionData[iOffset] = aIdx % BRICKS_PER_RES;
      this.indirectionData[iOffset + 1] = Math.floor(aIdx / BRICKS_PER_RES) % BRICKS_PER_RES;
      this.indirectionData[iOffset + 2] = Math.floor(aIdx / (BRICKS_PER_RES * BRICKS_PER_RES));
      this.indirectionData[iOffset + 3] = 255; // Alpha = Active
    }
  }

  private writeToAtlas(aIdx: number, lx: number, ly: number, lz: number, val: number) {
    const ax = aIdx % BRICKS_PER_RES;
    const ay = Math.floor(aIdx / BRICKS_PER_RES) % BRICKS_PER_RES;
    const az = Math.floor(aIdx / (BRICKS_PER_RES * BRICKS_PER_RES));

    const atlasPos = (
      (az * BRICK_P_RES + lz) * ATLAS_RES * ATLAS_RES +
      (ay * BRICK_P_RES + ly) * ATLAS_RES +
      (ax * BRICK_P_RES + lx)
    );
    this.atlasData[atlasPos] = val;
  }

  initTexturesThreeJs(
    params: THREE.ShaderMaterialParameters,
  ): BrickMapTHREETextures {
    let uniforms = params.uniforms;
    if (uniforms == undefined) {
      uniforms = {};
      params.uniforms = uniforms;
    }
    let iTex = new THREE.Data3DTexture(
      this.indirectionData,
      GRID_RES,
      GRID_RES,
      GRID_RES,
    );
    iTex.format = THREE.RGBAFormat;
    iTex.type = THREE.UnsignedByteType;
    iTex.minFilter = THREE.NearestFilter;
    iTex.magFilter = THREE.NearestFilter;
    iTex.wrapS = THREE.ClampToEdgeWrapping;
    iTex.wrapT = THREE.ClampToEdgeWrapping;
    iTex.wrapR = THREE.ClampToEdgeWrapping;
    iTex.unpackAlignment = 1;
    iTex.needsUpdate = true;
    let aTex = new THREE.Data3DTexture(
      this.atlasData,
      ATLAS_RES,
      ATLAS_RES,
      ATLAS_RES,
    );
    aTex.format = THREE.RedFormat; 
    aTex.type = THREE.UnsignedByteType;
    aTex.minFilter = THREE.LinearFilter;
    aTex.magFilter = THREE.LinearFilter;
    aTex.wrapS = THREE.ClampToEdgeWrapping;
    aTex.wrapT = THREE.ClampToEdgeWrapping;
    aTex.wrapR = THREE.ClampToEdgeWrapping;
    aTex.unpackAlignment = 1;
    aTex.needsUpdate = true;
    uniforms.uIndirectionTex = { value: iTex, };
    uniforms.uAtlasTex = { value: aTex, };
    return {
      iTex,
      aTex,
    };
  }

  updateTexturesThreeJs(textures: BrickMapTHREETextures) {
    textures.iTex.needsUpdate = true;
    textures.aTex.needsUpdate = true;
  }

  initTextures(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
  ): BrickMapTextures {
    let uIndirectionTex = gl.getUniformLocation(program, "uIndirectionTex");
    let uAtlasTex = gl.getUniformLocation(program, "uAtlasTex");
    gl.uniform1i(uIndirectionTex, 0);
    gl.uniform1i(uAtlasTex, 1);

    gl.activeTexture(gl.TEXTURE0);
    const iTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, iTex);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, GRID_RES, GRID_RES, GRID_RES, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.indirectionData);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

    gl.activeTexture(gl.TEXTURE1);
    const aTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, aTex);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, ATLAS_RES, ATLAS_RES, ATLAS_RES, 0, gl.RED, gl.UNSIGNED_BYTE, this.atlasData);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // CRITICAL: Trilinear enabled
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    
    return { iTex, aTex };
  }

  updateTextures(gl: WebGL2RenderingContext, textures: BrickMapTextures) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_3D, textures.iTex);
    gl.texSubImage3D(
      gl.TEXTURE_3D,
      0,
      0,
      0,
      0,
      GRID_RES,
      GRID_RES,
      GRID_RES,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.indirectionData,
    );
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, textures.aTex);
    gl.texSubImage3D(
      gl.TEXTURE_3D,
      0,
      0,
      0,
      0,
      ATLAS_RES,
      ATLAS_RES,
      ATLAS_RES,
      gl.RED,
      gl.UNSIGNED_BYTE,
      this.atlasData,
    );
  }

  writeShaderCode(): string {
    return (
`uniform sampler3D uIndirectionTex;
uniform sampler3D uAtlasTex;

const float VOXEL_SIZE = ${VOXEL_SIZE.toFixed(1)};
const float GRID_RES = ${GRID_RES.toFixed(1)};
const float ATLAS_RES = ${ATLAS_RES.toFixed(1)};
const float HALF_VOLUME_SIZE = ${((RES >> 1) * VOXEL_SIZE).toFixed(1)};

float map(vec3 p, vec3 rd) {
    vec3 p_local = p + HALF_VOLUME_SIZE;
    // calc grid coords
    vec3 uvw = p_local / ${(GRID_RES * BRICK_L_RES * VOXEL_SIZE).toFixed(1)};
    vec4 brickInfo = texture(uIndirectionTex, uvw);
    vec3 cellLocal = fract(uvw * GRID_RES);
    if (brickInfo.a == 0.0) {
      vec3 p2 = cellLocal - 0.5;
      vec3 m = 1.0 / rd;
      vec3 n = p2 * m;
      vec3 k = abs(m)*0.5;
      vec3 t = -n + k;
      float t2 = min(t.x, min(t.y, t.z));
      return max(VOXEL_SIZE,t2*${(BRICK_L_RES * VOXEL_SIZE).toFixed(1)});
    }

    // Map the 0.0->1.0 logical range to the 1.0->9.0 physical range (the padding)
    // Physical coordinate = (BrickIndex * 10.0) + 1.0 (offset) + (local * 8.0)
    vec3 brickBase = brickInfo.xyz * 255.0 * 10.0;
    vec3 atlasVoxelPos = brickBase + 1.0 + (cellLocal * 8.0);
    
    vec3 atlasUVW = atlasVoxelPos / ATLAS_RES;

    // hardware based trilinear interpolation
    float val = texture(uAtlasTex, atlasUVW).r;
    //
    return (0.5 - val) * 2.0 * VOXEL_SIZE;
}
`
    );
  }
}
