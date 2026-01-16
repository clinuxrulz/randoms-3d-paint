import { createComputed, createSignal, on, onCleanup, onMount, type Component } from 'solid-js';
import { BrickMap } from './BrickMap';

const FOV_Y = 50.0;

const App: Component = () => {
  let [ canvas, setCanvas, ] = createSignal<HTMLCanvasElement>();
  let [ gl, setGl, ] = createSignal<WebGL2RenderingContext>();
  let brickMap = new BrickMap();
  let quadVertices = new Float32Array(12);
  let quadVerticesBuffer: WebGLBuffer | undefined = undefined;
  let positionLocation: number | undefined = undefined;
  let resolutionLocation: WebGLUniformLocation | null | undefined = undefined;
  let focalLengthLocation: WebGLUniformLocation | null | undefined = undefined;
  let modelViewMatrixLocation: WebGLUniformLocation | null | undefined = undefined;
  // test data
  for (let i = -1; i <= 1; i += 2) {
    for (let j = -1; j <= 1; j += 2) {
      for (let k = -1; k <= 1; k += 2) {
        brickMap.set(
          512 + k,
          512 + j,
          512 + i,
          i * j * k,
        );
      }
    }
  }
  //
  let brickMapShaderCode = brickMap.writeShaderCode();
  let updateQuad = () => {
    let canvas2 = canvas();
    if (canvas2 == undefined) {
      return;
    }
    let gl2 = gl();
    if (gl2 == undefined) {
      return;
    }
    if (quadVerticesBuffer === undefined) {
      return;
    }
    if (positionLocation === undefined) {
      return;
    }
    if (resolutionLocation === undefined) {
      return;
    }
    if (focalLengthLocation === undefined) {
      return;
    }
    if (modelViewMatrixLocation === undefined) {
      return;
    }
    let width = canvas2.width;
    let height = canvas2.height;
    const focalLength = 0.5 * height / Math.tan(0.5 * FOV_Y * Math.PI / 180.0);
    quadVertices[0] = 0.0;
    quadVertices[1] = 0.0;
    quadVertices[2] = width;
    quadVertices[3] = 0.0;
    quadVertices[4] = width;
    quadVertices[5] = height;
    quadVertices[6] = 0.0;
    quadVertices[7] = 0.0;
    quadVertices[8] = width;
    quadVertices[9] = height;
    quadVertices[10] = 0.0;
    quadVertices[11] = height;
    gl2.enableVertexAttribArray(positionLocation);
    gl2.bindBuffer(gl2.ARRAY_BUFFER, quadVerticesBuffer);
    gl2.bufferData(gl2.ARRAY_BUFFER, quadVertices, gl2.DYNAMIC_DRAW);
    gl2.vertexAttribPointer(
      positionLocation,
      2,
      gl2.FLOAT,
      false,
      0,
      0,
    );
    gl2.disableVertexAttribArray(positionLocation);
    function createOrtho2D(left: number, right: number, bottom: number, top: number) {
        var near = -1, far = 1, rl = right-left, tb = top-bottom, fn = far-near;
        return [        2/rl,               0,              0,  0,
                          0,             2/tb,              0,  0,
                          0,                0,          -2/fn,  0,
            -(right+left)/rl, -(top+bottom)/tb, -(far+near)/fn,  1];
    }
    const modelViewMatrix = new Float32Array(
      createOrtho2D(
        0.0,
        width,
        0.0,
        height,
      ),
    );
    gl2.uniform2f(resolutionLocation, width, height);
    gl2.uniform1f(focalLengthLocation, focalLength);
    gl2.uniformMatrix4fv(
      modelViewMatrixLocation,
      false,
      modelViewMatrix,
    );
    gl2.viewport(0, 0, width, height);
    rerender();
  };
  let rerender: () => void;
  {
    let aboutToRender = false;
    rerender = () => {
      let gl2 = gl();
      if (gl2 == undefined) {
        return;
      }
      if (aboutToRender) {
        return;
      }
      aboutToRender = true;
      requestAnimationFrame(() => {
        if (quadVerticesBuffer === undefined) {
          return;
        }
        if (positionLocation === undefined) {
          return;
        }
        aboutToRender = false;
        gl2.enableVertexAttribArray(positionLocation);
        gl2.bindBuffer(gl2.ARRAY_BUFFER, quadVerticesBuffer);
        gl2.drawArrays(gl2.TRIANGLES, 0, 6);
        gl2.disableVertexAttribArray(positionLocation);
      });
    };
  }
  onMount(on(
    canvas,
    (canvas) => {
      if (canvas == undefined) {
        return;
      }
      let resizeObserver = new ResizeObserver(() => {
        let rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        updateQuad();
      });
      resizeObserver.observe(canvas);
      onCleanup(() => {
        resizeObserver.unobserve(canvas);
        resizeObserver.disconnect();
      });
      let gl2 = canvas.getContext("webgl2");
      if (gl2 == null) {
        return;
      }
      setGl(gl2);
    },
  ));
  createComputed(on(
    gl,
    (gl) => {
      if (gl == undefined) {
        return;
      }
      let vertexShader = gl.createShader(gl.VERTEX_SHADER);
      if (vertexShader == null) {
        return;
      }
      gl.shaderSource(vertexShader, `#version 300 es
        in vec4 aVertexPosition;
        uniform mat4 uModelViewMatrix;

        void main(void) {
          gl_Position = uModelViewMatrix * aVertexPosition;
        }
      `);
      gl.compileShader(vertexShader);
      if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
        console.error('An error occurred compiling the vertex shader: ' + gl.getShaderInfoLog(vertexShader));
        gl.deleteShader(vertexShader);
        return undefined;
      }
      let fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
      if (fragmentShader == null) {
        gl.deleteShader(vertexShader);
        return;
      }
      let fragmentShaderCode = `#version 300 es

precision highp float;
precision highp int;
precision highp usampler2D;

uniform vec2 resolution;
uniform float uFocalLength;

out vec4 fragColour;

${brickMapShaderCode}

const float CUBE_SIZE = 512.0 * VOXEL_SIZE;

float map(vec3 p) {
  p += vec3(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
  ivec3 p_min = ivec3(
    int(p.x / VOXEL_SIZE),
    int(p.y / VOXEL_SIZE),
    int(p.z / VOXEL_SIZE)
  );
  if (p_min.x < 0 || p_min.y < 0 || p_min.z < 0) {
    return 1000.0;
  }
  uvec3 p_min_2 = uvec3(
    uint(p_min.x),
    uint(p_min.y),
    uint(p_min.z)
  );
  vec3 d = vec3(
    (p.x - float(p_min_2.x) * VOXEL_SIZE) / VOXEL_SIZE,
    (p.y - float(p_min_2.y) * VOXEL_SIZE) / VOXEL_SIZE,
    (p.z - float(p_min_2.z) * VOXEL_SIZE) / VOXEL_SIZE
  );
  float v_nx_ny_nz = read_brick_map(p_min_2);
  float v_nx_ny_pz = read_brick_map(p_min_2 + uvec3(0u, 0u, 1u));
  float v_nx_py_nz = read_brick_map(p_min_2 + uvec3(0u, 1u, 0u));
  float v_nx_py_pz = read_brick_map(p_min_2 + uvec3(0u, 1u, 1u));
  float v_px_ny_nz = read_brick_map(p_min_2 + uvec3(1u, 0u, 0u));
  float v_px_ny_pz = read_brick_map(p_min_2 + uvec3(1u, 0u, 1u));
  float v_px_py_nz = read_brick_map(p_min_2 + uvec3(1u, 1u, 0u));
  float v_px_py_pz = read_brick_map(p_min_2 + uvec3(1u, 1u, 1u));
  float v_ny_nz = mix(v_nx_ny_nz, v_px_ny_nz, d.x);
  float v_ny_pz = mix(v_nx_ny_pz, v_px_ny_pz, d.x);
  float v_py_nz = mix(v_nx_py_nz, v_px_py_nz, d.x);
  float v_py_pz = mix(v_nx_py_pz, v_px_py_pz, d.x);
  float v_nz = mix(v_ny_nz, v_py_nz, d.y);
  float v_pz = mix(v_ny_pz, v_py_pz, d.y);
  float v = mix(v_nz, v_pz, d.z);
  return v;
}

const int max_iterations = 20;
const float tollerance = 1.0;
const float max_step = 999.0;

bool march(vec3 ro, vec3 rd, bool negateDist, out float t) {
  vec3 p = ro;
  t = 0.0;
  for (int i = 0; i < max_iterations; ++i) {
    vec3 p = ro + rd*t;
    float d = map(p);
    if (negateDist) {
      d = -d;
    }
    if (d <= tollerance) {
      return true;
    }
    if (d > max_step) {
      return false;
    }
    t += d;
  }
  return false;
}

vec3 normal(vec3 p) {
  float d = 0.01;
  float mp = map(p);
  float dx = map(p + vec3(d,0,0)) - mp;
  float dy = map(p + vec3(0,d,0)) - mp;
  float dz = map(p + vec3(0,0,d)) - mp;
  return normalize(vec3(dx,dy,dz));
}

void main(void) {
  float fl = uFocalLength;
  float mx = max(resolution.x, resolution.y);
  vec2 uv = gl_FragCoord.xy / mx;
  vec3 w = normalize(vec3(0.0, 0.0, 1.0));
  vec3 u = normalize(cross(vec3(0,1,0),w));
  vec3 v = cross(w,u);
  vec3 ro = vec3(0.0);
  vec3 rd = normalize(
    (gl_FragCoord.x - 0.5 * resolution.x) * u +
    (gl_FragCoord.y - 0.5 * resolution.y) * v +
    -fl * w
  );
  vec2 st = gl_FragCoord.xy / 400.0; 
  fragColour = vec4(
    float(read_brick_map(uvec3(512,512,512))) / 255.0,
    st.x,
    st.y,
    1.0
  );
}
      `;
      console.log(
        fragmentShaderCode
          .split("\n")
          .map((line, idx) => `${idx+1}: ${line}`)
          .join("\n")
      );
      gl.shaderSource(fragmentShader, fragmentShaderCode);
      gl.compileShader(fragmentShader);
      if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
        console.error('An error occurred compiling the fragment shader: ' + gl.getShaderInfoLog(fragmentShader));
        gl.deleteShader(fragmentShader);
        return undefined;
      }
      let shaderProgram = gl.createProgram();
      gl.attachShader(shaderProgram, vertexShader);
      gl.attachShader(shaderProgram, fragmentShader);
      gl.linkProgram(shaderProgram);
      if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
        gl.detachShader(shaderProgram, vertexShader);
        gl.detachShader(shaderProgram, fragmentShader);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        gl.deleteProgram(shaderProgram)
        return undefined;
      }
      gl.useProgram(shaderProgram);
      brickMap.initTextures(gl, shaderProgram);
      positionLocation = gl.getAttribLocation(shaderProgram, "aVertexPosition");
      resolutionLocation = gl.getUniformLocation(shaderProgram, "resolution");
      focalLengthLocation = gl.getUniformLocation(shaderProgram, "uFocalLength");
      modelViewMatrixLocation = gl.getUniformLocation(shaderProgram, "uModelViewMatrix");
      quadVerticesBuffer = gl.createBuffer();
      updateQuad();
    },
  ));
  return (
    <canvas
      ref={setCanvas}
      style={{
        width: "100%",
        height: "100%",
      }}
    />
  );
};

export default App;
