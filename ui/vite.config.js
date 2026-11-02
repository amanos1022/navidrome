import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const frontendPort = parseInt(process.env.PORT) || 4533
const backendPort = frontendPort + 100

// Point the dev server at an already-running Navidrome instead of a local
// backend, e.g. `NAVIDROME_BACKEND=http://host:4533 npm start`
const remoteBackend = process.env.NAVIDROME_BACKEND
const backend = remoteBackend || 'http://localhost:' + backendPort

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    remoteBackend && remoteAppConfig(remoteBackend),
    VitePWA({
      manifest: manifest(),
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MiB
        // index.html is rendered per-user by the server, so a precached copy
        // would pin one user's config (and auth payload) across logins
        globIgnores: ['index.html'],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  server: {
    host: true,
    port: frontendPort,
    proxy: {
      '^/(auth|api|rest|backgrounds)/.*': {
        target: backend,
        changeOrigin: true,
      },
    },
  },
  base: './',
  define: {
    // JSONForms and other libraries use process.env
    'process.env': JSON.stringify({}),
  },
  build: {
    outDir: 'build',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    css: true,
    reporters: ['verbose'],
    // reporters: ['default', 'hanging-process'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*'],
      exclude: [],
    },
  },
})

// Vite serves index.html itself, so the Go template placeholders are never
// filled in and src/config.js falls back to its hardcoded dev defaults. When
// developing against a real server, read that server's own index.html instead,
// so the UI feature flags match the ones its API will actually honour.
function remoteAppConfig(backendURL) {
  return {
    name: 'navidrome-remote-app-config',
    apply: 'serve',
    async transformIndexHtml(html) {
      let config
      try {
        const res = await fetch(backendURL)
        if (!res.ok) throw new Error('HTTP ' + res.status)
        config = /window\.__APP_CONFIG__\s*=\s*("(?:[^"\\]|\\.)*")/.exec(
          await res.text(),
        )?.[1]
        if (!config) throw new Error('no config found in index.html')
      } catch (e) {
        console.warn(
          `Could not read UI config from ${backendURL} (${e.message}), using the defaults in src/config.js`,
        )
        return html
      }
      return html
        .replace('{{ .AppConfig }}', () => config)
        .replace('{{ .ShareInfo }}', 'null')
    },
  }
}

// PWA manifest
function manifest() {
  return {
    name: 'Navidrome',
    short_name: 'Navidrome',
    description:
      'Navidrome, an open source web-based music collection server and streamer',
    categories: ['music', 'entertainment'],
    display: 'standalone',
    start_url: './',
    background_color: 'white',
    theme_color: 'blue',
    icons: [
      {
        src: './android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: './android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
