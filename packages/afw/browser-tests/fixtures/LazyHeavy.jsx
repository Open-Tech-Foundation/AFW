export default function LazyHeavy({ label, onpicked, children }) {
  $expose({ ping: () => `pong ${label}` });
  return (
    <section data-testid="heavy">
      <button type="button" data-testid="pick" onclick={() => onpicked?.(label)}>{label}</button>
      {children}
    </section>
  );
}
