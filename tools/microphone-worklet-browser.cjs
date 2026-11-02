const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('C:/Users/Scean Andrei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'audit/microphone-ready');
fs.mkdirSync(output, { recursive: true });
const wav = Buffer.alloc(44 + 48000 * 2 * 5);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8);
wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(48000, 24); wav.writeUInt32LE(96000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 0; i < (wav.length - 44) / 2; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / 48000) * 20000), 44 + i * 2);
const audio = path.join(output, 'tone.wav');
fs.writeFileSync(audio, wav);
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/javascript');
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><button>Start</button>'); }
  if (req.url === '/student/speech.js') return res.end(fs.readFileSync(path.join(root, 'student/speech.js'), 'utf8').replace(/^import .*;\r?\n/, 'const auth = {};\n'));
  if (req.url === '/student/microphone-worklet.js') return res.end(fs.readFileSync(path.join(root, 'student/microphone-worklet.js')));
  res.writeHead(404); res.end();
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true,
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', `--use-file-for-fake-audio-capture=${audio}`] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (/deprecated|ScriptProcessor/i.test(message.text())) errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const result = await page.evaluate(async () => {
      const { Microphone } = await import('/student/speech.js');
      const mic = new Microphone();
      const opened = await mic.open();
      if (opened !== 'ok') throw Error(`Microphone: ${opened}`);
      await new Promise(resolve => setTimeout(resolve, 500));
      const node = mic.processor;
      const clips = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        const release = new AbortController();
        const recording = mic.record(() => {}, new AbortController().signal, release.signal);
        await new Promise(resolve => setTimeout(resolve, 220));
        release.abort();
        const clip = await recording;
        if (!clip.wav) throw Error(`No audio on hold ${attempt}`);
        const bytes = new DataView(await clip.wav.arrayBuffer());
        clips.push({ size: clip.wav.size, rate: bytes.getUint32(24, true), first: bytes.getInt16(44, true) });
        if (mic.processor !== node) throw Error('Audio graph restarted');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const stream = mic.stream;
      mic.close();
      return { clips, stopped: stream.getTracks().every(track => track.readyState === 'ended') };
    });
    assert.equal(result.stopped, true);
    for (const clip of result.clips) {
      assert.equal(clip.rate, 16000);
      assert.ok(clip.size >= 2000 && clip.size < 15000, `Unexpected clip length ${clip.size}`);
    }
    assert.deepEqual(errors, []);
    console.log('PASS: real browser AudioWorklet records three holds, produces 16 kHz WAV, reuses graph, stops microphone, no deprecation warnings');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    fs.unlinkSync(audio);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
