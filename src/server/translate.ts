import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ExtractedText } from './scan';

export type TranslationMode = 'english_to_chinese' | 'japanese_to_chinese';

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
  translationMode?: TranslationMode;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

const DEFAULT_MODEL = 'deepseek-v4-flash';
const DEFAULT_BASE_URL = 'https://api.deepseek.com';

const MODE_COPY: Record<TranslationMode, { source: string; instruction: string }> = {
  english_to_chinese: {
    source: '英文',
    instruction: '把英文游戏文本翻译成自然、流畅、符合中文玩家阅读习惯的简体中文。'
  },
  japanese_to_chinese: {
    source: '日文',
    instruction: '把日文游戏文本翻译成自然、流畅、符合中文玩家阅读习惯的简体中文。'
  }
};

export function buildTranslatedFileName(fileName: string) {
  return fileName.replace(/\.json$/i, '.zh.json');
}

export function buildTranslationMessages(items: ExtractedText[], translationMode: TranslationMode = 'english_to_chinese') {
  const modeCopy = MODE_COPY[translationMode];

  return [
    {
      role: 'system',
      content: [
        '你是专业游戏本地化译者。',
        modeCopy.instruction,
        '译文必须是简体中文，不要输出英文直译、日文原文、拼音或乱码。',
        '不要机械逐词翻译，要改写成中文玩家看得懂、读起来顺的表达。',
        '人名、角色名、地名、专有名词、品牌名、代码字段、变量名和 id 不翻译。',
        '保留游戏术语的语气和上下文，例如按钮、菜单、提示、对白要像正式中文游戏文案。',
        '保持每个 id 一一对应，只返回合法 JSON。'
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify(
        {
          sourceLanguage: modeCopy.source,
          targetLanguage: '简体中文',
          requirements: [
            '只返回 JSON 对象，格式为 {"translations":[{"id":"000001","translatedText":"中文译文"}]}',
            'translations 数量必须和输入数量完全一致',
            '不要添加解释、Markdown 或额外字段',
            '如果文本中包含人名，请保留原文人名',
            '除人名和专有名词外，translatedText 必须是流畅简体中文'
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
        fetchImpl: options.fetchImpl || fetch,
        translationMode: options.translationMode || 'english_to_chinese'
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
  options: {
    apiKey: string;
    model: string;
    baseUrl: string;
    fetchImpl: typeof fetch;
    translationMode: TranslationMode;
  }
) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const translated = await translateBatch(items, options);
      validateTranslations(items, translated);
      validateChineseQuality(items, translated, options.translationMode);
      return translated;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('翻译失败');
}

async function translateBatch(
  items: ExtractedText[],
  options: {
    apiKey: string;
    model: string;
    baseUrl: string;
    fetchImpl: typeof fetch;
    translationMode: TranslationMode;
  }
) {
  const response = await options.fetchImpl(`${options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: options.model,
      messages: buildTranslationMessages(items, options.translationMode),
      response_format: { type: 'json_object' },
      temperature: 0.1
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

function validateChineseQuality(source: ExtractedText[], translated: TranslatedText[], translationMode: TranslationMode) {
  const translatedById = new Map(translated.map((item) => [item.id, item.translatedText]));
  const sourceItemsNeedingChinese = source.filter((item) => shouldExpectChinese(item.text, translationMode));

  if (sourceItemsNeedingChinese.length === 0) {
    return;
  }

  const chineseCount = sourceItemsNeedingChinese.filter((item) => hasChinese(translatedById.get(item.id) || '')).length;
  const ratio = chineseCount / sourceItemsNeedingChinese.length;

  if (ratio < 0.65) {
    throw new Error('翻译结果不像流畅中文，请检查模型返回内容或选择正确的英译中/日译中模式');
  }
}

function shouldExpectChinese(text: string, translationMode: TranslationMode) {
  const trimmed = text.trim();
  if (trimmed.length < 2) {
    return false;
  }

  if (/^[A-Z][a-z]+$/.test(trimmed)) {
    return false;
  }

  if (translationMode === 'japanese_to_chinese') {
    return /[\u3040-\u30ff]/.test(trimmed);
  }

  return /[A-Za-z]/.test(trimmed);
}

function hasChinese(text: string) {
  return /[\u4e00-\u9fff]/.test(text);
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
