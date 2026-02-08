import { batch, createComputed, createMemo, createSignal, on, onCleanup, onMount, Show, type Component } from 'solid-js';
import * as THREE from "three";
import { BrickMap, BrickMapTextures } from './BrickMap';
import RendererView, { RendererViewController } from './RendererView';
import { createStore } from 'solid-js/store';
import { Mode } from './modes/Mode';
import { ModeParams } from './modes/ModeParams';
import { IdleMode } from './modes/IdleMode';
import { DrawMode } from './modes/DrawMode';
import { InsertPrimitivesMode } from './modes/InsertPrimitivesMode';
import { SculptMode } from './modes/SculptMode';
import { loadScene, saveScene } from './load-save';
import { PaintMode } from './modes/PaintMode';

const App: Component = () => {
  let [ state, setState, ] = createStore<{
    mkMode: { new(modeParams: ModeParams): Mode, },
    pointerPos: THREE.Vector2 | undefined,
    pointerDown: boolean,
    pixelSize: number,
  }>({
    mkMode: IdleMode,
    pointerPos: undefined,
    pointerDown: false,
    pixelSize: 1,
  });
  let brickMap = new BrickMap();
  let [ rendererViewController, setRendererViewController, ] = createSignal<RendererViewController>();
  let setMode = (mode: { new(modeParams: ModeParams): Mode, }) => setState("mkMode", () => mode);
  let modeParams: ModeParams = {
    endMode: () => setMode(IdleMode),
    brickMap,
    canvasSize: () => rendererViewController()?.canvasSize(),
    pointerPos: () => state.pointerPos,
    pointerDown: () => state.pointerDown,
    updateSdf: () => {
      let controller = rendererViewController();
      controller?.onBrickMapChanged();
    },
    updatePaint: () => {
      let controller = rendererViewController();
      controller?.onBrickMapPaintChanged();
    },
    rerender: () => {
      let controller = rendererViewController();
      controller?.rerender();
    },
    screenCoordsToRay(screenCoords, out_ray) {
      let controller = rendererViewController();
      controller?.screenCoordsToRay(screenCoords, out_ray);
    },
    *getThreeObjectsUnderScreenCoords(screenCoords) {
      let result = rendererViewController()?.getThreeObjectsUnderScreenCoords(screenCoords);
      if (result == undefined) {
        return;
      }
      yield* result;
    },
  };
  let mode = createMemo(() => new state.mkMode(modeParams));
  let ModeInstructions: Component = () => (
    <Show when={mode().instructions} keyed>
      {(Instructions) => (<Instructions/>)}
    </Show>
  );
  let disableOrbit = createMemo(() => mode().disableOrbit?.() ?? false);
  let overlayObject3D = createMemo(() => mode().overlayObject3D?.());
  let useTransformControlOnObject3D = createMemo(() => mode().useTransformControlOnObject3D?.());
  let [ renderDiv, setRenderDiv, ] = createSignal<HTMLDivElement>();
  let [ isTransformDragging, setTransformDragging, ] = createSignal(false);
  let areTransformControlsVisible = createMemo(() => useTransformControlOnObject3D() != undefined);
  // test data
  /*
  function test_sdf(x: number, y: number, z: number) {
    let dx = x;
    let dy = y;
    let dz = z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) - 100.0;
  }
  for (let i = -105; i <= 105; ++i) {
    for (let j = -105; j <= 105; ++j) {
      for (let k = -105; k <= 105; ++k) {
        let a = test_sdf(i,j,k);
        a /= Math.sqrt(3);
        let val = 128 - Math.floor(Math.max(-1, Math.min(1, a)) * 127);
        if (val < 1) val = 1; 
        if (val > 255) val = 255;
        brickMap.set(
          512 + k,
          512 + j,
          512 + i,
          val,
        );
      }
    }
  }
  */
  //
  let pointerDownStartTime: number | undefined;
  let onPointerDown = (e: PointerEvent) => {
    if (isTransformDragging()) {
      return;
    }
    let renderDiv2 = renderDiv();
    if (renderDiv2 == undefined) {
      return;
    }
    renderDiv2.setPointerCapture(e.pointerId);
    let rect = renderDiv2.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;
    batch(() => {
      setState("pointerPos", new THREE.Vector2(x, y));
      setState("pointerDown", true);
    });
    pointerDownStartTime = performance.now();
  }
  let onPointerMove = (e: PointerEvent) => {
    if (isTransformDragging()) {
      return;
    }
    let renderDiv2 = renderDiv();
    if (renderDiv2 == undefined) {
      return;
    }
    renderDiv2.setPointerCapture(e.pointerId);
    let rect = renderDiv2.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;
    setState("pointerPos", new THREE.Vector2(x, y));
  };
  let onPointerUp = (e: PointerEvent) => {
    if (isTransformDragging()) {
      return;
    }
    let renderDiv2 = renderDiv();
    if (renderDiv2 == undefined) {
      return;
    }
    let time: number | undefined = undefined;
    if (pointerDownStartTime != undefined) {
      time = performance.now() - pointerDownStartTime;
    }
    pointerDownStartTime = undefined;
    renderDiv2.releasePointerCapture(e.pointerId);
    let rect = renderDiv2.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;
    batch(() => {
      //setState("pointerPos", undefined);
      setState("pointerDown", false);
    });
    if (time != undefined && time < 300) {
      onClick();
    }
  };
  let onClick = () => {
    mode().onClick?.();
  };
  let spin = () => {
    let angle = 0.0;
    let animate = () => {
      /*
      let gl2 = gl();
      if (gl2 == undefined) {
        return;
      }
      if (angleLocation === undefined) {
        return;
      }
      angle += 10.0;
      gl2.uniform1f(angleLocation, angle);
      rerender();
      requestAnimationFrame(animate);*/
    };
    requestAnimationFrame(animate);
  };
  let move = () => {
    let controller = rendererViewController();
    controller?.moveTransform();
  };
  let rotate = () => {
    let controller = rendererViewController();
    controller?.rotateTransform();
  };
  let scale = () => {
    let controller = rendererViewController();
    controller?.scaleTransform();
  };
  let load = async () => {
    await loadScene("quicksave.dat", brickMap);
    modeParams.updateSdf();
  };
  let save = async () => {
    await saveScene("quicksave.dat", brickMap);
  };
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
      }}
    >
      <div
        ref={setRenderDiv}
        style={{
          position: "absolute",
          left: "0",
          top: "0",
          right: "0",
          bottom: "0",
          "touch-action": "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <RendererView
          brickMap={brickMap}
          onDragingEvent={(isDraging) => {
            setTransformDragging(isDraging);
          }}
          onInit={(controller) => {
            setRendererViewController(controller);
          }}
          disableOrbit={disableOrbit()}
          overlayObject3D={overlayObject3D()}
          useTransformControlOnObject3D={useTransformControlOnObject3D()}
          pixelSize={state.pixelSize}
        />
      </div>
      <div
        class="ml-2 mt-2"
        style={{
          position: "absolute",
          left: "0",
          top: "0",
        }}
      >
        <div>
          <button
            class="btn btn-primary"
            onClick={() => setMode(InsertPrimitivesMode)}
          >
            Insert Primitive
          </button>
          <button
            class="btn btn-primary ml-2"
            onClick={() => setMode(DrawMode)}
          >
            Draw
          </button>
          <button
            class="btn btn-primary ml-2"
            onClick={() => setMode(SculptMode)}
          >
            Sculpt
          </button>
          <button
            class="btn btn-primary ml-2"
            onClick={() => setMode(PaintMode)}
          >
            Paint
          </button>
          <button
            class="btn btn-primary ml-2"
            onClick={() => load()}
          >
            Load
          </button>
          <button
            class="btn btn-primary ml-2"
            onClick={() => save()}
          >
            Save
          </button>
          <Show when={areTransformControlsVisible()}>
            <button
              class="btn btn-primary ml-2"
              onClick={() => move()}
            >
              Move
            </button>
            <button
              class="btn btn-primary ml-2"
              onClick={() => rotate()}
            >
              Rotate
            </button>
            <button
              class="btn btn-primary ml-2"
              onClick={() => scale()}
            >
              Scale
            </button>
          </Show>
          <div class="join">
            <label class="label">
              Px
              <input
                type="radio"
                name="PxSize"
                class="btn btn-sm join-item"
                aria-label="1x"
                checked={state.pixelSize == 1}
                onChange={(e) => {
                  if (e.currentTarget.checked) {
                    setState("pixelSize", 1);
                  }
                }}
              />
              <input
                type="radio"
                name="PxSize"
                class="btn btn-sm join-item"
                aria-label="2x"
                checked={state.pixelSize == 2}
                onChange={(e) => {
                  if (e.currentTarget.checked) {
                    setState("pixelSize", 2);
                  }
                }}
              />
              <input
                type="radio"
                name="PxSize"
                class="btn btn-sm join-item"
                aria-label="4x"
                checked={state.pixelSize == 4}
                onChange={(e) => {
                  if (e.currentTarget.checked) {
                    setState("pixelSize", 4);
                  }
                }}
              />
            </label>
          </div>
        </div>
        <ModeInstructions/>
      </div>
    </div>
  );
};

export default App;
