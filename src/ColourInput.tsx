import { Component, createMemo, createSignal, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { Portal } from "solid-js/web";
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
    onMount(() => {
      let paletteDiv2 = paletteDiv();
      paletteDiv2?.focus();
    });
    let rect = colourDiv2.getBoundingClientRect();
    return (
      <div
        ref={setPaletteDiv}
        style={{
          "position": "absolute",
          "left": `${rect.right}px`,
          "top": `${rect.top}px`,
        }}
        onFocusOut={() => {
          setState("showingPalette", false);
        }}
        tabIndex={-1}
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
            setState("showingPalette", false);
          }}
        />
      </div>
    );
  };
  return (
    <div
      ref={setColourDiv}
      class="m-2"
      style={{
        width: `${props.squareSize}px`,
        height: `${props.squareSize}px`,
        "background-color": divColour(),
        "cursor": "pointer",
      }}
      onClick={() => {
        setState("showingPalette", true);
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
