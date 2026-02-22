import * as THREE from "three";
import { Operation } from "./operations";
import SdfModelWorker from "./sdf-model-worker?worker";
import { ATLAS_RES, BRICK_P_RES, BrickMapTHREETextures, BRICKS_PER_RES, GRID_RES } from "./BrickMap";

export class AsyncSdfModel {
  private worker: Worker | undefined = undefined;
  private callbackMap = new Map<string, (params: any) => void>();

  dispose(): void {
    if (this.worker === undefined) {
      return;
    }
    this.worker.terminate();
  }

  private ensureWorkerInitialized(): Worker {
    if (this.worker == undefined) {
      this.worker = new SdfModelWorker();
      this.worker.onmessage = (e) => {
        let data = e.data;
        let method = data.method;
        let params = data.params;
        if (method == "callCallback") {
          let callbackId = params.id;
          let params2 = params.params;
          let callback = this.callbackMap.get(callbackId);
          if (callback != undefined) {
            callback(params2);
          }
        }
      };
    }
    return this.worker;
  }

  private registerCallback(callback: (params: any) => void): string {
    let id = crypto.randomUUID();
    this.callbackMap.set(id, callback);
    return id;
  }

  private unregisterCallback(callbackId: string) {
    this.callbackMap.delete(callbackId);
  }

  async *load(
    readableStream: ReadableStream,
  ): AsyncGenerator<{ workDone: number, totalWork: number, }, void, unknown> {
    let worker = this.ensureWorkerInitialized();
    let resolveNext: (value: any) => void;
    let mkResolveNextPromise =
      () => new Promise<
        | { type: "progress", params: { workDone: number, totalWork: number, }, }
        | { type: "done", params: { result: { type: "Ok", } | { type: "Err", message: string, } } }
      >(r => resolveNext = r);
    let resolveNextPromise = mkResolveNextPromise();
    const resume = () => {
      worker.postMessage({ method: "resume", params: {}, });
    };
    const onProgressId = this.registerCallback((params) => {
      resolveNext({
        type: "progress",
        params: { workDone: params.workDone, totalWork: params.totalWork, },
      });
    });
    const onDoneId = this.registerCallback((params) => {
      this.unregisterCallback(onProgressId);
      this.unregisterCallback(onDoneId);
      resolveNext({ type: "done", params, });
    });
    worker.postMessage(
      {
        method: "load",
        params: { readableStream, onProgressId, onDoneId },
      },
      [ readableStream, ],
    );
    while (true) {
      let event = await resolveNextPromise;
      resolveNextPromise = mkResolveNextPromise();
      if (event.type === "progress") {
        yield event.params;
        resume();
      } else if (event.type === "done") {
        if (event.params.result.type === "Err") {
          throw new Error(event.params.result.message);
        }
        return;
      }
    }
  }

  async save(writableStream: WritableStream): Promise<void> {
    let worker = this.ensureWorkerInitialized();
    let onDoneResolve = () => {};
    let onDoneReject = (reason: any) => {};
    let onDonePromise = new Promise<void>((resolve, reject) => {
      onDoneResolve = resolve;
      onDoneReject = reject;
    });
    let onDoneId = this.registerCallback((params) => {
      this.unregisterCallback(onDoneId);
      if (params.result.type == "Err") {
        onDoneReject(new Error(params.result.message));
        return;
      }
      onDoneResolve();
    });
    worker.postMessage({
      method: "save",
      params: {
        writableStream,
      },
    });
    return onDonePromise;
  }

