import express from 'express';
import path from 'node:path';
import { createApi } from './api.js';
import { openDb, defaultDbPath } from './db.js';

const prod = process.argv.includes('--prod');
const root = path.resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT) || 5180;

const dbPath = defaultDbPath();
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use('/api', createApi(openDb(dbPath)));

if (prod) {
  const dist = path.join(root, 'dist');
  app.use(express.static(dist));
  // root 옵션으로 넘겨야 상위 경로의 '.claude' 같은 점 폴더 때문에 404 가 나지 않는다
  app.get('/{*splat}', (req, res) => res.sendFile('index.html', { root: dist }));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

// 개인 금융 데이터이므로 이 PC 에서만 접속되게 루프백에만 바인딩한다.
app.listen(port, '127.0.0.1', () => {
  console.log(`자산관리 ${prod ? '' : '(dev) '}http://localhost:${port}`);
  console.log(`데이터 파일: ${dbPath}`);
});
