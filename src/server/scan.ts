import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type ExtractedText = {
  id: string;
  text: string;
  sourceFile: string;
  line: number;
  type: string;
};

export type BatchFile = {
  fileName: string;
  itemCount: number;
  fullPath: string;
};

export type ScanResult = {
  totalItems: number;
  outputDir: string;
  files: BatchFile[];
};

type Candidate = Omit<ExtractedText, 'id'>;

const TEXT_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.json',
  '.vue',
  '.css'
]);

const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'release',
  '.cache'
]);

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.mp3',
  '.ogg',
  '.wav',
  '.mp4',
  '.webm',
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.zip',
  '.rar',
  '.7z',
  '.exe',
  '.dll'
]);

const HTML_ATTRIBUTES = ['title', 'alt', 'placeholder', 'aria-label', 'value'];

export function shouldSkipDirectory(directoryName: string) {
  return SKIPPED_DIRECTORIES.has(directoryName);
}

export function shouldScanFile(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return TEXT_EXTENSIONS.has(extension) && !BINARY_EXTENSIONS.has(extension);
}

export function shouldIncludeText(rawText: string) {
  const text = normalizeText(rawText);

  if (text.length < 2) return false;
  if (/^\d+([.,:/-]\d+)*$/.test(text)) return false;
  if (/^https?:\/\//i.test(text) || /^data:/i.test(text)) return false;
  if (/^[./\\\w-]+\.(png|jpe?g|gif|webp|svg|mp3|ogg|wav|mp4|json|js|css|html)$/i.test(text)) {
    return false;
  }
  if (/^[{}[\]();,.:+\-*/<>=!&|"'`_%\s]+$/.test(text)) return false;
  if (!/[A-Za-z\u00C0-\u024F\u4E00-\u9FFF]/.test(text)) return false;
  if (/^[A-Z0-9_]+$/.test(text) && !text.includes(' ')) return false;

  return true;
}

export function chunkItems<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

export async function scanGameFolder(folderPath: string, projectRoot = process.cwd()): Promise<ScanResult> {
  const root = path.resolve(folderPath);
  const rootStats = await stat(root);

  if (!rootStats.isDirectory()) {
    throw new Error('输入路径不是文件夹');
  }

  const candidates: Candidate[] = [];
  await walkDirectory(root, root, candidates);

  const uniqueTexts = dedupeAndAssignIds(candidates);
  const outputDir = path.join(projectRoot, 'outputs', createTimestamp());
  const files = await writeBatches(uniqueTexts, outputDir);

  return {
    totalItems: uniqueTexts.length,
    outputDir,
    files
  };
}

export async function extractFileTexts(filePath: string, rootPath: string): Promise<Candidate[]> {
  const content = await readFile(filePath, 'utf8');
  const relativePath = path.relative(rootPath, filePath);
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.html' || extension === '.htm' || extension === '.vue') {
    return [
      ...extractHtmlText(content, relativePath),
      ...extractStringLiterals(content, relativePath, 'js-string')
    ];
  }

  if (extension === '.json') {
    return extractJsonStrings(content, relativePath);
  }

  return extractStringLiterals(content, relativePath, 'js-string');
}

export async function writeBatches(items: ExtractedText[], outputDir: string, batchSize = 300) {
  await mkdir(outputDir, { recursive: true });
  const chunks = chunkItems(items, batchSize);
  const files: BatchFile[] = [];

  for (const [index, chunk] of chunks.entries()) {
    const fileName = `batch-${String(index + 1).padStart(3, '0')}.json`;
    const fullPath = path.join(outputDir, fileName);
    await writeFile(fullPath, `${JSON.stringify(chunk, null, 2)}\n`, 'utf8');
    files.push({ fileName, itemCount: chunk.length, fullPath });
  }

  return files;
}

async function walkDirectory(currentPath: string, rootPath: string, candidates: Candidate[]) {
  const entries = await readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(entry.name)) {
        await walkDirectory(entryPath, rootPath, candidates);
      }
      continue;
    }

    if (entry.isFile() && shouldScanFile(entryPath)) {
      candidates.push(...(await extractFileTexts(entryPath, rootPath)));
    }
  }
}

function extractHtmlText(content: string, sourceFile: string): Candidate[] {
  const candidates: Candidate[] = [];
  const withoutScripts = content
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const textNodePattern = />\s*([^<>{}][^<]*?)\s*</g;
  let match: RegExpExecArray | null;

  while ((match = textNodePattern.exec(withoutScripts))) {
    addCandidate(candidates, match[1], sourceFile, lineNumberAt(content, match.index), 'html-text');
  }

  for (const attribute of HTML_ATTRIBUTES) {
    const attributePattern = new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, 'gi');
    while ((match = attributePattern.exec(content))) {
      addCandidate(candidates, match[1], sourceFile, lineNumberAt(content, match.index), 'html-attribute');
    }
  }

  return candidates;
}

function extractJsonStrings(content: string, sourceFile: string): Candidate[] {
  try {
    const parsed = JSON.parse(content);
    const candidates: Candidate[] = [];
    collectJsonStrings(parsed, candidates, sourceFile);
    return candidates;
  } catch {
    return extractStringLiterals(content, sourceFile, 'json-string');
  }
}

function collectJsonStrings(value: unknown, candidates: Candidate[], sourceFile: string) {
  if (typeof value === 'string') {
    addCandidate(candidates, value, sourceFile, 1, 'json-string');
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonStrings(item, candidates, sourceFile));
    return;
  }

  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectJsonStrings(item, candidates, sourceFile));
  }
}

function extractStringLiterals(content: string, sourceFile: string, type: string): Candidate[] {
  const candidates: Candidate[] = [];
  const pattern = /(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content))) {
    const text = unescapeLiteral(match[2]);
    addCandidate(candidates, text, sourceFile, lineNumberAt(content, match.index), type);
  }

  return candidates;
}

function dedupeAndAssignIds(candidates: Candidate[]): ExtractedText[] {
  const seen = new Set<string>();
  const items: ExtractedText[] = [];

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate.text);
    if (seen.has(normalized) || !shouldIncludeText(normalized)) {
      continue;
    }

    seen.add(normalized);
    items.push({
      ...candidate,
      id: String(items.length + 1).padStart(6, '0'),
      text: normalized
    });
  }

  return items;
}

function addCandidate(candidates: Candidate[], rawText: string, sourceFile: string, line: number, type: string) {
  const text = normalizeText(rawText);
  if (shouldIncludeText(text)) {
    candidates.push({ text, sourceFile, line, type });
  }
}

function normalizeText(text: string) {
  return text.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function unescapeLiteral(text: string) {
  return text
    .replace(/\\n/g, ' ')
    .replace(/\\r/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");
}

function lineNumberAt(content: string, index: number) {
  return content.slice(0, index).split(/\r\n|\r|\n/).length;
}

function createTimestamp() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}
