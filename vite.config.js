import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages(https://<아이디>.github.io/<저장소>/) 하위 경로에서도 열리도록 상대 경로로 빌드
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5180, host: '127.0.0.1' },
});
