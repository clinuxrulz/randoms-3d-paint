import { Component, createMemo, createSignal, createEffect, Show, createStore } from "solid-js";
import { Portal } from "@solidjs/web";
import * as THREE from "three";
import Palette from "./Palette";

const ColourInput: Component<{
  squareSize: number,
  colours: { id: string, colour: THREE.Color, }[],
  addColour: (colour: THREE.Color) => { id: string, },
  removeColour: (id: string) => void,
  selectedColourById: string | undefined,
  setSelectedColour: (colourId: string) => void,
}> = (props) => {
  let [ state, setState, ] = createStore<{
    showingPalette: boolean,
  }>({
    showingPalette: false,
  });
  let [ colourDiv, setColourDiv, ] = createSignal<HTMLDivElement>();
  createEffect(() => {}, () => {
    setColourDiv(document.getElementById("colour-div") as HTMLDivElement);
  });
  let divColour = createMemo(() => {
    if (props.selectedColourById == undefined) {
      return "";
    }
    let colour = props.colours.find(({ id, }) => id === props.selectedColourById);
    if (colour == undefined) {
      return "";
    }
    return `#${colour.colour.getHexString()}`;
  });
  let PopupPalette: Component = () => {
    let colourDiv2 = colourDiv();
    if (colourDiv2 == undefined) {
      return undefined;
    }
    let [ paletteDiv, setPaletteDiv, ] = createSignal<HTMLDivElement>();
    createEffect(() => {}, () => {
      let paletteDiv2 = document.getElementById("palette-div") as HTMLDivElement;
      setPaletteDiv(paletteDiv2);
      paletteDiv2?.focus();
    });
    let rect = colourDiv2.getBoundingClientRect();
    return (
      <div
        id="palette-div"
        style={{
          "position": "absolute",
          "left": `${rect.right}px`,
          "top": `${rect.top}px`,
        }}
        onFocusOut={() => {
          setState((s) => { s.showingPalette = false });
        }}
        tabindex={-1}
      >
        <Palette
          numColumns={8}
          squareSize={props.squareSize}
          colours={props.colours}
          addColour={props.addColour}
          removeColour={props.removeColour}
          selectedColourById={props.selectedColourById}
          setSelectedColour={(colourId) => {
            props.setSelectedColour(colourId);
            setState((s) => { s.showingPalette = false });
          }}
        />
      </div>
    );
  };
  return (
    <div
      id="colour-div"
      class="m-2"
      style={{
        width: `${props.squareSize}px`,
        height: `${props.squareSize}px`,
        "background-color": divColour(),
        "cursor": "pointer",
      }}
      onClick={() => {
        setState((s) => { s.showingPalette = true });
      }}
    >
      <Show when={state.showingPalette}>
        <Portal>
          <PopupPalette/>
        </Portal>
      </Show>
    </div>
  );
};

export default ColourInput;
