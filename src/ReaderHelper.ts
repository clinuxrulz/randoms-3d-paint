
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
