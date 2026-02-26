import * as THREE from "three";
import "./BrickMap";
import { BrickMap } from "./BrickMap";
import { Operations } from "./operations";
import { ReaderHelper } from "./ReaderHelper";
import { march as marchingCubes } from "./marching_cubes/marching_cubes";

const DELAY_BETWEEN_PROGRESS_UPDATE = 100;

let isLoading = false;
let resumeLoad = () => {};

let operations = new Operations();
let brickMap = new BrickMap();

let workerSelf = self as unknown as Worker;

self.addEventListener("message", (e) => {
  let data = e.data;
  let method = data.method;
  let params = data.params;
  switch (method) {
    case "load":
      load(params);
      break;
    case "save":
      save(params);
      break;
    case "resume":
      resumeLoad();
      break;
    case "lock":
      lock(params);
      break;
    case "unlock":
      unlock(params);
      break;
    case "addOperation":
      addOperation(params);
      break;
    case "updateBrickMap":
      updateBrickMap(params);
      break;
    case "setCombineMode":
      setCombineMode(params);
      break;
    case "setColour":
      setColour(params);
      break;
    case "setSoftness":
      setSoftness(params);
      break;
    case "directDraw":
      directDraw(params);
      break;
    case "directStroke":
      directStroke(params);
      break;
    case "directPaintDraw":
      directPaintDraw(params);
      break;
    case "directPaintStroke":
      directPaintStroke(params);
      break;
    case "march":
      march(params);
      break;
    case "marchCubes":
      marchCubes(params);
      break;
    case "writeShaderCode":
      writeShaderCode(params);
      break;
  }
});

async function directDraw(params: {
  pt: { x: number, y: number, z: number },
  negative: boolean,
  brushSize: number,
  doneId: string,
}) {
  let vptx = params.pt.x / 10.0;
  let vpty = params.pt.y / 10.0;
  let vptz = params.pt.z / 10.0;
  let cx = 512 + Math.round(vptx);
  let cy = 512 + Math.round(vpty);
  let cz = 512 + Math.round(vptz);
  let r = 0.5 * params.brushSize;
  let r2 = Math.round(r);
  const sqrt3 = Math.sqrt(3);
  for (let i = -r2 - 2; i <= r2 + 2; ++i) {
    let dz = (cz + i - 512) - vptz;
    for (let j = -r2 - 2; j <= r2 + 2; ++j) {
      let dy = (cy + j - 512) - vpty;
      for (let k = -r2 - 2; k <= r2 + 2; ++k) {
        let dx = (cx + k - 512) - vptx;
        let x = cx + k;
        let y = cy + j;
        let z = cz + i;
        if (x < 0 || x >= 1024 || y < 0 || y >= 1024 || z < 0 || z >= 1024) continue;
        let a = (Math.sqrt(dx * dx + dy * dy + dz * dz) - r) / sqrt3;
        let b = (128.0 - brickMap.get(x, y, z)) / 127.0;
        let c = params.negative ? Math.max(b, -a) : Math.min(b, a);
        let val = 128 - Math.floor(Math.max(-1, Math.min(1, c)) * 127);
        if (val < 1) val = 1;
        if (val > 255) val = 255;
        brickMap.set(x, y, z, val);
      }
    }
  }
  self.postMessage({
    method: "callCallback",
    params: { id: params.doneId, },
  });
}

