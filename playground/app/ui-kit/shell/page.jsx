// The UI kit's app shell: header, side navigation (a drawer on narrow screens),
// breadcrumbs, page header, a card grid and pagination.
import "@opentf/afw-ui-theme";
import {
  AppShell, AppShellHeader, AppShellMain, AppShellMenuButton, AppShellSidebar,
  Breadcrumbs, Button, Card, Grid, Inline, PageHeader, Pagination, SideNav, SideNavGroup,
  SideNavItem, Stack, toast, Toaster,
} from "@opentf/afw-ui";

export const metadata = { title: "UI Kit — App shell" };

const PROJECTS = [
  { name: "Atlas", desc: "Shipping dashboard for the logistics team.", status: "Healthy" },
  { name: "Beacon", desc: "Alerting and on-call rotation.", status: "2 alerts" },
  { name: "Cobalt", desc: "Billing service and invoices.", status: "Healthy" },
  { name: "Delta", desc: "Data warehouse exports.", status: "Paused" },
  { name: "Ember", desc: "Customer support inbox.", status: "Healthy" },
  { name: "Fjord", desc: "Search indexing pipeline.", status: "Degraded" },
];

export default function AppShellDemo() {
  let page = $state(1);
  return (
    <div data-theme="light" style="margin: -32px; font-family: var(--afw-ui-font)">
      <AppShell>
        <AppShellHeader>
          <AppShellMenuButton />
          <strong style="font-size: 15px">Acme Console</strong>
          <span style="margin-inline-start: auto" />
          <Button variant="ghost">Help</Button>
          <Button>Sign out</Button>
        </AppShellHeader>
        <AppShellSidebar label="Main navigation">
          <SideNav label="Main">
            <SideNavItem href="/ui-kit" exact>Components</SideNavItem>
            <SideNavGroup label="Workspace" open>
              <SideNavItem href="/ui-kit/shell">Projects</SideNavItem>
              <SideNavItem href="/ui-kit/shell/members">Members</SideNavItem>
              <SideNavItem href="/ui-kit/shell/billing">Billing</SideNavItem>
            </SideNavGroup>
            <SideNavGroup label="Settings">
              <SideNavItem href="/ui-kit/shell/profile">Profile</SideNavItem>
              <SideNavItem href="/ui-kit/shell/security">Security</SideNavItem>
            </SideNavGroup>
          </SideNav>
        </AppShellSidebar>
        <AppShellMain>
          <Stack gap="lg">
            <div>
              <Breadcrumbs items={[{ label: "Workspace", href: "/ui-kit" }, { label: "Projects", href: "/ui-kit/shell" }]} />
              <PageHeader title="Projects" description="Everything your team runs, at a glance.">
                <Button>Export</Button>
                <Button variant="primary" onclick={() => toast("Project created", { tone: "success" })}>New project</Button>
              </PageHeader>
            </div>
            <Grid min="15rem">
              {PROJECTS.map((p) => (
                <Card key={p.name}>
                  <h2>{p.name}</h2>
                  <p>{p.desc}</p>
                  <footer>
                    <Inline gap="sm" justify="between" style="inline-size: 100%">
                      <span style="color: var(--afw-ui-muted); font-size: 13px">{p.status}</span>
                      <Button size="sm">Open</Button>
                    </Inline>
                  </footer>
                </Card>
              ))}
            </Grid>
            <Pagination page={page} pageCount={8} onPageChange={(p) => (page = p)} />
          </Stack>
        </AppShellMain>
      </AppShell>
      <Toaster />
    </div>
  );
}
