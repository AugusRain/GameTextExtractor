import { FormEvent, useState } from 'react';

type ScanResponse = {
  totalItems: number;
  outputDir: string;
  files: Array<{ fileName: string; itemCount: number; fullPath: string }>;
};

export function App() {
  const [folderPath, setFolderPath] = useState('');
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isChoosingFolder, setIsChoosingFolder] = useState(false);

  async function handleChooseFolder() {
    setError('');
    setNotice('');
    setIsChoosingFolder(true);

    try {
      const response = await fetch('/api/select-folder', { method: 'POST' });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '选择文件夹失败');
      }

      if (data.folderPath) {
        setFolderPath(data.folderPath);
        setNotice('已选择游戏文件夹，可以开始提取。');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '选择文件夹失败');
    } finally {
      setIsChoosingFolder(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '扫描失败');
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="panel">
        <div className="header">
          <p className="eyebrow">TranslateProject002</p>
          <h1>游戏文本提取器</h1>
          <p className="intro">选择完整游戏文件夹，自动找出需要翻译成中文的前端文本，并拆成适合喂给 AI 的 JSON 文件。</p>
        </div>

        <form className="scan-form" onSubmit={handleSubmit}>
          <label htmlFor="folderPath">第一步：选择游戏文件夹</label>
          <div className="folder-actions">
            <button type="button" className="secondary-button" onClick={handleChooseFolder} disabled={isChoosingFolder}>
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
            <span>第二步：开始提取文本</span>
            <button type="submit" disabled={isScanning}>
              {isScanning ? '正在提取' : '开始提取'}
            </button>
          </div>
        </form>

        {notice ? <p className="message success">{notice}</p> : null}
        {error ? <p className="message error">{error}</p> : null}

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
            <div>
              <span className="label">可交给 AI 翻译的文件</span>
              <ul className="file-list">
                {result.files.map((file) => (
                  <li key={file.fullPath}>
                    <code>{file.fileName}</code>
                    <span>{file.itemCount} 条</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        <ol className="tips">
          <li>把生成的 JSON 文件逐个发给 AI 翻译。</li>
          <li>每个文件最多 300 条，适合分批处理。</li>
          <li>本版本只提取文本，不会修改你的游戏文件。</li>
        </ol>
      </section>
    </main>
  );
}