async function directStroke(params: {
  p1: { x: number, y: number, z: number },
  p2: { x: number, y: number, z: number },
  negative: boolean,
  brushSize: number,
  doneId: string,
}) {
  let v1x = params.p1.x / 10.0;
  let v1y = params.p1.y / 10.0;
  let v1z = params.p1.z / 10.0;
  let v2x = params.p2.x / 10.0;
  let v2y = params.p2.y / 10.0;
  let v2z = params.p2.z / 10.0;

  let r = 0.5 * params.brushSize;
  let r2 = Math.round(r);

  let ux = v2x - v1x;
  let uy = v2y - v1y;
  let uz = v2z - v1z;
  let uu = ux * ux + uy * uy + uz * uz;

  let min_x = 512 + Math.floor(Math.min(v1x, v2x) - r - 2);
  let max_x = 512 + Math.ceil(Math.max(v1x, v2x) + r + 2);
  let min_y = 512 + Math.floor(Math.min(v1y, v2y) - r - 2);
  let max_y = 512 + Math.ceil(Math.max(v1y, v2y) + r + 2);
  let min_z = 512 + Math.floor(Math.min(v1z, v2z) - r - 2);
  let max_z = 512 + Math.ceil(Math.max(v1z, v2z) + r + 2);

  const sqrt3 = Math.sqrt(3);
  for (let i = min_z; i <= max_z; ++i) {
    let dz_v1 = (i - 512) - v1z;
    for (let j = min_y; j <= max_y; ++j) {
      let dy_v1 = (j - 512) - v1y;
      for (let k = min_x; k <= max_x; ++k) {
        if (i < 0 || i >= 1024 || j < 0 || j >= 1024 || k < 0 || k >= 1024) continue;
        let dx_v1 = (k - 512) - v1x;
        
        let t = (dx_v1 * ux + dy_v1 * uy + dz_v1 * uz) / uu;
        t = Math.max(0.0, Math.min(1.0, t));
        
        let dx = dx_v1 - ux * t;
        let dy = dy_v1 - uy * t;
        let dz = dz_v1 - uz * t;
        
        let a = (Math.sqrt(dx * dx + dy * dy + dz * dz) - r) / sqrt3;
        let b = (128.0 - brickMap.get(k, j, i)) / 127.0;
        let c = params.negative ? Math.max(b, -a) : Math.min(b, a);
        let val = 128 - Math.floor(Math.max(-1, Math.min(1, c)) * 127);
        if (val < 1) val = 1;
        if (val > 255) val = 255;
        brickMap.set(k, j, i, val);
      }
    }
  }
  self.postMessage({
    method: "callCallback",
    params: { id: params.doneId, },
  });
}

async function directPaintDraw(params: {
  pt: { x: number, y: number, z: number },
  brushSize: number,
  r: number,
  g: number,
  b: number,
  doneId: string,
}) {
  let vptx = params.pt.x / 10.0;
  let vpty = params.pt.y / 10.0;
  let vptz = params.pt.z / 10.0;
  let cx = 512 + Math.round(vptx);
  let cy = 512 + Math.round(vpty);
  let cz = 512 + Math.round(vptz);
  let r = 0.5 * params.brushSize;
  let r2 = Math.round(r);
  
  let pr = Math.floor(params.r * 255.0);
  let pg = Math.floor(params.g * 255.0);
  let pb = Math.floor(params.b * 255.0);

  for (let i = -r2 - 2; i <= r2 + 2; ++i) {
    let dz = (cz + i - 512) - vptz;
    for (let j = -r2 - 2; j <= r2 + 2; ++j) {
      let dy = (cy + j - 512) - vpty;
      for (let k = -r2 - 2; k <= r2 + 2; ++k) {
        let dx = (cx + k - 512) - vptx;
        let x = cx + k;
        let y = cy + j;
        let z = cz + i;
        if (x < 0 || x >= 1024 || y < 0 || y >= 1024 || z < 0 || z >= 1024) continue;
        
        let dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist <= r) {
          brickMap.paint(x, y, z, pr, pg, pb);
        }
      }
    }
  }
  self.postMessage({
    method: "callCallback",
    params: { id: params.doneId, },
  });
}

async function directPaintStroke(params: {
  p1: { x: number, y: number, z: number },
  p2: { x: number, y: number, z: number },
  brushSize: number,
  r: number,
  g: number,
  b: number,
  doneId: string,
}) {
  let v1x = params.p1.x / 10.0;
  let v1y = params.p1.y / 10.0;
  let v1z = params.p1.z / 10.0;
  let v2x = params.p2.x / 10.0;
  let v2y = params.p2.y / 10.0;
  let v2z = params.p2.z / 10.0;

  let r = 0.5 * params.brushSize;
  let r2 = Math.round(r);

  let ux = v2x - v1x;
  let uy = v2y - v1y;
  let uz = v2z - v1z;
  let uu = ux * ux + uy * uy + uz * uz;

  let min_x = 512 + Math.floor(Math.min(v1x, v2x) - r - 2);
  let max_x = 512 + Math.ceil(Math.max(v1x, v2x) + r + 2);
  let min_y = 512 + Math.floor(Math.min(v1y, v2y) - r - 2);
  let max_y = 512 + Math.ceil(Math.max(v1y, v2y) + r + 2);
  let min_z = 512 + Math.floor(Math.min(v1z, v2z) - r - 2);
  let max_z = 512 + Math.ceil(Math.max(v1z, v2z) + r + 2);

  let pr = Math.floor(params.r * 255.0);
  let pg = Math.floor(params.g * 255.0);
  let pb = Math.floor(params.b * 255.0);

  for (let i = min_z; i <= max_z; ++i) {
    let dz_v1 = (i - 512) - v1z;
    for (let j = min_y; j <= max_y; ++j) {
      let dy_v1 = (j - 512) - v1y;
      for (let k = min_x; k <= max_x; ++k) {
        if (i < 0 || i >= 1024 || j < 0 || j >= 1024 || k < 0 || k >= 1024) continue;
        let dx_v1 = (k - 512) - v1x;
        
        let t = (dx_v1 * ux + dy_v1 * uy + dz_v1 * uz) / uu;
        t = Math.max(0.0, Math.min(1.0, t));
        
        let dx = dx_v1 - ux * t;
        let dy = dy_v1 - uy * t;
        let dz = dz_v1 - uz * t;
        
        let dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist <= r) {
          brickMap.paint(k, j, i, pr, pg, pb);
        }
      }
    }
  }
  self.postMessage({
    method: "callCallback",
    params: { id: params.doneId, },
  });
}

