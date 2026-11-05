export default function Card(props) {
  return (
    <div class="my-4 rounded-lg border p-4">
      <h2 class="font-semibold">{props.title}</h2>
      {props.children}
    </div>
  );
}
