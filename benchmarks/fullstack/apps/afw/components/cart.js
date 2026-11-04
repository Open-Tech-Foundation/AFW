import { reactive } from "@opentf/afw";

// The cart count, shared by the badge and every add-to-cart button.
export const cart = reactive({ count: 0 });
