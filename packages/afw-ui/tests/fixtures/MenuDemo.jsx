import { Menu, MenuCheckboxItem, MenuContent, MenuItem, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from "../../components/Menu.jsx";

export function Basic(props) {
  let grid = $state(false);
  let sort = $state("name");
  return (
    <div>
      <Menu>
        <MenuTrigger data-testid="trigger">Actions</MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={() => props.log?.("rename")}>Rename</MenuItem>
          <MenuItem disabled onSelect={() => props.log?.("never")}>Archive</MenuItem>
          <MenuItem href="#settings">Settings</MenuItem>
          <MenuSeparator />
          <MenuCheckboxItem checked={grid} onCheckedChange={(v) => (grid = v)}>Show grid</MenuCheckboxItem>
          <MenuRadioGroup label="Sort by" value={sort} onValueChange={(v) => (sort = v)}>
            <MenuRadioItem value="name">Name</MenuRadioItem>
            <MenuRadioItem value="date">Date</MenuRadioItem>
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
      <span data-testid="grid">{grid ? "on" : "off"}</span>
      <span data-testid="sort">{sort}</span>
      <button data-testid="after">After</button>
    </div>
  );
}
