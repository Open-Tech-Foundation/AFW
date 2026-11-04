// Guards /account: no "user" cookie, back to the home page.
export function onRequest(context, next) {
  if (context.url.pathname === "/account" && !context.cookies.has("user")) return context.redirect("/", 302);
  return next();
}
