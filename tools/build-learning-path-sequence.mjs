import { readFile, writeFile } from 'node:fs/promises';
const source = await readFile(new URL('../js/learningPathSequence.js', import.meta.url), 'utf8');
await writeFile(new URL('../notify-api/lib/learningPathSequence.js', import.meta.url), source.replace(/^\uFEFF/, ''));
