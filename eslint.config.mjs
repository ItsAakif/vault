import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // TypeScript rules - Enable important ones while allowing flexibility
      "@typescript-eslint/no-explicit-any": "warn", // Warn instead of error for gradual improvement
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { 
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "ignoreRestSiblings": true
        }
      ],
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/ban-ts-comment": [
        "warn",
        {
          "ts-expect-error": "allow-with-description",
          "ts-ignore": "allow-with-description",
          "ts-nocheck": "allow-with-description",
          "ts-check": false
        }
      ],
      "@typescript-eslint/prefer-as-const": "warn",
      
      // React rules - Important for component best practices
      "react-hooks/exhaustive-deps": "warn", // Essential for proper hook usage
      "react/no-unescaped-entities": "warn",
      "react/display-name": "warn",
      "react/prop-types": "off", // Not needed with TypeScript
      "react/react-in-jsx-scope": "off", // Not needed in Next.js
      
      // Next.js rules - Important for performance and SEO
      "@next/next/no-img-element": "warn", // Encourage using next/image
      "@next/next/no-html-link-for-pages": "warn",
      "@next/next/no-page-custom-font": "warn",
      
      // General JavaScript rules - Essential code quality
      "prefer-const": "warn",
      "no-unused-vars": "off", // Handled by TypeScript rule
      "no-console": [
        "warn",
        { "allow": ["warn", "error", "info"] }
      ], // Allow specific console methods
      "no-debugger": "warn",
      "no-empty": "warn",
      "no-irregular-whitespace": "warn",
      "no-case-declarations": "warn",
      "no-fallthrough": "warn",
      "no-mixed-spaces-and-tabs": "error",
      "no-redeclare": "warn",
      "no-undef": "off", // Handled by TypeScript
      "no-unreachable": "warn",
      "no-useless-escape": "warn",
      
      // Security and best practices
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
      "no-alert": "warn",
      "no-var": "error",
      "eqeqeq": ["warn", "always"],
      
      // Code style and readability
      "prefer-template": "warn",
      "prefer-arrow-callback": "warn",
      "object-shorthand": "warn",
      "prefer-destructuring": [
        "warn",
        {
          "array": false,
          "object": true
        }
      ],
      
      // Performance
      "no-new-object": "warn",
      "no-array-constructor": "warn",
      "no-new-wrappers": "warn"
    },
  },
  {
    // Specific overrides for test files
    files: ["**/*.test.{js,jsx,ts,tsx}", "**/__tests__/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
      "prefer-const": "off"
    }
  },
  {
    // Specific overrides for config files
    files: ["*.config.{js,mjs,ts}", ".*rc.{js,mjs}"],
    rules: {
      "@typescript-eslint/no-var-requires": "off",
      "no-console": "off"
    }
  }
];

export default eslintConfig;
