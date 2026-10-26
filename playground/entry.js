// Playground entry for pure-esdev runs (`esdev start` / `esdev build`).
// The route map comes from the `@afw/routes` virtual module (file conventions,
// no CLI), components compile on load, styles compile natively.
import { mountApp } from "@opentf/afw";
import { guard, pages } from "@afw/routes";

import "./app/global.css";

mountApp({ pages, guard, target: document.getElementById("app") });
