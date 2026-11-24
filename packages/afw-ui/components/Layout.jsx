// Layout primitives: Stack, Inline, Grid, Card, Divider.
//
//   <Stack gap="lg">
//     <Inline gap="sm" justify="end"><Button>Cancel</Button><Button variant="primary">Save</Button></Inline>
//     <Grid min="18rem">
//       <Card><h3>Usage</h3><p>4,210 requests today.</p></Card>
//       <Card><h3>Errors</h3><p>3 in the last hour.</p></Card>
//     </Grid>
//   </Stack>
//
// They only arrange: `data-gap`, `data-align`, `data-justify` and `--afw-ui-grid-min` are
// hooks a theme turns into spacing (density-aware in the default theme). Each is a
// `<div>`: put lists, `nav` and other meaningful elements inside, or give your own
// element the `afw-ui-stack` class and the same data attributes.

export function Stack({ gap = "md", align, children, ...rest }) {
  return (
    <div {...rest} class={["afw-ui-stack", rest.class]} data-gap={gap} data-align={align}>
      {children}
    </div>
  );
}

export function Inline({ gap = "sm", align = "center", justify, wrap = true, children, ...rest }) {
  return (
    <div
      {...rest}
      class={["afw-ui-inline", rest.class]}
      data-gap={gap}
      data-align={align}
      data-justify={justify}
      data-nowrap={wrap ? undefined : ""}
    >
      {children}
    </div>
  );
}

// Columns that fit the space they are given: as many as fit at `min` wide, filling the
// row, down to one — no breakpoints, so it works the same in a sidebar or a full page.
export function Grid({ min = "16rem", gap = "md", children, ...rest }) {
  return (
    <div {...rest} class={["afw-ui-grid", rest.class]} data-gap={gap} style={`--afw-ui-grid-min: ${min}`}>
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
