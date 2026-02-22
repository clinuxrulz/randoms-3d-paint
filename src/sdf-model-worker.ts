import * as THREE from "three";
import "./BrickMap";
import { BrickMap } from "./BrickMap";
import { Operations } from "./operations";
import { ReaderHelper } from "./ReaderHelper";

const DELAY_BETWEEN_PROGRESS_UPDATE = 500;

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
    case "march":
      march(params);
      break;
    case "writeShaderCode":
      writeShaderCode(params);
      break;
  }
});

async function march(params: {
  ro: { x: number, y: number, z: number },
  rd: { x: number, y: number, z: number },
  doneId: number,
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

async function writeShaderCode(params: { doneId: number }) {
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
  onProgressId: number,
  onDoneId: number,
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
  await operations.load(version, readerHelper);
  for await (let progress of operations.updateBrickMapAsyncGen(brickMap)) {
    let time = performance.now();
    if (time - lastTime >= DELAY_BETWEEN_PROGRESS_UPDATE) {
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

async function save(params: { onDoneId: number }) {
  let version = 2;
  let versionBuffer = new Uint8Array([version & 0xFF, (version >> 8) & 0xFF]);

  // 1. Collect all uncompressed data into a single ArrayBuffer
  const uncompressedParts: Uint8Array[] = [];
  const fakeWriter: WritableStreamDefaultWriter<BufferSource> = {
    async write(chunk: BufferSource) {
      uncompressedParts.push(new Uint8Array(chunk)); // Ensure we copy the chunk
    },
    close: async () => {}, // No-op for fake writer
    abort: async () => {}, // No-op for fake writer
    releaseLock: () => {}, // No-op for fake writer
    closed: Promise.resolve(),
    ready: Promise.resolve(),
  };

  // Call operations.save with our fake writer to collect all uncompressed bytes
  await operations.save(version, fakeWriter);
  const uncompressedBlob = new Blob(uncompressedParts);
  const uncompressedArrayBuffer = await uncompressedBlob.arrayBuffer();

  // 2. Compress the single uncompressed ArrayBuffer
  const cs = new CompressionStream("gzip");
  const compressedWriter = cs.writable.getWriter();
  
  // Write the entire uncompressed buffer to the compression stream
  compressedWriter.write(uncompressedArrayBuffer);
  compressedWriter.close();

  // Read the compressed data out of the compression stream
  const compressedChunks: Uint8Array[] = [];
  const compressedReader = cs.readable.getReader();
  while (true) {
    const { value, done } = await compressedReader.read();
    if (done) break;
    compressedChunks.push(value);
  }

  const compressedArrayBuffer = await new Blob(compressedChunks).arrayBuffer();

  // 3. Combine version with compressed data
  const finalBlob = new Blob([versionBuffer, compressedArrayBuffer]);
  const finalArrayBuffer = await finalBlob.arrayBuffer();

  self.postMessage({
    method: "callCallback",
    params: {
      id: params.onDoneId,
      params: {
        result: {
          type: "Ok",
          buffer: finalArrayBuffer,
        },
      },
    },
  }, [finalArrayBuffer]); // Transfer the final ArrayBuffer
}

async function addOperation(params: {
  doneId: number,
  origin: { x: number, y: number, z: number },
  orientation: { x: number, y: number, z: number, w: number },
  operationShape: { type: string, [key: string]: any },
  softness: number,
}) {
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

async function updateBrickMap(params: { doneId: number, }) {
  operations.updateBrickMap(brickMap);
  self.postMessage({
    method: "callCallback",
    params: {
      id: params.doneId,
    },
  });
}

function lock(params: { doneId: number, }) {
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
  doneId: number,
}) {
  brickMap.unlock(params);
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

async function setCombineMode(params: { doneId: number, mode: "Add" | "Subtract" | "Paint" }) {
  operations.combineMode = params.mode;
  self.postMessage({
    method: "callCallback",
    params: {
      id: params.doneId,
    },
  });
}

async function setColour(params: { doneId: number, r: number, g: number, b: number }) {
  operations.colour.setRGB(params.r, params.g, params.b);
  self.postMessage({
    method: "callCallback",
    params: {
      id: params.doneId,
    },
  });
}

async function setSoftness(params: { doneId: number, softness: number }) {
  operations.softness = params.softness;
  self.postMessage({
    method: "callCallback",
    params: {
      id: params.doneId,
    },
  });
}
