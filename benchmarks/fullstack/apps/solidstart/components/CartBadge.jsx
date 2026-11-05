import { cartCount } from "./cart.js";

export default function CartBadge() {
  return <span id="cart" class="ml-auto">Cart: {cartCount()}</span>;
}
