import { Link } from "@opentf/afw";
import BenchmarkTable from "./components/BenchmarkTable.jsx";
import EngineBenchmarkTable from "./components/EngineBenchmarkTable.jsx";
import CodeShowcase from "./components/CodeShowcase.jsx";
import InstallCommand from "./components/InstallCommand.jsx";
import RenderPipeline from "./components/RenderPipeline.jsx";
import { benchmark, capabilities, codeSamples, fullstack, fullstackTable, reasons, workflows } from "./home-data.js";

export const metadata = {
  // Absolute: the homepage keeps its full title instead of the "%s — AFW" template.
  title: { absolute: "AFW — App Framework for the Web" },
  description:
    "A high-performance full-stack web framework that compiles JSX to native Web Components, with signals for reactive state updates.",
  canonical: "/",
};

// Every benchmark caveat lives on /docs/benchmarks; the landing page states the claim in a
// line and links there, so a figure is never shown without its qualifications a click away.
const METHOD_LINK = "text-[var(--accent)] font-semibold hover:underline whitespace-nowrap";

// Status marks for the capability lists. Supported items carry no label.
const STATUS = {
  supported: { label: "", dot: "bg-emerald-500" },
  alpha: { label: "Alpha", dot: "bg-sky-500" },
  partial: { label: "Partial", dot: "bg-violet-500" },
  planned: { label: "Planned", dot: "bg-amber-500" },
};

