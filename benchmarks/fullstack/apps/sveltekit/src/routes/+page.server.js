import products from "../../data/products.json";

export const load = () => ({ featured: products.slice(0, 5) });
