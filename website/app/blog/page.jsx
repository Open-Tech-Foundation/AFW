// Blog index — a @opentf/afw-docs feature demo, not this project's product blog.
// Linked from the afw-docs guide only; omitted from the top nav on purpose.
import { Callout } from "@opentf/afw-docs";
import { PostList } from "@opentf/afw-docs";
import { posts } from "@opentf/afw-docs/posts";

export const metadata = {
  title: "Blog (demo)",
  description:
    "Sample posts demonstrating @opentf/afw-docs blog layouts — not AFW product news.",
  openGraph: { type: "website" },
};

export default function BlogIndex() {
  return (
    <div>
      <h1 className="text-4xl font-black tracking-tight text-[var(--text-main)]">
        Blog <span className="text-lg font-bold text-[var(--text-muted)]">(demo)</span>
      </h1>
      <p className="text-[var(--text-muted)] mt-2 mb-4 max-w-2xl">
        These sample posts exist to demonstrate the <code>@opentf/afw-docs</code> blog
        feature — post list, banner, reading time, and TOC. This is not the AFW
        product blog. Setup details are in the{" "}
        <a href="/packages/afw-docs/blog" className="text-[var(--accent)] underline">
          afw-docs Blog guide
        </a>
        .
      </p>
      <Callout type="info" title="Demo only">
        Browse <code>website/app/blog/</code> in the repo to see how the demo is wired.
        Your own site can omit a blog or follow the Blog guide to add one.
      </Callout>
      <div className="mt-6">
        <PostList posts={posts} />
      </div>
    </div>
  );
}