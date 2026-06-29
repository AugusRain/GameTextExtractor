import { app, BrowserWindow, dialog, type OpenDialogOptions } from 'electron';
import path from 'node:path';
import { createApp } from '../server/app';

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  const staticDir = path.resolve(__dirname, '../dist');
  const outputRoot = path.join(app.getPath('documents'), 'GameTextExtractor');
  const configRoot = app.getPath('userData');
  const expressApp = createApp({
    configRoot,
    outputRoot,
    staticDir,
    selectFolder: async (title) => {
      const options: OpenDialogOptions = {
        title: title || '选择文件夹',
        properties: ['openDirectory']
      };
      const result = mainWindow
        ? await dialog.showOpenDialog(mainWindow, options)
        : await dialog.showOpenDialog(options);

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    }
  });

  const server = expressApp.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  mainWindow = new BrowserWindow({
    width: 1040,
    height: 780,
    minWidth: 820,
    minHeight: 620,
    title: '游戏文本提取与翻译器',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
    server.close();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});
