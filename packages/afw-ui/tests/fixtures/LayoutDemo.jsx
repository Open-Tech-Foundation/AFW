import { Card, Divider, Grid, Inline, Stack } from "../../components/Layout.jsx";
import { AppShell, AppShellHeader, AppShellMain, AppShellMenuButton, AppShellSidebar } from "../../components/AppShell.jsx";
import { Breadcrumbs, PageHeader, Pagination, SideNav, SideNavGroup, SideNavItem } from "../../components/Navigation.jsx";

export function Primitives() {
  return (
    <Stack gap="lg" data-testid="stack">
      <Inline gap="sm" justify="end" data-testid="inline"><button>A</button><button>B</button></Inline>
      <Grid min="12rem" data-testid="grid">
        <Card data-testid="card"><h3>Usage</h3><p>4,210 requests</p></Card>
      </Grid>
      <Divider />
    </Stack>
  );
}

export function Shell(props) {
  return (
    <AppShell drawerBelow={props.drawerBelow ?? "1px"}>
      <AppShellHeader><AppShellMenuButton /><strong>Console</strong></AppShellHeader>
      <AppShellSidebar label="Main navigation">
        <SideNav label="Main">
          <SideNavItem href="/" exact>Overview</SideNavItem>
          <SideNavGroup label="Projects">
            <SideNavItem href="/projects">All projects</SideNavItem>
            <SideNavItem href="/projects/archived">Archived</SideNavItem>
          </SideNavGroup>
        </SideNav>
      </AppShellSidebar>
      <AppShellMain>
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Projects", href: "/projects" }, { label: "Archived", href: "/projects/archived" }]} />
        <PageHeader title="Archived" description="Projects you closed."><button>New</button></PageHeader>
        <button data-testid="in-main">In main</button>
      </AppShellMain>
    </AppShell>
  );
}

export function Pages(props) {
  let page = $state(props.page ?? 5);
  return (
    <div>
      <Pagination page={page} pageCount={12} onPageChange={(p) => (page = p)} />
      <Pagination page={1} pageCount={3} href={(p) => `/list?page=${p}`} label="Results pages" />
      <output data-testid="page">{page}</output>
    </div>
  );
}
