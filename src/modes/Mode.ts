import { Accessor, Component } from "solid-js";

export interface Mode {
  readonly instructions?: Component;
  readonly disableOrbit?: Accessor<boolean>;
}
