import { fileURLToPath } from 'url'

export default {
  plugins: {
    // Explicit path: the scripts run Vite from the repo root, where Tailwind
    // would not find this config and would ship a build with no utility classes.
    tailwindcss: { config: fileURLToPath(new URL('./tailwind.config.js', import.meta.url)) },
    autoprefixer: {}
  }
}
