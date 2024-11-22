import tsParser from "@typescript-eslint/parser"; // Import the TypeScript parser
import tsPlugin from "@typescript-eslint/eslint-plugin"; // Import the TypeScript plugin
import prettierPlugin from "eslint-plugin-prettier"; // Import the Prettier plugin
import importPlugin from "eslint-plugin-import";

export default {
  languageOptions: {
    globals: {
      NodeJS: true,
    },
    parser: tsParser,
    parserOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
    },
  },
  files: ["**/*.ts"],
  rules: {
    "comma-dangle": ["error", "only-multiline"],
    "require-await": "error",
    "no-undef": ["error"],
    "no-var": ["error"],
    "object-curly-spacing": ["error", "always"],
    quotes: ["error", "double", { allowTemplateLiterals: true }],
    semi: ["error", "always"],
    "no-console": ["error", { allow: ["warn"] }],
    "import/no-extraneous-dependencies": ["error"],
    "import/order": [
      "warn",
      {
        groups: [
          "builtin", // Built-in imports (come from NodeJS native) go first
          "external", // <- External imports
          "internal", // <- Absolute imports
          ["sibling", "parent"], // <- Relative imports, the sibling and parent types they can be mingled together
          "index", // <- index imports
          "unknown", // <- unknown
        ],
        "newlines-between": "always",
        alphabetize: {
          order: "asc",
          caseInsensitive: true,
        },
      },
    ],
  },
  ignores: ["dist", "node_modules/*"],
  plugins: {
    "@typescript-eslint": tsPlugin,
    prettier: prettierPlugin,
    import: importPlugin,
  },
};
