import { expect, test } from "runtime:test";
import { copy, file, makeTempDir, mkdir, readDir, remove, stat, write } from "runtime:fs";
import { dirname, fromFileURL, join } from "runtime:path";
import { Command } from "runtime:system";

test("published afw-form types check a strict TS form and reject misuse", async () => {
  const packages = dirname(dirname(fromFileURL(import.meta.url)));
  await mkdir(".cache", { recursive: true });
  const scratch = await makeTempDir({ dir: ".cache", prefix: "form-types-" });
  async function copyPath(source, target) {
    if ((await stat(source)).isDir) {
      await mkdir(target, { recursive: true });
      for (const entry of await readDir(source)) await copyPath(join(source, entry.name), join(target, entry.name));
    } else {
      await mkdir(dirname(target), { recursive: true });
      await copy(source, target);
    }
  }
  try {
    // Only the published files and exports, without workspace aliases.
    for (const name of ["afw", "afw-form"]) {
      const source = join(packages, name);
      const manifest = JSON.parse(await file(join(source, "package.json")).text());
      for (const path of ["package.json", ...manifest.files.filter((path) => !path.startsWith("!"))]) {
        await copyPath(join(source, path), join(scratch, "node_modules/@opentf", name, path));
      }
    }
    await write(join(scratch, "tsconfig.json"), JSON.stringify({
      compilerOptions: {
        strict: true, noEmit: true, isolatedModules: true, moduleDetection: "force",
        module: "ESNext", moduleResolution: "bundler", jsx: "preserve",
        jsxImportSource: "@opentf/afw", lib: ["ESNext", "DOM", "DOM.Iterable"],
        skipLibCheck: false, types: [],
      }, include: ["*.tsx"],
    }));
    await write(join(scratch, "form.tsx"), `
      import { createForm, signal, type Form, type FormErrors } from "@opentf/afw-form";
      type Login = { email: string; remember: boolean; address: { city: string } };
      export function LoginForm() {
        const form = createForm<Login>({
          initialValues: { email: "", remember: false, address: { city: "" } },
          validate: (values) => (values.email ? {} : { email: "Required" }),
          mode: "onChange", reValidateMode: "onBlur", key: "login",
        });
        const typed: Form<Login> = form;
        const email: string = form.values.email;
        const city: string = form.values.address.city;
        const flags: boolean = form.isValid && form.isChanged && form.isTouched && form.isSubmitting && form.isValidating && form.isSubmitted;
        const count: number = form.submitCount;
        const field = form.register("address.city");
        const fieldError: string | undefined = field.error.value;
        form.setError("email", "Taken"); form.setError("email", "");
        form.reset(); form.reset({ email: "a@b.c", remember: true, address: { city: "x" } });
        // @ts-expect-error the values keep their declared types
        const wrongEmail: number = form.values.email;
        // @ts-expect-error reset takes the form's value shape
        form.reset({ email: 1 });
        // @ts-expect-error mode is one of the validation modes
        createForm({ mode: "later" });
        return (
          <form onsubmit={form.handleSubmit((values) => { const remember: boolean = values.remember; })}>
            <input {...form.register("email")} type="email" />
            <input {...form.register("remember")} type="checkbox" />
            {form.errors.email ? <span>{String(form.errors.email)}</span> : null}
          </form>
        );
      }
      // Async validators, the { errors } resolver shape and a signal-held mode.
      const mode = signal<"onBlur" | "onChange" | "onSubmit" | undefined>("onSubmit");
      const errors: FormErrors = { user: { name: "Too short" }, email: false };
      createForm({ initialValues: { name: "" }, validator: async () => ({ errors }), mode });
      createForm({ validate: async () => null });
      // Without a type argument, the value shape is inferred from initialValues.
      const inferred = createForm({ initialValues: { qty: 1 } });
      const qty: number = inferred.values.qty;
      // @ts-expect-error inferred fields keep their types
      const qtyText: string = inferred.values.qty;
    `);
    const checked = await new Command("pnpm", {
      args: ["exec", "tsc", "-p", join(scratch, "tsconfig.json")], inheritEnv: true,
    }).output();
    const output = new TextDecoder().decode(checked.stdout) + new TextDecoder().decode(checked.stderr);
    if (!checked.success) throw new Error(output);
    expect(checked.success).toBe(true);
  } finally {
    await remove(scratch, { recursive: true });
  }
});
