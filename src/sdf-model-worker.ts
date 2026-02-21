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
    case "resume":
      resumeLoad();
      break;
    case "releaseBrickMapToWorker":
      break;
    case "obtainBrickMapFromWorker":
      break;
  }
});

async function load(params: {
  readableStream: ReadableStream,
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
        type: "progress",
        params: progress,
      });
      await new Promise<void>((resolve) => resumeLoad = resolve);
    }
  }
  isLoading = false;
  resumeLoad = () => {};
  self.postMessage({
    "type": "done",
  });
}
