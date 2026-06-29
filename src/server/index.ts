import express from 'express';
import { scanGameFolder } from './scan';

const app = express();
const port = Number(process.env.PORT || 5174);

app.use(express.json({ limit: '1mb' }));

app.post('/api/scan', async (request, response) => {
  const folderPath = request.body?.folderPath;

  if (typeof folderPath !== 'string' || folderPath.trim().length === 0) {
    response.status(400).json({ error: '请输入完整游戏文件夹路径' });
    return;
  }

  try {
    const result = await scanGameFolder(folderPath.trim(), process.cwd());
    response.json(result);
  } catch (error) {
    response.status(400).json({
      error: error instanceof Error ? error.message : '扫描失败'
    });
  }
});

app.listen(port, '127.0.0.1', () => {
  console.log(`API server running at http://127.0.0.1:${port}`);
});
