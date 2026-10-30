// "Last updated on <date>" line. Presentational — pass an ISO-8601 (or any
// Date-parseable) `date`; renders nothing when it's absent. The date itself comes from
// the build-time `@opentf/afw-docs/updated` map (git commit time or a frontmatter
// override); layouts look up the current route there and pass it in.
//
//   import updated from "@opentf/afw-docs/updated";
//   <LastUpdated date={updated[router.pathname]} />
import { formatDate } from "./format.js";

export default function LastUpdated(props) {
  const label = props.label || "Last updated on";
  return props.date ? (
    <div class="afwd-last-updated">
      {label}{" "}
      <time class="afwd-last-updated-time" datetime={String(props.date)}>
        {formatDate(props.date)}
      </time>
    </div>
  ) : null;
}
