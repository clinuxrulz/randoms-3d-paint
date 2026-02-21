import "./BrickMap";
import { BrickMap } from "./BrickMap";
import { Operations } from "./operations";
import { ReaderHelper } from "./ReaderHelper";

const DELAY_BETWEEN_PROGRESS_UPDATE = 500;

let isLoading = false;
let resumeLoad = () => {};

let operations = new Operations();
let brickMap = new BrickMap();

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
  }
});

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
      },
    },
  });
}

async function save(params: {
  writableStream: WritableStream,
  onDoneId: number,
}) {
  let version = 2;
  let versionBuffer = new Uint8Array([version & 0xFF, (version >> 8) & 0xFF]);
  {
    let writer = params.writableStream.getWriter();
    await writer.write(versionBuffer);
    writer.releaseLock();
  }
  let cs = new CompressionStream("gzip");
  let csWriter = cs.writable.getWriter();
  let savePromise = (async () => {
    operations.save(version, csWriter);
    await csWriter.close();
  })();
  await cs.readable.pipeTo(params.writableStream);
  await savePromise;
  self.postMessage({
    method: "callCallback",
    params: {
      id: params.onDoneId,
    },
  });
}

function lock(params: { doneId: number, }) {
  let result = brickMap.lock();
  self.postMessage(
    {
      method: "callCallback",
      params: {
        id: params.doneId,
        params: result,
      },
    },
    "/",
    [
      result.indirectionData,
      result.atlasData,
      result.colourData,
    ],
  );
}

function unlock(params: {
  buffers: {
    indirectionData: Uint8Array<ArrayBuffer>,
    atlasData: Uint8Array<ArrayBuffer>,
    colourData: Uint8Array<ArrayBuffer>,
  },
  doneId: number,
}) {
  brickMap.unlock(params.buffers);
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

