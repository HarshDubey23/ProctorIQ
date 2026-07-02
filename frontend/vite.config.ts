import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/framer-motion')) return 'vendor-framer';
          if (id.includes('node_modules/recharts')) return 'vendor-recharts';
          if (id.includes('node_modules/culori')) return 'vendor-culori';
          if (id.includes('node_modules/lucide-react')) return 'vendor-lucide';
          if (id.includes('node_modules/react')) return 'vendor-react';
          if (id.includes('node_modules/zustand')) return 'vendor-react';
        },
      },
    },
  },
});
