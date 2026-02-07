import { BrickMap } from "./BrickMap";

export class ReaderHelper {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private leftOver: Uint8Array | undefined = undefined;
  private leftOverOffset: number = 0;

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

export async function load(reader: ReadableStreamDefaultReader<Uint8Array>, brickMap: BrickMap) {
  let reader2 = new ReaderHelper(reader);
  let version = await reader2.readU16();
  brickMap.load(reader2);
}

export async function save(writer: WritableStreamDefaultWriter<Uint8Array>, brikMap: BrickMap) {
  let buffer = new Uint8Array(16);
  let version = 1;
  buffer[0] = version & 0xFF;
  buffer[1] = (version >> 8) & 0xFF;
  await writer.write(buffer);
  brikMap.save(writer);
}

