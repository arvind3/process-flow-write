module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: {
      jsx: true
    }
  },
  plugins: ["@typescript-eslint", "react", "react-hooks"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:react/jsx-runtime",
    "prettier"
  ],
  settings: {
    react: {
      version: "18.3"
    }
  },
  ignorePatterns: ["docs", "node_modules", "app/node_modules", "reports", "dist", "app/dist"],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "react/prop-types": "off",
    "no-empty": ["error", { "allowEmptyCatch": true }]
  }
};
