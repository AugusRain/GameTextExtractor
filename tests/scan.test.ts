import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  chunkItems,
  scanGameFolder,
  shouldIncludeText,
  shouldSkipDirectory,
  writeBatches,
  type ExtractedText
} from '../src/server/scan';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'translate-project-'));
  tempDirs.push(dir);
  return dir;
}

describe('text filters', () => {
  it('skips empty, numeric, URL, and file path text', () => {
    expect(shouldIncludeText('')).toBe(false);
    expect(shouldIncludeText('12345')).toBe(false);
    expect(shouldIncludeText('https://example.com/game')).toBe(false);
    expect(shouldIncludeText('assets/title.png')).toBe(false);
  });

  it('keeps likely visible text', () => {
    expect(shouldIncludeText('Start Game')).toBe(true);
    expect(shouldIncludeText('Load checkpoint')).toBe(true);
  });
});

describe('batch writing', () => {
  it('splits 301 items into 2 JSON files', async () => {
    const outputDir = await makeTempDir();
    const items: ExtractedText[] = Array.from({ length: 301 }, (_, index) => ({
      id: String(index + 1).padStart(6, '0'),
      text: `Text ${index + 1}`,
      sourceFile: 'game.js',
      line: index + 1,
      type: 'js-string'
    }));

    const files = await writeBatches(items, outputDir, 300);

    expect(files).toHaveLength(2);
    expect(files[0].itemCount).toBe(300);
    expect(files[1].itemCount).toBe(1);
    expect(chunkItems(items, 300)).toHaveLength(2);
  });
});

describe('directory scanning', () => {
  it('skips ignored folders', () => {
    expect(shouldSkipDirectory('node_modules')).toBe(true);
    expect(shouldSkipDirectory('dist')).toBe(true);
  });

  it('extracts HTML text, attributes, JSON strings, and JS strings', async () => {
    const gameDir = await makeTempDir();
    const outputRoot = await makeTempDir();
    await mkdir(path.join(gameDir, 'node_modules'));
    await mkdir(path.join(gameDir, 'data'));
    await writeFile(
      path.join(gameDir, 'index.html'),
      '<button title="Begin adventure">Start Game</button><input placeholder="Hero name" />'
    );
    await writeFile(path.join(gameDir, 'main.js'), 'const message = "Load checkpoint";');
    await writeFile(path.join(gameDir, 'data', 'dialog.json'), JSON.stringify({ text: 'Welcome back' }));
    await writeFile(path.join(gameDir, 'node_modules', 'ignored.js'), 'const text = "Do not scan";');

    const result = await scanGameFolder(gameDir, outputRoot);
    const firstBatch = JSON.parse(await readFile(result.files[0].fullPath, 'utf8')) as ExtractedText[];
    const texts = firstBatch.map((item) => item.text);

    expect(texts).toContain('Start Game');
    expect(texts).toContain('Begin adventure');
    expect(texts).toContain('Hero name');
    expect(texts).toContain('Load checkpoint');
    expect(texts).toContain('Welcome back');
    expect(texts).not.toContain('Do not scan');
  });
});
