import express from 'express';
import path from 'node:path';
import { scanGameFolder } from './scan';

type CreateAppOptions = {
  outputRoot?: string;
  staticDir?: string;
  selectFolder?: () => Promise<string | null>;
};

export function createApp(options: CreateAppOptions = {}) {
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  app.post('/api/select-folder', async (_request, response) => {
    if (!options.selectFolder) {
      response.status(501).json({ error: '当前运行方式不支持直接选择文件夹，请手动粘贴路径' });
      return;
    }

    try {
      const folderPath = await options.selectFolder();
      response.json({ folderPath });
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : '选择文件夹失败'
      });
    }
  });

  app.post('/api/scan', async (request, response) => {
    const folderPath = request.body?.folderPath;

    if (typeof folderPath !== 'string' || folderPath.trim().length === 0) {
      response.status(400).json({ error: '请先选择或输入游戏文件夹' });
      return;
    }

    try {
      const result = await scanGameFolder(folderPath.trim(), options.outputRoot || process.cwd());
      response.json(result);
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : '扫描失败'
      });
    }
  });

  if (options.staticDir) {
    app.use(express.static(options.staticDir));
    app.get('*', (_request, response) => {
      response.sendFile(path.join(options.staticDir as string, 'index.html'));
    });
  }

  return app;
}
