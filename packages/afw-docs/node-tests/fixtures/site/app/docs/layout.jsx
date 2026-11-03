import { DocsLayout } from "@opentf/afw-docs";
import config from "../../afw.config.js";

export default function Docs(props) {
  return <DocsLayout config={config.docs} siteUrl={config.site.url}>{props.children}</DocsLayout>;
}
