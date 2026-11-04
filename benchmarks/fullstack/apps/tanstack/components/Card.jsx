export default function Card({ title, children }) {
  return (
    <div className="my-4 rounded-lg border p-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </div>
  );
}
