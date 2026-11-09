/**
 * BEYU OS — Holograph WebGL renderer surface (shared capability).
 *
 * Import graph discipline: `./scene` and `./math` are pure (server-safe);
 * `./renderer` touches the DOM only inside methods/constructors, so importing
 * the module never executes browser code — but the workspace still loads the
 * 3D panel lazily so the renderer chunk is not part of the main bundle.
 */
export * from "./math";
export * from "./scene";
export * from "./renderer";
