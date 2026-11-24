// Responsive layout props, measured on their region: the page Container and a narrow
// sidebar Container (the same Grid behaves differently in each).
import { Button, Card, Container, Grid, Heading, Stack } from "@opentf/afw-ui";

export default function Responsive() {
  return (
    <Container id="page" size="xl" data-theme="light">
      <Stack id="stack" direction={{ base: "column", md: "row" }} gap={{ base: "sm", lg: "xl" }}>
        <Button>One</Button>
        <Button>Two</Button>
      </Stack>
      <Grid id="grid" columns={{ base: 1, md: 2, lg: 4 }}>
        <Card><h3>A</h3></Card>
        <Card><h3>B</h3></Card>
        <Card><h3>C</h3></Card>
        <Card><h3>D</h3></Card>
      </Grid>
      <div style="inline-size: 18rem">
        <Container id="narrow" size="full">
          <Grid id="side-grid" columns={{ base: 1, md: 2, lg: 4 }}>
            <Card><h3>A</h3></Card>
            <Card><h3>B</h3></Card>
          </Grid>
        </Container>
      </div>
      <Heading id="display" level={1} size="display">Usage</Heading>
      <p id="long">https://example.com/a/very/long/path/that/must/not/widen/the/page/at/three/hundred/twenty/pixels</p>
    </Container>
  );
}
