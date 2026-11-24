import { mountApp } from "@opentf/afw";
import { guard, loaderRoutes, pages } from "@afw/routes";

import "./app/global.css";

mountApp({ pages, guard, loaders: loaderRoutes, target: document.getElementById("app") });
