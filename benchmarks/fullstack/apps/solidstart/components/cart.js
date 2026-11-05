import { createSignal } from "solid-js";

// The cart count, shared by the badge and every add-to-cart button.
export const [cartCount, setCartCount] = createSignal(0);
