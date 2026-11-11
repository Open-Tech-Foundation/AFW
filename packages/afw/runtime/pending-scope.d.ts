/** Compiler-emitted around the build of a `<Pending>`'s children. */
export function enterPending(el: Element): void;
/** Compiler-emitted after the build of a `<Pending>`'s children. */
export function exitPending(): void;
export function buildingPending(): Element | null;
export function closestPending(node: Node): Element | null;
