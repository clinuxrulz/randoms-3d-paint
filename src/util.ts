import * as THREE from "three";

export class NoTrack<A> {
  value: A;
  constructor(value: A) {
    this.value = value;
  }
}

export function renderTargetToDataURL(renderer: THREE.WebGLRenderer, renderTarget: THREE.WebGLRenderTarget) {
  const { width, height } = renderTarget;
  const pixels = new Uint8Array(4 * width * height);
  renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx == null) {
    return undefined;
  }
  const imageData = new ImageData(new Uint8ClampedArray(pixels), width, height);
  ctx.save();
  ctx.scale(1, -1);
  ctx.translate(0, -height);
  ctx.putImageData(imageData, 0, 0);
  ctx.restore();
  return canvas.toDataURL('image/png');
}
