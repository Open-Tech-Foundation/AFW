// The cart count, shared by the badge and every add-to-cart button.
export const useCart = () => useState("cart", () => 0);
