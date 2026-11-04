// Entry for the navbar-menu browser e2e (navbar-menu.mjs): the full <Navbar> on a page
// with no sidebar, as a marketing home renders it, against the real theme CSS.
import Navbar from "../../components/Navbar.jsx";

const navbar = document.createElement(Navbar.tag);
navbar.config = {
  title: "AFW",
  version: "v0.27.0",
  github: "https://github.com/Open-Tech-Foundation/afw",
  nav: [
    { label: "Home", href: "/" },
    { label: "Docs", href: "/docs" },
    { label: "Packages", href: "/packages" },
    { label: "API", href: "/api" },
  ],
};
document.body.append(navbar);
