import tseslint from "typescript-eslint";

/**
 * The dependency rule, enforced rather than documented:
 *
 *   domain      <- imports nothing, not even a package
 *   application <- domain only
 *   everything else may depend inward, never outward
 *
 * Core no-restricted-imports rather than import/no-restricted-paths: the
 * latter needs a TypeScript resolver to see .ts files at all, and without one
 * it reports nothing while looking like it works. Verified by introducing a
 * violation and watching it fail.
 */
const outward = (patterns, message) => ({
  "no-restricted-imports": ["error", { patterns: patterns.map((group) => ({ group: [group], message })) }],
});

export default tseslint.config(
  { ignores: ["node_modules/**", ".wrangler/**", "eslint.config.js"] },
  ...tseslint.configs.recommended,
  {
    files: ["src/domain/**/*.ts"],
    rules: outward(
      ["@application/*", "@infrastructure/*", "@interfaces/*", "@config/*", "**/application/**", "**/infrastructure/**", "**/interfaces/**", "**/config/**"],
      "domain must not import from any other layer",
    ),
  },
  {
    files: ["src/application/**/*.ts"],
    rules: outward(
      ["@infrastructure/*", "@interfaces/*", "@config/*", "**/infrastructure/**", "**/interfaces/**", "**/config/**"],
      "application may only import from domain",
    ),
  },
);
