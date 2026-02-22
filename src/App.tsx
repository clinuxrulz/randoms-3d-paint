import { batch, createComputed, createMemo, createSignal, on, onCleanup, onMount, Show, untrack, type Component } from 'solid-js';
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { AsyncSdfModel } from './AsyncSdfModel';
import RendererView, { RendererViewController } from './RendererView';
import { createStore } from 'solid-js/store';
import { Mode } from './modes/Mode';
import { ModeParams } from './modes/ModeParams';
import { IdleMode } from './modes/IdleMode';
import { DrawMode } from './modes/DrawMode';
import { InsertPrimitivesMode } from './modes/InsertPrimitivesMode';
import { SculptMode } from './modes/SculptMode';

import { PaintMode } from './modes/PaintMode';
import ColourInput from './ColourInput';
import { march, pointsAndTriangleIndicesToGeometry } from './marching_cubes/marching_cubes';
// @ts-ignore
import { UVUnwrapper } from 'xatlas-three';
import FileSaver from "file-saver";
import { renderTargetToDataURL } from './util';


const defaultPalette = [
  // Grayscale (White to Black)
  "#FFFFFF", "#F2F2F2", "#E6E6E6", "#CCCCCC", "#999999", "#666666", "#333333", "#000000",
  // Reds (Pinkish to Deep Maroon)
  "#FFEBEE", "#FFCDD2", "#EF9A9A", "#E57373", "#EF5350", "#F44336", "#D32F2F", "#B71C1C",
  // Oranges (Peach to Deep Burnt Orange)
  "#FFF3E0", "#FFE0B2", "#FFCC80", "#FFB74D", "#FFA726", "#FF9800", "#F57C00", "#E65100",
  // Yellows/Ambers (Cream to Gold)
  "#FFFDE7", "#FFF9C4", "#FFF59D", "#FFF176", "#FFEE58", "#FFEB3B", "#FBC02D", "#F57F17",
  // Greens (Pale Mint to Forest)
  "#E8F5E9", "#C8E6C9", "#A5D6A7", "#81C784", "#66BB6A", "#4CAF50", "#388E3C", "#1B5E20",
  // Teals/Cyans (Light Aqua to Deep Teal)
  "#E0F7FA", "#B2EBF2", "#80DEEA", "#4DD0E1", "#26C6DA", "#00BCD4", "#0097A7", "#006064",
  // Blues (Sky to Navy)
  "#E3F2FD", "#BBDEFB", "#90CAF9", "#64B5F6", "#42A5F5", "#2196F3", "#1976D2", "#0D47A1",
  // Purples (Lavender to Deep Grape)
  "#F3E5F5", "#E1BEE7", "#CE93D8", "#BA68C8", "#AB47BC", "#9C27B0", "#7B1FA2", "#4A148C",
];

