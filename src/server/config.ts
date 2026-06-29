import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type LocalSettings = {
  deepseekApiKey?: string;
};

export function getSettingsPath(configRoot: string) {
  return path.join(configRoot, 'local-settings.json');
}

export async function saveDeepSeekApiKey(configRoot: string, apiKey: string) {
  const trimmedKey = apiKey.trim();

  if (!trimmedKey.startsWith('sk-')) {
    throw new Error('API Key 格式不正确，应以 sk- 开头');
  }

  await mkdir(configRoot, { recursive: true });
  await writeFile(getSettingsPath(configRoot), `${JSON.stringify({ deepseekApiKey: trimmedKey }, null, 2)}\n`, 'utf8');
}

export async function loadDeepSeekApiKey(configRoot: string) {
  try {
    const settings = JSON.parse(await readFile(getSettingsPath(configRoot), 'utf8')) as LocalSettings;
    return settings.deepseekApiKey || '';
  } catch {
    return '';
  }
}
