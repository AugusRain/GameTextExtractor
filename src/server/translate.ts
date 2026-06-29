import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ExtractedText } from './scan';

export type TranslatedText = {
  id: string;
  translatedText: string;
};

export type TranslationFileResult = {
  inputFile: string;
  outputFile: string;
  itemCount: number;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
};

export type TranslateFolderResult = {
  totalFiles: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  outputDir: string;
  files: TranslationFileResult[];
};

export type TranslateFolderOptions = {
  inputDir: string;
  outputDir?: string;
  apiKey: string;
  overwrite?: boolean;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

const DEFAULT_MODEL = 'deepseek-v4-flash';
const DEFAULT_BASE_URL = 'https://api.deepseek.com';

export function buildTranslatedFileName(fileName: string) {
  return fileName.replace(/\.json$/i, '.zh.json');
}

export function buildTranslationMessages(items: ExtractedText[]) {
  return [
    {
      role: 'system',
      content:
        '你是专业游戏本地化译者。请把文本翻译为简体中文。人名、角色名、地名、专有名词、品牌名、代码字段、变量名和 id 不翻译。保持每个 id 一一对应，只返回合法 JSON。'
    },
    {
      role: 'user',
      content: JSON.stringify(
        {
          requirements: [
            '只返回 JSON 对象，格式为 {"translations":[{"id":"000001","translatedText":"中文"}]}',
            'translations 数量必须和输入数量完全一致',
            '不要添加解释、Markdown 或额外字段',
            '如果文本中包含人名，请保留原文人名'
          ],
          items: items.map((item) => ({ id: item.id, text: item.text }))
        },
        null,
        2
      )
    }
  ];
}

export async function translateFolder(options: TranslateFolderOptions): Promise<TranslateFolderResult> {
  const inputDir = path.resolve(options.inputDir);
  const inputStats = await stat(inputDir);

  if (!inputStats.isDirectory()) {
    throw new Error('待翻译路径不是文件夹');
  }

  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new Error('请先保存 DeepSeek API Key');
  }

  const outputDir = options.outputDir
    ? path.resolve(options.outputDir)
    : path.join(path.dirname(inputDir), `translated-${createTimestamp()}`);
  await mkdir(outputDir, { recursive: true });

  const jsonFiles = (await readdir(inputDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json') && !entry.name.toLowerCase().endsWith('.zh.json'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'en'));

  const files: TranslationFileResult[] = [];

  for (const fileName of jsonFiles) {
    const inputFile = path.join(inputDir, fileName);
    const outputFile = path.join(outputDir, buildTranslatedFileName(fileName));

    if (!options.overwrite && (await fileExists(outputFile))) {
      files.push({ inputFile, outputFile, itemCount: 0, status: 'skipped' });
      continue;
    }

    try {
      const items = await readExtractedTextFile(inputFile);
      const translated = await translateWithRetry(items, {
        apiKey,
        model: options.model || DEFAULT_MODEL,
        baseUrl: options.baseUrl || DEFAULT_BASE_URL,
        fetchImpl: options.fetchImpl || fetch
      });
      await writeFile(outputFile, `${JSON.stringify(translated, null, 2)}\n`, 'utf8');
      files.push({ inputFile, outputFile, itemCount: translated.length, status: 'success' });
    } catch (error) {
      files.push({
        inputFile,
        outputFile,
        itemCount: 0,
        status: 'failed',
        error: error instanceof Error ? error.message : '翻译失败'
      });
    }
  }

  return {
    totalFiles: jsonFiles.length,
    successCount: files.filter((file) => file.status === 'success').length,
    failedCount: files.filter((file) => file.status === 'failed').length,
    skippedCount: files.filter((file) => file.status === 'skipped').length,
    outputDir,
    files
  };
}

async function readExtractedTextFile(filePath: string) {
  const parsed = JSON.parse(await readFile(filePath, 'utf8')) as ExtractedText[];

  if (!Array.isArray(parsed)) {
    throw new Error('JSON 文件必须是数组');
  }

  for (const item of parsed) {
    if (!item || typeof item.id !== 'string' || typeof item.text !== 'string') {
      throw new Error('JSON 条目必须包含 id 和 text');
    }
  }

  return parsed;
}

async function translateWithRetry(
  items: ExtractedText[],
  options: { apiKey: string; model: string; baseUrl: string; fetchImpl: typeof fetch }
) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const translated = await translateBatch(items, options);
      validateTranslations(items, translated);
      return translated;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('翻译失败');
}

async function translateBatch(
  items: ExtractedText[],
  options: { apiKey: string; model: string; baseUrl: string; fetchImpl: typeof fetch }
) {
  const response = await options.fetchImpl(`${options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: options.model,
      messages: buildTranslationMessages(items),
      response_format: { type: 'json_object' },
      temperature: 0.2
    })
  });

  if (!response.ok) {
    throw new Error(`DeepSeek 请求失败: ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('DeepSeek 返回内容为空');
  }

  return parseTranslationContent(content);
}

export function parseTranslationContent(content: string): TranslatedText[] {
  const parsed = JSON.parse(content) as unknown;
  const translations = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && 'translations' in parsed
      ? (parsed as { translations: unknown }).translations
      : null;

  if (!Array.isArray(translations)) {
    throw new Error('DeepSeek 返回 JSON 中缺少 translations 数组');
  }

  return translations.map((item) => {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof (item as TranslatedText).id !== 'string' ||
      typeof (item as TranslatedText).translatedText !== 'string'
    ) {
      throw new Error('DeepSeek 返回的条目必须包含 id 和 translatedText');
    }

    return {
      id: (item as TranslatedText).id,
      translatedText: (item as TranslatedText).translatedText
    };
  });
}

function validateTranslations(source: ExtractedText[], translated: TranslatedText[]) {
  if (source.length !== translated.length) {
    throw new Error('翻译结果数量与输入数量不一致');
  }

  const sourceIds = new Set(source.map((item) => item.id));
  for (const item of translated) {
    if (!sourceIds.has(item.id)) {
      throw new Error(`翻译结果包含未知 id: ${item.id}`);
    }
  }
}

async function fileExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
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
