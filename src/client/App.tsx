import { FormEvent, useEffect, useState } from 'react';

type TranslationMode = 'english_to_chinese' | 'japanese_to_chinese';

type ScanResponse = {
  totalItems: number;
  outputDir: string;
  files: Array<{ fileName: string; itemCount: number; fullPath: string }>;
};

type TranslateResponse = {
  totalFiles: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  outputDir: string;
  files: Array<{
    inputFile: string;
    outputFile: string;
    itemCount: number;
    status: 'success' | 'failed' | 'skipped';
    error?: string;
  }>;
};

export function App() {
  const [folderPath, setFolderPath] = useState('');
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [translateInputDir, setTranslateInputDir] = useState('');
  const [translateOutputDir, setTranslateOutputDir] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [overwrite, setOverwrite] = useState(true);
  const [translationMode, setTranslationMode] = useState<TranslationMode>('english_to_chinese');
  const [translateResult, setTranslateResult] = useState<TranslateResponse | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isChoosingFolder, setIsChoosingFolder] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  useEffect(() => {
    void refreshApiKeyStatus();
  }, []);

  async function refreshApiKeyStatus() {
    try {
      const response = await fetch('/api/api-key-status');
      const data = await response.json();
      setHasApiKey(Boolean(data.hasApiKey));
    } catch {
      setHasApiKey(false);
    }
  }

  async function chooseFolder(title: string) {
    const response = await fetch('/api/select-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '选择文件夹失败');
    }

    return typeof data.folderPath === 'string' ? data.folderPath : '';
  }

  async function handleChooseGameFolder() {
    setError('');
    setNotice('');
    setIsChoosingFolder(true);

    try {
      const selected = await chooseFolder('选择完整游戏文件夹');
      if (selected) {
        setFolderPath(selected);
        setNotice('已选择游戏文件夹，可以开始提取。');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '选择文件夹失败');
    } finally {
      setIsChoosingFolder(false);
    }
  }

  async function handleChooseTranslateInput() {
    setError('');
    setNotice('');

    try {
      const selected = await chooseFolder('选择待翻译 JSON 文件夹');
      if (selected) {
        setTranslateInputDir(selected);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '选择文件夹失败');
    }
  }

  async function handleChooseTranslateOutput() {
    setError('');
    setNotice('');

    try {
      const selected = await chooseFolder('选择中文结果保存文件夹');
      if (selected) {
        setTranslateOutputDir(selected);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '选择文件夹失败');
    }
  }

  async function handleSaveApiKey() {
    setError('');
    setNotice('');
    setIsSavingKey(true);

    try {
      const response = await fetch('/api/save-api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '保存 API Key 失败');
      }

      setApiKey('');
      setHasApiKey(true);
      setNotice('API Key 已保存到本机配置。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存 API Key 失败');
    } finally {
      setIsSavingKey(false);
    }
  }

  async function handleScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setResult(null);
    setIsScanning(true);

    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '扫描失败');
      }

      setResult(data);
      setTranslateInputDir(data.outputDir);
      setNotice('文本提取完成，已自动填入待翻译 JSON 文件夹。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '扫描失败');
    } finally {
      setIsScanning(false);
    }
  }

  async function handleTranslate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setTranslateResult(null);
    setIsTranslating(true);

    try {
      const response = await fetch('/api/translate-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputDir: translateInputDir,
          outputDir: translateOutputDir,
          overwrite,
          translationMode
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '翻译失败');
      }

      setTranslateResult(data);
      setNotice('JSON 翻译任务已完成。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '翻译失败');
    } finally {
      setIsTranslating(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="panel">
        <div className="header">
          <p className="eyebrow">TranslateProject002</p>
          <h1>游戏文本提取与翻译器</h1>
          <p className="intro">先从游戏文件夹提取文本，再把生成的 JSON 批量翻译成流畅简体中文。工具不会修改你的原游戏文件。</p>
        </div>

        <form className="section-card" onSubmit={handleScan}>
          <div className="section-heading">
            <span className="step-badge">1</span>
            <div>
              <h2>提取游戏文本</h2>
              <p>选择完整游戏文件夹，生成每批最多 300 条的 JSON。</p>
            </div>
          </div>

          <label htmlFor="folderPath">游戏文件夹</label>
          <div className="folder-actions">
            <button type="button" className="secondary-button" onClick={handleChooseGameFolder} disabled={isChoosingFolder}>
              {isChoosingFolder ? '正在打开' : '选择文件夹'}
            </button>
            <input
              id="folderPath"
              value={folderPath}
              onChange={(event) => setFolderPath(event.target.value)}
              placeholder="也可以把文件夹路径粘贴到这里"
              required
            />
          </div>

          <div className="start-row">
            <span>开始扫描并生成 JSON</span>
            <button type="submit" disabled={isScanning}>
              {isScanning ? '正在提取' : '开始提取'}
            </button>
          </div>
        </form>

        {result ? (
          <section className="result">
            <div className="summary">
              <span>已找到可翻译文本</span>
              <strong>{result.totalItems}</strong>
              <span>条</span>
            </div>
            <div>
              <span className="label">生成位置</span>
              <code>{result.outputDir}</code>
            </div>
            <FileList files={result.files.map((file) => ({ name: file.fileName, detail: `${file.itemCount} 条` }))} />
          </section>
        ) : null}

        <form className="section-card" onSubmit={handleTranslate}>
          <div className="section-heading">
            <span className="step-badge">2</span>
            <div>
              <h2>翻译 JSON 文件</h2>
              <p>选择英译中或日译中，按文件顺序调用 DeepSeek 输出一一对应的中文 JSON。</p>
            </div>
          </div>

          <div className="api-row">
            <div>
              <label htmlFor="apiKey">DeepSeek API Key</label>
              <input
                id="apiKey"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={hasApiKey ? '已保存，可留空' : '请输入 sk- 开头的 API Key'}
                type="password"
              />
            </div>
            <button type="button" className="secondary-button" onClick={handleSaveApiKey} disabled={isSavingKey || !apiKey.trim()}>
              {isSavingKey ? '保存中' : '保存 Key'}
            </button>
          </div>

          <div>
            <span className="label">翻译方向</span>
            <div className="mode-buttons" role="group" aria-label="翻译方向">
              <button
                type="button"
                className={translationMode === 'english_to_chinese' ? 'mode-button active' : 'mode-button'}
                onClick={() => setTranslationMode('english_to_chinese')}
              >
                英译中
              </button>
              <button
                type="button"
                className={translationMode === 'japanese_to_chinese' ? 'mode-button active' : 'mode-button'}
                onClick={() => setTranslationMode('japanese_to_chinese')}
              >
                日译中
              </button>
            </div>
          </div>

          <label htmlFor="translateInputDir">待翻译 JSON 文件夹</label>
          <div className="folder-actions">
            <button type="button" className="secondary-button" onClick={handleChooseTranslateInput}>
              选择文件夹
            </button>
            <input
              id="translateInputDir"
              value={translateInputDir}
              onChange={(event) => setTranslateInputDir(event.target.value)}
              placeholder="选择上一步生成的 outputs 文件夹"
              required
            />
          </div>

          <label htmlFor="translateOutputDir">中文结果保存文件夹</label>
          <div className="folder-actions">
            <button type="button" className="secondary-button" onClick={handleChooseTranslateOutput}>
              选择文件夹
            </button>
            <input
              id="translateOutputDir"
              value={translateOutputDir}
              onChange={(event) => setTranslateOutputDir(event.target.value)}
              placeholder="可留空，默认生成 translated-时间戳 文件夹"
            />
          </div>

          <label className="check-row">
            <input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />
            <span>重新翻译已存在的结果文件</span>
          </label>

          <div className="start-row">
            <span>译文将尽量改写成自然流畅中文，人名和专有名词保持原文</span>
            <button type="submit" disabled={isTranslating || !hasApiKey}>
              {isTranslating ? '正在翻译' : '开始翻译'}
            </button>
          </div>
        </form>

        {translateResult ? (
          <section className="result">
            <div className="summary">
              <span>文件</span>
              <strong>{translateResult.totalFiles}</strong>
              <span>个，成功 {translateResult.successCount}，跳过 {translateResult.skippedCount}，失败 {translateResult.failedCount}</span>
            </div>
            <div>
              <span className="label">中文结果位置</span>
              <code>{translateResult.outputDir}</code>
            </div>
            <FileList
              files={translateResult.files.map((file) => ({
                name: file.outputFile,
                detail: file.status === 'success' ? `${file.itemCount} 条` : file.status === 'skipped' ? '已跳过' : file.error || '失败'
              }))}
            />
          </section>
        ) : null}

        {notice ? <p className="message success">{notice}</p> : null}
        {error ? <p className="message error">{error}</p> : null}
      </section>
    </main>
  );
}

function FileList(props: { files: Array<{ name: string; detail: string }> }) {
  return (
    <ul className="file-list">
      {props.files.map((file) => (
        <li key={file.name}>
          <code>{file.name}</code>
          <span>{file.detail}</span>
        </li>
      ))}
    </ul>
  );
}
