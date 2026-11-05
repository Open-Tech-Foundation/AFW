// Guards /account: no "user" cookie, back to the home page.
export default defineNuxtRouteMiddleware((to) => {
  if (to.path === "/account" && !useCookie("user").value) return navigateTo("/", { redirectCode: 302 });
});
