// Fixtures for <Popover> and <Tooltip>.
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "../../components/Popover.jsx";
import { Tooltip } from "../../components/Tooltip.jsx";

export function PopoverBasic() {
  return (
    <Popover>
      <PopoverTrigger data-testid="trigger">Filters</PopoverTrigger>
      <PopoverContent data-testid="panel" aria-label="Filters" placement="bottom-end">
        <p>Panel</p>
        <PopoverClose>Done</PopoverClose>
      </PopoverContent>
    </Popover>
  );
}

export function Tooltips() {
  return (
    <div>
      <Tooltip content="Bold"><button data-testid="same" aria-label="Bold">B</button></Tooltip>
      <Tooltip content="Delete the file"><button data-testid="unnamed"><svg aria-hidden="true"></svg></button></Tooltip>
      <Tooltip content="Opens in a new tab" delay={0}><a data-testid="described" href="/docs">Docs</a></Tooltip>
      <Tooltip content="Kept"><button data-testid="author" aria-describedby="mine">Own</button></Tooltip>
      <p id="mine">Mine</p>
    </div>
  );
}
