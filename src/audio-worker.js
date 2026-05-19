'use strict';

let STORE = {
  Sdb: null,
  nFreq: 0,
  nFrames: 0,
  sampleRate: 32000,
  nFft: 1024,
  hopLength: 512,
  freqs: null,
  duration: 0,
  fmin: 0,
  fmax: 16000,
  freqScale: 'linear',
  colormap: 'magma',
};

const EPS = 1e-12;

self.onmessage = (ev) => {
  const msg = ev.data;
  if (!msg || !msg.type) return;
  try {
    if (msg.type === 'build-spectrogram') {
      buildSpectrogram(msg.samples, msg.sampleRate, msg.config);
    } else if (msg.type === 'render-spectrogram') {
      renderStoredSpectrogram(msg.config);
    } else if (msg.type === 'search-embedding') {
      searchEmbedding(msg);
    }
  } catch (err) {
    self.postMessage({ type: 'error', error: err.message || String(err) });
  }
};

function postProgress(message, progress) {
  self.postMessage({ type: 'progress', message, progress });
}

function postSearchProgress(message, progress) {
  self.postMessage({ type: 'search-progress', message, progress });
}

function buildSpectrogram(samples, sampleRate, config) {
  const nFft = config.nFft || 1024;
  const hop = config.hopLength || 512;
  const displayFmin = config.displayFminHz ?? 0;
  const displayFmax = Math.min(config.displayFmaxHz ?? sampleRate / 2, sampleRate / 2);
  const maxWidth = config.maxDisplayWidth || 18000;
  const freqScale = config.freqScale || 'linear';
  const colormap = config.colormap || 'magma';

  const nFrames = Math.max(1, Math.floor((samples.length - nFft) / hop) + 1);
  const half = Math.floor(nFft / 2);
  const binHz = sampleRate / nFft;
  const fStart = Math.max(0, Math.ceil(displayFmin / binHz));
  const fEnd = Math.min(half, Math.floor(displayFmax / binHz));
  const nFreq = fEnd - fStart + 1;
  const freqs = new Float32Array(nFreq);
  for (let i = 0; i < nFreq; i++) freqs[i] = (fStart + i) * binHz;

  postProgress(`Calculando STFT: ${nFrames.toLocaleString()} ventanas...`, 22);

  const win = hannWindow(nFft);
  const S_mag = new Float32Array(nFreq * nFrames);
  const re = new Float32Array(nFft);
  const im = new Float32Array(nFft);
  const bitrev = bitReverseTable(nFft);
  let maxMag = 0;
  const progressEvery = Math.max(1, Math.floor(nFrames / 40));

  for (let frame = 0; frame < nFrames; frame++) {
    const offset = frame * hop;
    for (let i = 0; i < nFft; i++) {
      re[i] = (samples[offset + i] || 0) * win[i];
      im[i] = 0;
    }
    fftInPlace(re, im, bitrev);
    for (let fi = 0; fi < nFreq; fi++) {
      const k = fStart + fi;
      const mag = Math.hypot(re[k], im[k]);
      S_mag[fi * nFrames + frame] = mag;
      if (mag > maxMag) maxMag = mag;
    }
    if (frame % progressEvery === 0) {
      const pct = 22 + Math.round((frame / nFrames) * 44);
      postProgress(`Calculando espectrograma... ${frame.toLocaleString()} / ${nFrames.toLocaleString()}`, pct);
    }
  }

  postProgress('Convirtiendo a decibeles...', 68);
  const ref = Math.max(maxMag, EPS);
  const Sdb = new Float32Array(S_mag.length);
  for (let i = 0; i < S_mag.length; i++) {
    Sdb[i] = 20 * Math.log10((S_mag[i] + 1e-10) / ref);
  }

  STORE = {
    Sdb,
    nFreq,
    nFrames,
    sampleRate,
    nFft,
    hopLength: hop,
    freqs,
    duration: samples.length / sampleRate,
    fmin: freqs[0],
    fmax: freqs[nFreq - 1],
    freqScale,
    colormap,
  };

  postProgress('Renderizando imagen del espectrograma...', 78);
  const width = Math.min(nFrames, maxWidth);
  const height = nFreq;
  const [p5, p995] = robustPercentiles(Sdb, 5, 99.5);
  const image = renderImage(Sdb, nFreq, nFrames, width, height, p5, p995, STORE.fmin, STORE.fmax, freqScale, colormap);

  postProgress('Listo.', 100);
  self.postMessage({
    type: 'spectrogram-ready',
    width,
    height,
    duration: STORE.duration,
    fmin: STORE.fmin,
    fmax: STORE.fmax,
    nFrames,
    nFreq,
    hopLength: hop,
    sampleRate,
    freqScale,
    colormap,
    imageBuffer: image.buffer,
  }, [image.buffer]);
}

