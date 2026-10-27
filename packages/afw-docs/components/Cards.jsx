// A responsive grid of <Card>s. Used on index/landing docs pages (e.g. the API
// reference overview) to present a set of links as tiles instead of a bullet list.
//
//   import { Cards, Card } from "@opentf/afw-docs";
//   <Cards>
//     <Card title="Core" href="/docs/api/core" desc="Runtime API." />
//   </Cards>

export default function Cards(props) {
  return <div class="afwd-cards">{props.children}</div>;
}
