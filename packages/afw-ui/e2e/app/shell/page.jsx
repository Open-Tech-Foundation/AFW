// The app shell, server-rendered at /shell: landmarks, the skip link, the current page
// marked from the route, and the sidebar that becomes a drawer on a narrow screen.
import {
  AppShell, AppShellHeader, AppShellMain, AppShellMenuButton, AppShellSidebar,
  Breadcrumbs, Card, Grid, PageHeader, SideNav, SideNavGroup, SideNavItem,
} from "@opentf/afw-ui";

export default function ShellPage() {
  return (
    <AppShell>
      <AppShellHeader>
        <AppShellMenuButton />
        <strong>Console</strong>
      </AppShellHeader>
      <AppShellSidebar label="Main navigation">
        <SideNav label="Main">
          <SideNavItem href="/" exact>Components</SideNavItem>
          <SideNavGroup label="Layouts">
            <SideNavItem href="/shell">App shell</SideNavItem>
          </SideNavGroup>
        </SideNav>
      </AppShellSidebar>
      <AppShellMain>
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "App shell", href: "/shell" }]} />
        <PageHeader title="App shell" description="Header, sidebar and main." />
        <Grid min="12rem">
          <Card><h2>Usage</h2><p>4,210 requests</p></Card>
          <Card><h2>Errors</h2><p>3 in the last hour</p></Card>
        </Grid>
      </AppShellMain>
    </AppShell>
  );
}
