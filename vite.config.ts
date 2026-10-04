import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  const backendTarget = process.env.BACKEND_URL || 'http://localhost:5000';

  return {
    root: path.resolve(__dirname),
    // When this version of the app was built, shown in the employee's Settings.
    define: {
      __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString())
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          navigateFallbackDenylist: [/^\/api\//],
          // The phone app opens from these files when there is no internet, so the logo
          // and icons are kept with the code.
          globPatterns: ['**/*.{js,css,html,png,svg}'],
        },
        manifest: {
          name: 'DILG WorkMate',
          short_name: 'WorkMate',
          description: 'Personnel operations portal for DILG field officers.',
          theme_color: '#1e40af',
          background_color: '#f8fafc',
          display: 'standalone',
          start_url: '/',
          icons: [
            {
              src: 'src/assets/dilg-logo.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'src/assets/dilg-logo.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: Number(process.env.PORT || 5173),
      strictPort: false,
      // listen on all interfaces (both IPv4 and IPv6) so `localhost`,
      // `127.0.0.1` and LAN addresses are reachable. Use `true` to let
      // Vite pick the appropriate host binding cross-platform.
      host: true,
      allowedHosts: process.env.LOCAL_TUNNEL_HOST ? [process.env.LOCAL_TUNNEL_HOST] : [],
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
        }
      },
      // Avoid HMR WebSocket port collisions when another Vite instance is running.
      // Enable it explicitly with ENABLE_HMR=true when live reload is needed.
      hmr: process.env.ENABLE_HMR === 'true',
      // Dynamic file watching to prevent unused CPU load.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      chunkSizeWarningLimit: 1400,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('jspdf')) return 'vendor-pdf';
            if (id.includes('pdf-lib')) return 'vendor-pdf-lib';
            if (id.includes('tesseract.js')) return 'vendor-ocr';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('motion')) return 'vendor-motion';
            if (id.includes('react')) return 'vendor-react';
            return undefined;
          },
        },
      },
    },
  };
});
