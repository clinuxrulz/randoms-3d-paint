import { BrickMap } from "./BrickMap";
import FileSaver from "file-saver";
import { Operations } from "./operations";

export class ReaderHelper {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  leftOver: Uint8Array | undefined = undefined;
  leftOverOffset: number = 0;

  constructor(reader: ReadableStreamDefaultReader<Uint8Array>) {
    this.reader = reader;
  }

  async read(buffer: Uint8Array, offset: number, len: number): Promise<number> {
    let at = offset;
    let max = at + len;
    while (at < max) {
      if (this.leftOver == undefined) {
        let data = await this.reader.read();
        if (data.done) {
          return at - offset;
        }
        this.leftOver = data.value;
      }
      let loLen = this.leftOver.length - this.leftOverOffset;
      let m = Math.min(loLen, max - at);
      buffer.set(this.leftOver.subarray(this.leftOverOffset, this.leftOverOffset + m), at);
      if (m == loLen) {
        this.leftOver = undefined;
        this.leftOverOffset = 0;
      } else {
        this.leftOverOffset += m;
      }
      at += m;
    }
    return len;
  }

  private readBuffer = new Uint8Array(16);
  private dataView = new DataView(this.readBuffer.buffer);

  async readU8(): Promise<number> {
    await this.read(this.readBuffer, 0, 1);
    return this.readBuffer[0];
  }

  async readU16(): Promise<number> {
    await this.read(this.readBuffer, 0, 2);
    return this.readBuffer[0] | (this.readBuffer[1] << 8);
  }

  async readU32(): Promise<number> {
    await this.read(this.readBuffer, 0, 4);
    return this.dataView.getUint32(0, true);
  }

  async readF32(): Promise<number> {
    await this.read(this.readBuffer, 0, 4);
    return this.dataView.getFloat32(0, true);
  }
}

async function loadFromReader(version: number, reader: ReadableStreamDefaultReader<Uint8Array>, operations: Operations) {
  let reader2 = new ReaderHelper(reader);
  await operations.load(version, reader2);
}

async function saveToWriter(version: number, writer: WritableStreamDefaultWriter<BufferSource>, operations: Operations) {
  await operations.save(version, writer);
}

async function loadFromReadable(readable: ReadableStream<Uint8Array>, operations: Operations) {
  let reader = readable.getReader();
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
  await loadFromReader(version, decompressReader, operations);
}

async function saveToWritable(writable: WritableStream<Uint8Array>, operations: Operations) {
  let version = 2;
  let versionBuffer = new Uint8Array([version & 0xFF, (version >> 8) & 0xFF]);
  {
    let writer = writable.getWriter();
    await writer.write(versionBuffer);
    writer.releaseLock();
  }
  let cs = new CompressionStream("gzip");
  let csWriter = cs.writable.getWriter();
  let savePromise = (async () => {
    await saveToWriter(version, csWriter, operations);
    await csWriter.close();
  })();
  await cs.readable.pipeTo(writable);
  await savePromise;
}

export async function uploadScene(file: File, operations: Operations) {
  let readable = await file.stream();
  await loadFromReadable(readable, operations);
}

export async function downloadScene(filename: string, operations: Operations) {
  let {
    writable,
    result: blob,
  } = createWritableStreamToBlob("application/octet-stream");
  await saveToWritable(writable, operations);
  let blob2 = await blob;
  FileSaver.saveAs(blob2, filename);
}

export async function loadScene(fileName: string, operations: Operations): Promise<boolean> {
  let dir = await navigator.storage.getDirectory();
  let fileHandle: FileSystemFileHandle;
  try {
    fileHandle = await dir.getFileHandle(fileName);
  } catch (ex) {
    if (ex instanceof DOMException) {
      if (ex.name == "NotFoundError") {
        return false;
      }
    }
    throw ex;
  }
  let file = await fileHandle.getFile();
  let readable = await file.stream();
  await loadFromReadable(readable, operations);
  // stats
  console.log("File size:", file.size);
  //
  return true;
}

export async function saveScene(fileName: string, operations: Operations) {
  let dir = await navigator.storage.getDirectory();
  let fileHandle = await dir.getFileHandle(fileName, { create: true, });
  let writable = await fileHandle.createWritable();
  await saveToWritable(writable, operations);
  // stats
  let file = await fileHandle.getFile();
  console.log("File size:", file.size);
  //
}

function createWritableStreamToBlob(mimeType: string): {
  writable: WritableStream<Uint8Array<ArrayBuffer>>,
  result: Promise<Blob>,
} {
  let chunks: Uint8Array<ArrayBuffer>[] = [];
  let resolve: (blob: Blob) => void = () => {};
  let reject: (reason: any) => void = () => {};
  let result = new Promise<Blob>((resolve2, reject2) => {
    resolve = resolve2;
    reject = reject2;
  });
  let writable = new WritableStream<Uint8Array<ArrayBuffer>>({
    write(chunk) {
      chunks.push(chunk);
    },
    close() {
      resolve(new Blob(chunks, { type: mimeType }));
    },
    abort(err) {
      reject(err);
    },
  });
  return {
    writable,
    result,
  }
}
