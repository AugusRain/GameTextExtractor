import express from 'express';
import path from 'node:path';
import { loadDeepSeekApiKey, saveDeepSeekApiKey } from './config';
import { scanGameFolder } from './scan';
import { translateFolder } from './translate';

type CreateAppOptions = {
  configRoot?: string;
  outputRoot?: string;
  staticDir?: string;
  selectFolder?: (title?: string) => Promise<string | null>;
};

export function createApp(options: CreateAppOptions = {}) {
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  app.post('/api/select-folder', async (request, response) => {
    if (!options.selectFolder) {
      response.status(501).json({ error: '当前运行方式不支持直接选择文件夹，请手动粘贴路径' });
      return;
    }

    try {
      const title = typeof request.body?.title === 'string' ? request.body.title : undefined;
      const folderPath = await options.selectFolder(title);
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

  app.get('/api/api-key-status', async (_request, response) => {
    const apiKey = options.configRoot ? await loadDeepSeekApiKey(options.configRoot) : '';
    response.json({ hasApiKey: apiKey.length > 0 });
  });

  app.post('/api/save-api-key', async (request, response) => {
    if (!options.configRoot) {
      response.status(500).json({ error: '当前运行方式不支持保存 API Key' });
      return;
    }

    const apiKey = request.body?.apiKey;
    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      response.status(400).json({ error: '请输入 DeepSeek API Key' });
      return;
    }

    try {
      await saveDeepSeekApiKey(options.configRoot, apiKey);
      response.json({ ok: true });
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : '保存 API Key 失败'
      });
    }
  });

  app.post('/api/translate-folder', async (request, response) => {
    if (!options.configRoot) {
      response.status(500).json({ error: '当前运行方式不支持读取 API Key' });
      return;
    }

    const inputDir = request.body?.inputDir;
    const outputDir = request.body?.outputDir;
    const overwrite = Boolean(request.body?.overwrite);
    const translationMode = request.body?.translationMode === 'japanese_to_chinese' ? 'japanese_to_chinese' : 'english_to_chinese';

    if (typeof inputDir !== 'string' || inputDir.trim().length === 0) {
      response.status(400).json({ error: '请先选择待翻译 JSON 文件夹' });
      return;
    }

    try {
      const apiKey = await loadDeepSeekApiKey(options.configRoot);
      const result = await translateFolder({
        inputDir: inputDir.trim(),
        outputDir: typeof outputDir === 'string' && outputDir.trim() ? outputDir.trim() : undefined,
        apiKey,
        overwrite,
        translationMode
      });
      response.json(result);
    } catch (error) {
      response.status(400).json({
        error: error instanceof Error ? error.message : '翻译失败'
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