  async lock(): Promise<{
    indirectionData: Uint8Array<ArrayBuffer>,
    atlasData: Uint8Array<ArrayBuffer>,
    colourData: Uint8Array<ArrayBuffer>,
    dirtyAtlasBricks: "all" | number[],
    dirtyColourBricks: "all" | number[],
  }> {
    let worker = this.ensureWorkerInitialized();
    let doneResolve: (params: {
      indirectionData: Uint8Array<ArrayBuffer>,
      atlasData: Uint8Array<ArrayBuffer>,
      colourData: Uint8Array<ArrayBuffer>,
      dirtyAtlasBricks: "all" | number[],
      dirtyColourBricks: "all" | number[],
    }) => void = () => {};
    let donePromise = new Promise<{
      indirectionData: Uint8Array<ArrayBuffer>,
      atlasData: Uint8Array<ArrayBuffer>,
      colourData: Uint8Array<ArrayBuffer>,
      dirtyAtlasBricks: "all" | number[],
      dirtyColourBricks: "all" | number[],
    }>((resolve) => doneResolve = resolve);
    let doneId = this.registerCallback((params) => {
      this.unregisterCallback(doneId);
      doneResolve(params);
    });
    worker.postMessage({
      method: "lock",
      params: {
        doneId,
      },
    });
    return donePromise;
  }

  async unlock(params: {
    indirectionData: Uint8Array<ArrayBuffer>,
    atlasData: Uint8Array<ArrayBuffer>,
    colourData: Uint8Array<ArrayBuffer>,
  }) {
    let worker = this.ensureWorkerInitialized();
    let doneResolve = () => {};
    let donePromise = new Promise<void>((resolve) => doneResolve = resolve);
    let doneId = this.registerCallback(() => {
      this.unregisterCallback(doneId);
      doneResolve();
    });
    worker.postMessage(
      {
        method: "unlock",
        params,
      },
      [ params.indirectionData, params.atlasData, params.colourData ],
    );
    return donePromise;
  }

  async addOperation(operation: Operation) {
    let worker = this.ensureWorkerInitialized();
    let doneResolve = () => {};
    let donePromise = new Promise<void>((resolve) => doneResolve = resolve);
    let doneId = this.registerCallback(() => {
      this.unregisterCallback(doneId);
      doneResolve();
    });
    worker.postMessage({
      method: "addOperation",
      params: {
        doneId,
        origin: {
          x: operation.origin.x,
          y: operation.origin.y,
          z: operation.origin.z,
        },
        orientation: {
          x: operation.orientation.x,
          y: operation.orientation.y,
          z: operation.orientation.z,
          w: operation.orientation.w,
        },
        operationShape: (() => {
          let shape = operation.operationShape;
          switch (shape.type) {
            case "Ellipsoid":
              return {
                type: "Ellipsoid",
                radius: {
                  x: shape.radius.x,
                  y: shape.radius.y,
                  z: shape.radius.z,
                },
              };
            case "Box":
              return {
                type: "Box",
                len: {
                  x: shape.len.x,
                  y: shape.len.y,
                  z: shape.len.z,
                },
              };
            case "Capsule":
              return {
                type: "Capsule",
                lenX: shape.lenX,
                radius: shape.radius,
              };
          }
        })(),
        softness: operation.softness,
      },
    });
    return donePromise;
  }

  async updateBrickMap() {
    let worker = this.ensureWorkerInitialized();
    let doneResolve = () => {};
    let donePromise = new Promise<void>((resolve) => doneResolve = resolve);
    let doneId = this.registerCallback(() => {
      this.unregisterCallback(doneId);
      doneResolve();
    });
    worker.postMessage({
      method: "updateBrickMap",
      params: {
        doneId,
      },
    });
    return donePromise;
  }

  async setCombineMode(mode: "Add" | "Subtract" | "Paint") {
    let worker = this.ensureWorkerInitialized();
    let doneResolve = () => {};
    let donePromise = new Promise<void>((resolve) => doneResolve = resolve);
    let doneId = this.registerCallback(() => {
      this.unregisterCallback(doneId);
      doneResolve();
    });
    worker.postMessage({
      method: "setCombineMode",
      params: {
        doneId,
        mode,
      },
    });
    return donePromise;
  }

