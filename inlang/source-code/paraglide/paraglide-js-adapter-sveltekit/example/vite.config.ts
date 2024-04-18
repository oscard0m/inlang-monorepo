import { sveltekit } from "@sveltejs/kit/vite"
import { paraglide } from "@inlang/paraglide-sveltekit/vite"
import { defineConfig } from "vite"

export default defineConfig({
	plugins: [
		paraglide({
			project: "./project.inlang",
			outdir: "./src/paraglide",
		}),
		sveltekit(),
	],
})
