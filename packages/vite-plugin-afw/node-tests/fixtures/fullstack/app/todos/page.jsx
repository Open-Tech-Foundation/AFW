import { router } from "@opentf/afw";

export default function Todos() {
  return <ul id="todos">{(router.data?.todos ?? []).map((t) => <li>{t}</li>)}</ul>;
}
