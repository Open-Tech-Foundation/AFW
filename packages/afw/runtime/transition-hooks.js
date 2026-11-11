// The seam between the DOM regions (dom.js) and enter/exit transitions
// (transition.js). Both slots stay null until a compiled element declares a
// transition (`setTransition`), so an app without transitions never loads
// transition.js and its regions add and remove nodes exactly as before.
//
// - `enter(node, initial)`: called for each root node a region has just inserted.
//   `initial` is true on the region's first render.
// - `leave(node)`: called for each root node a region is removing. Returns true
//   when it takes over the removal (the node animates out, then removes itself).
export const transitionHooks = { enter: null, leave: null };
