export default function MathDemo() {
  let squared = $state(false);
  return (
    <div>
      <math data-testid="formula">
        <mi>x</mi>
        {squared && <mn data-testid="power">2</mn>}
      </math>
      <button data-testid="toggle" onclick={() => (squared = !squared)}>toggle</button>
    </div>
  );
}
