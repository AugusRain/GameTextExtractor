import path from 'node:path';
import { createApp } from './app';

const port = Number(process.env.PORT || 5174);
const app = createApp({
  configRoot: path.join(process.cwd(), '.local')
});

app.listen(port, '127.0.0.1', () => {
  console.log(`API server running at http://127.0.0.1:${port}`);
});
