import { defineConfig } from 'vite'

export default defineConfig({
  // If your GitHub Pages repo is  https://yourorg.github.io/philanthropy-connect/
  // set base to '/philanthropy-connect/'.
  // For a root domain (yourorg.github.io) leave it as '/'.
  base: '/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html'
    }
  },
  define: {
    // Inject the proxy URL at build time so it never lives in source code
    __PROXY_URL__: JSON.stringify(process.env.VITE_PROXY_URL || 'https://YOUR_PROXY_URL/v1/messages')
  }
})