async function march(params: {
  ro: { x: number, y: number, z: number },
  rd: { x: number, y: number, z: number },
  doneId: string,
}) {
  let ro = new THREE.Vector3(params.ro.x, params.ro.y, params.ro.z);
  let rd = new THREE.Vector3(params.rd.x, params.rd.y, params.rd.z);
  let t: [number] = [0];
  let hit = brickMap.march(ro, rd, t);
  self.postMessage({
    method: "callCallback",
    params: {
      id: params.doneId,
      params: {
        hit,
        t,
      },
    },
  });
}

async function marchCubes(params: {
  doneId: string,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
  cubeSize: number,
  interpolate: boolean,
}) {
  operations.bvh.evalSDF_start();
  // ... rest of the marchCubes function
  const dummyRd = new THREE.Vector3(0, 0, 1);
  const p = new THREE.Vector3();
  const res = await marchingCubes({
    sdf: async (x: number, y: number, z: number) => {
      // Scale local marching cube coordinates to world coordinates for evalSDF
      const worldX = x * 50.0;
      const worldY = y * 50.0;
      const worldZ = z * 50.0;
      const sdfValue = operations.bvh.evalSDF(worldX, worldY, worldZ);
      // Scale the SDF result back to the marching cube's expected scale
      return sdfValue / 50.0;
    },
    ...params,
  });

  const points = new Float32Array(res.points);
  const triangles = new Uint32Array(res.triangles);

  self.postMessage({
    method: "callCallback",
    params: {
      id: params.doneId,
      params: {
        points,
        triangles,
      },
    },
  }, [ points.buffer, triangles.buffer, ]);
}

async function writeShaderCode(params: { doneId: string }) {
  let code = brickMap.writeShaderCode();
  self.postMessage({
    method: "callCallback",
    params: {
      id: params.doneId,
      params: {
        code,
      },
    },
  });
}

