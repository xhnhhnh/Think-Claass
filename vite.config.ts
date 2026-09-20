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
       */
      ignored: ['**/.pnpm-store/**', '**/*.tmpdir/**']
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
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
