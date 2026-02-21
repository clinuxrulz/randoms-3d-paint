import "./BrickMap";
import { BrickMap } from "./BrickMap";
import { Operations } from "./operations";

let operations = new Operations();
let brickMap = new BrickMap();

self.addEventListener("message", (e) => {
  let data = e.data;
  let method = data.method;
  let params = data.params;
  switch (method) {
    case "load":
    case "releaseBrickMapToWorker":
      break;
    case "obtainBrickMapFromWorker":
      
      break;
  }
});
