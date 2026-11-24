import { Field, TextField, Textarea } from "../../components/Field.jsx";
import { Checkbox, Radio, RadioGroup, Select, Switch } from "../../components/Choice.jsx";
import { Accordion, AccordionItem } from "../../components/Accordion.jsx";
import { Button, VisuallyHidden } from "../../components/Button.jsx";

export function Fields() {
  let email = $state("");
  let error = $state("");
  return (
    <form>
      <Field label="Email" description="Receipts only." error={error} required>
        <TextField name="email" type="email" value={email} onValueChange={(v) => (email = v)} />
      </Field>
      <button type="button" data-testid="fail" onclick={() => (error = "Enter an email address")}>Fail</button>
      <button type="button" data-testid="fix" onclick={() => (error = "")}>Fix</button>
      <span data-testid="email">{email}</span>
      <Field label="Bio"><Textarea name="bio" rows="3" /></Field>
      <TextField aria-label="Standalone" data-testid="standalone" />
      <p id="own-hint">Own hint</p>
      <TextField aria-label="Own ARIA" id="own-id" aria-describedby="own-hint" aria-invalid="true" required />
    </form>
  );
}

export function Choices() {
  let terms = $state(false);
  let alerts = $state(true);
  let plan = $state("team");
  let country = $state("in");
  let mixed = $state(true);
  return (
    <div>
      <Checkbox checked={terms} onCheckedChange={(v) => (terms = v)} data-testid="terms">I accept the terms</Checkbox>
      <Checkbox indeterminate={mixed} data-testid="mixed" onCheckedChange={() => (mixed = false)}>Select all</Checkbox>
      <Switch checked={alerts} onCheckedChange={(v) => (alerts = v)} data-testid="alerts">Email alerts</Switch>
      <Switch onLabel="Ein" offLabel="Aus">Benachrichtigungen</Switch>
      <RadioGroup label="Plan" value={plan} onValueChange={(v) => (plan = v)} description="Change it any time.">
        <Radio value="free">Free</Radio>
        <Radio value="team">Team</Radio>
      </RadioGroup>
      <Field label="Country">
        <Select name="country" value={country} onValueChange={(v) => (country = v)}>
          <option value="fr">France</option>
          <option value="in">India</option>
        </Select>
      </Field>
      <output data-testid="state">{`${terms}|${alerts}|${plan}|${country}`}</output>
    </div>
  );
}

export function Sections() {
  return (
    <div>
      <Accordion type="single" data-testid="single">
        <AccordionItem summary="Shipping">Ships in 2 days.</AccordionItem>
        <AccordionItem summary="Returns" open>30 days.</AccordionItem>
      </Accordion>
      <Accordion data-testid="multi">
        <AccordionItem summary="A">a</AccordionItem>
        <AccordionItem summary="B">b</AccordionItem>
      </Accordion>
    </div>
  );
}

export function Buttons(props) {
  let busy = $state(false);
  return (
    <div>
      <Button data-testid="plain" onclick={() => props.log?.("plain")}>Save</Button>
      <Button variant="primary" size="sm" type="submit" data-testid="primary">Go</Button>
      <Button loading={busy} data-testid="busy" onclick={() => props.log?.("busy")}>Upload</Button>
      <button data-testid="toggle" onclick={() => (busy = !busy)}>toggle</button>
      <Button aria-label="Close" data-testid="icon"><VisuallyHidden>Close dialog</VisuallyHidden></Button>
    </div>
  );
}
