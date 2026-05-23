'use strict';

const CONFIG = {
  targetSampleRate: 32000,
  nFft: 1024,
  hopLength: 512,
  displayFminHz: 0,
  displayFmaxHz: 16000,
  maxDisplayWidth: 18000,
  freqScale: 'linear',
  colormap: 'magma',
  embSize: 48,
  maxMatchesToDraw: 300,
  maxMatchesToStore: 500,
  freqAxisW: 108,
  timeAxisH: 30,
};

const state = {
  file: null,
  objectUrl: null,
  audioBuffer: null,
  samples: null,
  sampleRate: CONFIG.targetSampleRate,
  duration: 0,
  spectrogramReady: false,
  display: null,
  roi: null,
  savedRoi: null,
  matches: [],
  tableSort: { key: 'score', dir: 'desc' },
  worker: null,
  dragging: false,
  moved: false,
  startX: 0,
  startY: 0,
  rafId: null,
};

const el = {
  appShell: document.getElementById('appShell'),
  btnOpenAudio: document.getElementById('btnOpenAudio'),
  btnExportCsv: document.getElementById('btnExportCsv'),
  btnExportXlsx: document.getElementById('btnExportXlsx'),
  btnExportTxt: document.getElementById('btnExportTxt'),
  btnModalUpload: document.getElementById('btnModalUpload'),
  fileInput: document.getElementById('fileInput'),
  welcomeModal: document.getElementById('welcomeModal'),
  processingOverlay: document.getElementById('processingOverlay'),
  processingTitle: document.getElementById('processingTitle'),
  processingText: document.getElementById('processingText'),
  processingBar: document.getElementById('processingBar'),
  dropZone: document.getElementById('dropZone'),
  toastHost: document.getElementById('toastHost'),
  audioName: document.getElementById('audioName'),
  audioInfo: document.getElementById('audioInfo'),
  freqScaleSelect: document.getElementById('freqScaleSelect'),
  colormapSelect: document.getElementById('colormapSelect'),
  audioPlayer: document.getElementById('audioPlayer'),
  spectrogramTitle: document.getElementById('spectrogramTitle'),
  workflowBadge: document.getElementById('workflowBadge'),
  viewerHint: document.getElementById('viewerHint'),
  followPlayback: document.getElementById('followPlayback'),
  btnCenterPlayhead: document.getElementById('btnCenterPlayhead'),
  spectrogramViewport: document.getElementById('spectrogramViewport'),
  emptyViewer: document.getElementById('emptyViewer'),
  spectrogramStage: document.getElementById('spectrogramStage'),
  freqAxisCanvas: document.getElementById('freqAxisCanvas'),
  timeAxisCanvas: document.getElementById('timeAxisCanvas'),
  spectrogramCanvas: document.getElementById('spectrogramCanvas'),
  overlayCanvas: document.getElementById('overlayCanvas'),
  canvasLayer: document.getElementById('canvasLayer'),
  playhead: document.getElementById('playhead'),
  coachTitle: document.getElementById('coachTitle'),
  coachText: document.getElementById('coachText'),
  roiTmin: document.getElementById('roiTmin'),
  roiTmax: document.getElementById('roiTmax'),
  roiFmin: document.getElementById('roiFmin'),
  roiFmax: document.getElementById('roiFmax'),
  roiLabel: document.getElementById('roiLabel'),
  btnApplyRoi: document.getElementById('btnApplyRoi'),
  btnSaveRoi: document.getElementById('btnSaveRoi'),
  btnClearRoi: document.getElementById('btnClearRoi'),
  roiSummary: document.getElementById('roiSummary'),
  metricSelect: document.getElementById('metricSelect'),
  scoreThreshold: document.getElementById('scoreThreshold'),
  scoreThresholdInput: document.getElementById('scoreThresholdInput'),
  strideSec: document.getElementById('strideSec'),
  strideSecInput: document.getElementById('strideSecInput'),
  autoAdjustParams: document.getElementById('autoAdjustParams'),
  infoDots: Array.from(document.querySelectorAll('.info-dot')),
  btnSearch: document.getElementById('btnSearch'),
  btnClearMatches: document.getElementById('btnClearMatches'),
  matchSummary: document.getElementById('matchSummary'),
  matchesTable: document.getElementById('matchesTable'),
  accordionPanels: Array.from(document.querySelectorAll('.accordion-panel')),
};

function setStatus(badge, hint) {
  el.workflowBadge.textContent = badge;
  el.viewerHint.textContent = hint;
}

function setCoach(title, text) {
  el.coachTitle.textContent = title;
  el.coachText.textContent = text;
}

