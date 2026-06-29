import { app, BrowserWindow, dialog, type OpenDialogOptions } from 'electron';
import path from 'node:path';
import { createApp } from '../server/app';

let mainWindow: BrowserWindow | null = null;

async function createWindow() {
  const staticDir = path.resolve(__dirname, '../dist');
  const outputRoot = path.join(app.getPath('documents'), 'GameTextExtractor');
  const expressApp = createApp({
    outputRoot,
    staticDir,
    selectFolder: async () => {
      const options: OpenDialogOptions = {
        title: '选择完整游戏文件夹',
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
    width: 980,
    height: 720,
    minWidth: 760,
    minHeight: 560,
    title: '游戏文本提取器',
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
