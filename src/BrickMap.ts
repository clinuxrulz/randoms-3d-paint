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
    const minGx = (x - 1) >> BRICK_L_RES_BITS;
    const maxGx = (x + 1) >> BRICK_L_RES_BITS;
    const minGy = (y - 1) >> BRICK_L_RES_BITS;
    const maxGy = (y + 1) >> BRICK_L_RES_BITS;
    const minGz = (z - 1) >> BRICK_L_RES_BITS;
    const maxGz = (z + 1) >> BRICK_L_RES_BITS;

    const isNearSurface = value > 5 && value < 250;
    for (let gz = minGz; gz <= maxGz; gz++) {
      for (let gy = minGy; gy <= maxGy; gy++) {
        for (let gx = minGx; gx <= maxGx; gx++) {
          if (gx < 0 || gx >= GRID_RES || gy < 0 || gy >= GRID_RES || gz < 0 || gz >= GRID_RES) continue;

          const gIdx = this.getGridIdx(gx, gy, gz);
          const lx = x - (gx * BRICK_L_RES) + 1;
          const ly = y - (gy * BRICK_L_RES) + 1;
          const lz = z - (gz * BRICK_L_RES) + 1;

          if (isNearSurface) {
            this.ensureBrickAllocated(gx, gy, gz);
          }

          if (this.brickMap.has(gIdx)) {
            const aIdx = this.brickMap.get(gIdx)!;
            this.writeToAtlas(aIdx, lx, ly, lz, value);
          }
        }
      }
    }
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
    let VOXEL_SIZE = 10.0;
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
