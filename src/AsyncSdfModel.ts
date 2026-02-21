import SdfModelWorker from "./sdf-model-worker?worker";

export class AsyncSdfModel {
  private worker: Worker | undefined = undefined;
  private callbackMap = new Map<string, (params: any) => void>();

  dispose(): void {
    if (this.worker === undefined) {
      return;
    }
    this.worker.terminate();
  }

  private ensureWorkerInitialized(): Worker {
    if (this.worker == undefined) {
      this.worker = new SdfModelWorker();
      this.worker.onmessage = (e) => {
        let data = e.data;
        let method = data.method;
        let params = data.params;
        if (method == "callCallback") {
          let callbackId = params.id;
          let params2 = params.params;
          let callback = this.callbackMap.get(callbackId);
          if (callback != undefined) {
            callback(params2);
          }
        }
      };
    }
    return this.worker;
  }

  private registerCallback(callback: (params: any) => void): string {
    let id = crypto.randomUUID();
    this.callbackMap.set(id, callback);
    return id;
  }

  private unregisterCallback(callbackId: string) {
    this.callbackMap.delete(callbackId);
  }

  async *load(
    readableStream: ReadableStream,
  ): AsyncGenerator<{ workDone: number, totalWork: number, }, void, unknown> {
    let worker = this.ensureWorkerInitialized();
    let resolveNext: (value: any) => void;
    let mkResolveNextPromise =
      () => new Promise<
        | { type: "progress", params: { workDone: number, totalWork: number, }, }
        | { type: "done", params: { result: { type: "Ok", } | { type: "Err", message: string, } } }
      >(r => resolveNext = r);
    let resolveNextPromise = mkResolveNextPromise();
    const resume = () => {
      worker.postMessage({ method: "resume", params: {}, });
    };
    const onProgressId = this.registerCallback((params) => {
      resolveNext({
        type: "progress",
        params: { workDone: params.workDone, totalWork: params.totalWork, },
      });
    });
    const onDoneId = this.registerCallback((params) => {
      this.unregisterCallback(onProgressId);
      this.unregisterCallback(onDoneId);
      resolveNext({ type: "done", params, });
    });
    worker.postMessage(
      {
        method: "load",
        params: { readableStream, onProgressId, onDoneId },
      },
      [ readableStream, ],
    );
    while (true) {
      let event = await resolveNextPromise;
      resolveNextPromise = mkResolveNextPromise();
      if (event.type === "progress") {
        yield event.params;
        resume();
      } else if (event.type === "done") {
        if (event.params.result.type === "Err") {
          throw new Error(event.params.result.message);
        }
        return;
      }
    }
  }

  async save(writableStream: WritableStream): Promise<void> {
    let worker = this.ensureWorkerInitialized();
    let onDoneResolve = () => {};
    let onDoneReject = (reason: any) => {};
    let onDonePromise = new Promise<void>((resolve, reject) => {
      onDoneResolve = resolve;
      onDoneReject = reject;
    });
    let onDoneId = this.registerCallback((params) => {
      this.unregisterCallback(onDoneId);
      if (params.result.type == "Err") {
        onDoneReject(new Error(params.result.message));
        return;
      }
      onDoneResolve();
    });
    worker.postMessage({
      method: "save",
      params: {
        writableStream,
      },
    });
    return onDonePromise;
  }

  async lock(): Promise<{
    indirectionData: Uint8Array<ArrayBuffer>,
    atlasData: Uint8Array<ArrayBuffer>,
    colourData: Uint8Array<ArrayBuffer>,
  }> {
    let worker = this.ensureWorkerInitialized();
    let doneResolve: (params: {
      indirectionData: Uint8Array<ArrayBuffer>,
      atlasData: Uint8Array<ArrayBuffer>,
      colourData: Uint8Array<ArrayBuffer>,
    }) => void = () => {};
    let donePromise = new Promise<{
      indirectionData: Uint8Array<ArrayBuffer>,
      atlasData: Uint8Array<ArrayBuffer>,
      colourData: Uint8Array<ArrayBuffer>,
    }>((resolve) => doneResolve = resolve);
    let doneId = this.registerCallback((params) => {
      this.unregisterCallback(doneId);
      doneResolve(params);
    });
    worker.postMessage({
      method: "lock",
      params: {
        doneId,
      },
    });
    return donePromise;
  }

  async unlock(params: {
    indirectionData: Uint8Array<ArrayBuffer>,
    atlasData: Uint8Array<ArrayBuffer>,
    colourData: Uint8Array<ArrayBuffer>,
  }) {
    let worker = this.ensureWorkerInitialized();
    let doneResolve = () => {};
    let donePromise = new Promise<void>((resolve) => doneResolve = resolve);
    let doneId = this.registerCallback(() => {
      this.unregisterCallback(doneId);
      doneResolve();
    });
    worker.postMessage(
      {
        method: "unlock",
        params,
      },
      [ params.indirectionData, params.atlasData, params.colourData ],
    );
    return donePromise;
  }
}