// Small line icons for the "why" tiles.
function ReasonIcon({ name }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {name === "box" ? <path d="M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8" /> : null}
      {name === "bolt" ? <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /> : null}
      {name === "server" ? <path d="M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01" /> : null}
      {name === "split" ? <path d="M6 3v6a6 6 0 0 0 6 6h0a6 6 0 0 1 6 6M18 3v6a6 6 0 0 1-6 6" /> : null}
      {name === "form" ? <path d="M4 5h16M4 11h16M4 17h10M17 15l2 2 3-4" /> : null}
      {name === "globe" ? <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z" /> : null}
      {name === "test" ? <path d="M9 3h6M10 3v6L5 19a1.5 1.5 0 0 0 1.3 2h11.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7.5 15h9" /> : null}
      {name === "book" ? <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5ZM4 19a2 2 0 0 1 2-2h13" /> : null}
    </svg>
  );
}

function SectionHeading({ eyebrow, title, children }) {
  return (
    <div class="section-heading">
      {eyebrow ? <p class="section-eyebrow">{eyebrow}</p> : null}
      <h2 class="section-title">{title}</h2>
      {children ? <div class="section-lede">{children}</div> : null}
    </div>
  );
}

export default function HomePage() {
  // The tie threshold shown in the footnote comes from the generated report, so it
  // stays in lockstep with the rule the runner actually applied.
  const resolutionMs = benchmark.resolutionMs.toFixed(1);

  return (
    <main class="home">
      {/* Hero */}
      <section class="hero hero-glow">
        <div class="home-container hero-grid">
          <div class="hero-copy">
            <div class="hero-badge">
              <span class="hero-badge-dot" aria-hidden="true"></span>
              Public alpha
            </div>
            <h1 class="hero-title">
              The <span class="text-[var(--accent)]">native-first</span> framework for modern web apps.
            </h1>
            <p class="hero-lede">
              JSX compiled to native Web Components, signals instead of a virtual DOM, and typed
              server functions — on esdev or on Vite and Node.
            </p>
            <div class="hero-actions">
              <Link href="/docs/getting-started/installation" class="btn-start">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-start-icon" aria-hidden="true">
                  <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
                  <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-3.05 11a22.35 22.35 0 0 1-3.95 2z" />
                  <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
                  <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
                </svg>
                Get started
              </Link>
            </div>
            <InstallCommand />
          </div>
          <div class="hero-code">
            <CodeShowcase samples={codeSamples} />
          </div>
        </div>
      </section>

      {/* Why AFW */}
      <section class="home-section">
        <div class="home-container">
          <SectionHeading eyebrow="Why AFW" title="Web standards first, with the tools a real app needs" />
          <div class="reason-grid">
            {reasons.map((reason) => (
              <div class="reason-card">
                <div class="reason-icon"><ReasonIcon name={reason.icon} /></div>
                <h3 class="reason-title">{reason.title}</h3>
                <p class="reason-desc">{reason.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How updates work */}
      <section class="home-section home-section-alt">
        <div class="home-container how-grid">
          <div class="how-copy">
            <SectionHeading eyebrow="How it works" title="A state change updates the DOM, not a component">
              React re-renders components and reconciles a virtual DOM. AFW's compiler wires each
              piece of state to the DOM bindings that read it, so a change runs exactly those.
            </SectionHeading>
            <Link href="/docs/core-concepts/reactivity" class={METHOD_LINK}>Reactivity in depth →</Link>
          </div>
          <RenderPipeline />
        </div>
      </section>

      {/* Two workflows */}
      <section class="home-section">
        <div class="home-container">
          <SectionHeading eyebrow="Two workflows" title="Pick your toolchain, keep your app">
            The same <code>app/</code> folder builds with either. The core never depends on one.
          </SectionHeading>
          <div class="workflow-grid">
            {workflows.map((workflow) => (
              <div class="workflow-card">
                <h3 class="workflow-name">{workflow.name}</h3>
                <p class="workflow-tagline">{workflow.tagline}</p>
                <ul class="workflow-points">
                  {workflow.points.map((point) => <li>{point}</li>)}
                </ul>
                <div class="workflow-command"><span aria-hidden="true">$</span> <code>{workflow.command}</code></div>
                <Link href={workflow.href} class={METHOD_LINK}>Set it up →</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Performance */}
      <section class="home-section home-section-alt">
        <div class="home-container bench">
          <SectionHeading eyebrow="Performance" title="Fast where it counts">
            The runtime against the React, Solid and Svelte&nbsp;5 libraries — median ms over{" "}
            {benchmark.runs ?? 3} pooled runs, 4× CPU throttling, lower is better.
          </SectionHeading>
          <div class="bench-card">
            <BenchmarkTable report={benchmark} />
          </div>
          <p class="bench-note">
            Recorded {benchmark.generatedAt.slice(0, 10)}. Bold beats the ~{resolutionMs}&nbsp;ms timing
            resolution; the rest are ties. <Link href="/docs/benchmarks" class={METHOD_LINK}>Method &amp; caveats →</Link>
          </p>
          <h3 class="bench-subtitle">A full-stack app: dev speed, build speed and memory</h3>
          <p class="bench-lede">
            The same app — server-rendered pages, loaders, API routes, middleware, MDX docs and Tailwind —
            in both AFW workflows, Next.js, TanStack Start, SolidStart, SvelteKit, Nuxt and Astro, at 1,000 pages, fastest build first. Lower is better.
          </p>
          <div class="bench-card">
            <EngineBenchmarkTable report={fullstackTable(1000)} rowHeader="1,000 pages" sortBy="Build time" />
          </div>
          <p class="bench-note">
            Measured {fullstack.measuredAt}, median of {fullstack.runs} runs; every app passed the same output
            checks first. <Link href="/docs/benchmarks" class={METHOD_LINK}>All sizes, method &amp; caveats →</Link>
          </p>
        </div>
      </section>

      {/* Capabilities */}
      <section class="home-section">
        <div class="home-container">
          <SectionHeading eyebrow="Capabilities" title="What ships today">
            Everything without a label is supported. The <Link href="/docs/comparison" class={METHOD_LINK}>comparison</Link>{" "}
            shows where AFW stands against other frameworks.
          </SectionHeading>
          <div class="cap-grid">
            {capabilities.map((group) => (
              <div class="cap-card">
                <h3 class="cap-group">{group.category}</h3>
                <ul class="cap-list">
                  {group.items.map((item) => (
                    <li class="cap-item">
                      <span class={`cap-dot ${(STATUS[item.status] ?? STATUS.planned).dot}`} aria-hidden="true"></span>
                      <div>
                        <div class="cap-name">
                          {item.name}
                          {(STATUS[item.status] ?? STATUS.planned).label ? (
                            <span class="cap-status">{(STATUS[item.status] ?? STATUS.planned).label}</span>
                          ) : null}
                        </div>
                        <p class="cap-desc">{item.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section class="home-section">
        <div class="home-container">
          <div class="cta">
            <h2 class="cta-title">Build your first AFW app</h2>
            <p class="cta-lede">Create a project, run the dev server, and edit a page: it updates in place.</p>
            <div class="cta-actions">
              <Link href="/docs/getting-started/installation" class="btn btn-primary">Get started</Link>
              <Link href="/docs" class="btn btn-secondary">Read the docs</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
