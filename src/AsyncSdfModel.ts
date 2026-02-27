import * as THREE from "three";
import { Operation, OperationShape } from "./operations";
import SdfModelWorker from "./sdf-model-worker?worker";
import { ATLAS_RES, BRICK_P_RES, BrickMap, BrickMapTHREETextures, BRICKS_PER_RES, GRID_RES } from "./BrickMap";

export class AsyncSdfModel {
  private worker: Worker | undefined = undefined;
  private callbackMap = new Map<string, (params: any) => void>();
  readonly brickMap = new BrickMap();

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

    type Event =
      | { type: "progress", params: { workDone: number, totalWork: number, }, }
      | { type: "done", params: { result: { type: "Ok", } | { type: "Err", message: string, } } };

    let eventQueue: Event[] = [];
    let resolveNext: ((value: void) => void) | undefined = undefined;

    const onProgressId = this.registerCallback((eventData) => {
      eventQueue.push({
        type: eventData.type,
        params: { workDone: eventData.params.workDone, totalWork: eventData.params.totalWork, },
      });
      if (resolveNext) {
        resolveNext();
        resolveNext = undefined;
      }
    });

    const onDoneId = this.registerCallback((params) => {
      this.unregisterCallback(onProgressId);
      this.unregisterCallback(onDoneId);
      eventQueue.push({ type: "done", params, });
      if (resolveNext) {
        resolveNext();
        resolveNext = undefined;
      }
    });

    worker.postMessage(
      {
        method: "load",
        params: { readableStream, onProgressId, onDoneId },
      },
      [ readableStream, ],
    );

