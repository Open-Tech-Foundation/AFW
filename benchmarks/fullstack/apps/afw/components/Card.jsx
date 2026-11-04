export default function Card({ title, children }) {
  return (
    <div class="my-4 rounded-lg border p-4">
      <h2 class="font-semibold">{title}</h2>
      {children}
    </div>
  );
}
