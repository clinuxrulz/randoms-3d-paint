import { BrickMap } from "./BrickMap";

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
      let m = Math.min(loLen, len);
      buffer.set(this.leftOver.subarray(this.leftOverOffset, m), at);
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

  async readU16(): Promise<number> {
    this.read(this.readBuffer, 0, 2);
    return this.readBuffer[0] | (this.readBuffer[1] << 8);
  }
}

async function loadFromReader(version: number, reader: ReadableStreamDefaultReader<Uint8Array>, brickMap: BrickMap) {
  let reader2 = new ReaderHelper(reader);
  brickMap.load(reader2);
}

async function saveToWriter(version: number, writer: WritableStreamDefaultWriter<BufferSource>, brikMap: BrickMap) {
  let buffer = new Uint8Array(16);
  buffer[0] = version & 0xFF;
  buffer[1] = (version >> 8) & 0xFF;
  await writer.write(buffer);
  brikMap.save(writer);
}

export async function load(readable: ReadableStream<Uint8Array>, brickMap: BrickMap) {
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
      if (leftOver != undefined) {
        controller.enqueue(leftOver);
      }
      while (true) {
        let { value: chunk, done: chunkDone } = await reader.read();
        if (chunkDone) break;
        controller.enqueue(chunk);
      }
      controller.close();
    }
  }).pipeThrough(new DecompressionStream("gzip"));
  let decompressReader = decompressedStream.getReader();
  await loadFromReader(version, decompressReader, brickMap);
}

export async function save(writable: WritableStream<Uint8Array>, brickMap: BrickMap) {
  let version = 1;
  let versionBuffer = new Uint8Array([version & 0xFF, (version >> 8) & 0xFF]);
  {
    let writer = writable.getWriter();
    await writer.write(versionBuffer);
    writer.releaseLock();
  }
  let cs = new CompressionStream("gzip");
  let savePromise = saveToWriter(version, cs.writable.getWriter(), brickMap);
  await cs.readable.pipeTo(writable);
  await savePromise;
}
