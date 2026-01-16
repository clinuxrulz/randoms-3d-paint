import { createComputed, createSignal, on, onCleanup, onMount, type Component } from 'solid-js';
import { BrickMap } from './BrickMap';

const App: Component = () => {
  let [ canvas, setCanvas, ] = createSignal<HTMLCanvasElement>();
  let [ gl, setGl, ] = createSignal<WebGL2RenderingContext>();
  let brickMap = new BrickMap();
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

${brickMapShaderCode}

void main(void) {
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
