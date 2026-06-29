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
  const [isScanning, setIsScanning] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
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
        <div>
          <p className="eyebrow">TranslateProject002</p>
          <h1>游戏前端文本提取</h1>
        </div>

        <form className="scan-form" onSubmit={handleSubmit}>
          <label htmlFor="folderPath">完整游戏文件夹路径</label>
          <div className="input-row">
            <input
              id="folderPath"
              value={folderPath}
              onChange={(event) => setFolderPath(event.target.value)}
              placeholder="D:\games\example-game"
              required
            />
            <button type="submit" disabled={isScanning}>
              {isScanning ? '扫描中' : '扫描'}
            </button>
          </div>
        </form>

        {error ? <p className="message error">{error}</p> : null}

        {result ? (
          <section className="result">
            <div className="summary">
              <span>提取条目</span>
              <strong>{result.totalItems}</strong>
            </div>
            <div>
              <span className="label">输出目录</span>
              <code>{result.outputDir}</code>
            </div>
            <div>
              <span className="label">JSON 文件</span>
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
      </section>
    </main>
  );
}
