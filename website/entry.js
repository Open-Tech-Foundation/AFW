// Website entry for pure-esdev runs (`esdev start` / `esdev build`).
// Four lines: the route map comes from the `@afw/routes` virtual module
// (file conventions, no CLI), components compile on load, styles compile
// natively (project tailwindcss).
import { mountApp } from "@opentf/afw";
import { guard, pages, loaderRoutes } from "@afw/routes";

import "./app/global.css";

mountApp({ pages, guard, loaders: loaderRoutes, target: document.getElementById("app") });
