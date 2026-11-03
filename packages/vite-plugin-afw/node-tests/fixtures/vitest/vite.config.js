import afw from "@opentf/vite-plugin-afw";

export default {
  plugins: [afw()],
  test: {
    environment: "happy-dom",
    setupFiles: ["@opentf/afw-test/vitest"],
  },
};
