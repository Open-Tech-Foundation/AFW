import { useSyncExternalStore } from "react";

// The cart count, shared by the badge and every add-to-cart button.
let count = 0;
const listeners = new Set();
export const cart = {
  set(value) {
    count = value;
    for (const listener of listeners) listener();
  },
};
const subscribe = (listener) => (listeners.add(listener), () => listeners.delete(listener));
export const useCartCount = () => useSyncExternalStore(subscribe, () => count, () => 0);
