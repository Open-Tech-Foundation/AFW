import { Combobox } from "../../components/Combobox.jsx";
import { Field } from "../../components/Field.jsx";

const FRUIT = ["Apple", "Apricot", "Banana", { value: "cherry", label: "Cherry", disabled: true }, "Grape", "Mango"];

export function Basic(props) {
  let fruit = $state(props.initial);
  return (
    <form data-testid="form">
      <Field label="Fruit" description="Pick one.">
        <Combobox name="fruit" options={FRUIT} value={fruit} allowCustomValue={props.custom} onValueChange={(v) => { fruit = v; props.log?.(v); }} />
      </Field>
      <output data-testid="value">{String(fruit)}</output>
      <button type="button" data-testid="set">set</button>
      <button type="button" data-testid="pick-mango" onclick={() => (fruit = "Mango")}>mango</button>
    </form>
  );
}

export function Uncontrolled() {
  return (
    <form data-testid="form">
      <Combobox aria-label="Fruit" name="fruit" defaultValue="Grape" options={FRUIT} />
    </form>
  );
}
