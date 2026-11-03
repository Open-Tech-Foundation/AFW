import { createForm } from "../index.js";

// Two forms in one component with no `key` and identical initial values: they must
// stay independent (each keeps its own validator and values).
const initialValues = { user: "", email: "" };

export default function TwoForms() {
  const login = createForm({ mode: "onChange", initialValues, validate: (v) => (v.user ? {} : { user: "Login: user required" }) });
  const signup = createForm({ mode: "onChange", initialValues, validate: (v) => (v.email ? {} : { email: "Signup: email required" }) });
  return (
    <div>
      <input {...login.register("user")} data-testid="login-user" />
      <span data-testid="login-error">{login.errors.user ?? ""}</span>
      <input {...signup.register("email")} data-testid="signup-email" />
      <span data-testid="signup-error">{signup.errors.email ?? ""}</span>
    </div>
  );
}
