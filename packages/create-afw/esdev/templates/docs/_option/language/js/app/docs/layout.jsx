import { DocsLayout } from "@opentf/afw-docs";
import config from "../../afw.config.js";

export default function Docs({ children }) {
  return <DocsLayout config={config.docs} siteUrl={config.site.url}>{children}</DocsLayout>;
}
