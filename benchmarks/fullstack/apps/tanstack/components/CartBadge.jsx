import { useCartCount } from "./cart.js";

export default function CartBadge() {
  return <span id="cart" className="ml-auto">Cart: {useCartCount()}</span>;
}
