import { Component, For } from "solid-js";
import * as THREE from "three";

const Palette: Component<{
  numColumns: number,
  squareSize: number,
  colours: { id: string, colour: THREE.Color, }[],
  addColour: (colour: THREE.Color) => { id: string, },
  removeColour: (id: string) => void,
  selectedColourById: string | undefined,
  setSelectedColour: (colourId: string) => void,
}> = (props) => {
  return (
    <div
      class="bg-base-200"
      style={{
        "display": "grid",
        "width": "fit-content",
        "grid-template-columns": Array(props.numColumns).fill("min-content").join(" "),
        "padding": "10px",
      }}
    >
      <For each={props.colours}>
        {(colour) => (
          <div
            class="m-1"
            style={{
              "width": `${props.squareSize}px`,
              "height": `${props.squareSize}px`,
              "background-color": `#${colour.colour.getHexString()}`,
              "cursor": "pointer",
            }}
            onClick={() => props.setSelectedColour(colour.id)}
          />
        )}
      </For>
      <div
        class="m-1"
        style={{
          "width": `${props.squareSize}px`,
          "height": `${props.squareSize}px`,
          "cursor": "pointer",
        }}
      >
        +
      </div>
    </div>
  );
};

export default Palette;
