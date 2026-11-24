// Public barrel for @opentf/afw-ui — accessible, headless components.
//
// Components ship as JSX source and are compiled by the consuming app's pipeline (the
// @opentf/afw-docs model); each registers on the first read of its `.tag`, so a bundler
// drops every component you do not render. They draw nothing: style them with
// @opentf/afw-ui-theme or your own CSS through the `.afw-ui-*` classes and the
// ARIA/`data-*` state attributes.

export { Button, VisuallyHidden } from "./components/Button.jsx";
export { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose } from "./components/Dialog.jsx";
export { Popover, PopoverTrigger, PopoverContent, PopoverClose } from "./components/Popover.jsx";
export { Tooltip } from "./components/Tooltip.jsx";
export {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuCheckboxItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
} from "./components/Menu.jsx";
export { Tabs, TabList, Tab, TabPanel } from "./components/Tabs.jsx";
export { Accordion, AccordionItem } from "./components/Accordion.jsx";
export { Field, TextField, Textarea } from "./components/Field.jsx";
export { Checkbox, Switch, RadioGroup, Radio, Select } from "./components/Choice.jsx";
export { Combobox } from "./components/Combobox.jsx";
export { Heading, Text, TextLink, Code, Kbd, CodeBlock } from "./components/Typography.jsx";
export { Stack, Inline, Grid, Card, Divider } from "./components/Layout.jsx";
export { AppShell, AppShellHeader, AppShellMenuButton, AppShellSidebar, AppShellMain } from "./components/AppShell.jsx";
export { SideNav, SideNavItem, SideNavGroup, PageHeader, Breadcrumbs, Pagination, pageRange } from "./components/Navigation.jsx";
export { Toaster, toast, dismissToast, clearToasts } from "./components/Toast.jsx";
export { announce } from "./internal/announce.js";
