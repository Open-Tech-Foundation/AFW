// The create command for each toolchain, with a copy button.
import { copyWithFeedback } from "@opentf/afw";

const COMMANDS = [
  { label: "Vite + Node", command: "npm create @opentf/afw@latest" },
  { label: "esdev", command: "esdev create my-app" },
];

export default function InstallCommand() {
  let active = $state(0);

  return (
    <div class="install">
      <div class="install-tabs" role="tablist" aria-label="Toolchain">
        {COMMANDS.map((entry, index) => (
          <button
            type="button"
            role="tab"
            aria-selected={active === index ? "true" : "false"}
            class={active === index ? "install-tab is-active" : "install-tab"}
            onclick={() => (active = index)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div class="install-line">
        <span class="install-prompt" aria-hidden="true">$</span>
        <code class="install-command">{COMMANDS[active].command}</code>
        <button
          type="button"
          class="install-copy"
          aria-label="Copy command"
          onclick={(e) => copyWithFeedback(e.currentTarget, COMMANDS[active].command)}
        >
          <span class="afw-copy-label">Copy</span>
        </button>
      </div>
    </div>
  );
}
