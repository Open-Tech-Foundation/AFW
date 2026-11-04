import { router } from "@opentf/afw";
import AddToCart from "../../../components/AddToCart.jsx";

export default function Product() {
  return (
    <article>
      <h1 class="text-2xl font-bold">{router.data?.name}</h1>
      <p class="text-lg">${router.data?.price}</p>
      <p>{router.data?.description}</p>
      <AddToCart id={router.data?.id} />
    </article>
  );
}