async function load(params: {
  readableStream: ReadableStream,
  onProgressId: string,
  onDoneId: string,
}) {
  //
  let reader = params.readableStream.getReader();
  let version: number;
  let leftOver: Uint8Array | undefined;
  {
    let reader2 = new ReaderHelper(reader);
    version = await reader2.readU16();
    if (reader2.leftOver != undefined) {
      leftOver = reader2.leftOver.subarray(reader2.leftOverOffset);
    } else {
      leftOver = undefined;
    }
  }
  let decompressedStream = new ReadableStream({
    async start(controller) {
      try {
        if (leftOver != undefined) {
          controller.enqueue(leftOver);
        }
        while (true) {
          let { value: chunk, done: chunkDone } = await reader.read();
          if (chunkDone) break;
          controller.enqueue(chunk);
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      } finally {
        reader.releaseLock();
      }
    }
  }).pipeThrough(new DecompressionStream("gzip"));
  let decompressReader = decompressedStream.getReader();
  //
  isLoading = true;
  let lastTime = performance.now();
  let readerHelper = new ReaderHelper(decompressReader);
  brickMap.clear();
  await operations.load(version, readerHelper);
  console.log(`Loaded ${operations.operations.length} operations`);

  for await (let progress of operations.updateBrickMapAsyncGen(brickMap)) {
    let time = performance.now();
    if (time - lastTime >= DELAY_BETWEEN_PROGRESS_UPDATE) {
      lastTime = time;
      self.postMessage({
        method: "callCallback",
        params: {
          id: params.onProgressId,
          params: {
            type: "progress",
            params: progress,
          },
        },
      });
      await new Promise<void>((resolve) => resumeLoad = resolve);
    }
  }
  isLoading = false;
  resumeLoad = () => {};
  self.postMessage({
    method: "callCallback",
    params: {
      id: params.onDoneId,
      params: {
        type: "done",
        result: { type: "Ok", value: null, },
      },
    },
  });
}

async function save(params: { onDoneId: string, writableStream: WritableStream }) {
  let version = 2;
  const writer = params.writableStream.getWriter();

  try {
    let versionBuffer = new Uint8Array([version & 0xFF, (version >> 8) & 0xFF]);
    await writer.write(versionBuffer);
    writer.releaseLock();

     const compressionStream = new CompressionStream("gzip");
    const compressedWriter = compressionStream.writable.getWriter();
    const compressionDone = compressionStream.readable.pipeTo(params.writableStream);

    await operations.save(version, compressedWriter);

    await compressedWriter.close();
    await compressionDone;

    self.postMessage({
      method: "callCallback",
      params: {
        id: params.onDoneId,
        params: {
          result: { type: "Ok" },
        },
      },
    });
  } catch (e: any) {
    console.error("Error during save in worker:", e);
    await writer.abort(e);
    self.postMessage({
      method: "callCallback",
      params: {
        id: params.onDoneId,
        params: {
          result: { type: "Err", message: e.message || "Unknown error during save" },
        },
      },
    });
  }
}

async function addOperation(params: {
  doneId: string,
  origin: { x: number, y: number, z: number },
  orientation: { x: number, y: number, z: number, w: number },
  operationShape: { type: string, [key: string]: any },
  softness: number,
  dirtyTrackingEnabled?: boolean,
}) {
  operations.dirtyTrackingEnabled = params.dirtyTrackingEnabled ?? true;
  operations.softness = params.softness;
  const origin = new THREE.Vector3(params.origin.x, params.origin.y, params.origin.z);
  const orientation = new THREE.Quaternion(params.orientation.x, params.orientation.y, params.orientation.z, params.orientation.w);
  switch (params.operationShape.type) {
    case "Ellipsoid":
      operations.insertEllipsoid(
        origin,
        orientation,
        new THREE.Vector3(params.operationShape.radius.x, params.operationShape.radius.y, params.operationShape.radius.z)
      );
      break;
    case "Box":
      operations.insertBox(
        origin,
        orientation,
        new THREE.Vector3(params.operationShape.len.x, params.operationShape.len.y, params.operationShape.len.z)
      );
      break;
    case "Capsule":
      operations.insertCapsule(
        origin,
        orientation,
        params.operationShape.lenX,
        params.operationShape.radius
      );
      break;
  }
  self.postMessage({
    method: "callCallback",
    params: {
      id: params.doneId,
    },
  });
}

async function updateBrickMap(params: { doneId: string, }) {
  operations.updateBrickMap(brickMap);
  self.postMessage({
    method: "callCallback",
    params: {
      id: params.doneId,
    },
  });
}

function lock(params: { doneId: string, }) {
  let result = brickMap.lock();
  let dirtyAtlasBricks: "all" | number[];
  if (brickMap.forceAllAtlasDirty) {
    dirtyAtlasBricks = "all";
  } else {
    dirtyAtlasBricks = [ ...brickMap.dirtyAtlasBricks, ];
  }
  let dirtyColourBricks: "all" | number[];
  if (brickMap.forceAllColoursDirty) {
    dirtyColourBricks = "all";
  } else {
    dirtyColourBricks = [ ...brickMap.dirtyColourBricks, ];
  }
  brickMap.forceAllAtlasDirty = false;
  brickMap.forceAllColoursDirty = false;
  brickMap.dirtyAtlasBricks.clear();
  brickMap.dirtyColourBricks.clear();
  
  workerSelf.postMessage(
    {
      method: "callCallback",
      params: {
        id: params.doneId,
        params: {
          ...result,
          dirtyAtlasBricks,
          dirtyColourBricks,
        },
      },
    },
    [
      result.indirectionData,
      result.atlasData,
      result.colourData,
    ],
  );
}

function unlock(params: {
  indirectionData: ArrayBuffer,
  atlasData: ArrayBuffer,
  colourData: ArrayBuffer,
  doneId?: string,
}) {
  brickMap.unlock(params);
  if (params.doneId !== undefined) {
    self.postMessage(
      {
        method: "callCallback",
        params: {
          id: params.doneId,
          params: {},
        },
      },
    );
  }
}

async function setCombineMode(params: { doneId: string, mode: "Add" | "Subtract" | "Paint" }) {
  operations.combineMode = params.mode;
  self.postMessage({
    method: "callCallback",
    params: {
      id: params.doneId,
    },
  });
}

async function setColour(params: { doneId: string, r: number, g: number, b: number }) {
  operations.colour.setRGB(params.r, params.g, params.b);
  self.postMessage({
    method: "callCallback",
    params: {
      id: params.doneId,
    },
  });
}

async function setSoftness(params: { doneId: string, softness: number }) {
  operations.softness = params.softness;
  self.postMessage({
    method: "callCallback",
    params: {
      id: params.doneId,
    },
  });
}
