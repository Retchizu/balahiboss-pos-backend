module.exports = {
    root: true,
    env: {
        es6: true,
        node: true,
    },
    extends: [
        "eslint:recommended",
        "plugin:import/errors",
        "plugin:import/warnings",
        "plugin:import/typescript",
        "google",
        "plugin:@typescript-eslint/recommended",
    ],
    parser: "@typescript-eslint/parser",
    parserOptions: {
        project: ["tsconfig.json", "tsconfig.dev.json"],
        tsconfigRootDir: __dirname,
        sourceType: "module",
    },
    ignorePatterns: [
        "/lib/**/*", // Ignore built files.
        "/generated/**/*", // Ignore generated files.
        "node_modules/",
    ],
    plugins: ["@typescript-eslint", "import"],
    rules: {
        "quotes": ["error", "double"],
        "import/no-unresolved": 0,
        "indent": ["error", 4],
        "linebreak-style": ["error", "unix"],
        "max-len": ["error", { code: 120 }],
        "object-curly-spacing": "off",
        "@typescript-eslint/no-non-null-assertion": "off",
    },
};
