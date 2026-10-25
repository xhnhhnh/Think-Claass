import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    tsconfigPaths(),
  ],
  server: {
    watch: {
      /*
       * Editors that save atomically - and the agent tooling working in this repository -
       * write `<file>.<pid>.<uuid>.tmpdir/` next to the target and rename it into place.
       * The chokidar watcher can catch that directory mid-rename and die with
       * `EBUSY: resource busy or locked`, which takes the whole dev server down. The
       * pattern is ignored for the same reason `.pnpm-store` is: nothing in it is source.
       *
       * Design assets under `docs/` are ignored for a second instance of the same failure:
       * watching a 1.2 MB PNG there crashed the dev server with
       * `EBUSY: resource busy or locked, watch 'docs/design/selected-teacher-workbench.png'`.
       * The watcher has no reason to hold an image open - the build reads what it imports and
       * nothing in `src/` imports from `docs/` - and a design reference being open in an image
       * viewer should not be able to take the dev server down.
       */
      ignored: [
        '**/.pnpm-store/**',
        '**/*.tmpdir/**',
        '**/docs/**/*.{png,jpg,jpeg,webp,gif,avif,ico,pdf}',
        '**/.tmp/**',
      ],
    },
    /*
     * The demo instance (`npm run demo`) starts a second Vite on another port and points
     * it at its own API copy. Both values are env-overridable so the normal dev server
     * keeps its historical 5173 -> 3001 wiring, and a design-review instance can run
     * beside it without touching the developer's database.
     */
    port: Number(process.env.VITE_PORT || 5173),
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request to the Target:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
          });
        },
      }
    }
  }
})