function hannWindow(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

function bitReverseTable(n) {
  const bits = Math.round(Math.log2(n));
  const table = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let x = i;
    let y = 0;
    for (let b = 0; b < bits; b++) {
      y = (y << 1) | (x & 1);
      x >>= 1;
    }
    table[i] = y;
  }
  return table;
}

function fftInPlace(re, im, bitrev) {
  const n = re.length;
  for (let i = 0; i < n; i++) {
    const j = bitrev[i];
    if (j > i) {
      let tr = re[i]; re[i] = re[j]; re[j] = tr;
      let ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const theta = -2 * Math.PI / size;
    const wpr = Math.cos(theta);
    const wpi = Math.sin(theta);
    for (let start = 0; start < n; start += size) {
      let wr = 1;
      let wi = 0;
      for (let j = 0; j < half; j++) {
        const even = start + j;
        const odd = even + half;
        const tr = wr * re[odd] - wi * im[odd];
        const ti = wr * im[odd] + wi * re[odd];
        re[odd] = re[even] - tr;
        im[odd] = im[even] - ti;
        re[even] += tr;
        im[even] += ti;
        const nwr = wr * wpr - wi * wpi;
        wi = wr * wpi + wi * wpr;
        wr = nwr;
      }
    }
  }
}

function robustPercentiles(arr, pLow, pHigh) {
  const maxSamples = 400000;
  const step = Math.max(1, Math.floor(arr.length / maxSamples));
  const sample = [];
  for (let i = 0; i < arr.length; i += step) sample.push(arr[i]);
  sample.sort((a, b) => a - b);
  const q = (p) => {
    const idx = Math.max(0, Math.min(sample.length - 1, Math.floor((p / 100) * (sample.length - 1))));
    return sample[idx];
  };
  const lo = q(pLow);
  let hi = q(pHigh);
  if (hi <= lo) hi = lo + 1e-6;
  return [lo, hi];
}

function renderStoredSpectrogram(config = {}) {
  if (!STORE.Sdb) throw new Error('No hay espectrograma para redibujar.');
  const width = Math.min(STORE.nFrames, config.maxDisplayWidth || STORE.nFrames);
  const height = STORE.nFreq;
  const freqScale = config.freqScale || STORE.freqScale || 'linear';
  const colormap = config.colormap || STORE.colormap || 'magma';
  STORE.freqScale = freqScale;
  STORE.colormap = colormap;
  postProgress('Redibujando espectrograma...', 55);
  const [p5, p995] = robustPercentiles(STORE.Sdb, 5, 99.5);
  const image = renderImage(STORE.Sdb, STORE.nFreq, STORE.nFrames, width, height, p5, p995, STORE.fmin, STORE.fmax, freqScale, colormap);
  self.postMessage({
    type: 'spectrogram-image-ready',
    width,
    height,
    fmin: STORE.fmin,
    fmax: STORE.fmax,
    freqScale,
    colormap,
    imageBuffer: image.buffer,
  }, [image.buffer]);
}

function hzToMel(hz) {
  return 2595 * Math.log10(1 + Math.max(0, hz) / 700);
}

function melToHz(mel) {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

function yToFreqForRender(y, height, fmin, fmax, freqScale) {
  if (freqScale === 'mel') {
    const m0 = hzToMel(fmin);
    const m1 = hzToMel(fmax);
    const m = m1 - (y / Math.max(1, height - 1)) * (m1 - m0);
    return melToHz(m);
  }
  return fmax - (y / Math.max(1, height - 1)) * (fmax - fmin);
}

function sampleDbAt(Sdb, nFreq, nFrames, fiFloat, frame) {
  const f0 = Math.max(0, Math.min(nFreq - 1, Math.floor(fiFloat)));
  const f1 = Math.max(0, Math.min(nFreq - 1, f0 + 1));
  const u = Math.max(0, Math.min(1, fiFloat - f0));
  const a = Sdb[f0 * nFrames + frame];
  const b = Sdb[f1 * nFrames + frame];
  return a * (1 - u) + b * u;
}

function colorMapValue(t, colormap) {
  t = clamp01(t);
  if (colormap === 'gray' || colormap === 'grayscale' || colormap === 'bw') {
    const v = Math.round(t * 255);
    return [v, v, v];
  }
  return magmaApprox(t);
}

function renderImage(Sdb, nFreq, nFrames, width, height, vmin, vmax, fmin, fmax, freqScale, colormap) {
  const out = new Uint8ClampedArray(width * height * 4);
  const denom = Math.max(vmax - vmin, 1e-6);
  const binHz = (fmax - fmin) / Math.max(1, nFreq - 1);
  for (let y = 0; y < height; y++) {
    const freq = yToFreqForRender(y, height, fmin, fmax, freqScale);
    const fiFloat = Math.max(0, Math.min(nFreq - 1, (freq - fmin) / Math.max(binHz, 1e-9)));
    for (let x = 0; x < width; x++) {
      const frame = Math.min(nFrames - 1, Math.round((x / Math.max(1, width - 1)) * (nFrames - 1)));
      const db = sampleDbAt(Sdb, nFreq, nFrames, fiFloat, frame);
      const t = clamp01((db - vmin) / denom);
      const [r, g, b] = colorMapValue(t, colormap);
      const idx = (y * width + x) * 4;
      out[idx] = r;
      out[idx + 1] = g;
      out[idx + 2] = b;
      out[idx + 3] = 255;
    }
  }
  return out;
}

function magmaApprox(t) {
  const stops = [
    [0.00, 0, 0, 4],
    [0.13, 28, 16, 68],
    [0.25, 79, 18, 123],
    [0.38, 129, 37, 129],
    [0.52, 181, 54, 122],
    [0.67, 229, 80, 100],
    [0.82, 251, 135, 97],
    [1.00, 252, 253, 191],
  ];
  t = clamp01(t);
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (t >= a[0] && t <= b[0]) {
      const u = (t - a[0]) / (b[0] - a[0]);
      return [
        Math.round(a[1] + (b[1] - a[1]) * u),
        Math.round(a[2] + (b[2] - a[2]) * u),
        Math.round(a[3] + (b[3] - a[3]) * u),
      ];
    }
  }
  return [252, 253, 191];
}

function searchEmbedding(msg) {
  if (!STORE.Sdb) throw new Error('No hay espectrograma en memoria.');
  const roi = msg.roi;
  const metric = msg.metric || 'coseno';
  const threshold = Number(msg.scoreThreshold ?? 0.85);
  const strideSec = Number(msg.strideSec ?? 0.10);
  const maxMatches = Number(msg.maxMatches ?? 500);
  const idx = roiToIndices(roi);
  const [iF0, iF1, iT0, iT1] = idx;
  const h = iF1 - iF0;
  const w = iT1 - iT0;
  if (h < 4 || w < 4) throw new Error(`ROI demasiado pequeño: ${h} x ${w}`);
  postSearchProgress('Extrayendo embedding de la plantilla...', 12);
  const template = extractPatch(iF0, iF1, iT0, iT1);
  const templateEmb = patchToEmbedding(template, h, w, 48);
  const strideFrames = Math.max(1, Math.round(strideSec * STORE.sampleRate / STORE.hopLength));
  const nPositions = STORE.nFrames - w + 1;
  const totalSteps = Math.ceil(nPositions / strideFrames);
  const matches = [];
  const progressEvery = Math.max(1, Math.floor(totalSteps / 50));
  let stepIndex = 0;
  for (let col0 = 0; col0 < nPositions; col0 += strideFrames) {
    const candidate = extractPatch(iF0, iF1, col0, col0 + w);
    const emb = patchToEmbedding(candidate, h, w, 48);
    const score = similarity(templateEmb, emb, metric);
    if (score >= threshold) {
      matches.push({
        tmin: frameToTime(col0),
        tmax: frameToTime(Math.min(STORE.nFrames - 1, col0 + w - 1)),
        fmin: STORE.freqs[iF0],
        fmax: STORE.freqs[Math.min(STORE.nFreq - 1, iF1 - 1)],
        score,
        i_f0: iF0,
        i_f1: iF1,
        i_t0: col0,
        i_t1: col0 + w,
      });
    }
    if (stepIndex % progressEvery === 0) {
      const pct = 15 + Math.round((stepIndex / Math.max(1, totalSteps)) * 75);
      postSearchProgress(`Comparando embeddings... ${stepIndex.toLocaleString()} / ${totalSteps.toLocaleString()}`, pct);
    }
    stepIndex++;
  }
  postSearchProgress('Quitando duplicados cercanos...', 94);
  const kept = nmsTime(matches, Math.max(1, Math.round(w * 0.5))).slice(0, maxMatches);
  self.postMessage({ type: 'search-ready', matches: kept });
}

function roiToIndices(roi) {
  let iT0 = Math.floor((roi.tmin * STORE.sampleRate) / STORE.hopLength);
  let iT1 = Math.ceil((roi.tmax * STORE.sampleRate) / STORE.hopLength);
  iT0 = clampInt(iT0, 0, STORE.nFrames - 1);
  iT1 = clampInt(iT1, iT0 + 1, STORE.nFrames);
  let iF0 = lowerBound(STORE.freqs, roi.fmin);
  let iF1 = upperBound(STORE.freqs, roi.fmax);
  iF0 = clampInt(iF0, 0, STORE.nFreq - 1);
  iF1 = clampInt(iF1, iF0 + 1, STORE.nFreq);
  return [iF0, iF1, iT0, iT1];
}

function extractPatch(iF0, iF1, iT0, iT1) {
  const h = iF1 - iF0;
  const w = iT1 - iT0;
  const patch = new Float32Array(h * w);
  for (let r = 0; r < h; r++) {
    const srcBase = (iF0 + r) * STORE.nFrames + iT0;
    const dstBase = r * w;
    for (let c = 0; c < w; c++) patch[dstBase + c] = STORE.Sdb[srcBase + c];
  }
  return patch;
}

function patchToEmbedding(patch, h, w, outSize) {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < patch.length; i++) {
    const v = patch[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const denom = Math.max(max - min, EPS);
  const out = new Float32Array(outSize * outSize);
  let sum = 0;
  for (let oy = 0; oy < outSize; oy++) {
    const sy = outSize === 1 ? 0 : (oy / (outSize - 1)) * (h - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(h - 1, y0 + 1);
    const fy = sy - y0;
    for (let ox = 0; ox < outSize; ox++) {
      const sx = outSize === 1 ? 0 : (ox / (outSize - 1)) * (w - 1);
      const x0 = Math.floor(sx);
      const x1 = Math.min(w - 1, x0 + 1);
      const fx = sx - x0;
      const v00 = (patch[y0 * w + x0] - min) / denom;
      const v01 = (patch[y0 * w + x1] - min) / denom;
      const v10 = (patch[y1 * w + x0] - min) / denom;
      const v11 = (patch[y1 * w + x1] - min) / denom;
      const v0 = v00 * (1 - fx) + v01 * fx;
      const v1 = v10 * (1 - fx) + v11 * fx;
      const v = v0 * (1 - fy) + v1 * fy;
      const idx = oy * outSize + ox;
      out[idx] = v;
      sum += v;
    }
  }
  const mean = sum / out.length;
  let varSum = 0;
  for (let i = 0; i < out.length; i++) {
    out[i] -= mean;
    varSum += out[i] * out[i];
  }
  const std = Math.sqrt(varSum / out.length) || 1;
  let norm = 0;
  for (let i = 0; i < out.length; i++) {
    out[i] /= std;
    norm += out[i] * out[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function similarity(a, b, metric) {
  if (metric === 'coseno') {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    return dot;
  }
  let d2 = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    d2 += d * d;
  }
  return 1 - (Math.sqrt(d2) / 2);
}

function nmsTime(matches, minSepFrames) {
  matches.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const m of matches) {
    let close = false;
    for (const k of kept) {
      if (Math.abs(m.i_t0 - k.i_t0) < minSepFrames) {
        close = true;
        break;
      }
    }
    if (!close) kept.push(m);
  }
  return kept.sort((a, b) => b.score - a.score);
}

function frameToTime(frame) {
  return (frame * STORE.hopLength) / STORE.sampleRate;
}

function lowerBound(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBound(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function clampInt(x, a, b) { return Math.max(a, Math.min(b, x | 0)); }
