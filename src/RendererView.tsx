import { Accessor, batch, Component, createComputed, createResource, createSignal, on, onCleanup, onMount, Show, untrack } from "solid-js";
import * as THREE from "three";
import { AsyncSdfModel } from "./AsyncSdfModel";

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

const FOV_Y = 50.0;

export type RendererViewController = {
  canvasSize: Accessor<THREE.Vector2 | undefined>,
  onBrickMapChanged: () => void,
  onBrickMapPaintChanged: () => void,
  rerender: () => void,
  moveTransform: () => void,
  rotateTransform: () => void,
  scaleTransform: () => void,
  screenCoordsToRay: (screenCoords: THREE.Vector2, out_ray: THREE.Ray) => void,
  getThreeObjectsUnderScreenCoords: (screenCoords: THREE.Vector2) => Generator<THREE.Object3D>,
  renderer: Accessor<THREE.WebGLRenderer | undefined>,
};

const RendererView: Component<{
  model: AsyncSdfModel,
  hideBrickMap: boolean,
  onDragingEvent: (isDraging: boolean) => void,
  onInit: (controller: RendererViewController) => void,
  disableOrbit: boolean,
  overlayObject3D: THREE.Object3D | undefined,
  useTransformControlOnObject3D: THREE.Object3D | undefined,
  pixelSize: number,
}> = (props) => {
  let [ canvas, setCanvas, ] = createSignal<HTMLCanvasElement>();
  let [ canvasSize, setCanvasSize, ] = createSignal<THREE.Vector2>();
  let [ camera, setCamera, ] = createSignal<THREE.PerspectiveCamera>();
  let [ renderer, setRenderer, ] = createSignal<THREE.WebGLRenderer>();
  let [ orbitControls, setOrbitControls, ] = createSignal<OrbitControls>();
  let [ transformControls, setTransformControls, ] = createSignal<TransformControls>();
  let scene = new THREE.Scene();
  {
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    scene.add(hemiLight);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(1, 1, 1);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-1, 0, 1);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.6);
    rimLight.position.set(0, -1, -1);
    scene.add(rimLight);
  }
  let [brickMapShaderCode] = createResource(() => props.model.writeShaderCode());

  createComputed(() => {
    const code = brickMapShaderCode();
    if (!code) return;
    console.log(
      code
        .split("\n")
        .map((line, idx) => `${idx + 1}: ${line}`)
        .join("\n")
    );
  });

  let material = createMemo(() => {
    const code = brickMapShaderCode();
    if (!code) return undefined;
    let params: THREE.ShaderMaterialParameters = {
      uniforms: {
        resolution: { value: new THREE.Vector2(), },
        uFocalLength: { value: 0.0, },
        viewMatrixInverse: { value: new THREE.Matrix4(), },
        projectionMatrixInverse: { value: new THREE.Matrix4(), },
        uCameraViewMatrix: { value: new THREE.Matrix4() },
        uCameraProjectionMatrix: { value: new THREE.Matrix4() },
        cameraPosition: { value: new THREE.Vector3(), },
      },
      fragmentShader: `
        precision highp float;
        precision highp int;
        precision highp usampler3D;
        precision highp sampler3D;

        uniform vec2 resolution;
        uniform float uFocalLength;
        uniform mat4 viewMatrixInverse;
        uniform mat4 projectionMatrixInverse;
        uniform mat4 uCameraViewMatrix;
        uniform mat4 uCameraProjectionMatrix;

        //out vec4 fragColour;

        ${code}

        float map2(vec3 p) {
          p += 512.0 * VOXEL_SIZE;
          return abs(length(p - vec3(512.0*VOXEL_SIZE)) - 100.0 * VOXEL_SIZE);
        }

        const int MAX_STEPS = 1000;
        const float MIN_DIST = 1.0;
        const float MAX_DIST = 10000.0;

        bool negativeMarch(vec3 ro, vec3 rd, out float t) {
            t = 0.0;
            for(int i = 0; i < MAX_STEPS; i++) {
                vec3 p = ro + rd * t;
                float d = -map(p, rd);
                
                if(d < MIN_DIST) {
                    return true;
                }
                
                t += d;
                
                if(t > MAX_DIST) {
                    break;
                }
            }
            return false;
        }

        bool march(vec3 ro, vec3 rd, out float t, out bool negative) {
            t = 0.0;
            for(int i = 0; i < MAX_STEPS; i++) {
                vec3 p = ro + rd * t;
                float d = map(p, rd);

                if (d < 0.0) {
                    negative = true;
                    return negativeMarch(ro, rd, t);
                }
                
                if(d < MIN_DIST) {
                    return true;
                }
                
                t += d;
                
                if(t > MAX_DIST) {
                    break;
                }
            }
            return false;
        }

        vec3 normal(vec3 p) {
            const float eps = 4.0;
            const vec2 h = vec2(eps, 0);
            const vec3 z = vec3(0.0);
            return normalize(vec3(
                map(p + h.xyy, z) - map(p - h.xyy, z),
                map(p + h.yxy, z) - map(p - h.yxy, z),
                map(p + h.yyx, z) - map(p - h.yyx, z)
            ));
        }

        vec3 calculateLighting(vec3 pos, vec3 normal, vec3 viewDir, vec3 baseColor) {
            float hemi = 0.5 + 0.5 * normal.y;
            vec3 ambient = mix(vec3(0.1, 0.1, 0.2), vec3(0.2, 0.15, 0.1), hemi);
            vec3 keyDir = normalize(vec3(1.0, 1.0, 1.0));
            vec3 fillDir = normalize(vec3(-1.0, 0.0, 1.0));
            vec3 rimDir = normalize(vec3(0.0, -1.0, -1.0));
            float key = max(dot(normal, keyDir), 0.0);
            float fill = max(dot(normal, fillDir), 0.0) * 0.4;
            float rim = max(dot(normal, rimDir), 0.0) * 0.3;
            vec3 refl = reflect(-keyDir, normal);
            float spec = pow(max(dot(refl, viewDir), 0.0), 32.0) * 0.5;
            vec3 lighting = (ambient + (key + fill + rim) * 0.8) * baseColor + spec;
            return lighting;
        }

        void main(void) {
          float fl = uFocalLength;
          vec2 uv = gl_FragCoord.xy / resolution;
          vec4 ndc = vec4(uv * 2.0 - 1.0, 1.0, 1.0);
          vec4 viewPos = projectionMatrixInverse * ndc;
          viewPos /= viewPos.w;
          vec4 worldPos = viewMatrixInverse * viewPos;
          vec3 ro = cameraPosition;
          vec3 rd = normalize(worldPos.xyz - ro);
          float t = 0.0;
          bool negative = false;
          bool hit = march(ro, rd, t, negative);
          if (!hit) {
            gl_FragColor = vec4(0.2, 0.2, 0.2, 1.0);
            gl_FragDepth = 1.0; 
            return;
          }
          vec3 p = ro + rd*t;
          vec3 n = normal(p);
          if (negative) {
            n = -n;
          }
          float s = 0.8*dot(n,normalize(vec3(1,1,1))) + 0.2;
          vec4 c = colour(p);
          vec3 c2 = calculateLighting(p, n, rd, c.rgb);
          c = vec4(c2, c.a);
          gl_FragColor = c;
          vec4 clipPos = uCameraProjectionMatrix * uCameraViewMatrix * vec4(p, 1.0);
          float ndcDepth = clipPos.z / clipPos.w;
          if (ndcDepth < -1.0 || ndcDepth > 1.0) {
            ndcDepth = 1.0;
          }
          gl_FragDepth = (ndcDepth + 1.0) * 0.5;
        }
      `,
      depthWrite: true,
    };
    props.model.initTexturesThreeJs(params);
    return new THREE.ShaderMaterial(params);
  });

  let fullScreenQuad = createMemo(() => {
    const mat = material();
    if (!mat) return undefined;
    return new FullScreenQuad(mat);
  });
  
  props.onInit({
    canvasSize,
    async onBrickMapChanged() {
      const r = renderer();
      const mat = material();
      if (!r || !mat) return;
      const textures = mat.uniforms.uIndirectionTex.value;
      const result = await props.model.updateTextures({
        renderer: r,
        textures,
        updateAtlas: true,
        updateColours: false,
      });
      rerender();
      await result.onAfterRender();
    },
    async onBrickMapPaintChanged() {
      const r = renderer();
      const mat = material();
      if (!r || !mat) return;
      const textures = mat.uniforms.uIndirectionTex.value;
      const result = await props.model.updateTextures({
        renderer: r,
        textures,
        updateAtlas: false,
        updateColours: true,
      });
      rerender();
      await result.onAfterRender();
    },
    rerender,
    moveTransform() {
      let transformControls2 = transformControls();
      transformControls2?.setMode("translate");
    },
    rotateTransform() {
      let transformControls2 = transformControls();
      transformControls2?.setMode("rotate");
    },
    scaleTransform() {
      let transformControls2 = transformControls();
      transformControls2?.setMode("scale");
    },
    screenCoordsToRay(screenCoords: THREE.Vector2, out_ray: THREE.Ray) {
      let canvasSize2 = canvasSize();
      if (canvasSize2 == undefined) {
        return;
      }
      let camera2 = camera();
      if (camera2 == undefined) {
        return;
      }
      let pt = _screenCoordsToRay_tmpV2.set(
        (screenCoords.x / canvasSize2.x) * 2.0 - 1.0,
        -(screenCoords.y / canvasSize2.y) * 2.0 + 1.0,
      );
      let raycaster = _screenCoordsToRay_tmpRaycaster;
      raycaster.setFromCamera(pt, camera2);
      out_ray.copy(raycaster.ray);
    },
    *getThreeObjectsUnderScreenCoords(screenCoords: THREE.Vector2) {
      let canvasSize2 = canvasSize();
      if (canvasSize2 == undefined) {
        return;
      }
      let camera2 = camera();
      if (camera2 == undefined) {
        return;
      }
      let pt = new THREE.Vector2(
        (screenCoords.x / canvasSize2.x) * 2.0 - 1.0,
        -(screenCoords.y / canvasSize2.y) * 2.0 + 1.0,
      );
      let raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pt, camera2);
      for (let intersection of raycaster.intersectObject(scene, true)) {
        yield intersection.object;
      }
    },
    renderer,
  });
  onMount(() => {
    let canvas2 = canvas();
    if (canvas2 == undefined) {
      return;
    }
    let camera2 = new THREE.PerspectiveCamera(
      FOV_Y,
      1.0,
      10.0,
      10000.0,
    );
    camera2.position.set(0, 0, 5000);
    camera2.lookAt(new THREE.Vector3(0.0, 0.0, 0.0));
    let renderer2 = new THREE.WebGLRenderer({
      canvas: canvas2,
    });
    renderer2.setPixelRatio(window.devicePixelRatio);
    renderer2.autoClear = false;
    let updateSize = () => {
      const mat = material();
      if (!mat) return;
      let rect = canvas2.getBoundingClientRect();
      setCanvasSize(new THREE.Vector2(rect.width, rect.height));
      camera2.aspect = rect.width / rect.height;
      camera2.updateProjectionMatrix();
      let width = rect.width * window.devicePixelRatio;
      let height = rect.height * window.devicePixelRatio;
      let focalLength = 0.5 * height / Math.tan(0.5 * FOV_Y * Math.PI / 180.0);
      let s = 1.0 / props.pixelSize;
      renderer2.setSize(s * rect.width, s * rect.height, false);
      mat.uniforms.resolution.value.set(
        s * width,
        s * height,
      );
      mat.uniforms.uFocalLength.value = s * focalLength;
      rerender();
    };
    let resizeObserver = new ResizeObserver(() => {
      updateSize();
    });
    createComputed(on(
      () => props.pixelSize,
      () => updateSize(),
      { defer: true, }
    ));
    resizeObserver.observe(canvas2);
    onCleanup(() => {
      resizeObserver.unobserve(canvas2);
      resizeObserver.disconnect();
    });
    let orbitControls = new OrbitControls(camera2, canvas2);
    orbitControls.enableDamping = false;
    orbitControls.update();
    orbitControls.addEventListener("change", () => rerender());
    let transformControls2 = new TransformControls(camera2, canvas2);
    //let dummy = new THREE.Object3D();
    //transformControls2.attach(dummy);
    createComputed(on(
      () => props.useTransformControlOnObject3D,
      (useTransformControlOnObject3D) => {
        if (useTransformControlOnObject3D == undefined) {
          transformControls2.detach();
        } else {
          transformControls2.attach(useTransformControlOnObject3D);
        }
      },
    ));
    let [ transformDragging, setTransformDragging, ] = createSignal(false);
    transformControls2.addEventListener("dragging-changed", (e) => {
      let dragging = e.value as boolean;
      setTransformDragging(dragging);
      props.onDragingEvent(dragging);
    });
    createComputed(() => {
      orbitControls.enabled = !(transformDragging() || props.disableOrbit);
    });
    transformControls2.addEventListener("change", () => {
      rerender();
    });
    //scene.add(dummy);
    scene.add(transformControls2.getHelper());
    batch(() => {
      setCamera(camera2);
      setRenderer(renderer2);
      setOrbitControls(orbitControls);
      setTransformControls(transformControls2);
    });
    rerender();
  });
  createComputed(on(
    () => props.overlayObject3D,
    (overlayObject3D) => {
      if (overlayObject3D == undefined) {
        return;
      }
      scene.add(overlayObject3D);
      onCleanup(() => {
        scene.remove(overlayObject3D);
      });
      untrack(() => rerender());
    },
  ));
  return (
    <Show when={material()} fallback={<div>Loading...</div>}>
      <canvas
        ref={setCanvas}
        style={{
          width: "100%",
          height: "100%",
        }}
      />
    </Show>
  );
};

export default RendererView;