    while (true) {
      if (eventQueue.length === 0) {
        await new Promise<void>(r => resolveNext = r);
      }

      let event = eventQueue.shift()!;
      if (event.type === "progress") {
        yield event.params;
        worker.postMessage({ method: "resume", params: {}, });
      } else if (event.type === "done") {
        if (event.params.result.type === "Err") {
          throw new Error(event.params.result.message);
        }
        return;
      }
    }
  }

  async resume() {
    let worker = this.ensureWorkerInitialized();
    worker.postMessage({
      method: "resume",
      params: {},
    });
  }

  async save(writableStream: WritableStream): Promise<void> {
    let worker = this.ensureWorkerInitialized();

    const { readable, writable } = new TransformStream();
    let idPipeDone = readable.pipeTo(writableStream);

    let onDoneResolve: () => void = () => {};
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

    worker.postMessage(
      {
        method: "save",
        params: {
          onDoneId,
          writableStream: writable,
        },
      },
      [writable]
    );

    await Promise.all([onDonePromise, idPipeDone]);
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
      params.indirectionData = new Uint8Array(params.indirectionData);
      params.atlasData = new Uint8Array(params.atlasData);
      params.colourData = new Uint8Array(params.colourData);

      // Update local brickMap
      this.brickMap.updateFromBuffers({
        indirectionData: params.indirectionData,
        atlasData: params.atlasData,
      });

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

  unlock(params: {
    indirectionData: Uint8Array<ArrayBuffer>,
    atlasData: Uint8Array<ArrayBuffer>,
    colourData: Uint8Array<ArrayBuffer>,
  }) {
    let worker = this.ensureWorkerInitialized();
    let indirectionData = params.indirectionData.buffer;
    let atlasData = params.atlasData.buffer;
    let colourData = params.colourData.buffer;
    worker.postMessage(
      {
        method: "unlock",
        params: {
          indirectionData,
          atlasData,
          colourData,
        },
      },
      [ indirectionData, atlasData, colourData, ],
    );
  }

  private isLocked = false;
  private operationQueue: (() => Promise<any>)[] = [];

  private async _enqueue<T>(task: () => Promise<T>): Promise<T> {
    if (this.isLocked) {
      return new Promise<T>((resolve) => {
        this.operationQueue.push(async () => {
          resolve(await task());
        });
      });
    }
    return await task();
  }

  async addOperation(operation: {
    origin: THREE.Vector3,
    orientation: THREE.Quaternion,
    operationShape: OperationShape,
    softness: number,
    dirtyTrackingEnabled?: boolean,
  }) {
    return this._enqueue(async () => {
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
          dirtyTrackingEnabled: operation.dirtyTrackingEnabled,
        },
      });
      return donePromise;
    });
  }

  async directDraw(params: {
    pt: THREE.Vector3,
    negative: boolean,
    brushSize: number,
  }) {
    return this._enqueue(async () => {
      let worker = this.ensureWorkerInitialized();
      let doneResolve = () => {};
      let donePromise = new Promise<void>((resolve) => doneResolve = resolve);
      let doneId = this.registerCallback(() => {
        this.unregisterCallback(doneId);
        doneResolve();
      });
      worker.postMessage({
        method: "directDraw",
        params: {
          doneId,
          pt: { x: params.pt.x, y: params.pt.y, z: params.pt.z },
          negative: params.negative,
          brushSize: params.brushSize,
        },
      });
      return donePromise;
    });
  }

  async directStroke(params: {
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    negative: boolean,
    brushSize: number,
  }) {
    return this._enqueue(async () => {
      let worker = this.ensureWorkerInitialized();
      let doneResolve = () => {};
      let donePromise = new Promise<void>((resolve) => doneResolve = resolve);
      let doneId = this.registerCallback(() => {
        this.unregisterCallback(doneId);
        doneResolve();
      });
      worker.postMessage({
        method: "directStroke",
        params: {
          doneId,
          p1: { x: params.p1.x, y: params.p1.y, z: params.p1.z },
          p2: { x: params.p2.x, y: params.p2.y, z: params.p2.z },
          negative: params.negative,
          brushSize: params.brushSize,
        },
      });
      return donePromise;
    });
  }

  async directPaintDraw(params: {
    pt: THREE.Vector3,
    brushSize: number,
    colour: THREE.Color,
  }) {
    return this._enqueue(async () => {
      let worker = this.ensureWorkerInitialized();
      let doneResolve = () => {};
      let donePromise = new Promise<void>((resolve) => doneResolve = resolve);
      let doneId = this.registerCallback(() => {
        this.unregisterCallback(doneId);
        doneResolve();
      });
      worker.postMessage({
        method: "directPaintDraw",
        params: {
          doneId,
          pt: { x: params.pt.x, y: params.pt.y, z: params.pt.z },
          brushSize: params.brushSize,
          r: params.colour.r,
          g: params.colour.g,
          b: params.colour.b,
        },
      });
      return donePromise;
    });
  }

  async directPaintStroke(params: {
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    brushSize: number,
    colour: THREE.Color,
  }) {
    return this._enqueue(async () => {
      let worker = this.ensureWorkerInitialized();
      let doneResolve = () => {};
      let donePromise = new Promise<void>((resolve) => doneResolve = resolve);
      let doneId = this.registerCallback(() => {
        this.unregisterCallback(doneId);
        doneResolve();
      });
      worker.postMessage({
        method: "directPaintStroke",
        params: {
          doneId,
          p1: { x: params.p1.x, y: params.p1.y, z: params.p1.z },
          p2: { x: params.p2.x, y: params.p2.y, z: params.p2.z },
          brushSize: params.brushSize,
          r: params.colour.r,
          g: params.colour.g,
          b: params.colour.b,
        },
      });
      return donePromise;
    });
  }

  async updateBrickMap() {
    return this._enqueue(async () => {
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
    });
  }

  async setCombineMode(mode: "Add" | "Subtract" | "Paint") {
    return this._enqueue(async () => {
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
    });
  }

  async setColour(colour: THREE.Color) {
    return this._enqueue(async () => {
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
    });
  }

  async setSoftness(softness: number) {
    return this._enqueue(async () => {
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
    });
  }

  async marchCubes(params: {
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    minZ: number,
    maxZ: number,
    cubeSize: number,
    interpolate: boolean,
  }): Promise<{
    points: Float32Array,
    triangles: Uint32Array,
  }> {
    return this._enqueue(async () => {
      let worker = this.ensureWorkerInitialized();
      let doneResolve: (params: {
        points: Float32Array,
        triangles: Uint32Array,
      }) => void = () => {};
      let donePromise = new Promise<{
        points: Float32Array,
        triangles: Uint32Array,
      }>((resolve) => doneResolve = resolve);
      let doneId = this.registerCallback((params) => {
        this.unregisterCallback(doneId);
        doneResolve(params);
      });
      worker.postMessage({
        method: "marchCubes",
        params: {
          doneId,
          ...params,
        },
      });
      return donePromise;
    });
  }

  async march(ro: THREE.Vector3, rd: THREE.Vector3): Promise<{
    hit: boolean,
    t: [number],
  }> {
    return this._enqueue(async () => {
      let worker = this.ensureWorkerInitialized();
      let doneResolve: (params: {
        hit: boolean,
        t: [number],
      }) => void = () => {};
      let donePromise = new Promise<{
        hit: boolean,
        t: [number],
      }>((resolve) => doneResolve = resolve);
      let doneId = this.registerCallback((params) => {
        this.unregisterCallback(doneId);
        doneResolve(params);
      });
      worker.postMessage({
        method: "march",
        params: {
          doneId,
          ro: { x: ro.x, y: ro.y, z: ro.z },
          rd: { x: rd.x, y: rd.y, z: rd.z },
        },
      });
      return donePromise;
    });
  }

  async writeShaderCode(): Promise<string> {
    return this._enqueue(async () => {
      let worker = this.ensureWorkerInitialized();
      let doneResolve: (params: {
        code: string,
      }) => void = () => {};
      let donePromise = new Promise<string>((resolve) => {
        doneResolve = (params) => resolve(params.code);
      });
      let doneId = this.registerCallback((params) => {
        this.unregisterCallback(doneId);
        doneResolve(params);
      });
      worker.postMessage({
        method: "writeShaderCode",
        params: {
          doneId,
        },
      });
      return donePromise;
    });
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
    this.isLocked = true;
    let lockResult = await this.lock();
    if (params.updateAtlas || lockResult.dirtyAtlasBricks == "all" || (Array.isArray(lockResult.dirtyAtlasBricks) && lockResult.dirtyAtlasBricks.length > 0)) {
      this.updateTexturesThreeJs(
        params.renderer,
        params.textures,
        lockResult,
      );
    }
    if (params.updateColours || lockResult.dirtyColourBricks == "all" || (Array.isArray(lockResult.dirtyColourBricks) && lockResult.dirtyColourBricks.length > 0)) {
      this.updatePaintThreeJs(
        params.renderer,
        params.textures,
        lockResult,
      );
    }
    return {
      onAfterRender: async () => {
        this.unlock(lockResult);
        this.isLocked = false;
        
        const queueToProcess = this.operationQueue;
        this.operationQueue = [];

        for (const task of queueToProcess) {
          await task();
        }
        params.renderer.state.reset();
      },
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
      gl.activeTexture(gl.TEXTURE0);
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
    textures.cTex.image.data = lockResult.colourData;
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
    gl.activeTexture(gl.TEXTURE0);
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
            }  }
}
