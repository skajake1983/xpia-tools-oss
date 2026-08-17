// The Electron main process lives in ./entry.cjs (plain CommonJS).
// Electron's built-in `require('electron')` must resolve before the tsx hook is
// registered, which isn't possible from a tsx-transpiled module — so the main
// process is intentionally plain JS. This file is a placeholder.
export {};
