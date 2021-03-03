module.exports = {
  extends: ["standard", "plugin:prettier/recommended"],
  rules: {
    "one-var": ["error", "never"],
    "prettier/prettier": "error",
    "no-unused-vars": [
      2,
      { vars: "all", varsIgnorePattern: "^_", args: "all", argsIgnorePattern: "^_" },
    ],
  },
};
