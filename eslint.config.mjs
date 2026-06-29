import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundariesPlugin from "eslint-plugin-boundaries";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    plugins: {
      boundaries: boundariesPlugin,
    },
    settings: {
      "boundaries/elements": [
        { type: "orchestrator", pattern: "lib/orchestrator/**", mode: "file" },
        { type: "agent", pattern: "lib/agent/**", mode: "file" },
        { type: "scoring", pattern: "lib/scoring/**", mode: "file" },
        { type: "voice", pattern: "lib/voice/**", mode: "file" },
      ],
    },
    rules: {
      // Note: "boundaries/element-types" is the v5 name; v6 renamed it to
      // "boundaries/dependencies". Both names work in v6 (element-types is
      // kept as a deprecated alias). Using dependencies here for clarity.
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          rules: [
            {
              from: { type: ["orchestrator", "agent", "scoring"] },
              disallow: { to: { type: "voice" } },
              message:
                "Voice libraries must not be imported by orchestrator, agent, or scoring.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
