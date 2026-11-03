import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/@firebase/firestore/')) return 'firebase-database';
          if (id.includes('/@firebase/auth/')) return 'firebase-auth';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/'))
            return 'react-vendor';
        },
      },
    },
  },
});
