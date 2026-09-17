import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
	{
		ignores: ["main.js", "node_modules/**", "test-vault/**", "*.mjs", "*.js", "*.config.ts"],
	},
	...tseslint.configs.recommended,
	...obsidianmd.configs.recommended,
	{
		files: ["src/**/*.ts", "tests/**/*.ts"],
		languageOptions: {
			parserOptions: {
				project: "./tsconfig.json",
				tsconfigRootDir: import.meta.dirname,
			},
			globals: { ...globals.browser, ...globals.node },
		},
		rules: {
			"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
		},
	},
	{
		// User compile scripts are loaded with a dynamic import() of a blob: URL that this
		// code creates itself from a file the user placed in a folder they chose. The rule
		// only recognises HTML-sanitizer helpers as safe, so it cannot express that.
		files: ["src/compile/userScripts.ts"],
		rules: {
			"no-unsanitized/method": "off",
		},
	},
);