function showToast(title, text, ms = 3800) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span>`;
  el.toastHost.appendChild(node);
  window.setTimeout(() => {
    node.style.opacity = '0';
    node.style.transform = 'translateY(8px)';
    node.style.transition = 'all 0.18s ease';
    window.setTimeout(() => node.remove(), 220);
  }, ms);
}

function showProcessing(title, text, pct = 5) {
  el.processingTitle.textContent = title;
  el.processingText.textContent = text;
  el.processingBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  el.processingOverlay.classList.add('active');
}

function updateProcessing(text, pct) {
  el.processingText.textContent = text;
  if (typeof pct === 'number') el.processingBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

function hideProcessing() {
  el.processingOverlay.classList.remove('active');
}

function openWelcome() {
  el.welcomeModal.classList.add('active');
}

function closeWelcome() {
  el.welcomeModal.classList.remove('active');
}


function panelByName(name) {
  return el.accordionPanels.find(panel => panel.dataset.panel === name);
}

function setPanelOpen(name, open) {
  const panel = panelByName(name);
  if (!panel) return;
  panel.classList.toggle('is-open', open);
  panel.classList.toggle('is-collapsed', !open);
  const head = panel.querySelector('.accordion-head');
  const icon = panel.querySelector('.accordion-icon');
  if (head) head.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (icon) icon.textContent = open ? '▴' : '▾';
}

function togglePanel(name) {
  const panel = panelByName(name);
  if (!panel) return;
  setPanelOpen(name, !panel.classList.contains('is-open'));
}

function resetPanelsForInitialState() {
  setPanelOpen('guide', true);
  setPanelOpen('spectrogram-config', false);
  setPanelOpen('roi', false);
  setPanelOpen('search', false);
  setPanelOpen('results', false);
}

function openRoiStep() {
  setPanelOpen('guide', true);
  setPanelOpen('roi', true);
  setPanelOpen('search', false);
  setPanelOpen('results', false);
}

function openSearchStep() {
  setPanelOpen('roi', false);
  setPanelOpen('search', true);
  setPanelOpen('results', false);
}

function openResultsStep() {
  // Después de buscar, mantenemos el panel de búsqueda abierto para que
  // el usuario pueda afinar score/separación sin perder de vista resultados.
  setPanelOpen('roi', false);
  setPanelOpen('search', true);
  setPanelOpen('results', true);
  const searchPanel = panelByName('search');
  if (searchPanel && typeof searchPanel.scrollIntoView === 'function') {
    window.setTimeout(() => {
      searchPanel.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 60);
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));
}

function fmt(v, d = 3) {
  return Number.isFinite(v) ? Number(v).toFixed(d) : '0';
}

function bytesToMb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function resetForNewAudio() {
  state.roi = null;
  state.savedRoi = null;
  state.matches = [];
  state.spectrogramReady = false;
  state.display = null;
  state.dragging = false;
  state.moved = false;
  el.roiTmin.value = 0;
  el.roiTmax.value = 0;
  el.roiFmin.value = 0;
  el.roiFmax.value = 0;
  if (el.roiLabel) el.roiLabel.value = '';
  el.roiSummary.textContent = 'Sin ROI.';
  el.matchSummary.textContent = 'Sin coincidencias.';
  if (el.autoAdjustParams) el.autoAdjustParams.checked = true;
  el.spectrogramTitle.textContent = state.file ? `Espectrograma · ${state.file.name}` : 'Sin espectrograma';
  el.btnApplyRoi.disabled = true;
  el.btnSaveRoi.disabled = true;
  el.btnClearRoi.disabled = true;
  el.btnSearch.disabled = true;
  el.btnClearMatches.disabled = true;
  el.btnExportCsv.disabled = true;
  if (el.btnExportXlsx) el.btnExportXlsx.disabled = true;
  if (el.btnExportTxt) el.btnExportTxt.disabled = true;
  clearMatchesTable();
  resetPanelsForInitialState();
  drawOverlay();
}

function ensureWorker() {
  if (state.worker) {
    state.worker.terminate();
  }
  state.worker = new Worker('src/audio-worker.js');
  state.worker.onmessage = onWorkerMessage;
  state.worker.onerror = (err) => {
    hideProcessing();
    console.error(err);
    showToast('Error del worker', err.message || 'Falló el proceso en segundo plano.', 7000);
    setStatus('Error', 'Revisa la consola del navegador para ver el detalle.');
  };
}

function onWorkerMessage(ev) {
  const msg = ev.data;
  if (!msg || !msg.type) return;

  if (msg.type === 'progress') {
    updateProcessing(msg.message || 'Procesando...', msg.progress ?? 10);
    return;
  }

  if (msg.type === 'spectrogram-ready') {
    state.display = {
      width: msg.width,
      height: msg.height,
      duration: msg.duration,
      fmin: msg.fmin,
      fmax: msg.fmax,
      nFrames: msg.nFrames,
      nFreq: msg.nFreq,
      hopLength: msg.hopLength,
      sampleRate: msg.sampleRate,
      freqScale: msg.freqScale || CONFIG.freqScale,
      colormap: msg.colormap || CONFIG.colormap,
    };
    state.duration = msg.duration;
    el.spectrogramTitle.textContent = `Espectrograma · ${state.file?.name || 'audio cargado'}`;
    renderSpectrogramImage(msg.imageBuffer, msg.width, msg.height);
    hideProcessing();
    closeWelcome();
    state.spectrogramReady = true;
    setStatus('Marca plantilla', 'Arrastra sobre el espectrograma para encerrar el patrón que quieres buscar.');
    setCoach('Marca una plantilla', 'Dale play si quieres ubicar el sonido. Luego arrastra una caja roja sobre la región acústica que deseas usar como plantilla.');
    showToast('Espectrograma listo', 'Ahora arrastra una caja sobre el patrón acústico de interés.');
    enableAfterSpectrogram();
    openRoiStep();
    return;
  }

  if (msg.type === 'spectrogram-image-ready') {
    if (state.display) {
      state.display.width = msg.width;
      state.display.height = msg.height;
      state.display.fmin = msg.fmin;
      state.display.fmax = msg.fmax;
      state.display.freqScale = msg.freqScale || CONFIG.freqScale;
      state.display.colormap = msg.colormap || CONFIG.colormap;
    }
    renderSpectrogramImage(msg.imageBuffer, msg.width, msg.height);
    hideProcessing();
    drawOverlay();
    showToast('Visualización actualizada', 'Se aplicó la escala/color del espectrograma.');
    return;
  }

  if (msg.type === 'search-progress') {
    updateProcessing(msg.message || 'Buscando...', msg.progress ?? 50);
    return;
  }

  if (msg.type === 'search-ready') {
    hideProcessing();
    if (msg.auto) {
      if (Number.isFinite(msg.auto.scoreThreshold)) setScoreControls(msg.auto.scoreThreshold);
      if (Number.isFinite(msg.auto.strideSec)) setStrideControls(msg.auto.strideSec);
      // El autoajuste sirve para la primera propuesta. Luego se desactiva
      // para que los cambios manuales de score/separación sí tengan efecto
      // en búsquedas finas posteriores. Al subir un nuevo audio se reactiva.
      if (el.autoAdjustParams) el.autoAdjustParams.checked = false;
    }
    const etiqueta = cleanLabel(state.savedRoi?.etiqueta ?? currentEtiqueta());
    state.matches = (msg.matches || []).map(m => addEtiquetaToMatch(m, etiqueta));
    drawOverlay();
    renderMatchesTable();
    el.btnClearMatches.disabled = state.matches.length === 0;
    el.btnExportCsv.disabled = state.matches.length === 0;
    if (el.btnExportXlsx) el.btnExportXlsx.disabled = state.matches.length === 0;
    if (el.btnExportTxt) el.btnExportTxt.disabled = state.matches.length === 0;
    const autoNote = msg.auto ? ` Auto: score ${msg.auto.scoreThreshold.toFixed(3)}, separación ${msg.auto.strideSec.toFixed(2)} s.` : '';
    el.matchSummary.textContent = state.matches.length
      ? `${state.matches.length} coincidencias encontradas. Mejor score: ${state.matches[0].score.toFixed(3)}.${autoNote}`
      : `No hubo coincidencias con ese umbral.${autoNote}`;
    setStatus('Revisa resultados', state.matches.length ? 'Las cajas azules son candidatos similares a la plantilla.' : 'Baja el score o cambia el ROI si no aparecen coincidencias.');
    setCoach('Revisa los candidatos', state.matches.length ? 'Haz clic en una fila de la tabla para centrar el audio y el espectrograma en esa coincidencia.' : 'No aparecieron candidatos. Prueba bajar el score mínimo o marca una ROI más ajustada.');
    showToast('Búsqueda terminada', state.matches.length ? `Encontré ${state.matches.length} coincidencias.` : 'No encontré coincidencias con ese umbral.');
    openResultsStep();
    return;
  }

  if (msg.type === 'error') {
    hideProcessing();
    console.error(msg.error);
    showToast('Error', msg.error || 'Ocurrió un error.', 8000);
    setStatus('Error', msg.error || 'Ocurrió un error.');
  }
}

function enableAfterSpectrogram() {
  el.btnCenterPlayhead.disabled = false;
  el.btnApplyRoi.disabled = false;
}


function currentSpectrogramConfig() {
  CONFIG.freqScale = el.freqScaleSelect?.value || CONFIG.freqScale || 'linear';
  CONFIG.colormap = el.colormapSelect?.value || CONFIG.colormap || 'magma';
  return {
    ...CONFIG,
    // Mantener la escala temporal amplia del visor original.
    // El espectrograma puede exceder el ancho visible y se navega con scroll,
    // mientras el eje de frecuencia permanece fijo.
    maxDisplayWidth: CONFIG.maxDisplayWidth,
    freqScale: CONFIG.freqScale,
    colormap: CONFIG.colormap,
  };
}

function applySpectrogramSettings() {
  if (!state.worker || !state.spectrogramReady) {
    CONFIG.freqScale = el.freqScaleSelect?.value || CONFIG.freqScale;
    CONFIG.colormap = el.colormapSelect?.value || CONFIG.colormap;
    return;
  }
  showProcessing('Actualizando espectrograma', 'Aplicando escala y color...', 25);
  setStatus('Actualizando', 'Redibujando espectrograma con la nueva configuración.');
  state.worker.postMessage({
    type: 'render-spectrogram',
    config: currentSpectrogramConfig(),
  });
}

async function handleFile(file) {
  if (!file) return;
  resetForNewAudio();
  state.file = file;
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = URL.createObjectURL(file);
  el.audioPlayer.src = state.objectUrl;
  if (el.audioName) el.audioName.textContent = file.name;
  el.spectrogramTitle.textContent = `Espectrograma · ${file.name}`;
  if (el.audioInfo) el.audioInfo.textContent = `${bytesToMb(file.size)} MB · ${file.type || 'audio'}`;
  setStatus('Procesando', 'Decodificando audio y calculando espectrograma automáticamente.');
  setCoach('Procesando audio', 'No necesitas pulsar nada más. Cuando termine, aparecerá el visor y podrás marcar la plantilla.');
  showProcessing('Procesando audio', 'Leyendo archivo...', 4);
  try {
    const arrayBuffer = await file.arrayBuffer();
    updateProcessing('Decodificando audio en el navegador...', 10);
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    const mono = mixToMono(decoded);
    updateProcessing('Preparando señal mono...', 18);
    const resampled = resampleLinear(mono, decoded.sampleRate, CONFIG.targetSampleRate);
    state.samples = resampled;
    state.sampleRate = CONFIG.targetSampleRate;
    state.duration = resampled.length / CONFIG.targetSampleRate;
    if (el.audioInfo) el.audioInfo.textContent = `${bytesToMb(file.size)} MB · duración ${state.duration.toFixed(2)} s · procesado a ${CONFIG.targetSampleRate} Hz`;
    ensureWorker();
    state.worker.postMessage({
      type: 'build-spectrogram',
      samples: resampled,
      sampleRate: CONFIG.targetSampleRate,
      config: currentSpectrogramConfig(),
    }, [resampled.buffer]);
  } catch (err) {
    hideProcessing();
    console.error(err);
    setStatus('Error', 'No pude decodificar el audio. Prueba con WAV o MP3 estándar.');
    showToast('No pude leer el audio', err.message || String(err), 8000);
  }
}

function mixToMono(audioBuffer) {
  const len = audioBuffer.length;
  const channels = audioBuffer.numberOfChannels;
  const mono = new Float32Array(len);
  for (let c = 0; c < channels; c++) {
    const ch = audioBuffer.getChannelData(c);
    for (let i = 0; i < len; i++) mono[i] += ch[i] / channels;
  }
  return mono;
}

function resampleLinear(input, inputRate, outputRate) {
  if (Math.abs(inputRate - outputRate) < 1) return new Float32Array(input);
  const ratio = inputRate / outputRate;
  const outLen = Math.floor(input.length / ratio);
  const output = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const frac = pos - i0;
    output[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return output;
}

function renderSpectrogramImage(buffer, width, height) {
  el.emptyViewer.hidden = true;
  el.spectrogramStage.hidden = false;
  el.spectrogramViewport.classList.remove('empty');

  for (const c of [el.spectrogramCanvas, el.overlayCanvas]) {
    c.width = width;
    c.height = height;
  }

  el.freqAxisCanvas.width = CONFIG.freqAxisW;
  el.freqAxisCanvas.height = height;
  el.timeAxisCanvas.width = width;
  el.timeAxisCanvas.height = CONFIG.timeAxisH;

  const ctx = el.spectrogramCanvas.getContext('2d');
  const imageData = new ImageData(new Uint8ClampedArray(buffer), width, height);
  ctx.putImageData(imageData, 0, 0);

  layoutSpectrogramStage();
  drawAxes();
  drawOverlay();
  updatePlayhead(true);
}

function layoutSpectrogramStage() {
  if (!state.display) return;
  const width = state.display.width;
  const naturalHeight = state.display.height;

  // El visor solo debe tener scroll horizontal. Si el alto natural no cabe,
  // se escala visualmente el canvas para reservar siempre el eje temporal.
  const viewportH = Math.max(260, el.spectrogramViewport.clientHeight || naturalHeight + CONFIG.timeAxisH);
  const availableForSpec = Math.max(220, viewportH - CONFIG.timeAxisH - 18);
  const visualHeight = Math.min(naturalHeight, availableForSpec);

  state.visualHeight = visualHeight;

  el.spectrogramStage.style.width = `${CONFIG.freqAxisW + width}px`;
  el.spectrogramStage.style.height = `${visualHeight + CONFIG.timeAxisH}px`;

  el.canvasLayer.style.width = `${width}px`;
  el.canvasLayer.style.height = `${visualHeight}px`;

  for (const c of [el.spectrogramCanvas, el.overlayCanvas]) {
    c.style.width = `${width}px`;
    c.style.height = `${visualHeight}px`;
  }

  el.freqAxisCanvas.style.width = `${CONFIG.freqAxisW}px`;
  el.freqAxisCanvas.style.height = `${visualHeight}px`;

  el.timeAxisCanvas.style.width = `${width}px`;
  el.timeAxisCanvas.style.height = `${CONFIG.timeAxisH}px`;
  el.timeAxisCanvas.style.top = `${visualHeight}px`;

  el.playhead.style.height = `${visualHeight}px`;
}

function timeToX(t) {
  if (!state.display) return 0;
  return (t / state.display.duration) * state.display.width;
}

function xToTime(x) {
  if (!state.display) return 0;
  return (x / state.display.width) * state.display.duration;
}

function hzToMel(hz) {
  return 2595 * Math.log10(1 + Math.max(0, hz) / 700);
}

function melToHz(mel) {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

function freqToY(f) {
  if (!state.display) return 0;
  const f0 = state.display.fmin;
  const f1 = state.display.fmax;
  if (state.display.freqScale === 'mel') {
    const m0 = hzToMel(f0);
    const m1 = hzToMel(f1);
    return ((m1 - hzToMel(f)) / Math.max(m1 - m0, 1e-9)) * state.display.height;
  }
  const span = f1 - f0;
  return ((f1 - f) / span) * state.display.height;
}

function yToFreq(y) {
  if (!state.display) return 0;
  const f0 = state.display.fmin;
  const f1 = state.display.fmax;
  if (state.display.freqScale === 'mel') {
    const m0 = hzToMel(f0);
    const m1 = hzToMel(f1);
    const m = m1 - (y / state.display.height) * (m1 - m0);
    return melToHz(m);
  }
  const span = f1 - f0;
  return f1 - (y / state.display.height) * span;
}

function drawAxes() {
  if (!state.display) return;
  drawTimeAxis();
  drawFreqAxis();
}

function drawTimeAxis() {
  const ctx = el.timeAxisCanvas.getContext('2d');
  const W = state.display.width;
  const H = CONFIG.timeAxisH;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#f7f7f7';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0.5);
  ctx.lineTo(W, 0.5);
  ctx.stroke();
  ctx.fillStyle = '#111';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const step = chooseTimeStep(state.display.duration);
  for (let t = 0; t <= state.display.duration + 1e-9; t += step) {
    const x = timeToX(t);
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, 8);
    ctx.stroke();
    ctx.fillText(prettyTime(t), x, 10);
  }
}

function drawFreqAxis() {
  const ctx = el.freqAxisCanvas.getContext('2d');
  const W = CONFIG.freqAxisW;
  const H = state.display.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#f7f7f7';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W - 0.5, 0);
  ctx.lineTo(W - 0.5, H);
  ctx.stroke();
  ctx.fillStyle = '#111';
  ctx.font = '12px Arial';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  const step = chooseFreqStep();
  const ticks = [];
  for (let f = state.display.fmin; f <= state.display.fmax + 1e-9; f += step) ticks.push(f);
  if (!ticks.some(f => Math.abs(f - state.display.fmax) < 1e-6)) ticks.push(state.display.fmax);

  for (const f of ticks) {
    const yRaw = freqToY(f);
    const y = clamp(yRaw, 12, H - 12);
    ctx.beginPath();
    ctx.moveTo(W - 8, yRaw + 0.5);
    ctx.lineTo(W, yRaw + 0.5);
    ctx.stroke();
    ctx.fillText(prettyFreq(f), W - 10, y);
  }

  ctx.save();
  ctx.translate(13, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#64748b';
  ctx.font = '11px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Frecuencia', 0, 0);
  ctx.restore();
}

function chooseTimeStep(duration) {
  const width = Math.max(1, state.display?.width || 1000);
  // Buscamos marcas temporales más densas que cada 30 s, pero sin abarrotar.
  // targetPx representa la separación visual mínima aproximada entre etiquetas.
  const targetPx = 150;
  const raw = (duration * targetPx) / width;
  const candidates = [0.25, 0.5, 1, 2, 5, 10, 15, 20, 30, 60, 120, 300, 600];
  for (const c of candidates) {
    if (c >= raw) return c;
  }
  return 600;
}

function chooseFreqStep() {
  const span = state.display.fmax - state.display.fmin;
  if (span <= 2000) return 250;
  if (span <= 5000) return 500;
  if (span <= 10000) return 1000;
  return 2000;
}

function prettyTime(sec) {
  if (sec < 1) return `${sec.toFixed(1)} s`;
  if (state.display && state.display.duration > 900 && sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, '0')}`;
  }
  return state.display && state.display.duration <= 30 ? `${sec.toFixed(1)} s` : `${sec.toFixed(0)} s`;
}

