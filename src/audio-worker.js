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
  fmax: 0,
  freqScale: 'linear',
  colormap: 'magma',
  compoundTemplateCache: new Map(),
};

const EPS = 1e-12;

// Barandas internas del autoajuste. No inventan coincidencias:
// solo evitan que el umbral automático se vaya a extremos absurdos.
const AUTO_TARGET_MIN_MATCHES = 3;
const AUTO_TARGET_MAX_MATCHES = 30;
const AUTO_ABSOLUTE_FLOOR = 0.45;

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
    } else if (msg.type === 'warm-compound-template') {
      warmCompoundTemplate(msg);
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
  STORE.compoundTemplateCache = new Map();
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
    compoundTemplateCache: new Map(),
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

function warmCompoundTemplate(msg) {
  if (!STORE.Sdb) return;
  const rawSamples = Array.isArray(msg.samples) ? msg.samples.filter(isValidRoiMsg) : [];
  if (rawSamples.length <= 1) return;
  const estimator = normalizeSampleEstimator(msg.sampleEstimator);
  buildCompoundTemplateSpec(rawSamples, estimator);
  self.postMessage({ type: 'compound-template-warmed', key: msg.key || '' });
}

function searchEmbedding(msg) {
  if (!STORE.Sdb) throw new Error('No hay espectrograma en memoria.');
  const roi = msg.roi;
  const metric = msg.metric || 'coseno';
  const autoAdjust = Boolean(msg.autoAdjust);
  let threshold = Number(msg.scoreThreshold ?? 0.85);
  let strideSec = Number(msg.strideSec ?? 0.10);
  const maxMatches = Number(msg.maxMatches ?? 500);
  const rawSamples = Array.isArray(msg.samples) ? msg.samples.filter(isValidRoiMsg) : [];
  const useMulti = Boolean(msg.useMultiSamples) && rawSamples.length > 0;
  const estimator = normalizeSampleEstimator(msg.sampleEstimator);

  const templateSpec = useMulti
    ? buildCompoundTemplateSpec(rawSamples, estimator)
    : buildSingleTemplateSpec(roi);

  const { iF0, iF1, iT0, iT1, h, w, template, roiDuration } = templateSpec;
  if (h < 4 || w < 4) throw new Error(`Plantilla demasiado pequeña: ${h} x ${w}`);

  if (autoAdjust) {
    strideSec = autoStrideFromDuration(roiDuration);
  }

  const useTemporalNcc = metric === 'correlacion_cruzada';
  const useNcc2d = metric === 'correlacion_cruzada_2d';
  const useNcc2dMultiScale = metric === 'correlacion_2d_multiescala';
  const usesLocalComparison = useTemporalNcc || useNcc2d || useNcc2dMultiScale;
  const localMethodLabel = useNcc2dMultiScale ? 'correlación 2D multi-escala' : (useNcc2d ? 'correlación cruzada 2D' : (useTemporalNcc ? 'correlación cruzada' : ''));
  postSearchProgress(autoAdjust ? 'Autoajustando separación entre ventanas...' : (usesLocalComparison ? `Preparando ${localMethodLabel}...` : 'Extrayendo embedding de la plantilla...'), 12);
  const templateEmbeddings = !usesLocalComparison
    ? (templateSpec.templateEmbeddings && templateSpec.templateEmbeddings.length
      ? templateSpec.templateEmbeddings
      : [patchToEmbedding(template, h, w, 48)])
    : null;
  const nccOutSize = useNcc2dMultiScale ? 24 : 28;
  const templateNcc = usesLocalComparison ? patchToNccArray(template, h, w, nccOutSize) : null;
  const strideFrames = Math.max(1, Math.round(strideSec * STORE.sampleRate / STORE.hopLength));
  const nPositions = STORE.nFrames - w + 1;
  const totalSteps = Math.ceil(nPositions / strideFrames);
  const candidates = [];
  const progressEvery = Math.max(1, Math.floor(totalSteps / 50));
  let stepIndex = 0;

  for (let col0 = 0; col0 < nPositions; col0 += strideFrames) {
    const candidate = extractPatch(iF0, iF1, col0, col0 + w);
    let score = -Infinity;
    if (useTemporalNcc) {
      score = temporalNccScore(templateNcc, candidate, h, w, nccOutSize);
    } else if (useNcc2dMultiScale) {
      score = ncc2dMultiScaleScore(templateNcc, candidate, h, w, nccOutSize);
    } else if (useNcc2d) {
      score = ncc2dScore(templateNcc, candidate, h, w, nccOutSize);
    } else {
      const emb = patchToEmbedding(candidate, h, w, 48);
      for (const templateEmb of templateEmbeddings) {
        score = Math.max(score, similarity(templateEmb, emb, metric));
      }
    }
    candidates.push({
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

    if (stepIndex % progressEvery === 0) {
      const pct = 15 + Math.round((stepIndex / Math.max(1, totalSteps)) * 70);
      const progressLabel = useNcc2dMultiScale ? 'Correlación 2D multi-escala' : (useNcc2d ? 'Correlación cruzada 2D' : (useTemporalNcc ? 'Correlación cruzada temporal' : 'Comparando embeddings'));
      postSearchProgress(`${progressLabel}... ${stepIndex.toLocaleString()} / ${totalSteps.toLocaleString()}`, pct);
    }
    stepIndex++;
  }

  postSearchProgress(autoAdjust ? 'Detectando picos/islas y estimando umbral...' : 'Quitando duplicados cercanos...', 88);

  const validCandidates = candidates.filter(m => Number.isFinite(m.score) && m.score > 0);
  const manualSepFrames = Math.max(1, Math.round(w * 0.5));
  const autoSepFrames = autoMinSeparationFrames(w, roiDuration);
  const minSepFrames = autoAdjust ? autoSepFrames : manualSepFrames;

  // Primero convertimos la curva densa de scores en eventos/picos temporales.
  // Esto evita que ventanas consecutivas de un mismo evento generen decenas de cajas.
  const rankedAll = nmsTime(validCandidates, minSepFrames);

  let auto = null;
  let rankedForThreshold = rankedAll;
  let targetMin = null;
  let targetMax = null;
  if (autoAdjust) {
    targetMin = AUTO_TARGET_MIN_MATCHES;
    targetMax = autoTargetMaxMatches(STORE.duration);

    // Para estimar el umbral no dejamos que la propia plantilla marcada domine el cálculo.
    // La plantilla sí puede aparecer luego como match si supera el umbral final.
    rankedForThreshold = rankedAll.filter(m => !overlapsTemplate(m, iT0, iT1, 0.35));
    if (rankedForThreshold.length === 0) rankedForThreshold = rankedAll;

    const estimate = estimateAutoThreshold(rankedForThreshold.map(m => m.score), {
      targetMin,
      targetMax,
      absoluteFloor: AUTO_ABSOLUTE_FLOOR,
    });
    threshold = estimate.threshold;
    auto = {
      scoreThreshold: threshold,
      strideSec,
      method: useMulti ? `plantilla compuesta (${sampleEstimatorLabel(estimator)}) + ${comparisonMethodLabel(metric)} + picos/codo robusto` : `${comparisonMethodLabel(metric)} + picos/codo robusto + límites de candidatos`,
      candidatesEvaluated: candidates.length,
      rankedCandidates: rankedAll.length,
      rankedForThreshold: rankedForThreshold.length,
      targetMinMatches: targetMin,
      targetMaxMatches: targetMax,
      minSeparationSec: framesToSeconds(minSepFrames),
      elbowThreshold: estimate.elbow,
      noiseThreshold: estimate.noise,
      relativeThreshold: estimate.relative,
      countAtThreshold: estimate.countAtThreshold,
    };
  }

  const limit = autoAdjust ? Math.min(maxMatches, targetMax || AUTO_TARGET_MAX_MATCHES) : maxMatches;
  const kept = rankedAll.filter(m => m.score >= threshold).slice(0, limit);
  self.postMessage({ type: 'search-ready', matches: kept, auto });
}
function isValidRoiMsg(roi) {
  return Boolean(roi && Number.isFinite(Number(roi.tmin)) && Number.isFinite(Number(roi.tmax)) && Number.isFinite(Number(roi.fmin)) && Number.isFinite(Number(roi.fmax)) && Number(roi.tmax) > Number(roi.tmin) && Number(roi.fmax) > Number(roi.fmin));
}

function buildSingleTemplateSpec(roi) {
  const idx = roiToIndices(roi);
  const [iF0, iF1, iT0, iT1] = idx;
  const h = iF1 - iF0;
  const w = iT1 - iT0;
  return {
    iF0, iF1, iT0, iT1, h, w,
    roiDuration: Math.max(0.001, roi.tmax - roi.tmin),
    template: extractPatch(iF0, iF1, iT0, iT1),
  };
}

function percentileNum(values, q) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const pos = clamp(q, 0, 1) * (clean.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(clean.length - 1, lo + 1);
  const u = pos - lo;
  return clean[lo] * (1 - u) + clean[hi] * u;
}

function normalizeSampleEstimator(value) {
  if (value === 'mean') return 'mean';
  if (value === 'median') return 'median';
  if (value === 'medoid') return 'medoid';
  if (value === 'consensus_ncc') return 'consensus_ncc';
  if (value === 'weighted_consensus') return 'weighted_consensus';
  return 'consensus_ncc';
}


function comparisonMethodLabel(value) {
  if (value === 'coseno') return 'coseno';
  if (value === 'correlacion') return 'correlación normalizada';
  if (value === 'euclidiana') return 'euclidiana normalizada';
  if (value === 'correlacion_cruzada') return 'correlación cruzada';
  if (value === 'correlacion_cruzada_2d') return 'correlación cruzada 2D';
  if (value === 'correlacion_2d_multiescala') return 'correlación 2D multi-escala';
  return 'coseno';
}

function sampleEstimatorLabel(value) {
  if (value === 'mean') return 'promedio alineado';
  if (value === 'median') return 'mediana alineada';
  if (value === 'medoid') return 'medoide';
  if (value === 'consensus_ncc') return 'consenso NCC';
  if (value === 'weighted_consensus') return 'consenso ponderado';
  return 'consenso NCC';
}

function roiCachePart(roi) {
  return [roi.tmin, roi.tmax, roi.fmin, roi.fmax]
    .map(v => Number(v).toFixed(4))
    .join(',');
}

function compoundSpecCacheKey(samples, estimator) {
  const valid = samples.filter(isValidRoiMsg);
  const sampleKey = valid.map(roiCachePart).join('|');
  return [
    estimator || 'consensus_ncc',
    STORE.nFreq,
    STORE.nFrames,
    STORE.sampleRate,
    STORE.hopLength,
    STORE.fmin,
    STORE.fmax,
    sampleKey,
  ].join('::');
}

function buildCompoundTemplateSpec(samples, estimator) {
  const valid = samples.filter(isValidRoiMsg);
  if (!valid.length) throw new Error('No hay muestras válidas para la plantilla compuesta.');
  if (valid.length === 1) return buildSingleTemplateSpec(valid[0]);

  const cacheKey = compoundSpecCacheKey(valid, estimator);
  const cached = STORE.compoundTemplateCache && STORE.compoundTemplateCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const fmin = percentileNum(valid.map(s => Number(s.fmin)), 0.10);
  const fmax = percentileNum(valid.map(s => Number(s.fmax)), 0.90);
  const duration = Math.max(...valid.map(s => Math.max(0.001, Number(s.tmax) - Number(s.tmin))));
  let iF0 = lowerBound(STORE.freqs, Math.min(fmin, fmax));
  let iF1 = upperBound(STORE.freqs, Math.max(fmin, fmax));
  iF0 = clampInt(iF0, 0, STORE.nFreq - 1);
  iF1 = clampInt(iF1, iF0 + 1, STORE.nFreq);
  const h = iF1 - iF0;
  const w = Math.max(4, Math.round((duration * STORE.sampleRate) / STORE.hopLength));

  let template;
  let templateEmbeddings = null;

  if (estimator === 'medoid') {
    // Medoide rápido: no necesita alineación NCC completa. Escoge una muestra real
    // representativa con embeddings 48x48, así se siente casi instantáneo y no borra detalles.
    const rawPatches = buildCenteredSamplePatches(valid, h, w);
    const idx = medoidIndexForPatches(rawPatches, h, w);
    template = rawPatches[idx];
  } else {
    const aligned = buildAlignedSamplePatches(valid, h, w);
    const patches = aligned.patches;
    if (estimator === 'weighted_consensus') {
      template = weightedConsensusPatches(patches, h, w, aligned.weights || []);
    } else if (estimator === 'consensus_ncc') {
      template = combinePatches(patches, h, w, 'consensus_ncc');
    } else {
      template = combinePatches(patches, h, w, estimator);
    }
  }

  const ref = valid[valid.length - 1];
  const idx = roiToIndices(ref);
  const iT0 = idx[2];
  const iT1 = Math.min(STORE.nFrames, iT0 + w);
  const spec = { iF0, iF1, iT0, iT1, h, w, roiDuration: duration, template, templateEmbeddings };
  if (STORE.compoundTemplateCache) {
    if (STORE.compoundTemplateCache.size > 80) STORE.compoundTemplateCache.clear();
    STORE.compoundTemplateCache.set(cacheKey, spec);
  }
  return spec;
}

function buildCenteredSamplePatches(valid, h, w) {
  const patches = [];
  for (const sample of valid) {
    const centroid = energyCentroidForRoi(sample);
    const startT = Math.round(centroid.tFrame - w / 2);
    const startF = Math.round(centroid.fBin - h / 2);
    patches.push(extractPatchPadded(startF, startF + h, startT, startT + w));
  }
  return patches;
}

function buildAlignedSamplePatches(valid, h, w) {
  const initial = [];
  for (const sample of valid) {
    const centroid = energyCentroidForRoi(sample);
    const cT = centroid.tFrame;
    const cF = centroid.fBin;
    const startT = Math.round(cT - w / 2);
    const startF = Math.round(cF - h / 2);
    initial.push({ startF, startT, patch: extractPatchPadded(startF, startF + h, startT, startT + w) });
  }

  // Elegimos una referencia real representativa antes de alinear: evita que una muestra rara
  // fuerce el promedio. Luego alineamos por máxima coincidencia ponderada en una vecindad local.
  const refIdx = medoidIndexForPatches(initial.map(x => x.patch), h, w);
  const refPatch = initial[refIdx].patch;
  const maxShiftF = Math.max(1, Math.min(12, Math.round(h * 0.22)));
  const maxShiftT = Math.max(1, Math.min(18, Math.round(w * 0.22)));
  const patches = [];
  const weights = [];

  for (let k = 0; k < initial.length; k++) {
    const base = initial[k];
    if (k === refIdx) {
      patches.push(base.patch);
      weights.push(1);
      continue;
    }
    let bestPatch = base.patch;
    let bestScore = weightedPatchSimilarity(refPatch, bestPatch, h, w);
    for (let df = -maxShiftF; df <= maxShiftF; df++) {
      for (let dt = -maxShiftT; dt <= maxShiftT; dt++) {
        if (df === 0 && dt === 0) continue;
        const cand = extractPatchPadded(base.startF + df, base.startF + df + h, base.startT + dt, base.startT + dt + w);
        const score = weightedPatchSimilarity(refPatch, cand, h, w);
        if (score > bestScore) {
          bestScore = score;
          bestPatch = cand;
        }
      }
    }
    patches.push(bestPatch);
    weights.push(Math.max(0.05, clamp01((bestScore + 1) / 2)));
  }
  return { patches, refIdx, weights };
}

function weightedPatchSimilarity(a, b, h, w) {
  const na = normalizePatch01(a);
  const nb = normalizePatch01(b);
  const thrA = percentileNum(Array.from(na), 0.72);
  const thrB = percentileNum(Array.from(nb), 0.72);
  let sumW = 0, ma = 0, mb = 0;
  for (let i = 0; i < na.length; i++) {
    const wa = Math.max(0, na[i] - thrA);
    const wb = Math.max(0, nb[i] - thrB);
    const weight = Math.max(wa, wb) + 1e-3;
    sumW += weight;
    ma += weight * na[i];
    mb += weight * nb[i];
  }
  if (sumW <= EPS) return 0;
  ma /= sumW; mb /= sumW;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < na.length; i++) {
    const wa = Math.max(0, na[i] - thrA);
    const wb = Math.max(0, nb[i] - thrB);
    const weight = Math.max(wa, wb) + 1e-3;
    const xa = na[i] - ma;
    const xb = nb[i] - mb;
    num += weight * xa * xb;
    da += weight * xa * xa;
    db += weight * xb * xb;
  }
  return num / (Math.sqrt(da * db) + EPS);
}

function normalizePatch01(patch) {
  let min = Infinity, max = -Infinity;
  for (const v of patch) { if (v < min) min = v; if (v > max) max = v; }
  const denom = Math.max(max - min, EPS);
  const out = new Float32Array(patch.length);
  for (let i = 0; i < patch.length; i++) out[i] = (patch[i] - min) / denom;
  return out;
}

function medoidIndexForPatches(patches, h, w) {
  if (patches.length <= 1) return 0;
  const embs = patches.map(p => patchToEmbedding(p, h, w, 48));
  let bestIdx = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < embs.length; i++) {
    let sum = 0;
    for (let j = 0; j < embs.length; j++) {
      if (i === j) continue;
      sum += similarity(embs[i], embs[j], 'coseno');
    }
    if (sum > bestScore) {
      bestScore = sum;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function energyCentroidForRoi(roi) {
  const [iF0, iF1, iT0, iT1] = roiToIndices(roi);
  const patch = extractPatch(iF0, iF1, iT0, iT1);
  let vals = [];
  const step = Math.max(1, Math.floor(patch.length / 2000));
  for (let i = 0; i < patch.length; i += step) vals.push(patch[i]);
  vals.sort((a, b) => a - b);
  const thr = vals.length ? vals[Math.floor(vals.length * 0.75)] : -80;
  const h = iF1 - iF0;
  const w = iT1 - iT0;
  let sumW = 0, sumT = 0, sumF = 0;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const v = patch[r * w + c];
      const wt = Math.max(0, v - thr);
      if (wt > 0) {
        sumW += wt;
        sumT += (iT0 + c) * wt;
        sumF += (iF0 + r) * wt;
      }
    }
  }
  if (sumW <= EPS) {
    return { tFrame: (iT0 + iT1) / 2, fBin: (iF0 + iF1) / 2 };
  }
  return { tFrame: sumT / sumW, fBin: sumF / sumW };
}

function extractPatchPadded(iF0, iF1, iT0, iT1) {
  const h = iF1 - iF0;
  const w = iT1 - iT0;
  const patch = new Float32Array(h * w);
  for (let r = 0; r < h; r++) {
    const srcF = iF0 + r;
    for (let c = 0; c < w; c++) {
      const srcT = iT0 + c;
      let v = -120;
      if (srcF >= 0 && srcF < STORE.nFreq && srcT >= 0 && srcT < STORE.nFrames) {
        v = STORE.Sdb[srcF * STORE.nFrames + srcT];
      }
      patch[r * w + c] = v;
    }
  }
  return patch;
}

function combinePatches(patches, h, w, estimator) {
  if (!patches.length) return new Float32Array(h * w);
  if (patches.length === 1) return patches[0];
  if (estimator === 'medoid') return patches[medoidIndexForPatches(patches, h, w)];
  const out = new Float32Array(h * w);
  for (let i = 0; i < out.length; i++) {
    if (estimator === 'mean') {
      let s = 0;
      for (const p of patches) s += p[i];
      out[i] = s / patches.length;
    } else if (estimator === 'consensus_ncc') {
      const vals = patches.map(p => p[i]).sort((a, b) => a - b);
      out[i] = quantileSortedNum(vals, 0.70);
    } else {
      const vals = patches.map(p => p[i]).sort((a, b) => a - b);
      const mid = Math.floor(vals.length / 2);
      out[i] = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
    }
  }
  return out;
}


function weightedConsensusPatches(patches, h, w, weights) {
  if (!patches.length) return new Float32Array(h * w);
  if (patches.length === 1) return patches[0];
  const cleanWeights = patches.map((_, i) => Math.max(0.05, Number(weights[i] ?? 1)));
  const sumW = cleanWeights.reduce((a, b) => a + b, 0) || 1;
  const out = new Float32Array(h * w);
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (let k = 0; k < patches.length; k++) s += (cleanWeights[k] / sumW) * patches[k][i];
    out[i] = s;
  }
  return out;
}

function quantileSortedNum(values, q) {
  if (!values.length) return 0;
  const pos = clamp(q, 0, 1) * (values.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(values.length - 1, lo + 1);
  const u = pos - lo;
  return values[lo] * (1 - u) + values[hi] * u;
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


function patchToNccArray(patch, h, w, outSize) {
  // Representación reducida para correlación cruzada local. Es distinta del
  // embedding: conserva una imagen normalizada 0-1 sobre la que se prueban
  // pequeños desplazamientos internos.
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < patch.length; i++) {
    const v = patch[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const denom = Math.max(max - min, EPS);
  const out = new Float32Array(outSize * outSize);
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
      out[oy * outSize + ox] = v0 * (1 - fy) + v1 * fy;
    }
  }
  return out;
}

function temporalNccScore(templateReduced, candidatePatch, h, w, outSize) {
  // Correlación cruzada temporal: solo permite pequeños desplazamientos horizontales.
  const cand = patchToNccArray(candidatePatch, h, w, outSize);
  const maxShiftT = Math.max(1, Math.min(6, Math.round(outSize * 0.14)));
  let best = -Infinity;
  for (let dx = -maxShiftT; dx <= maxShiftT; dx++) {
    const ncc = weightedNccOverlap(templateReduced, cand, outSize, dx, 0);
    const penalty = Math.exp(-0.08 * Math.abs(dx));
    const score = ncc * penalty;
    if (score > best) best = score;
  }
  // Para mantener la UI unificada, todos los métodos devuelven score 0-1.
  // Una correlación negativa no representa similitud útil.
  return clamp01(best);
}

function ncc2dScore(templateReduced, candidatePatch, h, w, outSize) {
  // Correlación cruzada 2D: prueba desplazamientos pequeños en tiempo y frecuencia.
  // El margen frecuencial es más conservador para evitar falsos positivos por desplazamientos grandes.
  const cand = patchToNccArray(candidatePatch, h, w, outSize);
  const maxShiftT = Math.max(1, Math.min(6, Math.round(outSize * 0.14)));
  const maxShiftF = Math.max(1, Math.min(4, Math.round(outSize * 0.09)));
  return ncc2dReducedScore(templateReduced, cand, outSize, maxShiftT, maxShiftF, 0.075, 0.115);
}

function ncc2dMultiScaleScore(templateReduced, candidatePatch, h, w, outSize) {
  // Correlación 2D multi-escala: además de pequeños desplazamientos en tiempo/frecuencia,
  // prueba deformaciones globales conservadoras de duración y ancho frecuencial.
  // No es un warping libre: son pocas escalas controladas y penalizadas.
  const timeScales = [0.88, 1.00, 1.12];
  const freqScales = [0.92, 1.00, 1.08];
  const maxShiftT = Math.max(1, Math.min(5, Math.round(outSize * 0.12)));
  const maxShiftF = Math.max(1, Math.min(3, Math.round(outSize * 0.08)));
  let best = -Infinity;
  for (const st of timeScales) {
    for (const sf of freqScales) {
      const cand = patchToNccArrayScaled(candidatePatch, h, w, outSize, st, sf);
      const local = ncc2dReducedScore(templateReduced, cand, outSize, maxShiftT, maxShiftF, 0.075, 0.115);
      const scalePenalty = Math.exp(-1.25 * Math.abs(st - 1) - 1.75 * Math.abs(sf - 1));
      const score = local * scalePenalty;
      if (score > best) best = score;
    }
  }
  return clamp01(best);
}

function ncc2dReducedScore(templateReduced, candReduced, outSize, maxShiftT, maxShiftF, penaltyT, penaltyF) {
  let best = -Infinity;
  for (let dy = -maxShiftF; dy <= maxShiftF; dy++) {
    for (let dx = -maxShiftT; dx <= maxShiftT; dx++) {
      const ncc = weightedNccOverlap(templateReduced, candReduced, outSize, dx, dy);
      const penalty = Math.exp(-penaltyT * Math.abs(dx) - penaltyF * Math.abs(dy));
      const score = ncc * penalty;
      if (score > best) best = score;
    }
  }
  return clamp01(best);
}

function patchToNccArrayScaled(patch, h, w, outSize, scaleT, scaleF) {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < patch.length; i++) {
    const v = patch[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const denom = Math.max(max - min, EPS);
  const out = new Float32Array(outSize * outSize);
  const cxOut = (outSize - 1) / 2;
  const cyOut = (outSize - 1) / 2;
  const cxSrc = (w - 1) / 2;
  const cySrc = (h - 1) / 2;
  for (let oy = 0; oy < outSize; oy++) {
    const baseY = outSize === 1 ? 0 : (oy / (outSize - 1)) * (h - 1);
    let sy = cySrc + (baseY - cySrc) * scaleF;
    sy = clamp(sy, 0, h - 1);
    const y0 = Math.floor(sy);
    const y1 = Math.min(h - 1, y0 + 1);
    const fy = sy - y0;
    for (let ox = 0; ox < outSize; ox++) {
      const baseX = outSize === 1 ? 0 : (ox / (outSize - 1)) * (w - 1);
      let sx = cxSrc + (baseX - cxSrc) * scaleT;
      sx = clamp(sx, 0, w - 1);
      const x0 = Math.floor(sx);
      const x1 = Math.min(w - 1, x0 + 1);
      const fx = sx - x0;
      const v00 = (patch[y0 * w + x0] - min) / denom;
      const v01 = (patch[y0 * w + x1] - min) / denom;
      const v10 = (patch[y1 * w + x0] - min) / denom;
      const v11 = (patch[y1 * w + x1] - min) / denom;
      const v0 = v00 * (1 - fx) + v01 * fx;
      const v1 = v10 * (1 - fx) + v11 * fx;
      out[oy * outSize + ox] = v0 * (1 - fy) + v1 * fy;
    }
  }
  return out;
}

function weightedNccOverlap(a, b, n, dx, dy) {
  const x0a = Math.max(0, -dx);
  const x1a = Math.min(n, n - dx);
  const y0a = Math.max(0, -dy);
  const y1a = Math.min(n, n - dy);
  let sumW = 0, ma = 0, mb = 0;
  for (let y = y0a; y < y1a; y++) {
    const yb = y + dy;
    for (let x = x0a; x < x1a; x++) {
      const xb = x + dx;
      const va = a[y * n + x];
      const vb = b[yb * n + xb];
      const weight = Math.max(0.03, Math.max(va - 0.55, vb - 0.55));
      sumW += weight;
      ma += weight * va;
      mb += weight * vb;
    }
  }
  if (sumW <= EPS) return -1;
  ma /= sumW;
  mb /= sumW;
  let num = 0, da = 0, db = 0;
  for (let y = y0a; y < y1a; y++) {
    const yb = y + dy;
    for (let x = x0a; x < x1a; x++) {
      const xb = x + dx;
      const va0 = a[y * n + x];
      const vb0 = b[yb * n + xb];
      const weight = Math.max(0.03, Math.max(va0 - 0.55, vb0 - 0.55));
      const va = va0 - ma;
      const vb = vb0 - mb;
      num += weight * va * vb;
      da += weight * va * va;
      db += weight * vb * vb;
    }
  }
  return num / (Math.sqrt(da * db) + EPS);
}

function similarity(a, b, metric) {
  if (metric === 'coseno' || metric === 'correlacion') {
    let dot = 0;
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
    // Los embeddings ya están centrados y normalizados. Para la interfaz usamos score 0-1.
    return clamp01(dot);
  }
  let d2 = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    d2 += d * d;
  }
  // Como los vectores están normalizados L2, la distancia máxima útil es cercana a 2.
  return clamp01(1 - (Math.sqrt(d2) / 2));
}

function autoStrideFromDuration(durationSec) {
  // Ventanas largas no necesitan pasos diminutos; ventanas cortas sí.
  // El mínimo 0.05 s permite no saltarse eventos cortos, pero el agrupamiento posterior evita el efecto peine.
  return clamp(0.15 * durationSec, 0.05, 0.30);
}

function framesToSeconds(frames) {
  return (frames * STORE.hopLength) / STORE.sampleRate;
}

function secondsToFrames(sec) {
  return Math.max(1, Math.round(sec * STORE.sampleRate / STORE.hopLength));
}

function autoMinSeparationFrames(templateWidthFrames, roiDurationSec) {
  // Agrupa ventanas que representan el mismo evento acústico.
  // Usamos al menos una duración de plantilla y nunca menos de 0.45 s.
  const byTemplate = Math.round(templateWidthFrames * 1.0);
  const bySeconds = secondsToFrames(Math.max(0.45, roiDurationSec * 0.85));
  return Math.max(1, byTemplate, bySeconds);
}

function autoTargetMaxMatches(durationSec) {
  // Límite para el modo automático, no límite técnico de dibujo.
  // En clips cortos mantenemos pocos candidatos; en audios largos permitimos más,
  // pero sin convertir el resultado en una nube de cajas.
  return clampInt(Math.round(durationSec / 12), 8, AUTO_TARGET_MAX_MATCHES);
}

function percentileAsc(sortedAsc, p) {
  if (!sortedAsc.length) return 0;
  const q = clamp(p, 0, 1);
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor((sortedAsc.length - 1) * q)));
  return sortedAsc[idx];
}

