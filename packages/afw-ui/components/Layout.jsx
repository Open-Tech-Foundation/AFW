// Layout primitives: Stack, Inline, Grid, Container, Card, Divider.
//
//   <Stack gap="lg">
//     <Inline gap="sm" justify="end"><Button>Cancel</Button><Button variant="primary">Save</Button></Inline>
//     <Grid min="18rem">
//       <Card><h3>Usage</h3><p>4,210 requests today.</p></Card>
//       <Card><h3>Errors</h3><p>3 in the last hour.</p></Card>
//     </Grid>
//   </Stack>
//
// They only arrange: `data-gap`, `data-align`, `data-justify`, `data-direction` and
// `--afw-ui-grid-min` are hooks a theme turns into spacing (density-aware in the default
// theme). Each is a `<div>`: put lists, `nav` and other meaningful elements inside, or give
// your own element the `afw-ui-stack` class and the same data attributes.
//
// Responsive: `gap`, `align`, `justify`, `direction` and `columns` take one value or one per
// breakpoint — `gap={{ base: "sm", md: "lg" }}`. A breakpoint is the width of the space the
// component sits in (the nearest AppShellMain, Container or Card), not the window, so the
// same Grid works in a sidebar and a full page. Each entry is a `data-<prop>-<bp>` hook.

import { at } from "../internal/responsive.js";

export function Stack({ gap = "md", align, direction, children, ...rest }) {
  return (
    <div
      {...rest}
      class={["afw-ui-stack", rest.class]}
      data-gap={at(gap, "base")}
      data-gap-sm={at(gap, "sm")}
      data-gap-md={at(gap, "md")}
      data-gap-lg={at(gap, "lg")}
      data-gap-xl={at(gap, "xl")}
      data-align={at(align, "base")}
      data-align-sm={at(align, "sm")}
      data-align-md={at(align, "md")}
      data-align-lg={at(align, "lg")}
      data-align-xl={at(align, "xl")}
      data-direction={at(direction, "base")}
      data-direction-sm={at(direction, "sm")}
      data-direction-md={at(direction, "md")}
      data-direction-lg={at(direction, "lg")}
      data-direction-xl={at(direction, "xl")}
    >
      {children}
    </div>
  );
}

export function Inline({ gap = "sm", align = "center", justify, wrap = true, children, ...rest }) {
  return (
    <div
      {...rest}
      class={["afw-ui-inline", rest.class]}
      data-gap={at(gap, "base")}
      data-gap-sm={at(gap, "sm")}
      data-gap-md={at(gap, "md")}
      data-gap-lg={at(gap, "lg")}
      data-gap-xl={at(gap, "xl")}
      data-align={at(align, "base")}
      data-align-sm={at(align, "sm")}
      data-align-md={at(align, "md")}
      data-align-lg={at(align, "lg")}
      data-align-xl={at(align, "xl")}
      data-justify={at(justify, "base")}
      data-justify-sm={at(justify, "sm")}
      data-justify-md={at(justify, "md")}
      data-justify-lg={at(justify, "lg")}
      data-justify-xl={at(justify, "xl")}
      data-nowrap={wrap ? undefined : ""}
    >
      {children}
    </div>
  );
}

// `columns` as a custom property per breakpoint (a count CSS can't read from an attribute
// everywhere yet), next to the auto-fill minimum.
function gridStyle(min, columns) {
  const parts = [`--afw-ui-grid-min: ${min}`];
  for (const bp of ["base", "sm", "md", "lg", "xl"]) {
    const n = Math.trunc(Number(at(columns, bp)));
    if (n > 0) parts.push(`--afw-ui-cols${bp === "base" ? "" : `-${bp}`}: ${n}`);
  }
  return parts.join("; ");
}
const has = (columns, bp) => (Math.trunc(Number(at(columns, bp))) > 0 ? "" : undefined);

// Without `columns`: as many columns as fit at `min` wide, filling the row, down to one —
// no breakpoints, so it works the same in a sidebar or a full page. With `columns`, that
// many equal columns from the breakpoint given (`columns={{ base: 1, md: 2, xl: 4 }}`);
// below the first one it still fits by `min`.
export function Grid({ min = "16rem", gap = "md", columns, children, ...rest }) {
  return (
    <div
      {...rest}
      class={["afw-ui-grid", rest.class]}
      data-gap={at(gap, "base")}
      data-gap-sm={at(gap, "sm")}
      data-gap-md={at(gap, "md")}
      data-gap-lg={at(gap, "lg")}
      data-gap-xl={at(gap, "xl")}
      data-columns={has(columns, "base")}
      data-columns-sm={has(columns, "sm")}
      data-columns-md={has(columns, "md")}
      data-columns-lg={has(columns, "lg")}
      data-columns-xl={has(columns, "xl")}
      style={gridStyle(min, columns)}
    >
      {children}
    </div>
  );
}

// A centred page column: `size` caps its width (`sm` 40rem … `xl` 80rem, or `full`), with
// side padding that clears a phone's notch. It is a measuring region: responsive props
// inside it follow its width.
export function Container({ size = "lg", children, ...rest }) {
  return (
    <div {...rest} class={["afw-ui-container", rest.class]} data-size={size}>
      {children}
    </div>
  );
}

// A card groups one piece of content. Its regions are its direct children, in source
// order — media (`img`/`picture`/`video`/`svg`), a heading (or `hgroup`/`header`),
// content (`p`/`ul`/`dl`, or one `div` around several), and a `footer` of actions — so a
// theme places and styles them by selector, with no wrapper parts.
export function Card({ children, ...rest }) {
  return (
    <article {...rest} class={["afw-ui-card", rest.class]}>
      {children}
    </article>
  );
}

export function Divider(props) {
  return <hr class={["afw-ui-divider", props.class]} />;
}
