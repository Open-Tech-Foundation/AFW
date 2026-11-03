import { describe, expect, test } from "runtime:test";
import { mount, type } from "./dom.js";
import TwoForms from "./TwoForms.jsx";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("createForm per-component registry", () => {
  test("two unkeyed forms in one component stay independent", async () => {
    const { getByTestId } = mount(TwoForms);
    expect(getByTestId("login-error").textContent).toBe("Login: user required");
    expect(getByTestId("signup-error").textContent).toBe("Signup: email required");

    await type(getByTestId("login-user"), "ada");
    expect(getByTestId("login-error").textContent).toBe("");
    expect(getByTestId("signup-error").textContent).toBe("Signup: email required");
    expect(getByTestId("signup-email").value).toBe("");
  });

  test("a remounted component gets the same forms back", async () => {
    const { container, getByTestId } = mount(TwoForms);
    await type(getByTestId("login-user"), "ada");
    const host = container.firstElementChild;
    host.remove();
    await tick(); // let the disconnect teardown run
    container.appendChild(host);
    expect(getByTestId("login-user").value).toBe("ada");
    expect(getByTestId("login-error").textContent).toBe("");
    expect(getByTestId("signup-error").textContent).toBe("Signup: email required");
  });
});
