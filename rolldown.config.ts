import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
	input: 'src/index.ts',
	platform: 'node',
	output: {
		dir: 'lib',
		format: 'es',
		sourcemap: false,
		comments: {
			legal: true,
			jsdoc: false,
		},
		minify: true,
	},
	external: ['bcrypt', 'jsonwebtoken', 'quickjs-emscripten'],
	plugins: [
		dts()
	],
	tsconfig: './tsconfig.json'
})