  async setColour(colour: THREE.Color) {
    let worker = this.ensureWorkerInitialized();
    let doneResolve = () => {};
    let donePromise = new Promise<void>((resolve) => doneResolve = resolve);
    let doneId = this.registerCallback(() => {
      this.unregisterCallback(doneId);
      doneResolve();
    });
    worker.postMessage({
      method: "setColour",
      params: {
        doneId,
        r: colour.r,
        g: colour.g,
        b: colour.b,
      },
    });
    return donePromise;
  }

  async setSoftness(softness: number) {
    let worker = this.ensureWorkerInitialized();
    let doneResolve = () => {};
    let donePromise = new Promise<void>((resolve) => doneResolve = resolve);
    let doneId = this.registerCallback(() => {
      this.unregisterCallback(doneId);
      doneResolve();
    });
    worker.postMessage({
      method: "setSoftness",
      params: {
        doneId,
        softness,
      },
    });
    return donePromise;
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
      null,
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
      null,
      ATLAS_RES,
      ATLAS_RES,
      ATLAS_RES,
    );
    aTex.format = THREE.RedFormat; 
    aTex.internalFormat = "R8";
    aTex.type = THREE.UnsignedByteType;
    aTex.minFilter = THREE.LinearFilter;
    aTex.magFilter = THREE.LinearFilter;
    aTex.wrapS = THREE.ClampToEdgeWrapping;
    aTex.wrapT = THREE.ClampToEdgeWrapping;
    aTex.wrapR = THREE.ClampToEdgeWrapping;
    aTex.unpackAlignment = 1;
    aTex.needsUpdate = true;
    let cTex = new THREE.Data3DTexture(
      null,
      ATLAS_RES,
      ATLAS_RES,
      ATLAS_RES,
    );
    cTex.format = THREE.RGBAFormat;
    cTex.internalFormat = "RGBA8";
    cTex.type = THREE.UnsignedByteType;
    cTex.minFilter = THREE.LinearFilter;
    cTex.magFilter = THREE.LinearFilter;
    cTex.wrapS = THREE.ClampToEdgeWrapping;
    cTex.wrapT = THREE.ClampToEdgeWrapping;
    cTex.wrapR = THREE.ClampToEdgeWrapping;
    cTex.unpackAlignment = 1;
    cTex.needsUpdate = true;
    uniforms.uIndirectionTex = { value: iTex, };
    uniforms.uAtlasTex = { value: aTex, };
    uniforms.uColourTex = { value: cTex, };
    return {
      iTex,
      aTex,
      cTex,
    };
  }

  async updateTextures(params: {
    renderer: THREE.WebGLRenderer,
    textures: BrickMapTHREETextures,
    updateAtlas: boolean,
    updateColours: boolean,
  }): Promise<{
    onAfterRender: () => Promise<void>,
  }> {
    let lockResult = await this.lock();
    if (params.updateAtlas) {
      this.updateTexturesThreeJs(
        params.renderer,
        params.textures,
        lockResult,
      );
    }
    if (params.updateColours) {
      this.updatePaintThreeJs(
        params.renderer,
        params.textures,
        lockResult,
      );
    }
    return {
      onAfterRender: () => this.unlock(lockResult),
    };
  }

  private tempAtlasDataBuffer = new Uint8Array(BRICK_P_RES ** 3);
  updateTexturesThreeJs(
    renderer: THREE.WebGLRenderer,
    textures: BrickMapTHREETextures,
    lockResult: {
      indirectionData: Uint8Array<ArrayBuffer>,
      atlasData: Uint8Array<ArrayBuffer>,
      dirtyAtlasBricks: "all" | number[],
    }
  ) {
    textures.iTex.image.data = lockResult.indirectionData;
    textures.aTex.image.data = lockResult.atlasData;
    textures.iTex.needsUpdate = true;
    {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      let textureProperties = renderer.properties.get(textures.aTex);
      if (lockResult.dirtyAtlasBricks == "all") {
        textures.aTex.needsUpdate = true;
        return;
      }
      if (!(textureProperties as any).__webglTexture) {
        textures.aTex.needsUpdate = true;
        return;
      }
      gl.bindTexture(gl.TEXTURE_3D, (textureProperties as any).__webglTexture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
      gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, 0);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
      for (let aIdx of lockResult.dirtyAtlasBricks) {
        let ax = aIdx % BRICKS_PER_RES;
        let ay = Math.floor(aIdx / BRICKS_PER_RES) % BRICKS_PER_RES;
        let az = Math.floor(aIdx / (BRICKS_PER_RES * BRICKS_PER_RES));
        const xOff = ax * BRICK_P_RES;
        const yOff = ay * BRICK_P_RES;
        const zOff = az * BRICK_P_RES;
        let idx = 0;
        for (let z = 0; z < BRICK_P_RES; z++) {
          let sliceStart = ((zOff + z) * ATLAS_RES * ATLAS_RES + (yOff * ATLAS_RES) + xOff);
          for (let y = 0; y < BRICK_P_RES; y++) {
            let rowStart = sliceStart + (y * ATLAS_RES);
            for (let x = 0; x < BRICK_P_RES; x++) {
              let pixelPos = rowStart + x;
              this.tempAtlasDataBuffer[idx++] = lockResult.atlasData[pixelPos];
            }
          }
        }
        gl.texSubImage3D(
          gl.TEXTURE_3D,
          0,
          xOff, yOff, zOff,
          BRICK_P_RES, BRICK_P_RES, BRICK_P_RES,
          gl.RED,
          gl.UNSIGNED_BYTE,
          this.tempAtlasDataBuffer,
        );
      }
      renderer.state.reset();
    }
  }

  private tempColourDataBuffer = new Uint8Array((BRICK_P_RES ** 3) << 2);
  updatePaintThreeJs(
    renderer: THREE.WebGLRenderer,
    textures: BrickMapTHREETextures,
    lockResult: {
      colourData: Uint8Array<ArrayBuffer>,
      dirtyColourBricks: "all" | number[],
    }
  ) {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    let textureProperties = renderer.properties.get(textures.cTex);
    if (lockResult.dirtyColourBricks == "all") {
      textures.cTex.needsUpdate = true;
      return;
    }
    if (!(textureProperties as any).__webglTexture) {
      textures.cTex.needsUpdate = true;
      return;
    }
    gl.bindTexture(gl.TEXTURE_3D, (textureProperties as any).__webglTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, 0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
    for (let aIdx of lockResult.dirtyColourBricks) {
      let ax = aIdx % BRICKS_PER_RES;
      let ay = Math.floor(aIdx / BRICKS_PER_RES) % BRICKS_PER_RES;
      let az = Math.floor(aIdx / (BRICKS_PER_RES * BRICKS_PER_RES));
      const xOff = ax * BRICK_P_RES;
      const yOff = ay * BRICK_P_RES;
      const zOff = az * BRICK_P_RES;
      let idx = 0;
      for (let z = 0; z < BRICK_P_RES; z++) {
        let sliceStart = ((zOff + z) * ATLAS_RES * ATLAS_RES + (yOff * ATLAS_RES) + xOff) << 2;
        for (let y = 0; y < BRICK_P_RES; y++) {
          let rowStart = sliceStart + (y * ATLAS_RES << 2);
          for (let x = 0; x < BRICK_P_RES; x++) {
            let pixelPos = rowStart + (x << 2);
            this.tempColourDataBuffer[idx++] = lockResult.colourData[pixelPos];
            this.tempColourDataBuffer[idx++] = lockResult.colourData[pixelPos + 1];
            this.tempColourDataBuffer[idx++] = lockResult.colourData[pixelPos + 2];
            this.tempColourDataBuffer[idx++] = lockResult.colourData[pixelPos + 3];
          }
        }
      }
      gl.texSubImage3D(
        gl.TEXTURE_3D,
        0,
        xOff, yOff, zOff,
        BRICK_P_RES, BRICK_P_RES, BRICK_P_RES,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.tempColourDataBuffer
      );
    }
    renderer.state.reset();
  }
}

