import { Code, CodeBlock, Heading, Kbd, TextLink, Text } from "../../components/Typography.jsx";
import { PageHeader } from "../../components/Navigation.jsx";

export function Headings(props) {
  return (
    <div>
      <Heading level={1} data-testid="h1">Billing</Heading>
      <Heading level={3} size="sm" data-testid="h3">Invoices</Heading>
      <Heading data-testid="default">Default</Heading>
      <Heading level={9} data-testid="clamped">Clamped</Heading>
      <Heading level={props.level ?? 2} data-testid="live">Live</Heading>
    </div>
  );
}

export function Texts() {
  return (
    <div>
      <Text data-testid="p">Paragraph</Text>
      <Text as="span" tone="muted" size="sm" weight="semibold" data-testid="span">Inline</Text>
      <Text as="div" truncate data-testid="truncate">quarterly-report-final-v2.pdf</Text>
      <Text lines={2} data-testid="lines">Two lines at most</Text>
    </div>
  );
}

export function Links() {
  return (
    <div>
      <TextLink href="/settings" data-testid="app">Settings</TextLink>
      <TextLink href="https://status.example.com" external data-testid="external">Status page</TextLink>
      <TextLink href="//cdn.example.com/a" data-testid="protocol">CDN</TextLink>
    </div>
  );
}

export function CodeBits() {
  return (
    <div>
      <Code data-testid="code">afw dev</Code>
      <Kbd data-testid="kbd">Esc</Kbd>
      <Kbd keys={["Ctrl", "K"]} data-testid="combo" />
      <CodeBlock label="Install" language="sh" data-testid="block">npm i @opentf/afw-ui</CodeBlock>
    </div>
  );
}

export function Header() {
  return <PageHeader title="Atlas" description="Shipping" />;
}

export function ClickLink(props) {
  return <TextLink href="https://example.com" onclick={() => props.spy.clicks++}>Site</TextLink>;
}
