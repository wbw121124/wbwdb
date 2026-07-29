import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		rules: {
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/no-unused-vars': ['error', {
				argsIgnorePattern: '^_',
				varsIgnorePattern: "^_",
				caughtErrors: "none",
				caughtErrorsIgnorePattern: "^_",
			}],
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/no-non-null-assertion': 'warn',
			'no-console': 'off',
		},
	},
	{
		ignores: ['lib/**', 'docs/**', 'node_modules/**', 'test/**'],
	},
);
