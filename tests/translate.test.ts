import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildTranslatedFileName,
  buildTranslationMessages,
  parseTranslationContent,
  translateFolder
} from '../src/server/translate';
import type { ExtractedText } from '../src/server/scan';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'translate-json-'));
  tempDirs.push(dir);
  return dir;
}

function makeItem(id: string, text: string): ExtractedText {
  return {
    id,
    text,
    sourceFile: 'game.js',
    line: 1,
    type: 'js-string'
  };
}

function fakeFetchWithTranslations(translatedText: string): typeof fetch {
  return (async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                translations: [{ id: '000001', translatedText }]
              })
            }
          }
        ]
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch;
}

describe('translation helpers', () => {
  it('maps batch file names to Chinese output file names', () => {
    expect(buildTranslatedFileName('batch-001.json')).toBe('batch-001.zh.json');
  });

  it('includes the no-person-name-translation constraint in the prompt', () => {
    const messages = buildTranslationMessages([makeItem('000001', 'Alice starts the game')]);
    expect(messages[0].content).toContain('人名');
    expect(messages[0].content).toContain('不翻译');
  });

  it('parses valid model JSON output', () => {
    expect(parseTranslationContent('{"translations":[{"id":"000001","translatedText":"开始游戏"}]}')).toEqual([
      { id: '000001', translatedText: '开始游戏' }
    ]);
  });

  it('rejects invalid model JSON output', () => {
    expect(() => parseTranslationContent('{"items":[]}')).toThrow('translations');
  });
});

describe('translateFolder', () => {
  it('only translates .json files and writes .zh.json output', async () => {
    const inputDir = await makeTempDir();
    const outputDir = await makeTempDir();
    await writeFile(path.join(inputDir, 'batch-001.json'), JSON.stringify([makeItem('000001', 'Start Game')]));
    await writeFile(path.join(inputDir, 'notes.txt'), 'Ignore me');
    await writeFile(path.join(inputDir, 'batch-000.zh.json'), '[]');

    const result = await translateFolder({
      inputDir,
      outputDir,
      apiKey: 'sk-test',
      fetchImpl: fakeFetchWithTranslations('开始游戏')
    });

    expect(result.totalFiles).toBe(1);
    expect(result.successCount).toBe(1);
    const output = JSON.parse(await readFile(path.join(outputDir, 'batch-001.zh.json'), 'utf8'));
    expect(output).toEqual([{ id: '000001', translatedText: '开始游戏' }]);
    await expect(stat(path.join(outputDir, 'notes.zh.json'))).rejects.toThrow();
  });

  it('skips existing output files unless overwrite is enabled', async () => {
    const inputDir = await makeTempDir();
    const outputDir = await makeTempDir();
    await writeFile(path.join(inputDir, 'batch-001.json'), JSON.stringify([makeItem('000001', 'Start Game')]));
    await writeFile(path.join(outputDir, 'batch-001.zh.json'), '[]');

    const result = await translateFolder({
      inputDir,
      outputDir,
      apiKey: 'sk-test',
      fetchImpl: fakeFetchWithTranslations('开始游戏')
    });

    expect(result.skippedCount).toBe(1);
  });

  it('marks one file failed and continues with the next file', async () => {
    const inputDir = await makeTempDir();
    const outputDir = await makeTempDir();
    await mkdir(path.join(inputDir, 'nested'));
    await writeFile(path.join(inputDir, 'batch-001.json'), JSON.stringify([makeItem('000001', 'Start Game')]));
    await writeFile(path.join(inputDir, 'batch-002.json'), JSON.stringify([makeItem('000001', 'Load Game')]));
    let callCount = 0;
    const fetchImpl = (async () => {
      callCount += 1;
      const content =
        callCount <= 3
          ? '{"translations":[]}'
          : JSON.stringify({ translations: [{ id: '000001', translatedText: '读取游戏' }] });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }) as typeof fetch;

    const result = await translateFolder({
      inputDir,
      outputDir,
      apiKey: 'sk-test',
      fetchImpl
    });

    expect(result.failedCount).toBe(1);
    expect(result.successCount).toBe(1);
  });
});
