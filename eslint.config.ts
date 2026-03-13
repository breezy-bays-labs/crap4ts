import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    extends: [...tseslint.configs.recommended],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    ignores: ["dist/", "node_modules/", "coverage/"],
  },
);
