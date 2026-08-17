'use strict';

// Bioacoustic Template Labeler v46 · Perch2 browser worker
// Inferencia local: el runtime ONNX y el modelo se descargan como recursos
// estáticos; el audio del usuario permanece en el navegador.

const ORT_VERSION = '1.27.0';
const ORT_DIST = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const ORT_SCRIPT = `${ORT_DIST}ort.webgpu.min.js`;
const MODEL_URL = 'https://huggingface.co/sammlapp/Perch_v2_headless/resolve/main/perch_v2_no_dft_embedding_only.onnx';
const TARGET_SR = 32000;
const WINDOW_S = 5;
const WINDOW_N = TARGET_SR * WINDOW_S;
const PEAK_LEVEL = 0.25;
const EMBEDDING_DIM = 1536;
const BUTTERWORTH_Q6 = [0.5176380902050415, 0.7071067811865476, 1.9318516525781366];

let ortReady = false;
let session = null;
let backendUsed = null;
let nativeAudio = null;
let nativeSampleRate = 0;
let duration = 0;
let raw32k = null;
let bandCache = null;
let cancelRequested = false;
let searchRunning = false;

function post(type, payload = {}) { self.postMessage({ type, ...payload }); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function fmtBytes(n) {
  if (!Number.isFinite(n)) return '?';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let v = n; let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(i ? 1 : 0)} ${units[i]}`;
}

async function fetchWithProgress(url) {
  const response = await fetch(url, { mode: 'cors' });
  if (!response.ok) throw new Error(`HTTP ${response.status} al descargar Perch2`);
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks = []; let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); received += value.byteLength;
    const progress = total ? (received / total) * 100 : Math.min(96, 8 + Math.log2(1 + received / 1048576) * 9);
    post('perch-model-progress', { progress, message: `Descargando modelo Perch2… ${fmtBytes(received)}${total ? ` / ${fmtBytes(total)}` : ''}` });
  }
  const out = new Uint8Array(received); let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
  return out;
}

function ensureOrt() {
  if (ortReady) return;
  importScripts(ORT_SCRIPT);
  if (!self.ort) throw new Error('ONNX Runtime Web no pudo cargarse desde CDN.');
  self.ort.env.wasm.wasmPaths = ORT_DIST;
  self.ort.env.wasm.numThreads = 1;
  self.ort.env.wasm.proxy = false;
  ortReady = true;
}

async function ensureSession() {
  if (session) return session;
  ensureOrt();
  post('perch-model-progress', { progress: 2, message: 'Preparando Perch2 ONNX…' });
  const bytes = await fetchWithProgress(MODEL_URL);
  post('perch-model-progress', { progress: 98, message: 'Creando sesión ONNX…' });
  const canWebGpu = Boolean(self.navigator && self.navigator.gpu);
  if (canWebGpu) {
    try {
      session = await self.ort.InferenceSession.create(bytes, { executionProviders: ['webgpu'], graphOptimizationLevel: 'all' });
      backendUsed = 'webgpu';
    } catch (err) {
      post('perch-model-progress', { progress: 99, message: `WebGPU no disponible para este modelo (${err.message || err}). Probando WASM…` });
    }
  }
  if (!session) {
    session = await self.ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    backendUsed = 'wasm';
  }
  post('perch-model-ready', { backend: backendUsed, inputNames: session.inputNames, outputNames: session.outputNames, progress: 100 });
  return session;
}

function linearResample(input, inputRate, outputRate) {
  if (!input || !input.length) return new Float32Array();
  if (Math.abs(inputRate - outputRate) < 1) return new Float32Array(input);
  const n = Math.max(1, Math.round(input.length * outputRate / inputRate));
  const out = new Float32Array(n); const ratio = inputRate / outputRate;
  for (let i = 0; i < n; i += 1) {
    const p = i * ratio; const j = Math.floor(p); const f = p - j;
    const a = input[Math.min(j, input.length - 1)]; const b = input[Math.min(j + 1, input.length - 1)];
    out[i] = a + (b - a) * f;
  }
  return out;
}

function biquadCoefficients(type, fc, q, fs) {
  const cutoff = clamp(fc, 1, fs * 0.499);
  const w0 = 2 * Math.PI * cutoff / fs; const cos = Math.cos(w0); const sin = Math.sin(w0); const alpha = sin / (2 * q);
  let b0; let b1; let b2; const a0 = 1 + alpha; const a1 = -2 * cos; const a2 = 1 - alpha;
  if (type === 'lowpass') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2; }
  else { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; }
  return { b0: b0/a0, b1: b1/a0, b2: b2/a0, a1: a1/a0, a2: a2/a0 };
}
function applyBiquad(input, c) {
  const out = new Float32Array(input.length); let z1 = 0; let z2 = 0;
  for (let i=0;i<input.length;i+=1) { const x=input[i]; const y=c.b0*x+z1; z1=c.b1*x-c.a1*y+z2; z2=c.b2*x-c.a2*y; out[i]=y; }
  return out;
}
function reverseCopy(input) { const out=new Float32Array(input.length); for(let i=0,j=input.length-1;i<input.length;i+=1,j-=1) out[i]=input[j]; return out; }
function applySections(input, sections) { let out=new Float32Array(input); for(const section of sections) out=applyBiquad(out,section); return out; }
function zeroPhaseBandpass(input, fs, fmin, fmax) {
  const nyquist=fs/2; let lo=clamp(Number(fmin)||0,0,nyquist-2); let hi=clamp(Number(fmax)||nyquist,2,nyquist-1);
  if(lo>hi)[lo,hi]=[hi,lo]; if(hi-lo<5)hi=Math.min(nyquist-1,lo+5);
  const sections=[];
  if(lo>1) for(const q of BUTTERWORTH_Q6) sections.push(biquadCoefficients('highpass',lo,q,fs));
  if(hi<nyquist-1) for(const q of BUTTERWORTH_Q6) sections.push(biquadCoefficients('lowpass',hi,q,fs));
  if(!sections.length)return new Float32Array(input);
  let y=applySections(input,sections); y=reverseCopy(y); y=applySections(y,sections); return reverseCopy(y);
}

function getRaw32k() { if(!raw32k) raw32k=linearResample(nativeAudio,nativeSampleRate,TARGET_SR); return raw32k; }
function getBand32k(fmin,fmax) {
  const key=`${Math.round(fmin)}:${Math.round(fmax)}`;
  if(bandCache&&bandCache.key===key)return bandCache.audio;
  post('perch-search-progress',{progress:3,message:`Filtrando ${Math.round(fmin)}–${Math.round(fmax)} Hz…`});
  const filtered=zeroPhaseBandpass(nativeAudio,nativeSampleRate,fmin,fmax);
  const audio=linearResample(filtered,nativeSampleRate,TARGET_SR); bandCache={key,audio}; return audio;
}
function extractNormalizedWindow(audio32k,startSec) {
  const out=new Float32Array(WINDOW_N); const i0=Math.max(0,Math.round(startSec*TARGET_SR)); const available=Math.max(0,Math.min(WINDOW_N,audio32k.length-i0));
  if(available>0)out.set(audio32k.subarray(i0,i0+available)); let peak=0;
  for(let i=0;i<out.length;i+=1)peak=Math.max(peak,Math.abs(out[i]));
  if(peak>0){const gain=PEAK_LEVEL/peak;for(let i=0;i<out.length;i+=1)out[i]*=gain;} return out;
}
function getEmbeddingOutput(outputs) {
  if(outputs.embedding&&outputs.embedding.data)return outputs.embedding.data;
  for(const name of session.outputNames){const tensor=outputs[name];if(tensor&&tensor.data&&tensor.data.length===EMBEDDING_DIM)return tensor.data;}
  const first=session.outputNames[0]; if(!outputs[first]||!outputs[first].data)throw new Error('Perch2 no devolvió una salida tensorial.'); return outputs[first].data;
}
function normalizeVector(input) { const out=Float32Array.from(input); let ss=0; for(let i=0;i<out.length;i+=1)ss+=out[i]*out[i]; const norm=Math.sqrt(ss)||1; for(let i=0;i<out.length;i+=1)out[i]/=norm; return out; }
async function embedWindow(audio32k,startSec) {
  if(cancelRequested)throw new Error('__PERCH_CANCELLED__');
  const prepared=extractNormalizedWindow(audio32k,startSec); const inputName=session.inputNames.includes('inputs')?'inputs':session.inputNames[0];
  const tensor=new self.ort.Tensor('float32',prepared,[1,WINDOW_N]); const outputs=await session.run({[inputName]:tensor}); const vector=getEmbeddingOutput(outputs);
  if(vector.length!==EMBEDDING_DIM)throw new Error(`Embedding Perch2 inesperado: ${vector.length} dimensiones.`); return normalizeVector(vector);
}
function averagePrototype(vectors) { if(!vectors.length)throw new Error('No hay contextos válidos para construir el prototipo Perch2.'); const avg=new Float32Array(EMBEDDING_DIM); for(const v of vectors)for(let i=0;i<EMBEDDING_DIM;i+=1)avg[i]+=v[i]; for(let i=0;i<EMBEDDING_DIM;i+=1)avg[i]/=vectors.length; return normalizeVector(avg); }
function dot(a,b){let s=0;for(let i=0;i<a.length;i+=1)s+=a[i]*b[i];return s;}
function templateContextStarts(tmin,tmax){const maxStart=Math.max(0,duration-WINDOW_S);let a=clamp(Math.min(tmin,tmax),0,duration);let b=clamp(Math.max(tmin,tmax),0,duration);if(!(b>a))return[clamp(a-WINDOW_S/2,0,maxStart)];const width=b-a;if(width<=WINDOW_S)return[clamp((a+b)/2-WINDOW_S/2,0,maxStart)];const starts=[];for(let s=a;s<=b-WINDOW_S+1e-8;s+=WINDOW_S)starts.push(clamp(s,0,maxStart));const last=clamp(b-WINDOW_S,0,maxStart);if(!starts.length||Math.abs(starts[starts.length-1]-last)>0.05)starts.push(last);return[...new Set(starts.map(v=>Number(v.toFixed(6))))];}
function scanStarts(strideSec){const maxStart=Math.max(0,duration-WINDOW_S);if(duration<=WINDOW_S)return[0];const step=clamp(Number(strideSec)||0.5,0.05,10);const starts=[];for(let s=0;s<=maxStart+1e-8;s+=step)starts.push(Number(s.toFixed(6)));if(Math.abs(starts[starts.length-1]-maxStart)>Math.min(step*0.25,0.05))starts.push(Number(maxStart.toFixed(6)));return starts;}
function emitSearchProgress(progress,message){const pct=progress.total>0?5+(progress.done/progress.total)*94:5;post('perch-search-progress',{progress:clamp(pct,5,99),message});}
async function makePrototype(audio32k,contextStarts,progress){const vectors=[];for(const start of contextStarts){vectors.push(await embedWindow(audio32k,start));progress.done+=1;emitSearchProgress(progress,`Embedding de plantilla ${progress.done}/${progress.total}`);}return averagePrototype(vectors);}

async function runSearch(message){
  if(!nativeAudio||!nativeAudio.length||!(nativeSampleRate>0))throw new Error('Perch2 no recibió el audio de trabajo.');
  if(searchRunning)throw new Error('Ya hay una búsqueda Perch2 en curso.');
  searchRunning=true; cancelRequested=false; const started=performance.now();
  try{
    await ensureSession(); const mode=['full','band','compare'].includes(message.mode)?message.mode:'full'; const strideSec=clamp(Number(message.strideSec)||0.5,0.05,10);
    const template=message.template||{}; const contexts=templateContextStarts(Number(template.tmin)||0,Number(template.tmax)||0); const starts=scanStarts(strideSec); const factor=mode==='compare'?2:1; const progress={done:0,total:(contexts.length+starts.length)*factor};
    const raw=(mode==='full'||mode==='compare')?getRaw32k():null;
    const band=(mode==='band'||mode==='compare')?getBand32k(Number(message.bandFminHz)||0,Number(message.bandFmaxHz)||nativeSampleRate/2):null;
    let protoRaw=null,protoBand=null; if(raw)protoRaw=await makePrototype(raw,contexts,progress); if(band)protoBand=await makePrototype(band,contexts,progress);
    const candidates=[];
    for(let i=0;i<starts.length;i+=1){if(cancelRequested)throw new Error('__PERCH_CANCELLED__');const start=starts[i];const candidate={tmin:start,tmax:Math.min(duration,start+WINDOW_S)};
      if(raw){const emb=await embedWindow(raw,start);candidate.scoreRaw=dot(protoRaw,emb);progress.done+=1;emitSearchProgress(progress,`Perch2 audio completo · ventana ${i+1}/${starts.length}`);}
      if(band){const emb=await embedWindow(band,start);candidate.scoreBand=dot(protoBand,emb);progress.done+=1;emitSearchProgress(progress,`Perch2 banda · ventana ${i+1}/${starts.length}`);}
      candidates.push(candidate);
    }
    post('perch-search-ready',{candidates,mode,backend:backendUsed,contexts:contexts.length,windows:starts.length,elapsedMs:performance.now()-started,targetSampleRate:TARGET_SR,embeddingDim:EMBEDDING_DIM,windowSec:WINDOW_S});
  }catch(err){if(String(err&&err.message)==='__PERCH_CANCELLED__')post('perch-cancelled',{message:'Búsqueda Perch2 cancelada.'});else throw err;}
  finally{searchRunning=false;cancelRequested=false;}
}

self.onmessage=async(event)=>{const message=event.data||{};try{
  if(message.type==='init-audio'){nativeAudio=message.samples instanceof Float32Array?message.samples:new Float32Array(message.samples||0);nativeSampleRate=Number(message.sampleRate)||0;duration=nativeSampleRate>0?nativeAudio.length/nativeSampleRate:0;raw32k=null;bandCache=null;cancelRequested=false;post('perch-audio-ready',{duration,sampleRate:nativeSampleRate});return;}
  if(message.type==='cancel'){cancelRequested=true;return;}
  if(message.type==='search'){await runSearch(message);return;}
}catch(err){post('perch-error',{error:err&&(err.stack||err.message)?(err.stack||err.message):String(err)});}};