const App: Component = () => {
  let initPalette = defaultPalette.map((colourHex, idx) => {
    let colour = new THREE.Color().set(colourHex);
    return { id: window.crypto.randomUUID(), colour, };
  });
  let [ state, setState, ] = createStore<{
    mkMode: { new(modeParams: ModeParams): Mode, },
    pointerPos: THREE.Vector2 | undefined,
    pointerDown: boolean,
    pixelSize: number,
    palette: { id: string, colour: THREE.Color, }[],
    selectedColourById: string | undefined,
    showingMarchedGeometry: THREE.BufferGeometry | undefined,
  }>({
    mkMode: IdleMode,
    pointerPos: undefined,
    pointerDown: false,
    pixelSize: 4,
    palette: initPalette,
    selectedColourById: initPalette[50].id,
    showingMarchedGeometry: undefined,
  });
  onCleanup(() => {
    let geometry = state.showingMarchedGeometry;
    if (geometry != undefined) {
      geometry.dispose();
    }
    setState("showingMarchedGeometry", undefined);
  });
  let currentColour = createMemo(() => {
    let colourId = state.selectedColourById;
    if (colourId == undefined) {
      return undefined;
    }
    return state.palette.find(({ id }) => id === colourId)?.colour;
  });
  let operations = new Operations();
  let model = new AsyncSdfModel();

  let [ rendererViewController, setRendererViewController, ] = createSignal<RendererViewController>();
  let setMode = (mode: { new(modeParams: ModeParams): Mode, }) => setState("mkMode", () => mode);
  let modeParams: ModeParams = {
    endMode: () => setMode(IdleMode),
    model,
    canvasSize: () => rendererViewController()?.canvasSize(),
    pointerPos: () => state.pointerPos,
    pointerDown: () => state.pointerDown,
    currentColour,
    updateSdf: async () => {
      await model.updateBrickMap();
      let controller = rendererViewController();
      controller?.onBrickMapChanged();
    },
    updatePaint: async () => {
      await model.updateBrickMap();
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
  let modeOverlayObject3D = createMemo(() => mode().overlayObject3D?.());
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
  let loadSnapshot = async () => {
    const fileHandle = await navigator.storage.getDirectory();
    const file = await fileHandle.getFileHandle("quicksave.dat");
    const readable = await file.createReadable();
    for await (const progress of model.load(readable)) {
      console.log(progress);
    }
    modeParams.updateSdf();
    modeParams.updatePaint();
  };
  let saveSnapshot = async () => {
    const fileHandle = await navigator.storage.getDirectory();
    const file = await fileHandle.getFileHandle("quicksave.dat", { create: true });
    const writable = await file.createWritable();
    await model.save(writable);
    await writable.close();
  };
  let load = async (file: File) => {
    const readable = file.stream();
    for await (const progress of model.load(readable)) {
      console.log(progress);
    }
    modeParams.updateSdf();
    modeParams.updatePaint();
  };
  let save = async () => {
    let filename = window.prompt("Enter filename:");
    if (filename == null) {
      return;
    }
    filename = filename.trim();
    if (filename == "") {
      return;
    }
    if (!filename.toLowerCase().endsWith(".randoms-3d-paint")) {
      filename += ".randoms-3d-paint";
    }
    const fileHandle = await window.showSaveFilePicker({
      suggestedName: filename,
    });
    const writable = await fileHandle.createWritable();
    await model.save(writable);
    await writable.close();
  };
  let march_ = () => {
    let pointsAndTriangleIndices = march({
      sdf: (x: number, y: number, z: number) => {
        let t: [number] = [0];
        model.march(new THREE.Vector3(x,y,z), new THREE.Vector3(0,0,1), t);
        return t[0];
      },
      minX: -51*2,
      minY: -51*2,
      minZ: -51*2,
      maxX: 51*2,
      maxY: 51*2,
      maxZ: 51*2,
      cubeSize: 1,
      interpolate: true,
    });
    for (let i = 0; i < pointsAndTriangleIndices.points.length; ++i) {
      pointsAndTriangleIndices.points[i] *= 50.0;
    }
    let geometry = pointsAndTriangleIndicesToGeometry(pointsAndTriangleIndices);
    setState("showingMarchedGeometry", geometry);
  };
  let clearMarch = () => {
    if (state.showingMarchedGeometry == undefined) {
      return;
    }
    state.showingMarchedGeometry.dispose();
    setState("showingMarchedGeometry", undefined);
    modeParams.rerender();
  };
  let material: THREE.Material = new THREE.MeshStandardMaterial({ color: "blue", });
  onCleanup(() => {
    material.dispose();
  });
  let showingMarchedMesh = createMemo(() => {
    if (state.showingMarchedGeometry == undefined) {
      return undefined;
    }
    let geometry = state.showingMarchedGeometry;
    let mesh = new THREE.Mesh(geometry, material);
    modeParams.rerender();
    (async () => {
      let unwrapper = new UVUnwrapper({BufferAttribute: THREE.BufferAttribute});
      await unwrapper.loadLibrary(
        (mode: number, progress: number)=>{console.log(mode, progress);},
        'https://cdn.jsdelivr.net/npm/xatlasjs@0.2.0/dist/xatlas.wasm',
        'https://cdn.jsdelivr.net/npm/xatlasjs@0.2.0/dist/xatlas.js',
      );
      await unwrapper.unwrapGeometry(geometry);
      let texture = new THREE.TextureLoader().load(
        "./uvdebug.jpg",
        () => {
          material.dispose();
          material = new THREE.MeshStandardMaterial({ map: texture, });
          mesh.material = material;
          modeParams.rerender();
        },
      );
    })();
    return mesh;
  });
  let bake = async () => {
    const renderer = rendererViewController()?.renderer();
    const mesh = showingMarchedMesh();
    if (!renderer || !mesh) return;
    const bakeVertexShader = `
      varying vec3 vWorldPosition;
      void main() {
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
      }
    `;
    const bakeFragmentShader = `
${(await model.writeShaderCode())}

varying vec3 vWorldPosition;
//vec3 colorFunc(vec3 p) { return vec3(sin(p.x), cos(p.y), sin(p.z)); }
void main() { gl_FragColor = vec4(colour(vWorldPosition).rgb, 1.0); }
`;
    const bakeDimension = 1024;
    const renderTarget = new THREE.WebGLRenderTarget(bakeDimension, bakeDimension);
    const bakeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    let shaderParams: THREE.ShaderMaterialParameters = {
      vertexShader: bakeVertexShader,
      fragmentShader: bakeFragmentShader,
      side: THREE.DoubleSide
    };
    let bmTxt = model.initTexturesThreeJs(shaderParams);
    const bakeMaterial = new THREE.ShaderMaterial(shaderParams);
    const originalMaterial = mesh.material;
    const oldTarget = renderer.getRenderTarget();
    mesh.material = bakeMaterial;
    renderer.setRenderTarget(renderTarget);
    renderer.render(mesh, bakeCamera);
    let imageUrl = renderTargetToDataURL(renderer, renderTarget);
    if (imageUrl == undefined) {
      return;
    }
    renderer.setRenderTarget(oldTarget);
    let texture = await new THREE.TextureLoader().loadAsync(imageUrl);
    texture.flipY = false;
    const finalMaterial = new THREE.MeshStandardMaterial({ 
      map: texture,
    });
    mesh.material = finalMaterial;
    if (originalMaterial) originalMaterial.dispose();
    bakeMaterial.dispose(); 
    modeParams.rerender();
  };
  let exportToGlb = async () => {
    const mesh = showingMarchedMesh();
    if (mesh == undefined) {
      return;
    }
    let filename = window.prompt("Enter filename:");
    if (filename == null) {
      return;
    }
    filename = filename.trim();
    if (filename == "") {
      return;
    }
    if (!filename.toLowerCase().endsWith(".glb")) {
      filename += ".glb";
    }
    let exporter = new GLTFExporter();
    let result = (await exporter.parseAsync(mesh, { binary: true, })) as ArrayBuffer;
    FileSaver.saveAs(
      new Blob([ result, ], { type: "model/gltf-binary", }),
      filename,
    );
  };
  let overlayObject3D = createMemo(() => {
    let objects = [
      modeOverlayObject3D(),
      showingMarchedMesh(),
    ].filter((x) => x !== undefined);
    if (objects.length == 0) {
      return undefined;
    } else if (objects.length == 1) {
      return objects[0];
    } else {
      let group = new THREE.Group();
      group.add(...objects);
      return group;
    }
  });
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
          model={model}
          hideBrickMap={showingMarchedMesh() != undefined}
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
          "pointer-events": "none",
        }}
      >
        <div
          style={{
            "pointer-events": "auto",
          }}
        >
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
            onClick={() => loadSnapshot()}
          >
            Load SS
          </button>
          <button
            class="btn btn-primary ml-2"
            onClick={() => saveSnapshot()}
          >
            Save SS
          </button>
          {untrack(() => {
            let [ fileInput, setFileInput, ] = createSignal<HTMLInputElement>();
            return (<>
              <button
                class="btn btn-primary ml-2"
                onClick={() => fileInput()?.click()}
              >
                Load
              </button>
              <input
                ref={setFileInput}
                type="file"
                onChange={(e) => {
                  let files = e.currentTarget.files;
                  if (files == null) {
                    return;
                  }
                  if (files.length != 1) {
                    return;
                  }
                  let file = files[0];
                  load(file);
                  e.currentTarget.value = "";
                }}
                hidden
              />
            </>);
          })}
          <button
            class="btn btn-primary ml-2"
            onClick={() => save()}
          >
            Save
          </button>
          <Show when={state.showingMarchedGeometry == undefined}>
            <button
              class="btn btn-primary ml-2"
              onClick={() => march_()}
            >
              March
            </button>
          </Show>
          <Show when={state.showingMarchedGeometry != undefined}>
            <button
              class="btn btn-primary ml-2"
              onClick={() => clearMarch()}
            >
              Clear March
            </button>
            <button
              class="btn btn-primary ml-2"
              onClick={() => bake()}
            >
              Bake
            </button>
            <button
              class="btn btn-primary ml-2"
              onClick={() => exportToGlb()}
            >
              Export
            </button>
          </Show>
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
        <div
          style={{
            "pointer-events": "auto",
            "width": "fit-content",
          }}
        >
          <ModeInstructions/>
        </div>
        <div
          style={{
            "pointer-events": "auto",
            "width": "fit-content",
          }}
        >
          <ColourInput
            squareSize={20}
            colours={state.palette}
            addColour={() => { return { id: "", }; }}
            removeColour={() => {}}
            selectedColourById={state.selectedColourById}
            setSelectedColour={(colourId) => setState("selectedColourById", colourId)}
          />
        </div>
      </div>
    </div>
  );
};

export default App;
