import { KokoroTTS } from "https://esm.sh/kokoro-js@1.2.1";

let kokoroPromise = null;
const voiceCache = new Map();

export function splitNarration(text, max = 380) {
  const paras = String(text || '').replace(/\r/g, '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
  const out = [];
  for (const para of (paras.length ? paras : [String(text || '').trim()])) {
    if (!para) continue;
    if (para.length <= max) { out.push(para); continue; }
    const sentences = para.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g) || [para];
    let buf = '';
    for (const sentence of sentences) {
      if ((buf + ' ' + sentence).trim().length > max && buf) { out.push(buf.trim()); buf = sentence; }
      else buf = (buf + ' ' + sentence).trim();
    }
    if (buf) out.push(buf.trim());
  }
  return out.filter(Boolean);
}

export function wavBlob(chunks, sampleRate = 24000) {
  const total = chunks.reduce((n, a) => n + a.length, 0);
  const pcm = new Int16Array(total);
  let o = 0;
  for (const a of chunks) {
    for (let i = 0; i < a.length; i++) {
      const v = Math.max(-1, Math.min(1, a[i]));
      pcm[o++] = v < 0 ? v * 32768 : v * 32767;
    }
  }
  const b = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(b);
  const ws = (p, x) => { for (let i = 0; i < x.length; i++) v.setUint8(p + i, x.charCodeAt(i)); };
  const w32 = (p, x) => v.setUint32(p, x, true), w16 = (p, x) => v.setUint16(p, x, true);
  ws(0, 'RIFF'); w32(4, 36 + pcm.length * 2); ws(8, 'WAVE'); ws(12, 'fmt '); w32(16, 16);
  w16(20, 1); w16(22, 1); w32(24, sampleRate); w32(28, sampleRate * 2); w16(32, 2); w16(34, 16);
  ws(36, 'data'); w32(40, pcm.length * 2); new Uint8Array(b, 44).set(new Uint8Array(pcm.buffer));
  return new Blob([b], { type: 'audio/wav' });
}

async function loadKokoro() {
  if (kokoroPromise) return kokoroPromise;
  kokoroPromise = (async () => {
    if (navigator.gpu) {
      try { return await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32', device: 'webgpu' }); }
      catch (e) { console.warn('Kokoro WebGPU unavailable; using WASM.', e); }
    }
    return KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'wasm' });
  })();
  return kokoroPromise;
}

export async function generateVoiceWav(text, voice = 'am_adam', speed = 1, onProgress) {
  const source = String(text || '').trim();
  if (!source) throw new Error('Add narration before generating the voice.');
  const engine = await loadKokoro();
  const chunks = splitNarration(source);
  const audios = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(i, chunks.length);
    const a = await engine.generate(chunks[i], { voice, speed: Number(speed) || 1 });
    audios.push(a.audio instanceof Float32Array ? a.audio : new Float32Array(a.audio));
  }
  onProgress?.(chunks.length, chunks.length);
  return wavBlob(audios, 24000);
}

const MUSIC = {
  documentary:{root:196,scale:[0,3,7,10],bpm:70,wave:'sine',beat:0}, cinematic:{root:146.8,scale:[0,3,7,12],bpm:80,wave:'sawtooth',beat:1},
  horror:{root:110,scale:[0,1,6,7],bpm:55,wave:'triangle',beat:0}, cozy:{root:261.6,scale:[0,4,7,11],bpm:68,wave:'sine',beat:0},
  adventure:{root:220,scale:[0,4,7,9],bpm:112,wave:'triangle',beat:2}, afrobeats:{root:233,scale:[0,3,7,10],bpm:104,wave:'triangle',beat:3},
  hiphop:{root:130.8,scale:[0,3,5,7],bpm:140,wave:'square',beat:3}, lofi:{root:220,scale:[0,3,7,10],bpm:76,wave:'sine',beat:2},
  scifi:{root:174.6,scale:[0,2,7,9],bpm:96,wave:'sawtooth',beat:1}
};
const TAU = Math.PI * 2;
function midiHz(root, semitone) { return root * Math.pow(2, semitone / 12); }
function osc(t, f, wave) {
  const x = (t * f) % 1;
  if (wave === 'square') return x < .5 ? 1 : -1;
  if (wave === 'sawtooth') return 2 * x - 1;
  if (wave === 'triangle') return 1 - 4 * Math.abs(Math.round(x) - x);
  return Math.sin(TAU * x);
}

// Creates a real WAV file, so generated music can be attached to an MP4 export.
export async function generateMusicWav(type = 'documentary', seconds = 60, onProgress) {
  const p = MUSIC[type] || MUSIC.documentary;
  const sr = 22050, total = Math.max(10, Math.min(120, Math.round(seconds * sr)));
  const data = new Int16Array(total), beatLen = 60 / p.bpm;
  const chord = [0, 3, 2, 4];
  for (let i = 0; i < total; i++) {
    const t = i / sr, beat = t / beatLen, step = Math.floor(beat * 2), bar = Math.floor(step / 8), deg = chord[bar % chord.length];
    let sample = 0;
    const root = midiHz(p.root, p.scale[deg % p.scale.length]);
    sample += osc(t, root / 2, 'sine') * .16;
    sample += osc(t, root, p.wave) * .07;
    sample += osc(t, midiHz(p.root * 2, p.scale[(deg + 2) % p.scale.length]), 'sine') * .035;
    const local = beat % 1;
    if (p.beat && (step % 2 === 0)) sample += Math.sin(TAU * (80 + 30 * (1 - local)) * t) * Math.exp(-local * 14) * .10;
    if (p.beat > 1 && (step % 4 === 3)) sample += osc(t, root * 2, p.wave) * Math.exp(-local * 18) * .045;
    const fade = Math.min(1, t / 0.5, (seconds - t) / 0.8);
    data[i] = Math.max(-32767, Math.min(32767, sample * fade * 12000));
    if (i % 22050 === 0) { onProgress?.(i / total); await new Promise(r => setTimeout(r, 0)); }
  }
  onProgress?.(1);
  return wavBlob([new Float32Array(Array.from(data, x => x / 32768))], sr);
}

export async function saveLatestAudio(blob) {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('muzjetai-tts', 1); r.onupgradeneeded = () => r.result.createObjectStore('audio');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  await new Promise((res, rej) => { const r = db.transaction('audio', 'readwrite').objectStore('audio').put(blob, 'latest'); r.onsuccess = res; r.onerror = () => rej(r.error); });
}
