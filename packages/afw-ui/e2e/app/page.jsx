// The kit as a server-rendered page: every part whose ids, context or initial state
// must survive hydration, plus the controls the e2e drives with real keyboard input.
import {
  Button, Combobox, Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger,
  Field, Menu, MenuContent, MenuItem, MenuTrigger, Popover, PopoverContent, PopoverTrigger,
  Switch, Tab, TabList, TabPanel, Tabs, TextField, Toaster, toast, Tooltip,
  Code, CodeBlock, Heading, Kbd, Text, TextLink,
} from "@opentf/afw-ui";

export default function Kit() {
  return (
    <div data-theme="light" style="padding: 24px; display: grid; gap: 16px; max-width: 640px">
      <div style="display: flex; gap: 8px; align-items: center">
        <Button id="first" variant="primary" onclick={() => toast("Saved", { tone: "success" })}>Save</Button>
        <Dialog>
          <DialogTrigger id="dialog-trigger">Delete</DialogTrigger>
          <DialogContent role="alertdialog">
            <DialogTitle>Delete this project?</DialogTitle>
            <DialogDescription>It cannot be undone.</DialogDescription>
            <DialogClose id="keep" autofocus>Keep</DialogClose>
            <DialogClose value="delete">Delete</DialogClose>
          </DialogContent>
        </Dialog>
        <Menu>
          <MenuTrigger>Actions</MenuTrigger>
          <MenuContent>
            <MenuItem>Rename</MenuItem>
            <MenuItem>Duplicate</MenuItem>
            <MenuItem>Archive</MenuItem>
          </MenuContent>
        </Menu>
        <Popover>
          <PopoverTrigger>Filters</PopoverTrigger>
          <PopoverContent aria-label="Filters"><p>Panel</p></PopoverContent>
        </Popover>
        <Tooltip content="Copy the share link"><button id="share" type="button">Share</button></Tooltip>
      </div>
      <Tabs defaultValue="b">
        <TabList aria-label="Project">
          <Tab value="a">Overview</Tab>
          <Tab value="b">Activity</Tab>
          <Tab value="c">Members</Tab>
        </TabList>
        <TabPanel value="a">Overview panel</TabPanel>
        <TabPanel value="b">Activity panel</TabPanel>
        <TabPanel value="c">Members panel</TabPanel>
      </Tabs>
      <Field label="Email" description="Receipts only." required>
        <TextField name="email" type="email" />
      </Field>
      <Field label="Fruit">
        <Combobox name="fruit" defaultValue="banana" options={[{ value: "apple", label: "Apple" }, { value: "apricot", label: "Apricot" }, { value: "banana", label: "Banana" }, { value: "grape", label: "Grape" }]} />
      </Field>
      <Switch checked>Email alerts</Switch>
      <section id="type" style="inline-size: 240px">
        <Heading level={2} size="3xl">Usage report</Heading>
        <Heading level={3}>This week</Heading>
        <Text id="clamp" lines={2}>Requests rose by a fifth on Tuesday after the billing export moved to the nightly queue, then settled.</Text>
        <Text id="cut" truncate>quarterly-usage-report-final-version-two.pdf</Text>
        <Text tone="muted" size="sm">Updated hourly.</Text>
        <Text id="split">Before <div class="blk">block</div> after</Text>
        <TextLink id="ext" href="https://status.example.com" external>Status page</TextLink>
        <p>Press <Kbd id="combo" keys={["Ctrl", "K"]} /> or run <Code id="code">afw dev</Code>.</p>
        <CodeBlock id="block" label="Install">{"npm install @opentf/afw-ui @opentf/afw-ui-theme --save-exact"}</CodeBlock>
      </section>
      <Toaster />
    </div>
  );
}
