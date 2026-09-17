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
		// User compile scripts are user-authored code the user opts into by naming a folder;
		// evaluating them is the feature, so the eval guards are relaxed for this file only.
		files: ["src/compile/userScripts.ts"],
		rules: {
			"obsidianmd/rule-custom-message": "off",
			"@typescript-eslint/no-implied-eval": "off",
			"no-new-func": "off",
		},
	},
);
