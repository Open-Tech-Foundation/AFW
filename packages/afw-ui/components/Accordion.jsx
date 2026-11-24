// Accordion — disclosure sections on native <details>/<summary>.
//
//   <Accordion type="single">
//     <AccordionItem summary="Shipping">…</AccordionItem>
//     <AccordionItem summary="Returns" open>…</AccordionItem>
//   </Accordion>
//
// `type="single"` gives every item the same `name`, so the browser keeps at most one
// open (exclusive accordion). "multiple" lets any number open. The summary is the
// button: Enter/Space toggle it, its expanded state is exposed natively, and
// find-in-page opens a closed item that contains the match. An <AccordionItem> also
// works on its own, outside an <Accordion>.

import { ContextProvider, createContext } from "@opentf/afw";

const AccordionContext = createContext(null);

export function Accordion({ type = "multiple", children, ...rest }) {
  const name = $id();
  const api = { name: type === "single" ? name : undefined };
  return (
    <ContextProvider context={AccordionContext} value={api}>
      <div {...rest} class={["afw-ui-accordion", rest.class]}>
        {children}
      </div>
    </ContextProvider>
  );
}

export function AccordionItem({ summary, open = false, onOpenChange, children, ...rest }) {
  const accordion = $context(AccordionContext);
  return (
    <details
      {...rest}
      class={["afw-ui-accordion-item", rest.class]}
      name={accordion?.name}
      open={open || undefined}
      ontoggle={(e) => onOpenChange?.(e.currentTarget.open)}
    >
      <summary class="afw-ui-accordion-summary">{summary}</summary>
      <div class="afw-ui-accordion-content">{children}</div>
    </details>
  );
}
