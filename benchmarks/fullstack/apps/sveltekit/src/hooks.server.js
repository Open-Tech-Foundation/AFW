// Guards /account: no "user" cookie, back to the home page.
export async function handle({ event, resolve }) {
  if (event.url.pathname === "/account" && !event.cookies.get("user")) {
    return new Response(null, { status: 302, headers: { location: "/" } });
  }
  return resolve(event);
}
