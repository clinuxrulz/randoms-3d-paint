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

const App: Component = () => {
  let [ state, setState, ] = createStore<{
    mkMode: { new(modeParams: ModeParams): Mode, },
    pointerPos: THREE.Vector2 | undefined,
    pointerDown: boolean,
  }>({
    mkMode: IdleMode,
    pointerPos: undefined,
    pointerDown: false,
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
        if (a < -1.0 || a > 1.0) {
          continue;
        }
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
  }*/
  //
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
    renderDiv2.releasePointerCapture(e.pointerId);
    let rect = renderDiv2.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;
    batch(() => {
      setState("pointerPos", undefined);
      setState("pointerDown", false);
    });
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
            onClick={() => spin()}
          >
            Spin
          </button>
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
        </div>
        <ModeInstructions/>
      </div>
    </div>
  );
};

export default App;
