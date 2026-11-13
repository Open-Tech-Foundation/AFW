import { mountApp } from "@opentf/afw";
import { guard, loaderRoutes, pages } from "@afw/routes";

mountApp({ pages, guard, loaders: loaderRoutes, target: document.getElementById("app") });
