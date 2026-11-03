import { onMount } from "@opentf/afw";

export default function Greet() {
  let name = $state("");
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
  });
  return (
    <form>
      <label>
        Name <input value={name} oninput={(e: Event) => (name = (e.target as HTMLInputElement).value)} />
      </label>
      <output>{name ? `Hello, ${name}!` : "Who are you?"}</output>
      <span>{mounted ? "mounted" : "pending"}</span>
    </form>
  );
}
