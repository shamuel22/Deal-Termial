import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { knowledgeDocs } from './knowledge-docs';

export default defineConfig({
  plugins: [react(), knowledgeDocs()],
  server: {
    proxy: {
      '/api': 'http://localhost:3029',
    },
  },
});
