// Build-time entry for the docs toolchain integration on esdev (ES-Runtime). The
// Vite workflow uses `@opentf/afw-docs/vite`, which installs the Node host instead.
//
// Re-exports the nav plugin (registered by @opentf/afw-cli when a project
// has a `docs` config) and the AFW Search indexing function. Importing this
// from afw-cli keeps all docs-specific build logic owned by this package.

import { useHost } from "./host.js";
import { esdevHost } from "./hosts/esdev.js";

useHost(esdevHost);

export { docsNavPlugin } from "./docs-nav-plugin.js";
export { blogPostsPlugin, loadPosts } from "./blog-posts-plugin.js";
export { lastUpdatedPlugin, loadLastUpdated } from "./last-updated-plugin.js";
export { isUnpublished } from "./publish.js";
export { postContentHtml, renderAtomFeed, renderBlogFeed } from "./feed.js";
export { renderLlmsFullTxt, renderLlmsTxt } from "./llms.js";
export { indexWithAfwSearch } from "./search.js";
export { blogPostsModule } from "./blog-posts-plugin.js";
export { docsNavModule } from "./docs-nav-plugin.js";
export { lastUpdatedModule } from "./last-updated-plugin.js";