function prettyFreq(hz) {
  return hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${hz.toFixed(0)} Hz`;
}

function drawOverlay() {
  if (!state.display || !el.overlayCanvas.width) return;
  const ctx = el.overlayCanvas.getContext('2d');
  ctx.clearRect(0, 0, el.overlayCanvas.width, el.overlayCanvas.height);
  drawMatches(ctx);
  drawRoi(ctx, state.roi, 'ROI', '#ef4444', 'rgba(239,68,68,0.18)', 3);
}

function drawMatches(ctx) {
  const matches = state.matches || [];
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,120,255,0.95)';
  ctx.fillStyle = 'rgba(0,120,255,0.14)';
  ctx.font = '11px Arial';
  for (const m of matches.slice(0, CONFIG.maxMatchesToDraw)) {
    const x1 = timeToX(m.tmin);
    const x2 = timeToX(m.tmax);
    const y1 = freqToY(m.fmax);
    const y2 = freqToY(m.fmin);
    const rx = Math.min(x1, x2);
    const ry = Math.min(y1, y2);
    const rw = Math.abs(x2 - x1);
    const rh = Math.abs(y2 - y1);
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.fillStyle = 'rgba(0,120,255,1)';
    ctx.fillText(m.score.toFixed(2), rx + 2, Math.max(12, ry - 2));
    ctx.fillStyle = 'rgba(0,120,255,0.14)';
  }
}

function drawRoi(ctx, roi, label, stroke, fill, lineWidth) {
  if (!roi) return;
  const x1 = timeToX(roi.tmin);
  const x2 = timeToX(roi.tmax);
  const y1 = freqToY(roi.fmax);
  const y2 = freqToY(roi.fmin);
  const rx = Math.min(x1, x2);
  const ry = Math.min(y1, y2);
  const rw = Math.abs(x2 - x1);
  const rh = Math.abs(y2 - y1);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.fillRect(rx, ry, rw, rh);
  ctx.strokeRect(rx, ry, rw, rh);
  ctx.fillStyle = stroke;
  ctx.font = '12px Arial';
  ctx.fillText(label, rx + 4, Math.max(12, ry - 4));
}

function getCanvasXY(ev) {
  const rect = el.overlayCanvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (state.display.width / rect.width);
  const y = (ev.clientY - rect.top) * (state.display.height / rect.height);
  return [clamp(x, 0, state.display.width), clamp(y, 0, state.display.height)];
}

function rectToRoi(x1, y1, x2, y2) {
  const rx1 = clamp(Math.min(x1, x2), 0, state.display.width);
  const rx2 = clamp(Math.max(x1, x2), 0, state.display.width);
  const ry1 = clamp(Math.min(y1, y2), 0, state.display.height);
  const ry2 = clamp(Math.max(y1, y2), 0, state.display.height);
  return {
    tmin: xToTime(rx1),
    tmax: xToTime(rx2),
    fmin: yToFreq(ry2),
    fmax: yToFreq(ry1),
  };
}

function setRoi(roi, fromFields = false) {
  if (!state.display) return;
  const clipped = clipRoi(roi);
  state.roi = clipped;
  el.roiTmin.value = fmt(clipped.tmin, 3);
  el.roiTmax.value = fmt(clipped.tmax, 3);
  el.roiFmin.value = fmt(clipped.fmin, 1);
  el.roiFmax.value = fmt(clipped.fmax, 1);
  el.btnSaveRoi.disabled = false;
  el.btnClearRoi.disabled = false;
  el.roiSummary.textContent = `ROI actual: t=[${fmt(clipped.tmin)}, ${fmt(clipped.tmax)}] s · f=[${fmt(clipped.fmin, 1)}, ${fmt(clipped.fmax, 1)}] Hz`;
  if (!fromFields) {
    setCoach('ROI marcada', 'Ahora pulsa Guardar plantilla. Luego podrás buscar regiones parecidas en el audio.');
    setStatus('ROI marcada', 'Guarda la plantilla para habilitar la búsqueda por embedding.');
  }
  drawOverlay();
}

function clipRoi(roi) {
  let tmin = clamp(Number(roi.tmin), 0, state.display.duration);
  let tmax = clamp(Number(roi.tmax), 0, state.display.duration);
  let fmin = clamp(Number(roi.fmin), state.display.fmin, state.display.fmax);
  let fmax = clamp(Number(roi.fmax), state.display.fmin, state.display.fmax);
  if (tmin > tmax) [tmin, tmax] = [tmax, tmin];
  if (fmin > fmax) [fmin, fmax] = [fmax, fmin];
  return { tmin, tmax, fmin, fmax };
}

function updatePlayhead(doFollow = false) {
  if (!state.display) return;
  const t = el.audioPlayer.currentTime || 0;
  const x = timeToX(t);
  el.playhead.style.left = `${x}px`;
  if (doFollow && !state.dragging && el.followPlayback.checked) {
    scrollToPlayhead(x);
  }
}

function scrollToPlayhead(x, force = false) {
  if (!state.display) return;
  if (!force && !el.followPlayback.checked) return;
  const visibleW = el.spectrogramViewport.clientWidth;
  const maxScroll = Math.max(0, el.spectrogramViewport.scrollWidth - visibleW);
  const target = CONFIG.freqAxisW + x - visibleW * 0.45;
  el.spectrogramViewport.scrollLeft = clamp(target, 0, maxScroll);
}

function centerOnCurrentTime(force = true) {
  if (!state.display) return;
  scrollToPlayhead(timeToX(el.audioPlayer.currentTime || 0), force);
}

function startAnimationLoop() {
  if (state.rafId !== null) cancelAnimationFrame(state.rafId);
  const loop = () => {
    updatePlayhead(true);
    if (!el.audioPlayer.paused && !el.audioPlayer.ended) state.rafId = requestAnimationFrame(loop);
    else state.rafId = null;
  };
  state.rafId = requestAnimationFrame(loop);
}

function stopAnimationLoop() {
  if (state.rafId !== null) cancelAnimationFrame(state.rafId);
  state.rafId = null;
  updatePlayhead(false);
}

function clearMatchesTable() {
  el.matchesTable.querySelector('tbody').innerHTML = '<tr><td colspan="7" class="muted-cell">Sin resultados</td></tr>';
}

function sortMatchesForTable(matches) {
  const key = state.tableSort?.key || 'score';
  const dir = state.tableSort?.dir === 'asc' ? 1 : -1;
  const arr = matches.map((m, idx) => ({ ...m, _rank: idx + 1 }));
  const valueFor = (m) => {
    if (key === 'rank') return m._rank;
    if (key === 'etiqueta') return String(m.etiqueta || '').toLowerCase();
    return Number(m[key]);
  };
  arr.sort((a, b) => {
    const va = valueFor(a);
    const vb = valueFor(b);
    if (typeof va === 'string' || typeof vb === 'string') {
      return String(va).localeCompare(String(vb)) * dir;
    }
    const na = Number.isFinite(va) ? va : -Infinity;
    const nb = Number.isFinite(vb) ? vb : -Infinity;
    if (na === nb) return a._rank - b._rank;
    return (na - nb) * dir;
  });
  return arr;
}

function updateTableSortIndicators() {
  const ths = el.matchesTable.querySelectorAll('th.sortable');
  ths.forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    const base = th.dataset.label || th.textContent.replace(/[▲▼]/g, '').trim();
    th.dataset.label = base;
    if (th.dataset.sort === state.tableSort.key) {
      th.classList.add(state.tableSort.dir === 'asc' ? 'sort-asc' : 'sort-desc');
      th.textContent = `${base} ${state.tableSort.dir === 'asc' ? '▲' : '▼'}`;
    } else {
      th.textContent = base;
    }
  });
}

function renderMatchesTable() {
  const tbody = el.matchesTable.querySelector('tbody');
  updateTableSortIndicators();
  if (!state.matches.length) {
    clearMatchesTable();
    updateTableSortIndicators();
    return;
  }
  tbody.innerHTML = '';
  sortMatchesForTable(state.matches).slice(0, 80).forEach((m) => {
    const tr = document.createElement('tr');
    tr.className = 'match-row';
    tr.innerHTML = `<td>${m._rank}</td><td>${m.score.toFixed(3)}</td><td>${m.tmin.toFixed(2)}</td><td>${m.tmax.toFixed(2)}</td><td>${m.fmin.toFixed(0)}</td><td>${m.fmax.toFixed(0)}</td><td>${escapeHtml(m.etiqueta || '')}</td>`;
    tr.addEventListener('click', () => {
      el.audioPlayer.currentTime = m.tmin;
      updatePlayhead(true);
      centerOnCurrentTime(true);
      showToast('Match seleccionado', `t=[${m.tmin.toFixed(2)}, ${m.tmax.toFixed(2)}] s`);
    });
    tbody.appendChild(tr);
  });
}

function getExportBaseName() {
  const name = state.file?.name || 'embedding_matches';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function exportCsv() {
  if (!state.matches.length) return;
  const header = ['audio','tmin','tmax','fmin','fmax','etiqueta','score','estado'];
  const rows = state.matches.map(m => [
    state.file?.name || '',
    m.tmin.toFixed(6),
    m.tmax.toFixed(6),
    m.fmin.toFixed(3),
    m.fmax.toFixed(3),
    cleanLabel(m.etiqueta || state.savedRoi?.etiqueta || currentEtiqueta()),
    m.score.toFixed(6),
    'candidato'
  ]);
  const csv = [header, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `${getExportBaseName()}.csv`);
  showToast('CSV exportado', 'Se descargó la tabla de candidatos con la etiqueta.');
}


function exportXlsx() {
  if (!state.matches.length) return;
  const header = ['audio','tmin','tmax','fmin','fmax','etiqueta','score','estado'];
  const rows = state.matches.map(m => [
    state.file?.name || '',
    Number(m.tmin.toFixed(6)),
    Number(m.tmax.toFixed(6)),
    Number(m.fmin.toFixed(3)),
    Number(m.fmax.toFixed(3)),
    cleanLabel(m.etiqueta || state.savedRoi?.etiqueta || currentEtiqueta()),
    Number(m.score.toFixed(6)),
    'candidato'
  ]);
  const blob = makeXlsxBlob([header, ...rows]);
  downloadBlob(blob, `${getExportBaseName()}.xlsx`);
  showToast('XLSX exportado', 'Se descargó la tabla de candidatos con la etiqueta.');
}

function exportAudacityTxt() {
  if (!state.matches.length) return;
  const lines = [];
  for (const m of state.matches) {
    const etiqueta = cleanLabel(m.etiqueta || state.savedRoi?.etiqueta || currentEtiqueta());
    lines.push(`${m.tmin.toFixed(6)}\t${m.tmax.toFixed(6)}\t${etiqueta}`);
    lines.push(`\\\t${m.fmin.toFixed(6)}\t${m.fmax.toFixed(6)}`);
  }
  const txt = lines.join('\r\n') + '\r\n';
  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, `${getExportBaseName()}.txt`);
  showToast('TXT Audacity exportado', 'Se descargó el archivo de etiquetas en formato Audacity.');
}

function xmlEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;'
  }[ch]));
}

function colName(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function makeSheetXml(rows) {
  const sheetRows = rows.map((row, rIdx) => {
    const rn = rIdx + 1;
    const cells = row.map((value, cIdx) => {
      const ref = `${colName(cIdx + 1)}${rn}`;
      if (typeof value === 'number' && Number.isFinite(value)) {
        return `<c r="${ref}"><v>${value}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rn}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${sheetRows}</sheetData></worksheet>`;
}

function makeXlsxBlob(rows) {
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="matches" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml', makeSheetXml(rows)],
  ];
  return zipStore(files, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(n) { return [n & 255, (n >>> 8) & 255]; }
function u32(n) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }

function zipStore(fileEntries, mime) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of fileEntries) {
    const nameBytes = enc.encode(name);
    const data = enc.encode(text);
    const crc = crc32(data);
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0)
    ]);
    chunks.push(local, nameBytes, data);
    const cent = new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0),
      ...u16(0), ...u16(0), ...u32(0), ...u32(offset)
    ]);
    central.push(cent, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralOffset = offset;
  let centralSize = 0;
  for (const c of central) centralSize += c.length;
  const end = new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(fileEntries.length), ...u16(fileEntries.length),
    ...u32(centralSize), ...u32(centralOffset), ...u16(0)
  ]);
  return new Blob([...chunks, ...central, end], { type: mime });
}

function csvCell(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function cleanLabel(value) {
  return String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();
}

function currentEtiqueta() {
  return cleanLabel(el.roiLabel ? el.roiLabel.value : '');
}

function addEtiquetaToMatch(match, etiqueta) {
  return { ...match, etiqueta: cleanLabel(etiqueta) };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function applyRoiFromFields() {
  if (!state.display) return;
  setRoi({
    tmin: Number(el.roiTmin.value),
    tmax: Number(el.roiTmax.value),
    fmin: Number(el.roiFmin.value),
    fmax: Number(el.roiFmax.value),
  }, true);
  showToast('ROI aplicada', 'La caja roja se actualizó con los valores del panel.');
}

function saveRoi() {
  if (!state.roi) return;
  const widthSec = state.roi.tmax - state.roi.tmin;
  const heightHz = state.roi.fmax - state.roi.fmin;
  if (widthSec <= 0 || heightHz <= 0) {
    showToast('ROI inválida', 'La caja debe tener ancho temporal y alto frecuencial.');
    return;
  }
  state.savedRoi = { ...state.roi, etiqueta: currentEtiqueta() };
  el.btnSearch.disabled = false;
  setStatus('Plantilla guardada', 'Ajusta los parámetros y pulsa Buscar similares.');
  setCoach('Busca similares', 'Puedes dejar activo el autoajuste para proponer score mínimo y separación entre ventanas según esta ROI.');
  showToast('Plantilla guardada', 'Ahora puedes buscar similares por embedding.');
  openSearchStep();
}

function clearRoi() {
  state.roi = null;
  state.savedRoi = null;
  state.matches = [];
  el.roiTmin.value = 0;
  el.roiTmax.value = 0;
  el.roiFmin.value = 0;
  el.roiFmax.value = 0;
  if (el.roiLabel) el.roiLabel.value = '';
  el.roiSummary.textContent = 'Sin ROI.';
  el.matchSummary.textContent = 'Sin coincidencias.';
  el.btnSaveRoi.disabled = true;
  el.btnClearRoi.disabled = true;
  el.btnSearch.disabled = true;
  el.btnClearMatches.disabled = true;
  el.btnExportCsv.disabled = true;
  if (el.btnExportXlsx) el.btnExportXlsx.disabled = true;
  if (el.btnExportTxt) el.btnExportTxt.disabled = true;
  clearMatchesTable();
  drawOverlay();
  setStatus('Marca plantilla', 'Arrastra sobre el espectrograma para encerrar el patrón que quieres buscar.');
  setCoach('Marca una plantilla', 'Dibuja una caja roja sobre el sonido que quieres encontrar en el resto del audio.');
  openRoiStep();
}

function searchEmbedding() {
  if (!state.savedRoi || !state.worker) return;
  state.savedRoi.etiqueta = currentEtiqueta();
  const metric = el.metricSelect.value;
  const scoreThreshold = Number(el.scoreThreshold.value);
  const strideSec = Number(el.strideSec.value);
  const autoAdjust = Boolean(el.autoAdjustParams?.checked);
  showProcessing(
    autoAdjust ? 'Autoajustando y buscando similares' : 'Buscando similares',
    autoAdjust ? 'Estimando separación y codo de scores...' : 'Comparando embeddings...',
    10
  );
  setStatus('Buscando', autoAdjust ? 'Autoajustando parámetros y procesando candidatos.' : 'Procesando candidatos en segundo plano.');
  state.worker.postMessage({
    type: 'search-embedding',
    roi: state.savedRoi,
    metric,
    scoreThreshold,
    strideSec,
    autoAdjust,
    maxMatches: CONFIG.maxMatchesToStore,
  });
}

function clearMatches() {
  state.matches = [];
  el.matchSummary.textContent = 'Sin coincidencias.';
  el.btnClearMatches.disabled = true;
  el.btnExportCsv.disabled = true;
  if (el.btnExportXlsx) el.btnExportXlsx.disabled = true;
  if (el.btnExportTxt) el.btnExportTxt.disabled = true;
  clearMatchesTable();
  drawOverlay();
  showToast('Coincidencias limpiadas', 'Se retiraron las cajas azules.');
}

function setScoreControls(value) {
  const v = clamp(Number(value), 0, 0.99);
  const formatted = v.toFixed(3);
  el.scoreThreshold.value = formatted;
  el.scoreThresholdInput.value = formatted;
}

function setStrideControls(value) {
  const v = clamp(Number(value), 0.01, 1.00);
  const formatted = v.toFixed(2);
  el.strideSec.value = formatted;
  el.strideSecInput.value = formatted;
}

function syncRangeNumber(rangeEl, numberEl, decimals, minValue, maxValue) {
  const normalize = (value) => {
    const n = clamp(Number(value), minValue, maxValue);
    return Number.isFinite(n) ? n : minValue;
  };

  const setBoth = (value, source) => {
    const n = normalize(value);
    const formatted = n.toFixed(decimals);
    if (source !== 'range') rangeEl.value = formatted;
    if (source !== 'number') numberEl.value = formatted;
  };

  rangeEl.addEventListener('input', () => setBoth(rangeEl.value, 'range'));
  numberEl.addEventListener('input', () => setBoth(numberEl.value, 'number'));
  numberEl.addEventListener('change', () => setBoth(numberEl.value, 'none'));
  setBoth(rangeEl.value, 'none');
}

function attachEvents() {
  el.btnOpenAudio.addEventListener('click', () => el.fileInput.click());
  el.btnModalUpload.addEventListener('click', () => el.fileInput.click());
  el.fileInput.addEventListener('change', (ev) => handleFile(ev.target.files?.[0]));
  el.dropZone.addEventListener('dragover', (ev) => { ev.preventDefault(); el.dropZone.classList.add('dragover'); });
  el.dropZone.addEventListener('dragleave', () => el.dropZone.classList.remove('dragover'));
  el.dropZone.addEventListener('drop', (ev) => {
    ev.preventDefault(); el.dropZone.classList.remove('dragover'); handleFile(ev.dataTransfer.files?.[0]);
  });
  el.btnCenterPlayhead.addEventListener('click', () => centerOnCurrentTime(true));
  el.followPlayback.addEventListener('change', () => { if (el.followPlayback.checked) centerOnCurrentTime(true); });
  el.audioPlayer.addEventListener('play', startAnimationLoop);
  el.audioPlayer.addEventListener('pause', stopAnimationLoop);
  el.audioPlayer.addEventListener('ended', stopAnimationLoop);
  el.audioPlayer.addEventListener('timeupdate', () => updatePlayhead(false));
  el.audioPlayer.addEventListener('seeked', () => { updatePlayhead(true); centerOnCurrentTime(true); });

  el.overlayCanvas.addEventListener('mousedown', (ev) => {
    if (!state.display) return;
    state.dragging = true;
    state.moved = false;
    [state.startX, state.startY] = getCanvasXY(ev);
  });
  el.overlayCanvas.addEventListener('mousemove', (ev) => {
    if (!state.dragging || !state.display) return;
    state.moved = true;
    const [x, y] = getCanvasXY(ev);
    const roi = rectToRoi(state.startX, state.startY, x, y);
    const ctx = el.overlayCanvas.getContext('2d');
    drawOverlay();
    drawRoi(ctx, roi, 'ROI', '#ef4444', 'rgba(239,68,68,0.18)', 3);
  });
  const finishDrag = (ev) => {
    if (!state.dragging || !state.display) return;
    state.dragging = false;
    const [x, y] = getCanvasXY(ev);
    if (!state.moved) {
      el.audioPlayer.currentTime = xToTime(x);
      updatePlayhead(true);
      centerOnCurrentTime(true);
      return;
    }
    setRoi(rectToRoi(state.startX, state.startY, x, y));
  };
  el.overlayCanvas.addEventListener('mouseup', finishDrag);
  el.overlayCanvas.addEventListener('mouseleave', finishDrag);

  el.btnApplyRoi.addEventListener('click', applyRoiFromFields);
  el.btnSaveRoi.addEventListener('click', saveRoi);
  el.btnClearRoi.addEventListener('click', clearRoi);
  el.btnSearch.addEventListener('click', searchEmbedding);
  el.btnClearMatches.addEventListener('click', clearMatches);
  el.btnExportCsv.addEventListener('click', exportCsv);
  if (el.btnExportXlsx) el.btnExportXlsx.addEventListener('click', exportXlsx);
  if (el.btnExportTxt) el.btnExportTxt.addEventListener('click', exportAudacityTxt);
  el.accordionPanels.forEach(panel => {
    const head = panel.querySelector('.accordion-head');
    if (head) head.addEventListener('click', () => togglePanel(panel.dataset.panel));
  });
  el.matchesTable.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (!key) return;
      if (state.tableSort.key === key) {
        state.tableSort.dir = state.tableSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        state.tableSort.key = key;
        state.tableSort.dir = key === 'etiqueta' ? 'asc' : 'desc';
      }
      renderMatchesTable();
    });
  });
  el.infoDots.forEach(dot => {
    dot.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      showToast('Ayuda', dot.dataset.tip || dot.getAttribute('title') || 'Sin descripción.', 9000);
    });
  });
  window.addEventListener('resize', () => { layoutSpectrogramStage(); drawAxes(); drawOverlay(); updatePlayhead(false); });
  if (el.freqScaleSelect) el.freqScaleSelect.addEventListener('change', applySpectrogramSettings);
  if (el.colormapSelect) el.colormapSelect.addEventListener('change', applySpectrogramSettings);
  syncRangeNumber(el.scoreThreshold, el.scoreThresholdInput, 3, 0, 0.99);
  syncRangeNumber(el.strideSec, el.strideSecInput, 2, 0.01, 1.00);
}

attachEvents();
resetPanelsForInitialState();

if (location.protocol === 'file:') {
  showToast('Abre con servidor local', 'No abras el HTML con doble clic. Usa http://localhost o GitHub Pages.', 9000);
}
