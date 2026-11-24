// UI kit demo: every @opentf/afw-ui component in the default theme, with mode and
// density switches. The kit sits on its own canvas so the playground's dark Tailwind
// chrome does not leak into it.
import "@opentf/afw-ui-theme";
import {
  Accordion, AccordionItem, Button, Checkbox, Combobox,
  Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger,
  Field, Menu, MenuCheckboxItem, MenuContent, MenuItem, MenuRadioGroup, MenuRadioItem,
  MenuSeparator, MenuTrigger, Popover, PopoverClose, PopoverContent, PopoverTrigger,
  Radio, RadioGroup, Select, Switch, Tab, TabList, TabPanel, Tabs, Textarea, TextField,
  Toaster, toast, Tooltip,
} from "@opentf/afw-ui";

export const metadata = { title: "UI Kit" };

export default function UiKit() {
  let theme = $state("light");
  let density = $state("comfortable");
  let grid = $state(true);
  let sort = $state("name");
  let email = $state("");
  let touched = $state(false);
  let plan = $state("team");
  let saving = $state(false);
  const emailError = $derived(touched && !email.includes("@") ? "Enter an email address, like name@example.com" : "");

  const save = () => {
    saving = true;
    setTimeout(() => {
      saving = false;
      toast("Project saved", { tone: "success" });
    }, 1200);
  };

  return (
    <div
      data-theme={theme}
      data-density={density}
      style="background: var(--afw-ui-canvas); color: var(--afw-ui-ink); font-family: var(--afw-ui-font); padding: 24px; border-radius: 12px; display: grid; gap: 28px; max-width: 760px"
    >
      <header style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap; justify-content: space-between">
        <h1 style="margin: 0; font-size: 22px">UI Kit</h1>
        <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap">
          <Switch checked={theme === "dark"} onCheckedChange={(on) => (theme = on ? "dark" : "light")}>Dark mode</Switch>
          <Field label="Density">
            <Select value={density} onValueChange={(v) => (density = v)}>
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
              <option value="spacious">Spacious</option>
            </Select>
          </Field>
        </div>
      </header>

      <section style="display: grid; gap: 12px">
        <h2 style="margin: 0; font-size: 16px">Actions</h2>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center">
          <Button variant="primary" loading={saving} onclick={save}>Save changes</Button>
          <Button>Cancel</Button>
          <Button variant="ghost">More</Button>
          <Tooltip content="Copy the share link to the clipboard">
            <button class="afw-ui-button" onclick={() => toast("Link copied", { duration: 3000 })}>Share</button>
          </Tooltip>

          <Menu>
            <MenuTrigger>Actions</MenuTrigger>
            <MenuContent>
              <MenuItem onSelect={() => toast("Renamed")}>Rename</MenuItem>
              <MenuItem onSelect={() => toast("Duplicated")}>Duplicate</MenuItem>
              <MenuItem disabled>Archive</MenuItem>
              <MenuSeparator />
              <MenuCheckboxItem checked={grid} onCheckedChange={(v) => (grid = v)}>Show grid</MenuCheckboxItem>
              <MenuRadioGroup label="Sort by" value={sort} onValueChange={(v) => (sort = v)}>
                <MenuRadioItem value="name">Sort by name</MenuRadioItem>
                <MenuRadioItem value="date">Sort by date</MenuRadioItem>
              </MenuRadioGroup>
            </MenuContent>
          </Menu>

          <Popover>
            <PopoverTrigger>Filters</PopoverTrigger>
            <PopoverContent aria-label="Filters">
              <div style="display: grid; gap: 8px">
                <Checkbox>Only mine</Checkbox>
                <Checkbox checked>Include archived</Checkbox>
                <PopoverClose>Done</PopoverClose>
              </div>
            </PopoverContent>
          </Popover>

          <Dialog onOpenChange={(open, value) => !open && value === "delete" && toast("Project deleted", { tone: "danger" })}>
            <DialogTrigger>Delete project…</DialogTrigger>
            <DialogContent role="alertdialog">
              <DialogTitle>Delete this project?</DialogTitle>
              <DialogDescription>Its pages and history are removed. This can't be undone.</DialogDescription>
              <div style="display: flex; gap: 8px; justify-content: end">
                <DialogClose autofocus>Keep project</DialogClose>
                <DialogClose value="delete" class="afw-ui-button" data-variant="danger">Delete</DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <p style="margin: 0; font-size: 13px; color: var(--afw-ui-muted)">
          Grid {grid ? "on" : "off"} · sorted by {sort}
        </p>
      </section>

      <section style="display: grid; gap: 12px">
        <h2 style="margin: 0; font-size: 16px">Tabs</h2>
        <Tabs defaultValue="overview">
          <TabList aria-label="Project">
            <Tab value="overview">Overview</Tab>
            <Tab value="activity">Activity</Tab>
            <Tab value="members">Members</Tab>
            <Tab value="settings" disabled>Settings</Tab>
          </TabList>
          <TabPanel value="overview"><p>Arrow keys move between tabs; selection follows focus.</p></TabPanel>
          <TabPanel value="activity"><p>Hidden panels are hidden="until-found": try find-in-page for "deploy".</p><p>Last deploy: 2 hours ago.</p></TabPanel>
          <TabPanel value="members"><p>3 members.</p></TabPanel>
          <TabPanel value="settings"><p>Settings.</p></TabPanel>
        </Tabs>
      </section>

      <section style="display: grid; gap: 16px">
        <h2 style="margin: 0; font-size: 16px">Form</h2>
        <Field label="Email" description="We only use it for receipts." error={emailError} required>
          <TextField name="email" type="email" autocomplete="email" value={email} onValueChange={(v) => (email = v)} onfocusout={() => (touched = true)} />
        </Field>
        <Field label="Country" description="Type to filter.">
          <Combobox
            name="country"
            placeholder="Choose a country"
            options={["Australia", "Brazil", "Canada", "France", "Germany", "India", "Japan", "Kenya", "Mexico", "Netherlands", "Singapore", "Spain", "Sweden", "United Kingdom", "United States"]}
          />
        </Field>
        <Field label="Notes">
          <Textarea name="notes" placeholder="Anything we should know" />
        </Field>
        <RadioGroup label="Plan" value={plan} onValueChange={(v) => (plan = v)} description="You can change it any time.">
          <Radio value="free">Free</Radio>
          <Radio value="team">Team</Radio>
          <Radio value="enterprise">Enterprise</Radio>
        </RadioGroup>
        <Switch checked>Email alerts</Switch>
        <Checkbox>I accept the terms</Checkbox>
      </section>

      <section style="display: grid; gap: 12px">
        <h2 style="margin: 0; font-size: 16px">Accordion</h2>
        <Accordion type="single">
          <AccordionItem summary="Shipping">Ships in two working days.</AccordionItem>
          <AccordionItem summary="Returns">30 days, no questions asked.</AccordionItem>
          <AccordionItem summary="Warranty">Two years on every part.</AccordionItem>
        </Accordion>
      </section>

      <Toaster />
    </div>
  );
}
