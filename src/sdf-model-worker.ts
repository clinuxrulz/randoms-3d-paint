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
  version: number,
  reader: ReadableStreamDefaultReader<Uint8Array>,
}) {
  isLoading = true;
  let lastTime = performance.now();
  let readerHelper = new ReaderHelper(params.reader);
  await operations.load(params.version, readerHelper);
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