function median(values) {
  if (!values.length) return 0;
  const a = [...values].sort((x, y) => x - y);
  return percentileAsc(a, 0.5);
}

function mad(values, med) {
  if (!values.length) return 0;
  const deviations = values.map(v => Math.abs(v - med)).sort((x, y) => x - y);
  return percentileAsc(deviations, 0.5);
}

function estimateElbowThreshold(scores) {
  const clean = scores
    .filter(v => Number.isFinite(v))
    .map(v => clamp01(v))
    .sort((a, b) => b - a);

  if (clean.length === 0) return 0.85;
  if (clean.length < 6) return clamp(clean[0] * 0.80, AUTO_ABSOLUTE_FLOOR, 0.95);

  const top = clean.slice(0, Math.min(clean.length, 600));
  const sMax = top[0];
  const sMin = top[top.length - 1];

  if (Math.abs(sMax - sMin) < 1e-6) return clamp(sMax * 0.80, AUTO_ABSOLUTE_FLOOR, 0.95);

  // Distancia máxima a la recta entre el primer y último punto de la curva ordenada.
  const x1 = 0, y1 = sMax;
  const x2 = top.length - 1, y2 = sMin;
  const den = Math.sqrt((y2 - y1) ** 2 + (x2 - x1) ** 2) || 1;
  let bestIdx = 0;
  let bestDist = -Infinity;
  for (let i = 1; i < top.length - 1; i++) {
    const x0 = i, y0 = top[i];
    const dist = Math.abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1) / den;
    if (dist > bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  return clamp(top[bestIdx], AUTO_ABSOLUTE_FLOOR, 0.98);
}

function estimateAutoThreshold(scores, opts = {}) {
  const targetMin = opts.targetMin ?? AUTO_TARGET_MIN_MATCHES;
  const targetMax = opts.targetMax ?? AUTO_TARGET_MAX_MATCHES;
  const absoluteFloor = opts.absoluteFloor ?? AUTO_ABSOLUTE_FLOOR;

  const clean = scores
    .filter(v => Number.isFinite(v))
    .map(v => clamp01(v))
    .sort((a, b) => b - a);

  if (clean.length === 0) {
    return {
      threshold: 0.85,
      elbow: 0.85,
      noise: 0.85,
      relative: 0.85,
      countAtThreshold: 0,
    };
  }

  const sMax = clean[0];
  const ascending = [...clean].sort((a, b) => a - b);
  const med = median(ascending);
  const robustMad = mad(ascending, med);
  const elbow = estimateElbowThreshold(clean);
  const noise = clamp(med + 2.5 * robustMad, absoluteFloor, 0.98);
  const relative = clamp(sMax * 0.75, absoluteFloor, 0.98);

  // Umbral inicial: razonable, no pegado al máximo.
  let threshold = Math.max(absoluteFloor, elbow, noise, relative);

  // Si el umbral inicial deja demasiados candidatos, subimos hasta el corte de N_MAX.
  if (clean.length >= targetMax) {
    const cutMax = clean[Math.max(0, targetMax - 1)];
    if (countAtOrAbove(clean, threshold) > targetMax) {
      threshold = Math.max(threshold, cutMax);
    }
  }

  // Si el umbral inicial deja menos de N_MIN, bajamos solo hasta donde existan
  // candidatos razonables por encima del piso absoluto. No se inventan coincidencias.
  if (clean.length >= targetMin) {
    const cutMin = clean[Math.max(0, targetMin - 1)];
    if (countAtOrAbove(clean, threshold) < targetMin && cutMin >= absoluteFloor) {
      threshold = Math.min(threshold, cutMin);
    }
  }

  threshold = clamp(threshold, absoluteFloor, 0.98);

  return {
    threshold,
    elbow,
    noise,
    relative,
    countAtThreshold: countAtOrAbove(clean, threshold),
  };
}

function countAtOrAbove(sortedDesc, threshold) {
  let n = 0;
  for (const v of sortedDesc) {
    if (v >= threshold) n++;
    else break;
  }
  return n;
}

function overlapsTemplate(match, iT0, iT1, minOverlapRatio = 0.35) {
  const a0 = match.i_t0;
  const a1 = match.i_t1;
  const overlap = Math.max(0, Math.min(a1, iT1) - Math.max(a0, iT0));
  const templateWidth = Math.max(1, iT1 - iT0);
  return (overlap / templateWidth) >= minOverlapRatio;
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

function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function clampInt(x, a, b) { return Math.max(a, Math.min(b, x | 0)); }
