import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../student/speech.js', import.meta.url), 'utf8'))
  .split('function wavBlob')[0].replace(/^import .*;\r?\n/, '').replace('export class Microphone', 'class Microphone')
  .replace('import.meta.url', '"https://example.test/student/speech.js"');
let opens = 0, stopped = 0, nodes = 0, processor;
let Processor;
const workletContext = vm.createContext({
  AudioWorkletProcessor: class { constructor() { this.port = { postMessage: data => processor.port.onmessage({ data }) }; } },
  registerProcessor: (name, implementation) => { assert.equal(name, 'pronunciation-microphone'); Processor = implementation; },
});
vm.runInContext(await readFile(new URL('../student/microphone-worklet.js', import.meta.url), 'utf8'), workletContext);
class WorkletNode {
  constructor(context, name) {
    nodes++;
    assert.equal(name, 'pronunciation-microphone');
    this.worker = new Processor();
    this.port = { postMessage: data => this.worker.port.onmessage({ data }), close() {} };
    processor = this;
  }
  connect() {}
  disconnect() {}
}
let acquire = async () => ({ active: true, getTracks: () => [{ stop() { stopped++; } }] });
class Context {
  state = 'running';
  sampleRate = 16000;
  destination = {};
  audioWorklet = { addModule: async url => assert.ok(url.pathname.endsWith('/student/microphone-worklet.js')) };
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  async close() { this.state = 'closed'; }
}
const context = vm.createContext({
  window: { AudioContext: Context, AudioWorkletNode: WorkletNode }, AudioWorkletNode: WorkletNode, URL,
  navigator: { mediaDevices: { getUserMedia() { opens++; return acquire(); } } },
  Blob, Float32Array, Int16Array, ArrayBuffer, DataView,
});
vm.runInContext(source + '\nglobalThis.Microphone = Microphone; globalThis.wavBlob = frames => new Blob(frames);', context);
const mic = new context.Microphone();
await Promise.all([mic.open(), mic.open()]);
assert.equal(opens, 1, 'concurrent preparation shares permission acquisition');
assert.equal(nodes, 1, 'audio pipeline is prepared before holding');
const feed = value => processor.worker.process([[new Float32Array(512).fill(value)]]);
feed(0.8); // Idle audio must not count toward the following silent attempt.
let release = new AbortController();
let recording = mic.record(() => {}, new AbortController().signal, release.signal);
feed(0); feed(0); feed(0);
release.abort();
assert.equal((await recording).noSpeech, true);
for (let attempt = 0; attempt < 2; attempt++) {
  await mic.open();
  release = new AbortController();
  recording = mic.record(() => {}, new AbortController().signal, release.signal);
  feed(0.3); feed(0.3); feed(0.3);
  release.abort();
  assert.ok((await recording).wav, 'speech from the beginning of the hold is retained');
}
assert.equal(opens, 1, 'successive holds reuse the microphone');
assert.equal(nodes, 1, 'successive holds reuse the ready audio pipeline');
recording = mic.record(() => {}, new AbortController().signal, new AbortController().signal);
mic.close();
assert.equal((await recording).cancelled, true);
assert.equal(stopped, 1);
assert.equal(await mic.open(), 'unavailable', 'closed microphone cannot reopen after navigation');

let resolvePermission;
acquire = () => new Promise(resolve => { resolvePermission = resolve; });
const late = new context.Microphone();
const opening = late.open();
late.close();
resolvePermission({ active: true, getTracks: () => [{ stop() { stopped++; } }] });
assert.equal(await opening, 'unavailable');
assert.equal(stopped, 2, 'permission granted after leaving immediately stops the stream');
console.log('PASS: microphone preparation, reuse, immediate speech, idle discard, cancellation, late permission cleanup');
