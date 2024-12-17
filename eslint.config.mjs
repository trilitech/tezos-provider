import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import prettierPlugin from "eslint-plugin-prettier";
import importPlugin from "eslint-plugin-import";
import jestPlugin from "eslint-plugin-jest";
import unusedImportsPlugin from "eslint-plugin-unused-imports";
import reactPlugin from "eslint-plugin-react";

export default {
  languageOptions: {
    globals: {
      NodeJS: true,
      jest: true,
      global: true,
      fetch: true,
    },
    parser: tsParser,
    parserOptions: {
      projectService: true,
      ecmaVersion: 2020,
      sourceType: "module",
    },
  },
  files: ["**/*.ts"],
  rules: {
    // TypeScript rules
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-empty-function": [
      "warn",
      { allow: ["arrowFunctions"] },
    ],
    "@typescript-eslint/switch-exhaustiveness-check": "warn",
    "@typescript-eslint/await-thenable": "warn",
    "@typescript-eslint/no-unnecessary-condition": "warn",
    "@typescript-eslint/ban-ts-comment": [
      "warn",
      { "ts-ignore": "allow-with-description" },
    ],
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
    "@typescript-eslint/triple-slash-reference": "off",
    "@typescript-eslint/require-await": "warn",
    "@typescript-eslint/no-floating-promises": "warn",
    "@typescript-eslint/no-misused-promises": [
      "warn",
      { checksVoidReturn: { attributes: false } },
    ],
    "@typescript-eslint/no-unused-expressions": [
      "warn",
      { allowShortCircuit: true, allowTernary: true, enforceForJSX: true },
    ],
    "@typescript-eslint/consistent-type-imports": [
      "error",
      { fixStyle: "inline-type-imports" },
    ],

    // Jest rules
    "jest/no-focused-tests": "warn",
    "jest/no-identical-title": "warn",
    "jest/valid-expect": "warn",
    "jest/prefer-to-have-length": "warn",

    // Unused imports rule
    "unused-imports/no-unused-imports": "warn",

    // General rules
    "arrow-body-style": ["warn", "as-needed"],
    curly: ["warn", "all"],
    eqeqeq: ["warn", "always"],
    "comma-dangle": ["error", "only-multiline"],
    "require-await": "error",
    "no-undef": ["error"],
    "no-var": ["error"],
    "object-curly-spacing": ["error", "always"],
    quotes: ["error", "double", { allowTemplateLiterals: true }],
    semi: ["error", "always"],
    "no-console": ["error", { allow: ["warn"] }],
    "no-duplicate-imports": "warn",
    "no-restricted-imports": [
      "warn",
      {
        paths: [
          {
            name: "react",
            importNames: ["default"],
            message: "use `import { <...> } from 'react'` instead",
          },
        ],
      },
    ],

    // Import rules
    "import/no-extraneous-dependencies": ["error"],
    "import/no-cycle": "warn",
    "import/no-self-import": "warn",
    "import/no-duplicates": ["warn", { "prefer-inline": true }],
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
    "sort-imports": [
      "warn",
      {
        ignoreCase: false,
        ignoreDeclarationSort: true, // Don't sort import lines, use eslint-plugin-import instead
        ignoreMemberSort: false,
        memberSyntaxSortOrder: ["none", "all", "multiple", "single"],
        allowSeparatedGroups: true,
      },
    ],
    "sort-keys": [
      "warn", // or "error"
      "asc", // "asc" for ascending, "desc" for descending
      {
        caseSensitive: false,
        natural: true, // Whether to use natural ordering for numbers (e.g., "a", "10", "2", "b")
        minKeys: 2, // Minimum number of keys required in an object for sorting
      },
    ],

    // React-specific rules
    "react/jsx-curly-brace-presence": ["warn", "never"],
    "react/jsx-key": [
      "warn",
      {
        checkFragmentShorthand: true,
        checkKeyMustBeforeSpread: true,
        warnOnDuplicates: true,
      },
    ],
  },
  ignores: ["dist", "node_modules/*"],
  plugins: {
    "@typescript-eslint": tsPlugin,
    prettier: prettierPlugin,
    import: importPlugin,
    jest: jestPlugin,
    "unused-imports": unusedImportsPlugin,
    react: reactPlugin,
    // "sort-keys": sortKeysPlugin,
  },
};
