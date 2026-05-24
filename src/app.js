'use strict';

const CONFIG = {
  targetSampleRate: null, // null = usar sample rate nativo del audio para mostrar el espectro completo
  nFft: 1024,
  hopLength: 512,
  displayFminHz: 0,
  displayFmaxHz: null, // null = Nyquist del audio procesado
  maxDisplayWidth: 18000,
  freqScale: 'linear',
  colormap: 'magma',
  embSize: 48,
  maxMatchesToDraw: 300,
  maxMatchesToStore: 500,
  freqAxisW: 96,
  timeAxisH: 34,
  templateColors: ['#00e5ff', '#39ff14', '#2979ff', '#ffd60a', '#ff4fd8', '#7c4dff', '#00f5a0', '#4cc9f0', '#c6ff00', '#ff66c4'],
};

const state = {
  file: null,
  objectUrl: null,
  audioBuffer: null,
  samples: null,
  sampleRate: 0,
  duration: 0,
  spectrogramReady: false,
  display: null,
  roi: null,
  savedRoi: null,
  templates: [],
  activeTemplateId: null,
  templateCounter: 0,
  hasSearched: false,
  searchQueue: [],
  searchResultsAccumulator: [],
  currentSearchTemplateId: null,
  currentSearchAll: false,
  forceAutoSearch: false,
  matches: [],
  tableSort: { key: 'score', dir: 'desc' },
  worker: null,
  dragging: false,
  moved: false,
  preventRoiEdit: false,
  lockToastShown: false,
  samplePreviewToken: 0,
  workerCompoundWarmKeys: new Set(),
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
  templateChips: document.getElementById('templateChips'),
  searchTemplateChips: document.getElementById('searchTemplateChips'),
  btnPrevTemplate: document.getElementById('btnPrevTemplate'),
  btnNextTemplate: document.getElementById('btnNextTemplate'),
  btnPrevSearchTemplate: document.getElementById('btnPrevSearchTemplate'),
  btnNextSearchTemplate: document.getElementById('btnNextSearchTemplate'),
  templatePager: document.getElementById('templatePager'),
  searchTemplatePager: document.getElementById('searchTemplatePager'),
  btnAddTemplate: document.getElementById('btnAddTemplate'),
  btnSearchAllTemplates: document.getElementById('btnSearchAllTemplates'),
  btnRemoveTemplate: document.getElementById('btnRemoveTemplate'),
  btnApplyRoi: document.getElementById('btnApplyRoi'),
  btnSaveRoi: document.getElementById('btnSaveRoi'),
  btnClearRoi: document.getElementById('btnClearRoi'),
  roiSummary: document.getElementById('roiSummary'),
  metricSelect: document.getElementById('metricSelect'),
  scoreThreshold: document.getElementById('scoreThreshold'),
  scoreThresholdInput: document.getElementById('scoreThresholdInput'),
  strideSec: document.getElementById('strideSec'),
  strideSecInput: document.getElementById('strideSecInput'),
  autoAdjustMode: document.getElementById('autoAdjustMode'),
  expertMode: document.getElementById('expertMode'),
  expertPanel: document.getElementById('expertPanel'),
  expertMinMatches: document.getElementById('expertMinMatches'),
  expertMinMatchesInput: document.getElementById('expertMinMatchesInput'),
  expertMaxMatches: document.getElementById('expertMaxMatches'),
  expertMaxMatchesInput: document.getElementById('expertMaxMatchesInput'),
  expertProminence: document.getElementById('expertProminence'),
  expertProminenceInput: document.getElementById('expertProminenceInput'),
  expertGroupFactor: document.getElementById('expertGroupFactor'),
  expertGroupFactorInput: document.getElementById('expertGroupFactorInput'),
  showActiveMatches: document.getElementById('showActiveMatches'),
  useMultiSamples: document.getElementById('useMultiSamples'),
  sampleEstimator: document.getElementById('sampleEstimator'),
  samplePanel: document.getElementById('samplePanel'),
  samplePreviewCanvas: document.getElementById('samplePreviewCanvas'),
  sampleSummary: document.getElementById('sampleSummary'),
  sampleProgress: document.getElementById('sampleProgress'),
  btnAddSample: document.getElementById('btnAddSample'),
  btnRemoveSample: document.getElementById('btnRemoveSample'),
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

function scrollSidePanelTo(name, behavior = 'smooth') {
  const panel = panelByName(name);
  const sidePanel = document.querySelector('.side-panel');
  if (!panel || !sidePanel) return;

  // Alinear el panel solicitado contra la parte superior del scroll lateral.
  // Usamos offsetTop para evitar errores de medición justo después de abrir/cerrar acordeones.
  window.setTimeout(() => {
    const target = Math.max(0, panel.offsetTop - sidePanel.offsetTop - 2);
    sidePanel.scrollTo({ top: target, behavior });
  }, 120);
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

function focusTemplateStep() {
  // Usado cuando el usuario dibuja una plantilla nueva desde el espectrograma.
  // Dejamos Plantilla arriba y lista para editar etiqueta/coordenadas.
  setPanelOpen('guide', false);
  setPanelOpen('spectrogram-config', false);
  setPanelOpen('roi', true);
  setPanelOpen('search', false);
  setPanelOpen('results', false);
  scrollSidePanelTo('roi');
}

function openSearchStep() {
  setPanelOpen('guide', false);
  setPanelOpen('spectrogram-config', false);
  setPanelOpen('roi', false);
  setPanelOpen('search', true);
  setPanelOpen('results', false);
  scrollSidePanelTo('search');
}

function openResultsStep() {
  // Después de buscar, mantenemos Búsqueda y Resultados abiertos.
  // Además cerramos los paneles superiores para que Búsqueda quede alineado arriba.
  setPanelOpen('guide', false);
  setPanelOpen('spectrogram-config', false);
  setPanelOpen('roi', false);
  setPanelOpen('search', true);
  setPanelOpen('results', true);
  scrollSidePanelTo('search');
  window.setTimeout(() => scrollSidePanelTo('search', 'auto'), 260);
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
  state.templates = [];
  state.activeTemplateId = null;
  state.templateCounter = 0;
  state.hasSearched = false;
  state.searchQueue = [];
  state.searchResultsAccumulator = [];
  state.currentSearchTemplateId = null;
  state.currentSearchAll = false;
  state.forceAutoSearch = false;
  state.workerCompoundWarmKeys = new Set();
  state.matches = [];
  state.spectrogramReady = false;
  state.display = null;
  state.dragging = false;
  state.moved = false;
  state.preventRoiEdit = false;
  state.lockToastShown = false;
  el.roiTmin.value = 0;
  el.roiTmax.value = 0;
  el.roiFmin.value = 0;
  el.roiFmax.value = 0;
  if (el.roiLabel) el.roiLabel.value = '';
  el.roiSummary.textContent = 'Sin plantilla.';
  el.matchSummary.textContent = 'Sin coincidencias.';
  setAutoAdjustControls('balanceado');
  if (el.showActiveMatches) el.showActiveMatches.checked = true;
  if (el.useMultiSamples) el.useMultiSamples.checked = false;
  if (el.sampleEstimator) el.sampleEstimator.value = 'consensus_ncc';
  updateSamplePanelState(null);
  el.spectrogramTitle.textContent = state.file ? `Espectrograma · ${state.file.name}` : 'Sin espectrograma';
  if (el.btnApplyRoi) el.btnApplyRoi.disabled = true;
  if (el.btnSaveRoi) el.btnSaveRoi.disabled = true;
  if (el.btnClearRoi) el.btnClearRoi.disabled = true;
  if (el.btnAddTemplate) el.btnAddTemplate.disabled = true;
  if (el.btnSearchAllTemplates) el.btnSearchAllTemplates.disabled = true;
  if (el.btnRemoveTemplate) el.btnRemoveTemplate.disabled = true;
  el.btnSearch.disabled = true;
  el.btnClearMatches.disabled = true;
  el.btnExportCsv.disabled = true;
  if (el.btnExportXlsx) el.btnExportXlsx.disabled = true;
  if (el.btnExportTxt) el.btnExportTxt.disabled = true;
  clearMatchesTable();
  renderTemplateNavigator();
  resetPanelsForInitialState();
  drawOverlay();
}

function getActiveTemplate() {
  return state.templates.find(t => t.id === state.activeTemplateId) || null;
}

function makeTemplateId() {
  state.templateCounter += 1;
  return `tpl_${state.templateCounter}`;
}

function nextFonotipoName() {
  return `fonotipo${state.templateCounter + 1}`;
}

function colorForTemplateIndex(idx) {
  return CONFIG.templateColors[idx % CONFIG.templateColors.length];
}

function isTemplateValid(tpl) {
  if (!tpl) return false;
  if (tpl.useMultiSamples) {
    return Array.isArray(tpl.samples) && tpl.samples.some(isRoiValid);
  }
  return Boolean(Number.isFinite(tpl.tmin) && Number.isFinite(tpl.tmax) && Number.isFinite(tpl.fmin) && Number.isFinite(tpl.fmax) && tpl.tmax > tpl.tmin && tpl.fmax > tpl.fmin);
}

function isRoiValid(roi) {
  return Boolean(roi && Number.isFinite(roi.tmin) && Number.isFinite(roi.tmax) && Number.isFinite(roi.fmin) && Number.isFinite(roi.fmax) && roi.tmax > roi.tmin && roi.fmax > roi.fmin);
}
function cloneRoi(roi) {
  return roi ? { tmin: Number(roi.tmin), tmax: Number(roi.tmax), fmin: Number(roi.fmin), fmax: Number(roi.fmax) } : null;
}

function roiDuration(roi) {
  return roi && Number.isFinite(roi.tmax) && Number.isFinite(roi.tmin) ? Math.max(0, roi.tmax - roi.tmin) : 0;
}

function quantile(values, q) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const pos = clamp(q, 0, 1) * (clean.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(clean.length - 1, lo + 1);
  const u = pos - lo;
  return clean[lo] * (1 - u) + clean[hi] * u;
}

function sampleEstimatorLabel(value) {
  if (value === 'mean') return 'promedio alineado';
  if (value === 'median') return 'mediana alineada';
  if (value === 'medoid') return 'medoide';
  if (value === 'consensus_ncc') return 'consenso NCC';
  if (value === 'weighted_consensus') return 'consenso ponderado';
  return 'consenso NCC';
}

function compoundSupportFromSamples(samples) {
  const valid = (samples || []).filter(isRoiValid);
  if (!valid.length) return null;
  const fmin = quantile(valid.map(s => s.fmin), 0.10);
  const fmax = quantile(valid.map(s => s.fmax), 0.90);
  const dur = Math.max(...valid.map(roiDuration));
  const ref = valid[valid.length - 1];
  const center = (ref.tmin + ref.tmax) / 2;
  const tmin = clamp(center - dur / 2, 0, state.display ? state.display.duration : Infinity);
  const tmax = clamp(tmin + dur, 0, state.display ? state.display.duration : Infinity);
  return { tmin, tmax, fmin: Math.min(fmin, fmax), fmax: Math.max(fmin, fmax) };
}

function sameSample(a, b) {
  return sameRoi(a, b);
}


function roundForCache(v) {
  return Number.isFinite(Number(v)) ? Number(v).toFixed(4) : 'nan';
}

function samplesCacheKey(samples, estimator, outW, outH) {
  const valid = (samples || []).filter(isRoiValid);
  const body = valid.map(s => [s.tmin, s.tmax, s.fmin, s.fmax].map(roundForCache).join(',')).join('|');
  const disp = state.display ? `${state.display.width}x${state.display.height}:${roundForCache(state.display.fmin)}:${roundForCache(state.display.fmax)}:${state.display.freqScale}:${state.display.colormap}` : 'nodisplay';
  return `${estimator || 'consensus_ncc'}::${outW}x${outH}::${disp}::${body}`;
}

function samplesBaseCacheKey(samples, outW, outH) {
  const valid = (samples || []).filter(isRoiValid);
  const body = valid.map(s => [s.tmin, s.tmax, s.fmin, s.fmax].map(roundForCache).join(',')).join('|');
  const disp = state.display ? `${state.display.width}x${state.display.height}:${roundForCache(state.display.fmin)}:${roundForCache(state.display.fmax)}:${state.display.freqScale}:${state.display.colormap}` : 'nodisplay';
  return `${outW}x${outH}::${disp}::${body}`;
}

function workerCompoundKey(samples, estimator) {
  const valid = (samples || []).filter(isRoiValid);
  const body = valid.map(s => [s.tmin, s.tmax, s.fmin, s.fmax].map(roundForCache).join(',')).join('|');
  const disp = state.display ? `${state.display.width}x${state.display.height}:${roundForCache(state.display.fmin)}:${roundForCache(state.display.fmax)}:${state.display.freqScale}` : 'nodisplay';
  return `${estimator || 'consensus_ncc'}::${disp}::${body}`;
}

function warmWorkerCompoundTemplate(tpl, samples, estimator) {
  if (!state.worker || !tpl || !state.display) return;
  const valid = (samples || []).filter(isRoiValid);
  if (valid.length <= 1) return;
  const key = `${tpl.id}::${workerCompoundKey(valid, estimator)}`;
  if (state.workerCompoundWarmKeys.has(key)) return;
  state.workerCompoundWarmKeys.add(key);
  state.worker.postMessage({
    type: 'warm-compound-template',
    key,
    samples: valid.map(cloneRoi),
    sampleEstimator: estimator || 'consensus_ncc',
  });
}

function ensureTemplateCompositeCache(tpl) {
  if (!tpl) return null;
  if (!(tpl.previewCache instanceof Map)) tpl.previewCache = new Map();
  if (!(tpl.previewByMethod instanceof Map)) tpl.previewByMethod = new Map();
  return tpl.previewByMethod;
}

function clearTemplateCompositeCache(tpl) {
  if (!tpl) return;
  tpl.previewCacheKey = null;
  tpl.previewImageData = null;
  tpl.previewBaseKey = null;
  tpl.compoundCacheKey = null;
  tpl.workerCompoundCacheKey = null;
  if (tpl.previewCache && typeof tpl.previewCache.clear === 'function') tpl.previewCache.clear();
  tpl.previewCache = new Map();
  tpl.previewByMethod = new Map();
  // La caché del worker es interna; esta marca evita asumir que ya está precalentada
  // cuando cambiaron las muestras o el espectrograma.
  state.workerCompoundWarmKeys = new Set();
}

function setSampleProgress(text = '', pct = null, visible = true) {
  if (!el.sampleProgress) return;
  el.sampleProgress.classList.toggle('is-hidden', !visible);
  const bar = el.sampleProgress.querySelector('.sample-progress-bar');
  const label = el.sampleProgress.querySelector('.sample-progress-text');
  if (label) label.textContent = text;
  if (bar && typeof pct === 'number') bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

function updateSamplePanelState(tpl = getActiveTemplate()) {
  const enabled = Boolean(el.useMultiSamples?.checked);
  if (el.samplePanel) el.samplePanel.classList.toggle('is-hidden', !enabled);
  if (el.sampleEstimator) el.sampleEstimator.disabled = !enabled;
  if (el.btnAddSample) el.btnAddSample.disabled = !enabled || !isRoiValid(state.roi);
  const n = tpl && Array.isArray(tpl.samples) ? tpl.samples.filter(isRoiValid).length : 0;
  if (el.btnRemoveSample) el.btnRemoveSample.disabled = !enabled || n === 0;
  if (el.sampleSummary && enabled) {
    el.sampleSummary.textContent = n
      ? `Muestras agregadas: ${n}. Método: ${sampleEstimatorLabel(el.sampleEstimator?.value)}.`
      : 'Marca una caja y pulsa Agregar muestra.';
  }
  drawSamplePreview(tpl);
}

function drawSamplePreview(tpl = getActiveTemplate()) {
  const canvas = el.samplePreviewCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, w, h);

  const enabled = Boolean(el.useMultiSamples?.checked);
  const validSamples = tpl && Array.isArray(tpl.samples) ? tpl.samples.filter(isRoiValid) : [];
  if (!enabled || !state.display || !el.spectrogramCanvas || !validSamples.length) {
    state.samplePreviewToken++;
    setSampleProgress('', 0, false);
    drawPreviewEmpty(ctx, w, h, enabled ? 'Agrega muestras para ver la plantilla compuesta' : '');
    return;
  }

  const estimator = el.sampleEstimator?.value || tpl?.sampleEstimator || 'consensus_ncc';
  const baseKey = samplesBaseCacheKey(validSamples, w, h);
  const cacheKey = samplesCacheKey(validSamples, estimator, w, h);
  const cacheByMethod = tpl ? ensureTemplateCompositeCache(tpl) : null;
  if (tpl && tpl.previewBaseKey !== baseKey) {
    // Cambiaron muestras/espectrograma/tamaño de preview: se invalida solo esta familia.
    tpl.previewBaseKey = baseKey;
    tpl.previewByMethod = new Map();
  }
  const cachedPreview = cacheByMethod ? cacheByMethod.get(estimator) : null;
  if (cachedPreview) {
    ctx.putImageData(cachedPreview, 0, 0);
    drawSamplePreviewFrame(ctx, w, h, tpl, validSamples.length, estimator, true);
    setSampleProgress(`Plantilla compuesta en caché · ${sampleEstimatorLabel(estimator)}.`, 100, true);
    warmWorkerCompoundTemplate(tpl, validSamples, estimator);
    return;
  }
  // Compatibilidad con la caché vieja basada en una clave completa.
  if (tpl && tpl.previewCacheKey === cacheKey && tpl.previewImageData) {
    ensureTemplateCompositeCache(tpl).set(estimator, tpl.previewImageData);
    ctx.putImageData(tpl.previewImageData, 0, 0);
    drawSamplePreviewFrame(ctx, w, h, tpl, validSamples.length, estimator, true);
    setSampleProgress(`Plantilla compuesta en caché · ${sampleEstimatorLabel(estimator)}.`, 100, true);
    warmWorkerCompoundTemplate(tpl, validSamples, estimator);
    return;
  }

  const token = ++state.samplePreviewToken;
  drawPreviewEmpty(ctx, w, h, 'Calculando plantilla compuesta...');
  setSampleProgress('Calculando plantilla compuesta...', 18, true);

  window.setTimeout(() => {
    if (token !== state.samplePreviewToken) return;
    const activeTpl = getActiveTemplate();
    const currentSamples = activeTpl && Array.isArray(activeTpl.samples) ? activeTpl.samples.filter(isRoiValid) : [];
    const currentEstimator = el.sampleEstimator?.value || activeTpl?.sampleEstimator || 'consensus_ncc';
    const currentKey = samplesCacheKey(currentSamples, currentEstimator, w, h);
    if (!activeTpl || currentKey !== cacheKey) return;

    try {
      setSampleProgress('Alineando muestras y construyendo consenso...', 55, true);
      const composite = buildCompositePreviewImage(validSamples, w, h, estimator);
      if (token !== state.samplePreviewToken) return;
      if (composite) {
        ensureTemplateCompositeCache(activeTpl).set(estimator, composite);
        activeTpl.previewBaseKey = baseKey;
        activeTpl.previewCacheKey = cacheKey;
        activeTpl.previewImageData = composite;
        ctx.putImageData(composite, 0, 0);
        drawSamplePreviewFrame(ctx, w, h, activeTpl, validSamples.length, estimator, false);
        setSampleProgress(`Plantilla compuesta lista · ${sampleEstimatorLabel(estimator)}.`, 100, true);
        warmWorkerCompoundTemplate(activeTpl, validSamples, estimator);
      } else {
        drawPreviewEmpty(ctx, w, h, 'No pude construir la vista previa');
        setSampleProgress('No pude construir la plantilla compuesta.', 100, true);
      }
    } catch (err) {
      console.warn('No pude dibujar la plantilla compuesta:', err);
      drawPreviewEmpty(ctx, w, h, 'No pude construir la vista previa');
      setSampleProgress('Error al construir la plantilla compuesta.', 100, true);
    }
  }, 30);
}

function drawSamplePreviewFrame(ctx, w, h, tpl, sampleCount, estimatorValue, fromCache = false) {
  const color = tpl?.color || '#00e5ff';
  // El marco se aplica como borde CSS del canvas para no tapar píxeles
  // importantes de la plantilla compuesta.
  if (el.samplePreviewCanvas) {
    el.samplePreviewCanvas.style.borderColor = color;
    el.samplePreviewCanvas.style.boxShadow = `0 0 0 1px ${color}33`;
  }
  ctx.fillStyle = 'rgba(15,23,42,0.76)';
  ctx.fillRect(8, h - 30, Math.min(w - 16, 332), 22);
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px Arial';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const estimator = sampleEstimatorLabel(estimatorValue);
  const cacheNote = fromCache ? ' · caché' : '';
  ctx.fillText(`Plantilla compuesta · ${sampleCount} muestra(s) · ${estimator}${cacheNote}`, 14, h - 19);
}

function drawPreviewEmpty(ctx, w, h, text) {
  if (el.samplePreviewCanvas) {
    el.samplePreviewCanvas.style.borderColor = '#dbe4ee';
    el.samplePreviewCanvas.style.boxShadow = 'none';
  }
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, w, h);
  if (!text) return;
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);
}

function buildCompositePreviewImage(samples, outW, outH, estimator) {
  if (!samples.length || !state.display || !el.spectrogramCanvas) return null;
  const source = el.spectrogramCanvas;
  const support = compoundSupportFromSamples(samples);
  if (!support || !isRoiValid(support)) return null;

  const supportWidth = Math.max(4, Math.round(Math.max(...samples.map(s => Math.abs(timeToX(s.tmax) - timeToX(s.tmin))))));
  const sy1 = freqToY(support.fmax);
  const sy2 = freqToY(support.fmin);
  const supportHeight = Math.max(4, Math.round(Math.abs(sy2 - sy1)));

  const rawPatches = [];
  const tmp = document.createElement('canvas');
  tmp.width = outW;
  tmp.height = outH;
  const tctx = tmp.getContext('2d', { willReadFrequently: true });

  for (const sample of samples) {
    const centroid = previewEnergyCentroid(sample);
    const cropX = Math.round(centroid.x - supportWidth / 2);
    const cropY = Math.round(centroid.y - supportHeight / 2);
    tctx.clearRect(0, 0, outW, outH);
    tctx.fillStyle = '#0f172a';
    tctx.fillRect(0, 0, outW, outH);

    const srcX = clamp(cropX, 0, source.width - 1);
    const srcY = clamp(cropY, 0, source.height - 1);
    const srcX2 = clamp(cropX + supportWidth, 0, source.width);
    const srcY2 = clamp(cropY + supportHeight, 0, source.height);
    const sw = Math.max(1, srcX2 - srcX);
    const sh = Math.max(1, srcY2 - srcY);
    const dx = ((srcX - cropX) / supportWidth) * outW;
    const dy = ((srcY - cropY) / supportHeight) * outH;
    const dw = (sw / supportWidth) * outW;
    const dh = (sh / supportHeight) * outH;
    tctx.drawImage(source, srcX, srcY, sw, sh, dx, dy, dw, dh);
    rawPatches.push(new Uint8ClampedArray(tctx.getImageData(0, 0, outW, outH).data));
  }

  if (!rawPatches.length) return null;
  const method = estimator || 'consensus_ncc';
  const alignedInfo = alignPreviewPatchesBySimilarity(rawPatches, outW, outH);
  const patchArrays = alignedInfo.patches;
  const weights = alignedInfo.weights;

  if (method === 'medoid') {
    const idx = medoidIndexForImagePatches(patchArrays);
    return new ImageData(new Uint8ClampedArray(patchArrays[idx]), outW, outH);
  }

  const out = new Uint8ClampedArray(outW * outH * 4);
  if (method === 'mean') {
    for (let i = 0; i < out.length; i += 4) {
      let r = 0, g = 0, b = 0;
      for (const arr of patchArrays) { r += arr[i]; g += arr[i + 1]; b += arr[i + 2]; }
      out[i] = Math.round(r / patchArrays.length);
      out[i + 1] = Math.round(g / patchArrays.length);
      out[i + 2] = Math.round(b / patchArrays.length);
      out[i + 3] = 255;
    }
  } else if (method === 'weighted_consensus') {
    const sumWeights = weights.reduce((a, b) => a + b, 0) || 1;
    for (let i = 0; i < out.length; i += 4) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < patchArrays.length; k++) {
        const arr = patchArrays[k];
        const wk = weights[k] / sumWeights;
        r += wk * arr[i]; g += wk * arr[i + 1]; b += wk * arr[i + 2];
      }
      out[i] = Math.round(r); out[i + 1] = Math.round(g); out[i + 2] = Math.round(b); out[i + 3] = 255;
    }
  } else if (method === 'consensus_ncc') {
    const rv = [], gv = [], bv = [];
    for (let i = 0; i < out.length; i += 4) {
      rv.length = gv.length = bv.length = 0;
      for (const arr of patchArrays) { rv.push(arr[i]); gv.push(arr[i + 1]); bv.push(arr[i + 2]); }
      rv.sort((a, b) => a - b); gv.sort((a, b) => a - b); bv.sort((a, b) => a - b);
      out[i] = quantileByteSorted(rv, 0.70);
      out[i + 1] = quantileByteSorted(gv, 0.70);
      out[i + 2] = quantileByteSorted(bv, 0.70);
      out[i + 3] = 255;
    }
  } else {
    const rv = [], gv = [], bv = [];
    for (let i = 0; i < out.length; i += 4) {
      rv.length = gv.length = bv.length = 0;
      for (const arr of patchArrays) { rv.push(arr[i]); gv.push(arr[i + 1]); bv.push(arr[i + 2]); }
      rv.sort((a, b) => a - b); gv.sort((a, b) => a - b); bv.sort((a, b) => a - b);
      out[i] = medianByte(rv);
      out[i + 1] = medianByte(gv);
      out[i + 2] = medianByte(bv);
      out[i + 3] = 255;
    }
  }
  return new ImageData(out, outW, outH);
}

function alignPreviewPatchesBySimilarity(patches, w, h) {
  if (patches.length <= 1) return { patches, weights: patches.map(() => 1) };
  const refIdx = medoidIndexForImagePatches(patches);
  const ref = patches[refIdx];
  const maxDx = Math.max(1, Math.min(16, Math.round(w * 0.06)));
  const maxDy = Math.max(1, Math.min(10, Math.round(h * 0.10)));
  const aligned = [];
  const weights = [];
  for (let k = 0; k < patches.length; k++) {
    if (k === refIdx) {
      aligned.push(patches[k]);
      weights.push(1);
      continue;
    }
    let best = patches[k];
    let bestScore = weightedImageSimilarity(ref, best);
    for (let dy = -maxDy; dy <= maxDy; dy++) {
      for (let dx = -maxDx; dx <= maxDx; dx++) {
        if (dx === 0 && dy === 0) continue;
        const shifted = shiftImagePatch(patches[k], w, h, dx, dy);
        const score = weightedImageSimilarity(ref, shifted);
        if (score > bestScore) { bestScore = score; best = shifted; }
      }
    }
    aligned.push(best);
    weights.push(Math.max(0.05, clamp((bestScore + 1) / 2, 0.05, 1)));
  }
  return { patches: aligned, weights };
}

function shiftImagePatch(arr, w, h, dx, dy) {
  const out = new Uint8ClampedArray(arr.length);
  for (let i = 0; i < out.length; i += 4) { out[i] = 15; out[i + 1] = 23; out[i + 2] = 42; out[i + 3] = 255; }
  for (let y = 0; y < h; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= h) continue;
    for (let x = 0; x < w; x++) {
      const sx = x - dx;
      if (sx < 0 || sx >= w) continue;
      const src = (sy * w + sx) * 4;
      const dst = (y * w + x) * 4;
      out[dst] = arr[src]; out[dst + 1] = arr[src + 1]; out[dst + 2] = arr[src + 2]; out[dst + 3] = 255;
    }
  }
  return out;
}

function weightedImageSimilarity(a, b) {
  const valsA = [];
  const valsB = [];
  const step = Math.max(4, Math.floor(a.length / 2000 / 4) * 4);
  for (let i = 0; i < a.length; i += step) { valsA.push(luminance(a[i], a[i + 1], a[i + 2])); valsB.push(luminance(b[i], b[i + 1], b[i + 2])); }
  valsA.sort((x, y) => x - y); valsB.sort((x, y) => x - y);
  const thrA = valsA[Math.floor(valsA.length * 0.72)] || 0;
  const thrB = valsB[Math.floor(valsB.length * 0.72)] || 0;
  let sumW = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i += 4) {
    const la = luminance(a[i], a[i + 1], a[i + 2]);
    const lb = luminance(b[i], b[i + 1], b[i + 2]);
    const weight = Math.max(Math.max(0, la - thrA), Math.max(0, lb - thrB)) + 1e-3;
    sumW += weight; ma += weight * la; mb += weight * lb;
  }
  if (sumW <= 1e-9) return 0;
  ma /= sumW; mb /= sumW;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i += 4) {
    const la = luminance(a[i], a[i + 1], a[i + 2]);
    const lb = luminance(b[i], b[i + 1], b[i + 2]);
    const weight = Math.max(Math.max(0, la - thrA), Math.max(0, lb - thrB)) + 1e-3;
    const xa = la - ma; const xb = lb - mb;
    num += weight * xa * xb; da += weight * xa * xa; db += weight * xb * xb;
  }
  return num / (Math.sqrt(da * db) + 1e-9);
}

function quantileByteSorted(values, q) {
  if (!values.length) return 0;
  const pos = clamp(q, 0, 1) * (values.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(values.length - 1, lo + 1);
  const u = pos - lo;
  return Math.round(values[lo] * (1 - u) + values[hi] * u);
}

function medoidIndexForImagePatches(patches) {
  if (patches.length <= 1) return 0;
  const vectors = patches.map(arr => imagePatchVector(arr));
  let bestIdx = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < vectors.length; i++) {
    let sum = 0;
    for (let j = 0; j < vectors.length; j++) {
      if (i === j) continue;
      sum += dotVectors(vectors[i], vectors[j]);
    }
    if (sum > bestScore) { bestScore = sum; bestIdx = i; }
  }
  return bestIdx;
}

function imagePatchVector(arr) {
  const step = Math.max(4, Math.floor(arr.length / 900));
  const vals = [];
  for (let i = 0; i < arr.length; i += step * 4) vals.push(luminance(arr[i], arr[i + 1], arr[i + 2]));
  const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
  let norm = 0;
  for (let i = 0; i < vals.length; i++) { vals[i] -= mean; norm += vals[i] * vals[i]; }
  norm = Math.sqrt(norm) || 1;
  return vals.map(v => v / norm);
}

function dotVectors(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function medianByte(values) {
  if (!values.length) return 0;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : Math.round((values[mid - 1] + values[mid]) / 2);
}

function previewEnergyCentroid(roi) {
  const source = el.spectrogramCanvas;
  const ctx = source.getContext('2d', { willReadFrequently: true });
  const x1 = Math.floor(timeToX(roi.tmin));
  const x2 = Math.ceil(timeToX(roi.tmax));
  const y1 = Math.floor(freqToY(roi.fmax));
  const y2 = Math.ceil(freqToY(roi.fmin));
  const x = clamp(Math.min(x1, x2), 0, source.width - 1);
  const y = clamp(Math.min(y1, y2), 0, source.height - 1);
  const w = clamp(Math.abs(x2 - x1), 1, source.width - x);
  const h = clamp(Math.abs(y2 - y1), 1, source.height - y);
  const data = ctx.getImageData(x, y, w, h).data;
  const lum = [];
  const step = Math.max(4, Math.floor(data.length / 1600 / 4) * 4);
  for (let i = 0; i < data.length; i += step) lum.push(luminance(data[i], data[i + 1], data[i + 2]));
  lum.sort((a, b) => a - b);
  const thr = lum.length ? lum[Math.floor(lum.length * 0.75)] : 0;
  let sumW = 0, sumX = 0, sumY = 0;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const idx = (py * w + px) * 4;
      const weight = Math.max(0, luminance(data[idx], data[idx + 1], data[idx + 2]) - thr);
      if (weight > 0) {
        sumW += weight;
        sumX += (x + px) * weight;
        sumY += (y + py) * weight;
      }
    }
  }
  if (sumW <= 1e-9) return { x: x + w / 2, y: y + h / 2 };
  return { x: sumX / sumW, y: sumY / sumW };
}

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ensureActiveTemplateForSamples() {
  let tpl = getActiveTemplate();
  if (!tpl) {
    tpl = createDraftTemplate();
    if (el.roiLabel) el.roiLabel.value = displayLabelForTemplate(tpl);
  }
  tpl.useMultiSamples = Boolean(el.useMultiSamples?.checked);
  tpl.sampleEstimator = el.sampleEstimator?.value || tpl.sampleEstimator || 'consensus_ncc';
  tpl.expertParams = expertParamsFromUi();
  if (!Array.isArray(tpl.samples)) tpl.samples = [];
  return tpl;
}

function addCurrentSampleToActiveTemplate({ silent = false } = {}) {
  if (!isRoiValid(state.roi)) {
    if (!silent) showToast('Sin muestra válida', 'Marca una caja antes de agregar una muestra.');
    return null;
  }
  const tpl = ensureActiveTemplateForSamples();
  tpl.useMultiSamples = true;
  tpl.sampleEstimator = el.sampleEstimator?.value || 'consensus_ncc';
  const sample = cloneRoi(state.roi);
  const exists = tpl.samples.some(s => sameRoiLoose(s, sample, 0.02, 10));
  if (!exists) {
    tpl.samples.push(sample);
    clearTemplateCompositeCache(tpl);
  }
  const support = compoundSupportFromSamples(tpl.samples);
  if (support) {
    tpl.tmin = support.tmin; tpl.tmax = support.tmax; tpl.fmin = support.fmin; tpl.fmax = support.fmax;
  }
  tpl.matches = [];
  tpl.hasSearched = false;
  tpl.autoAdjust = true;
  tpl.autoAdjustMode = 'balanceado';
  tpl.showMatches = true;
  tpl.isDraft = false;
  state.activeTemplateId = tpl.id;
  if (el.useMultiSamples) el.useMultiSamples.checked = true;
  if (el.sampleEstimator) el.sampleEstimator.value = tpl.sampleEstimator;
  updateSamplePanelState(tpl);
  renderTemplateNavigator();
  updateSearchButtonsState();
  drawOverlay();
  if (!silent) showToast('Muestra agregada', `${displayLabelForTemplate(tpl)} tiene ${tpl.samples.length} muestra(s).`);
  return tpl;
}

function removeLastSampleFromActiveTemplate() {
  const tpl = getActiveTemplate();
  if (!tpl || !Array.isArray(tpl.samples) || !tpl.samples.length) return;
  tpl.samples.pop();
  clearTemplateCompositeCache(tpl);
  const support = compoundSupportFromSamples(tpl.samples);
  if (support) {
    tpl.tmin = support.tmin; tpl.tmax = support.tmax; tpl.fmin = support.fmin; tpl.fmax = support.fmax;
  } else {
    tpl.tmin = tpl.tmax = tpl.fmin = tpl.fmax = 0;
  }
  tpl.matches = [];
  tpl.hasSearched = false;
  tpl.autoAdjust = true;
  tpl.autoAdjustMode = 'balanceado';
  updateSamplePanelState(tpl);
  renderTemplateNavigator();
  refreshCombinedMatches();
  updateSamplePanelState(tpl);
  updateSearchSummaryText();
  drawOverlay();
}

function hasSearchableTemplateOrCurrentRoi() {
  return state.templates.some(isTemplateValid) || isRoiValid(state.roi);
}

function getPendingTemplates() {
  return state.templates.filter(t => isTemplateValid(t) && !t.hasSearched);
}

function shouldBlockCanvasRoiEdit() {
  // Ya no bloqueamos el dibujo sobre el espectrograma después de una búsqueda.
  // Si la plantilla activa ya fue buscada y el usuario dibuja otra caja,
  // esa caja se convierte en una nueva plantilla, no reemplaza la anterior.
  return false;
}

function hasPendingTemplateOrCurrentRoi() {
  return getPendingTemplates().length > 0 || isRoiValid(state.roi);
}

function updateSearchButtonsState() {
  const enabled = hasSearchableTemplateOrCurrentRoi();
  const active = getActiveTemplate();
  const roiCreatesOrChangesTemplate = isRoiValid(state.roi) && (!active || !sameRoi(state.roi, active));
  const pendingCount = getPendingTemplates().length + (roiCreatesOrChangesTemplate ? 1 : 0);

  if (el.btnSearchAllTemplates) {
    el.btnSearchAllTemplates.disabled = !enabled;
    if (!enabled) {
      el.btnSearchAllTemplates.textContent = 'Dibuja una plantilla';
    } else if (pendingCount > 1) {
      el.btnSearchAllTemplates.textContent = `Buscar ${pendingCount} pendientes`;
    } else if (pendingCount === 1) {
      el.btnSearchAllTemplates.textContent = 'Buscar plantilla pendiente';
    } else {
      el.btnSearchAllTemplates.textContent = 'Buscar coincidencias';
    }
  }

  if (el.btnSearch) {
    el.btnSearch.disabled = !enabled;
    if (!enabled) {
      el.btnSearch.textContent = 'Sin plantilla';
    } else if (active && isTemplateValid(active)) {
      el.btnSearch.textContent = 'Buscar similares';
    } else {
      el.btnSearch.textContent = 'Buscar similares';
    }
  }
}

function createDraftTemplate() {
  const id = makeTemplateId();
  const defaultLabel = `fonotipo${state.templateCounter}`;
  const tpl = {
    id,
    defaultLabel,
    etiqueta: defaultLabel,
    color: colorForTemplateIndex(state.templates.length),
    metric: el.metricSelect?.value || 'coseno',
    scoreThreshold: Number(el.scoreThreshold?.value || 0.85),
    strideSec: Number(el.strideSec?.value || 0.10),
    autoAdjust: true,
    autoAdjustMode: 'balanceado',
    showMatches: true,
    expertParams: expertParamsFromUi(),
    useMultiSamples: Boolean(el.useMultiSamples?.checked),
    sampleEstimator: el.sampleEstimator?.value || 'consensus_ncc',
    samples: [],
    previewCache: new Map(),
    matches: [],
    hasSearched: false,
    tmin: 0,
    tmax: 0,
    fmin: 0,
    fmax: 0,
    isDraft: true,
  };
  state.templates.push(tpl);
  state.activeTemplateId = id;
  return tpl;
}

function displayLabelForTemplate(tpl) {
  if (!tpl) return '';
  return cleanLabel(tpl.etiqueta || tpl.defaultLabel || '');
}

function syncActiveTemplateParamsFromUi() {
  const tpl = getActiveTemplate();
  if (!tpl) return;

  tpl.metric = el.metricSelect.value;
  tpl.scoreThreshold = Number(el.scoreThreshold.value);
  tpl.strideSec = Number(el.strideSec.value);
  tpl.autoAdjustMode = normalizeAutoAdjustMode(el.autoAdjustMode?.value || getTemplateAutoMode(tpl));
  tpl.autoAdjust = isAutoModeActive(tpl.autoAdjustMode);
  tpl.showMatches = Boolean(el.showActiveMatches?.checked);
  tpl.useMultiSamples = Boolean(el.useMultiSamples?.checked);
  tpl.sampleEstimator = el.sampleEstimator?.value || tpl.sampleEstimator || 'consensus_ncc';
  tpl.expertParams = expertParamsFromUi();
  if (!Array.isArray(tpl.samples)) tpl.samples = [];
  updateSamplePanelState(tpl);

  // Mantener sincronía bidireccional de etiquetas:
  // - tabla -> plantilla ya usa updateTemplateLabel()
  // - plantilla -> tabla debe propagar a matches, chips, cajas y exportación
  const currentLabel = displayLabelForTemplate(tpl);
  const nextLabel = cleanLabel(el.roiLabel?.value || tpl.etiqueta || tpl.defaultLabel || '');

  if (nextLabel && nextLabel !== currentLabel) {
    updateTemplateLabel(tpl.id, nextLabel, { silent: true });
  }
}

function applyTemplateToFields(tpl) {
  if (!tpl) {
    el.roiTmin.value = 0;
    el.roiTmax.value = 0;
    el.roiFmin.value = 0;
    el.roiFmax.value = 0;
    if (el.roiLabel) el.roiLabel.value = '';
    if (el.showActiveMatches) el.showActiveMatches.checked = true;
    setExpertControls({ enabled: false });
    if (el.useMultiSamples) el.useMultiSamples.checked = false;
    if (el.sampleEstimator) el.sampleEstimator.value = 'consensus_ncc';
    updateSamplePanelState(null);
    el.roiSummary.textContent = 'Sin plantilla.';
    state.roi = null;
    drawOverlay();
    return;
  }
  state.roi = { tmin: tpl.tmin, tmax: tpl.tmax, fmin: tpl.fmin, fmax: tpl.fmax };
  el.roiTmin.value = fmt(tpl.tmin, 3);
  el.roiTmax.value = fmt(tpl.tmax, 3);
  el.roiFmin.value = fmt(tpl.fmin, 1);
  el.roiFmax.value = fmt(tpl.fmax, 1);
  if (el.roiLabel) el.roiLabel.value = displayLabelForTemplate(tpl);
  el.metricSelect.value = tpl.metric || 'coseno';
  setScoreControls(tpl.scoreThreshold ?? 0.85);
  setStrideControls(tpl.strideSec ?? 0.10);
  setAutoAdjustControls(getTemplateAutoMode(tpl));
  setExpertControls(tpl.expertParams || {});
  if (el.showActiveMatches) el.showActiveMatches.checked = tpl.showMatches !== false;
  if (el.useMultiSamples) el.useMultiSamples.checked = Boolean(tpl.useMultiSamples);
  if (el.sampleEstimator) el.sampleEstimator.value = tpl.sampleEstimator || 'consensus_ncc';
  updateSamplePanelState(tpl);
  if (el.btnSaveRoi) el.btnSaveRoi.disabled = false;
  if (el.btnClearRoi) el.btnClearRoi.disabled = false;
  if (el.btnRemoveTemplate) el.btnRemoveTemplate.disabled = false;
  updateSearchButtonsState();
  el.roiSummary.textContent = `Plantilla activa: ${displayLabelForTemplate(tpl)} · t=[${fmt(tpl.tmin)}, ${fmt(tpl.tmax)}] s · f=[${fmt(tpl.fmin, 1)}, ${fmt(tpl.fmax, 1)}] Hz`;
  drawOverlay();
}

function renderTemplateNavigator() {
  const chipTargets = [el.templateChips, el.searchTemplateChips].filter(Boolean);
  for (const target of chipTargets) target.innerHTML = '';

  if (!state.templates.length) {
    if (el.templatePager) el.templatePager.textContent = 'Sin plantillas';
    if (el.searchTemplatePager) el.searchTemplatePager.textContent = 'Sin plantillas';
    if (el.btnPrevTemplate) el.btnPrevTemplate.disabled = true;
    if (el.btnNextTemplate) el.btnNextTemplate.disabled = true;
    if (el.btnPrevSearchTemplate) el.btnPrevSearchTemplate.disabled = true;
    if (el.btnNextSearchTemplate) el.btnNextSearchTemplate.disabled = true;
    if (el.btnRemoveTemplate) el.btnRemoveTemplate.disabled = true;
    if (el.btnSearchAllTemplates) el.btnSearchAllTemplates.disabled = true;
    return;
  }

  const renderInto = (target) => {
    if (!target) return;
    state.templates.forEach((tpl, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `template-chip${tpl.id === state.activeTemplateId ? ' active' : ''}`;
      btn.style.setProperty('--tpl-color', tpl.color);
      const statusIcon = !isTemplateValid(tpl) ? '○' : (tpl.hasSearched ? '✓' : '!');
      const statusText = !isTemplateValid(tpl) ? 'sin caja válida' : (tpl.hasSearched ? 'buscada' : 'pendiente');
      btn.innerHTML = `<span class="chip-status" aria-hidden="true">${statusIcon}</span><span class="chip-label">${escapeHtml(displayLabelForTemplate(tpl))}</span>`;
      btn.title = `Plantilla ${idx + 1} · ${statusText}`;
      btn.addEventListener('click', () => setActiveTemplate(tpl.id));
      target.appendChild(btn);
    });
  };

  chipTargets.forEach(renderInto);

  const activeIdx = state.templates.findIndex(t => t.id === state.activeTemplateId);
  if (activeIdx < 0) {
    const pagerText = 'Nueva plantilla · dibuja una caja';
    if (el.templatePager) el.templatePager.textContent = pagerText;
    if (el.searchTemplatePager) el.searchTemplatePager.textContent = 'Selecciona una plantilla';
    if (el.btnPrevTemplate) el.btnPrevTemplate.disabled = true;
    if (el.btnNextTemplate) el.btnNextTemplate.disabled = true;
    if (el.btnPrevSearchTemplate) el.btnPrevSearchTemplate.disabled = true;
    if (el.btnNextSearchTemplate) el.btnNextSearchTemplate.disabled = true;
    if (el.btnRemoveTemplate) el.btnRemoveTemplate.disabled = true;
    if (typeof updateSearchButtonsState === 'function') updateSearchButtonsState();
    return;
  }

  const idx = activeIdx;
  const tpl = state.templates[idx];
  const pagerText = `Plantilla ${idx + 1} de ${state.templates.length} · ${displayLabelForTemplate(tpl)}`;
  if (el.templatePager) el.templatePager.textContent = pagerText;
  if (el.searchTemplatePager) el.searchTemplatePager.textContent = pagerText;
  if (el.btnPrevTemplate) el.btnPrevTemplate.disabled = state.templates.length <= 1;
  if (el.btnNextTemplate) el.btnNextTemplate.disabled = state.templates.length <= 1;
  if (el.btnPrevSearchTemplate) el.btnPrevSearchTemplate.disabled = state.templates.length <= 1;
  if (el.btnNextSearchTemplate) el.btnNextSearchTemplate.disabled = state.templates.length <= 1;
  if (el.btnRemoveTemplate) el.btnRemoveTemplate.disabled = false;
  if (typeof updateSearchButtonsState === 'function') updateSearchButtonsState();
}
function setActiveTemplate(id) {
  syncActiveTemplateParamsFromUi();
  const tpl = state.templates.find(t => t.id === id);
  if (!tpl) return;
  state.activeTemplateId = id;
  renderTemplateNavigator();
  applyTemplateToFields(tpl);
  updateSearchSummaryText();
  setCoach('Plantilla activa', `Edita o busca similares para ${displayLabelForTemplate(tpl)}.`);
}

function activeTemplateIndex() {
  return state.templates.findIndex(t => t.id === state.activeTemplateId);
}

function goTemplate(delta) {
  if (!state.templates.length) return;
  const idx = activeTemplateIndex();
  const next = (idx + delta + state.templates.length) % state.templates.length;
  setActiveTemplate(state.templates[next].id);
}

function clearFieldsForNewTemplate() {
  state.roi = null;
  el.roiTmin.value = 0;
  el.roiTmax.value = 0;
  el.roiFmin.value = 0;
  el.roiFmax.value = 0;
  if (el.roiLabel) el.roiLabel.value = '';
  if (el.useMultiSamples) el.useMultiSamples.checked = false;
  if (el.sampleEstimator) el.sampleEstimator.value = 'consensus_ncc';
  updateSamplePanelState(null);
  setAutoAdjustControls('balanceado');
  if (el.showActiveMatches) el.showActiveMatches.checked = true;
  el.roiSummary.textContent = 'Dibuja una caja para crear la primera plantilla.';
  if (el.btnSaveRoi) el.btnSaveRoi.disabled = true;
  if (el.btnClearRoi) el.btnClearRoi.disabled = false;
  updateSearchButtonsState();
  drawOverlay();
}

function addTemplatePlaceholder() {
  syncActiveTemplateParamsFromUi();
  const tpl = createDraftTemplate();
  state.roi = null;
  el.roiTmin.value = 0;
  el.roiTmax.value = 0;
  el.roiFmin.value = 0;
  el.roiFmax.value = 0;
  if (el.roiLabel) el.roiLabel.value = displayLabelForTemplate(tpl);
  el.roiSummary.textContent = 'Dibuja una caja para esta plantilla.';
  if (el.btnSaveRoi) el.btnSaveRoi.disabled = true;
  if (el.btnClearRoi) el.btnClearRoi.disabled = false;
  renderTemplateNavigator();
  drawOverlay();
  setStatus('Nueva plantilla', 'Dibuja una caja y pulsa Agregar plantilla +.');
  setCoach('Nueva plantilla', 'Marca otro fonotipo o patrón acústico. Si no escribes etiqueta, se usará fonotipo automático.');
  openRoiStep();
}
function removeActiveTemplate() {
  const idx = activeTemplateIndex();
  if (idx < 0) return;
  const removed = state.templates[idx];
  state.templates.splice(idx, 1);
  state.matches = getAllMatches();
  if (!state.templates.length) {
    state.activeTemplateId = null;
    state.roi = null;
    clearFieldsForNewTemplate();
    if (el.roiLabel) el.roiLabel.value = '';
    el.roiSummary.textContent = 'Sin plantilla. Dibuja una caja para crear una nueva.';
    el.btnSearch.disabled = true;
    if (el.btnSearchAllTemplates) el.btnSearchAllTemplates.disabled = true;
    if (el.btnRemoveTemplate) el.btnRemoveTemplate.disabled = true;
  } else {
    const next = state.templates[Math.min(idx, state.templates.length - 1)];
    state.activeTemplateId = next.id;
    applyTemplateToFields(next);
  }
  renderTemplateNavigator();
  renderMatchesTable();
  updateExportButtons();
  drawOverlay();
  showToast('Plantilla eliminada', `${displayLabelForTemplate(removed)} fue retirada con sus coincidencias.`);
}
function getAllMatches() {
  return state.templates.flatMap(tpl => (tpl.matches || []).map(m => ({ ...m })));
}

function refreshCombinedMatches() {
  state.matches = getAllMatches();
  state.tableSort = { key: 'score', dir: 'desc' };
  renderMatchesTable();
  updateExportButtons();
}

function updateExportButtons() {
  const any = state.matches.length > 0;
  el.btnClearMatches.disabled = !getActiveTemplate() || !(getActiveTemplate().matches || []).length;
  el.btnExportCsv.disabled = !any;
  if (el.btnExportXlsx) el.btnExportXlsx.disabled = !any;
  if (el.btnExportTxt) el.btnExportTxt.disabled = !any;
}

function updateSearchSummaryText() {
  const tpl = getActiveTemplate ? getActiveTemplate() : null;

  if (!tpl) {
    el.matchSummary.textContent = 'Sin plantilla seleccionada.';
    return 0;
  }

  const label = displayLabelForTemplate(tpl);
  const tplMatches = tpl.matches || [];
  const total = tplMatches.length;
  const best = total ? Math.max(...tplMatches.map(m => m.score || 0)) : 0;

  const lastAuto = tpl.lastAuto || null;
  const autoNote = lastAuto
    ? ` Auto: score ${Number(lastAuto.scoreThreshold).toFixed(3)}, sep ${Number(lastAuto.strideSec).toFixed(2)} s.`
    : '';

  if (!isTemplateValid(tpl)) {
    el.matchSummary.textContent = `${label}: sin caja válida. Dibuja una plantilla antes de buscar.`;
  } else if (total) {
    el.matchSummary.textContent = `${label}: ${total} coincidencias encontradas. Mejor score: ${best.toFixed(3)}.${autoNote}`;
  } else if (tpl.hasSearched) {
    el.matchSummary.textContent = `${label}: sin coincidencias.${autoNote}`;
  } else {
    el.matchSummary.textContent = `${label}: pendiente de búsqueda.`;
  }
  return total;
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

  if (msg.type === 'compound-template-warmed') {
    return;
  }

  if (msg.type === 'search-progress') {
    updateProcessing(msg.message || 'Buscando...', msg.progress ?? 50);
    return;
  }

  if (msg.type === 'search-ready') {
    const tpl = state.templates.find(t => t.id === state.currentSearchTemplateId) || getActiveTemplate();
    if (msg.auto && tpl) {
      if (Number.isFinite(msg.auto.scoreThreshold)) tpl.scoreThreshold = msg.auto.scoreThreshold;
      if (Number.isFinite(msg.auto.strideSec)) tpl.strideSec = msg.auto.strideSec;
      tpl.lastAuto = {
        scoreThreshold: tpl.scoreThreshold,
        strideSec: tpl.strideSec,
      };
      tpl.autoAdjust = false;
      tpl.autoAdjustMode = 'none';
    } else if (tpl) {
      tpl.lastAuto = null;
    }
    if (tpl) {
      const etiqueta = displayLabelForTemplate(tpl);
      tpl.matches = (msg.matches || []).map(m => ({ ...addEtiquetaToMatch(m, etiqueta), templateId: tpl.id, templateLabel: etiqueta, color: tpl.color }));
      tpl.hasSearched = true;
      tpl.showMatches = tpl.showMatches !== false;
      state.searchResultsAccumulator.push({ template: tpl, count: tpl.matches.length, auto: msg.auto || null });
    }

    if (state.searchQueue.length > 0) {
      startNextSearchInQueue();
      return;
    }

    hideProcessing();
    if (state.currentSearchAll || !state.hasSearched) {
      state.hasSearched = true;
      setAutoAdjustControls('none');
    }
    state.currentSearchTemplateId = null;
    state.currentSearchAll = false;
    state.forceAutoSearch = false;
    refreshCombinedMatches();
    renderTemplateNavigator();
    updateSearchButtonsState();
    const active = getActiveTemplate();
    if (active) applyTemplateToFields(active);
    drawOverlay();

    const total = updateSearchSummaryText();
    const searchedNames = state.searchResultsAccumulator
      .filter(x => x.template)
      .map(x => displayLabelForTemplate(x.template))
      .join(', ') || 'la plantilla activa';
    setStatus('Revisa resultados', total ? 'Las cajas de colores son candidatos similares a sus plantillas.' : 'Baja el score o cambia la plantilla si no aparecen coincidencias.');
    setCoach('Revisa los candidatos', total ? `Búsqueda terminada para: ${searchedNames}. Puedes editar etiquetas en la tabla y se propagan por plantilla.` : 'No aparecieron candidatos. Prueba bajar el score mínimo o marca una plantilla más ajustada.');
    showToast('Búsqueda terminada', total ? `Encontré ${total} coincidencias.` : 'No encontré coincidencias con esos parámetros.');
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
  if (el.btnApplyRoi) el.btnApplyRoi.disabled = false;
  if (el.btnAddTemplate) el.btnAddTemplate.disabled = false;
  if (el.btnSaveRoi) el.btnSaveRoi.disabled = true;
  if (el.btnClearRoi) el.btnClearRoi.disabled = false;
  clearFieldsForNewTemplate();
  if (el.roiLabel) el.roiLabel.value = '';
  el.roiSummary.textContent = 'Dibuja una caja para crear la primera plantilla.';
  updateSearchButtonsState();
  renderTemplateNavigator();
  drawOverlay();
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

    // Para no recortar artificialmente el espectrograma a 16 kHz,
    // se conserva por defecto el sample rate nativo del audio decodificado.
    // Así el eje de frecuencia llega hasta Nyquist: decoded.sampleRate / 2.
    const processingSampleRate = decoded.sampleRate;
    const processed = new Float32Array(mono);
    state.samples = processed;
    state.sampleRate = processingSampleRate;
    state.duration = processed.length / processingSampleRate;
    if (el.audioInfo) el.audioInfo.textContent = `${bytesToMb(file.size)} MB · duración ${state.duration.toFixed(2)} s · sample rate ${Math.round(processingSampleRate)} Hz`;
    ensureWorker();
    state.worker.postMessage({
      type: 'build-spectrogram',
      samples: processed,
      sampleRate: processingSampleRate,
      config: currentSpectrogramConfig(),
    }, [processed.buffer]);
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

  // Los ejes se configuran en layoutSpectrogramStage() con alta densidad de píxeles.
  // No se dejan aquí con el tamaño natural porque el navegador los escala y las letras quedan borrosas.

  const ctx = el.spectrogramCanvas.getContext('2d');
  const imageData = new ImageData(new Uint8ClampedArray(buffer), width, height);
  ctx.putImageData(imageData, 0, 0);

  layoutSpectrogramStage();
  drawAxes();
  drawOverlay();
  updatePlayhead(true);
}

function setupHiDpiCanvas(canvas, cssWidth, cssHeight) {
  const rawDpr = window.devicePixelRatio || 1;
  const maxCanvasSide = 32767;
  const safeDpr = Math.max(1, Math.min(
    rawDpr,
    maxCanvasSide / Math.max(1, cssWidth),
    maxCanvasSide / Math.max(1, cssHeight)
  ));
  canvas.width = Math.max(1, Math.round(cssWidth * safeDpr));
  canvas.height = Math.max(1, Math.round(cssHeight * safeDpr));
  canvas.dataset.dpr = String(safeDpr);
  return safeDpr;
}

function resetHiDpiContext(ctx, canvas, cssWidth, cssHeight) {
  const dpr = Number(canvas.dataset.dpr || 1);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { dpr, W: cssWidth, H: cssHeight };
}

function layoutSpectrogramStage() {
  if (!state.display) return;
  const width = state.display.width;
  const naturalHeight = state.display.height;

  // El visor usa todo el alto útil: espectrograma + eje temporal + barra horizontal.
  // clientHeight ya descuenta la barra horizontal nativa; no restamos margen extra.
  const viewportH = Math.max(260, el.spectrogramViewport.clientHeight || naturalHeight + CONFIG.timeAxisH);
  const availableForSpec = Math.max(220, viewportH - CONFIG.timeAxisH);
  const visualHeight = availableForSpec;

  state.visualHeight = visualHeight;
  state.visualScaleY = visualHeight / Math.max(1, naturalHeight);

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
  setupHiDpiCanvas(el.freqAxisCanvas, CONFIG.freqAxisW, visualHeight);

  el.timeAxisCanvas.style.width = `${width}px`;
  el.timeAxisCanvas.style.height = `${CONFIG.timeAxisH}px`;
  el.timeAxisCanvas.style.top = `${visualHeight}px`;
  setupHiDpiCanvas(el.timeAxisCanvas, width, CONFIG.timeAxisH);

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
  resetHiDpiContext(ctx, el.timeAxisCanvas, W, H);

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0.5);
  ctx.lineTo(W, 0.5);
  ctx.stroke();

  ctx.fillStyle = '#334155';
  ctx.font = '12px Inter, Arial, sans-serif';
  ctx.textBaseline = 'top';
  const step = chooseTimeStep(state.display.duration);
  for (let t = 0; t <= state.display.duration + 1e-9; t += step) {
    const x = timeToX(t);
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, 7);
    ctx.stroke();

    if (x < 22) ctx.textAlign = 'left';
    else if (x > W - 28) ctx.textAlign = 'right';
    else ctx.textAlign = 'center';
    ctx.fillText(prettyTime(t), clamp(x, 2, W - 2), 10);
  }
}

function drawFreqAxis() {
  const ctx = el.freqAxisCanvas.getContext('2d');
  const W = CONFIG.freqAxisW;
  const H = state.visualHeight || state.display.height;
  const scaleY = H / Math.max(1, state.display.height);
  resetHiDpiContext(ctx, el.freqAxisCanvas, W, H);

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W - 0.5, 0);
  ctx.lineTo(W - 0.5, H);
  ctx.stroke();

  ctx.fillStyle = '#334155';
  ctx.font = '11.5px Inter, Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  const step = chooseFreqStep();
  const ticks = [];
  for (let f = state.display.fmin; f <= state.display.fmax + 1e-9; f += step) ticks.push(f);
  if (!ticks.some(f => Math.abs(f - state.display.fmax) < 1e-6)) ticks.push(state.display.fmax);

  for (const f of ticks) {
    const yRawNatural = freqToY(f);
    const yRaw = yRawNatural * scaleY;
    const y = clamp(yRaw, 12, H - 12);
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(W - 7, yRaw + 0.5);
    ctx.lineTo(W, yRaw + 0.5);
    ctx.stroke();
    ctx.fillStyle = '#334155';
    ctx.fillText(prettyFreq(f), W - 9, y);
  }

  ctx.save();
  ctx.translate(12, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#64748b';
  ctx.font = '11px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
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
  drawTemplates(ctx);
  const active = getActiveTemplate();
  const roiAlreadySample = active && active.useMultiSamples && Array.isArray(active.samples)
    ? active.samples.some(s => sameRoi(state.roi, s))
    : false;
  const shouldDrawTemp = state.roi && (
    !active ||
    !sameRoi(state.roi, active) ||
    (active.useMultiSamples && !roiAlreadySample)
  );
  if (shouldDrawTemp) {
    // Caja temporal de selección: negra y entrecortada para contrastar con magma.
    drawRoi(ctx, state.roi, '', '#000000', 'rgba(0,0,0,0.04)', 2.5, false, true);
  }
}

function sameRoi(a, b) {
  if (!a || !b) return false;
  return Math.abs(a.tmin - b.tmin) < 1e-6 && Math.abs(a.tmax - b.tmax) < 1e-6 && Math.abs(a.fmin - b.fmin) < 1e-6 && Math.abs(a.fmax - b.fmax) < 1e-6;
}

function sameRoiLoose(a, b, timeTol = 0.01, freqTol = 5) {
  if (!a || !b) return false;
  return Math.abs(Number(a.tmin) - Number(b.tmin)) <= timeTol
    && Math.abs(Number(a.tmax) - Number(b.tmax)) <= timeTol
    && Math.abs(Number(a.fmin) - Number(b.fmin)) <= freqTol
    && Math.abs(Number(a.fmax) - Number(b.fmax)) <= freqTol;
}

function hexToRgba(hex, alpha) {
  const h = String(hex || '#00e5ff').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawMatches(ctx) {
  const matches = state.matches || [];
  ctx.font = '11px Arial';
  for (const m of matches.slice(0, CONFIG.maxMatchesToDraw)) {
    const tpl = state.templates.find(t => t.id === m.templateId);
    if (tpl && tpl.showMatches === false) continue;
    const color = m.color || tpl?.color || '#00e5ff';
    const x1 = timeToX(m.tmin);
    const x2 = timeToX(m.tmax);
    const y1 = freqToY(m.fmax);
    const y2 = freqToY(m.fmin);
    const rx = Math.min(x1, x2);
    const ry = Math.min(y1, y2);
    const rw = Math.abs(x2 - x1);
    const rh = Math.abs(y2 - y1);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.fillStyle = hexToRgba(color, 0.12);
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.fillStyle = color;
    ctx.fillText(m.score.toFixed(2), rx + 2, Math.max(12, ry - 2));
  }
}

function drawTemplates(ctx) {
  for (const tpl of state.templates) {
    if (!isTemplateValid(tpl)) continue;
    const active = tpl.id === state.activeTemplateId;
    if (tpl.useMultiSamples && Array.isArray(tpl.samples) && tpl.samples.length) {
      tpl.samples.filter(isRoiValid).forEach((sample, idx) => {
        const label = idx === 0 ? `${displayLabelForTemplate(tpl)} (${tpl.samples.length})` : '';
        drawRoi(ctx, sample, label, tpl.color, hexToRgba(tpl.color, active ? 0.08 : 0.04), active ? 2.4 : 1.8, active && idx === 0, true);
      });
    } else {
      const roi = { tmin: tpl.tmin, tmax: tpl.tmax, fmin: tpl.fmin, fmax: tpl.fmax };
      drawRoi(ctx, roi, displayLabelForTemplate(tpl), tpl.color, hexToRgba(tpl.color, active ? 0.10 : 0.05), active ? 3 : 2, active);
    }
  }
}

function drawRoi(ctx, roi, label, stroke, fill, lineWidth, doubleBorder = false, dashed = false) {
  if (!roi) return;
  const x1 = timeToX(roi.tmin);
  const x2 = timeToX(roi.tmax);
  const y1 = freqToY(roi.fmax);
  const y2 = freqToY(roi.fmin);
  const rx = Math.min(x1, x2);
  const ry = Math.min(y1, y2);
  const rw = Math.abs(x2 - x1);
  const rh = Math.abs(y2 - y1);

  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  if (dashed) ctx.setLineDash([8, 5]);
  ctx.fillRect(rx, ry, rw, rh);
  ctx.strokeRect(rx, ry, rw, rh);
  ctx.setLineDash([]);

  if (doubleBorder) {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(15,23,42,0.85)';
    ctx.strokeRect(rx + 4, ry + 4, Math.max(0, rw - 8), Math.max(0, rh - 8));
  }

  if (label) {
    ctx.fillStyle = stroke;
    ctx.font = '12px Arial';
    ctx.fillText(label, rx + 4, Math.max(12, ry - 4));
  }
  ctx.restore();
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
  if (el.btnSaveRoi) el.btnSaveRoi.disabled = false;
  if (el.btnClearRoi) el.btnClearRoi.disabled = false;
  const validNow = isRoiValid(clipped);
  let activeTpl = getActiveTemplate();
  let createdNewFromSearched = false;

  // Si la plantilla activa ya fue buscada y el usuario dibuja una nueva caja,
  // interpretamos la acción como creación de una plantilla nueva.
  // Esto evita reemplazar accidentalmente una plantilla ya procesada.
  if (validNow && activeTpl && activeTpl.hasSearched && isTemplateValid(activeTpl) && !sameRoi(clipped, activeTpl)) {
    activeTpl = createDraftTemplate();
    createdNewFromSearched = true;
    if (el.roiLabel) el.roiLabel.value = activeTpl.defaultLabel;
  }

  // Si todavía no existe una plantilla activa, crearla recién cuando haya una caja real.
  // Así evitamos fonotipo1 en el origen, pero el chip aparece apenas se dibuja una plantilla válida.
  if (validNow && !activeTpl) {
    activeTpl = createDraftTemplate();
    const label = cleanLabel(el.roiLabel?.value || activeTpl.defaultLabel || nextFonotipoName());
    activeTpl.etiqueta = label;
    if (el.roiLabel) el.roiLabel.value = label;
  } else if (validNow && activeTpl && el.roiLabel && !cleanLabel(el.roiLabel.value)) {
    el.roiLabel.value = displayLabelForTemplate(activeTpl) || nextFonotipoName();
  }

  const roiChangedForActive = activeTpl ? !sameRoi(clipped, activeTpl) : true;
  if (validNow && activeTpl && (!activeTpl.hasSearched || createdNewFromSearched) && roiChangedForActive) {
    activeTpl.tmin = clipped.tmin;
    activeTpl.tmax = clipped.tmax;
    activeTpl.fmin = clipped.fmin;
    activeTpl.fmax = clipped.fmax;
    activeTpl.matches = [];
    activeTpl.hasSearched = false;
    activeTpl.autoAdjust = true;
    activeTpl.autoAdjustMode = 'balanceado';
    activeTpl.showMatches = true;
    activeTpl.isDraft = true;
  }
  if (validNow && roiChangedForActive) {
    setAutoAdjustControls('balanceado');
    if (activeTpl) activeTpl.autoAdjust = true;
  }
  if (el.btnAddTemplate) el.btnAddTemplate.disabled = !validNow;
  updateSamplePanelState(activeTpl);
  renderTemplateNavigator();
  updateSearchButtonsState();
  updateSearchSummaryText();
  el.roiSummary.textContent = `Plantilla actual: t=[${fmt(clipped.tmin)}, ${fmt(clipped.tmax)}] s · f=[${fmt(clipped.fmin, 1)}, ${fmt(clipped.fmax, 1)}] Hz`;
  if (!fromFields) {
    if (createdNewFromSearched) {
      setCoach('Nueva plantilla marcada', 'Se creó una nueva plantilla sin reemplazar las anteriores. Puedes buscarla o agregar otra.');
      setStatus('Nueva plantilla', 'Plantilla nueva lista para buscar o agregar.');
      focusTemplateStep();
    } else {
      setCoach('Plantilla marcada', 'Puedes pulsar Buscar coincidencias directamente, o Agregar plantilla + para guardar esta y marcar otra.');
      setStatus('Plantilla marcada', 'Busca coincidencias o agrega otra plantilla.');
    }
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
  let message = 'Sin resultados';
  if (!state.file) {
    message = 'Sube un audio para comenzar.';
  } else if (!state.templates.some(isTemplateValid) && !isRoiValid(state.roi)) {
    message = 'Dibuja una plantilla y pulsa Buscar coincidencias.';
  } else if (!state.matches.length) {
    message = 'Sin coincidencias todavía. Busca similares para llenar la tabla.';
  }
  el.matchesTable.querySelector('tbody').innerHTML = `<tr><td colspan="7" class="muted-cell">${escapeHtml(message)}</td></tr>`;
}

function sortMatchesForTable(matches) {
  const key = state.tableSort?.key || 'score';
  const dir = state.tableSort?.dir === 'asc' ? 1 : -1;
  const arr = matches.map((m, idx) => ({ ...m, _rank: idx + 1 }));
  const valueFor = (m) => {
    if (key === 'rank') return m._rank;
    if (key === 'etiqueta') return String(m.etiqueta || '').toLowerCase();
    if (key === 'plantilla') return String(m.templateLabel || '').toLowerCase();
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
  sortMatchesForTable(state.matches).slice(0, 120).forEach((m) => {
    const tr = document.createElement('tr');
    tr.className = 'match-row';
    const labelText = escapeHtml(m.etiqueta || m.templateLabel || '');
    tr.innerHTML = `<td>${m._rank}</td><td class="label-pill-cell"><span class="label-pill editable-label" contenteditable="true" data-template-id="${escapeHtml(m.templateId || '')}" style="--tpl-color:${m.color || '#00e5ff'}">${labelText}</span></td><td>${m.score.toFixed(3)}</td><td>${m.tmin.toFixed(2)}</td><td>${m.tmax.toFixed(2)}</td><td>${m.fmin.toFixed(0)}</td><td>${m.fmax.toFixed(0)}</td>`;
    tr.addEventListener('click', (ev) => {
      if (ev.target && ev.target.classList.contains('editable-label')) return;
      el.audioPlayer.currentTime = m.tmin;
      updatePlayhead(true);
      centerOnCurrentTime(true);
      if (m.templateId) setActiveTemplate(m.templateId);
      showToast('Coincidencia seleccionada', `t=[${m.tmin.toFixed(2)}, ${m.tmax.toFixed(2)}] s`);
    });
    const labelCell = tr.querySelector('.editable-label');
    labelCell.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        labelCell.blur();
      }
    });
    labelCell.addEventListener('blur', () => {
      const templateId = labelCell.dataset.templateId;
      const newLabel = cleanLabel(labelCell.textContent || '');
      updateTemplateLabel(templateId, newLabel);
    });
    tbody.appendChild(tr);
  });
}

function updateTemplateLabel(templateId, newLabel, options = {}) {
  const tpl = state.templates.find(t => t.id === templateId);
  if (!tpl) return;
  const finalLabel = cleanLabel(newLabel || tpl.defaultLabel || displayLabelForTemplate(tpl));
  tpl.etiqueta = finalLabel;
  for (const m of (tpl.matches || [])) {
    m.etiqueta = finalLabel;
    m.templateLabel = finalLabel;
  }
  if (tpl.id === state.activeTemplateId && el.roiLabel) el.roiLabel.value = finalLabel;
  refreshCombinedMatches();
  renderTemplateNavigator();
  updateSearchSummaryText();
  drawOverlay();
  if (!options.silent) {
    showToast('Etiqueta actualizada', `Todos los resultados de ${finalLabel} fueron actualizados.`);
  }
}

function getExportBaseName() {
  const name = state.file?.name || 'embedding_matches';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function exportCsv() {
  if (!state.matches.length) return;
  const header = ['audio','plantilla','tmin','tmax','fmin','fmax','etiqueta','score','estado'];
  const rows = state.matches.map(m => [
    state.file?.name || '',
    m.templateLabel || '',
    m.tmin.toFixed(6),
    m.tmax.toFixed(6),
    m.fmin.toFixed(3),
    m.fmax.toFixed(3),
    cleanLabel(m.etiqueta || m.templateLabel || ''),
    m.score.toFixed(6),
    'candidato'
  ]);
  const csv = [header, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, `${getExportBaseName()}.csv`);
  showToast('CSV exportado', 'Se descargó la tabla de candidatos multi-plantilla.');
}

function exportXlsx() {
  if (!state.matches.length) return;
  const header = ['audio','plantilla','tmin','tmax','fmin','fmax','etiqueta','score','estado'];
  const rows = state.matches.map(m => [
    state.file?.name || '',
    m.templateLabel || '',
    Number(m.tmin.toFixed(6)),
    Number(m.tmax.toFixed(6)),
    Number(m.fmin.toFixed(3)),
    Number(m.fmax.toFixed(3)),
    cleanLabel(m.etiqueta || m.templateLabel || ''),
    Number(m.score.toFixed(6)),
    'candidato'
  ]);
  const blob = makeXlsxBlob([header, ...rows]);
  downloadBlob(blob, `${getExportBaseName()}.xlsx`);
  showToast('XLSX exportado', 'Se descargó la tabla de candidatos multi-plantilla.');
}

function exportAudacityTxt() {
  if (!state.matches.length) return;
  const lines = [];
  const ordered = [...state.matches].sort((a, b) => a.tmin - b.tmin || b.score - a.score);
  for (const m of ordered) {
    const etiqueta = cleanLabel(m.etiqueta || m.templateLabel || '');
    lines.push(`${m.tmin.toFixed(6)}\t${m.tmax.toFixed(6)}\t${etiqueta}`);
    lines.push(`\\\t${m.fmin.toFixed(6)}\t${m.fmax.toFixed(6)}`);
  }
  const txt = lines.join('\r\n') + '\r\n';
  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, `${getExportBaseName()}.txt`);
  showToast('TXT Audacity exportado', 'Se descargó el archivo de etiquetas multi-plantilla.');
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
}

function saveCurrentTemplate({ silent = false } = {}) {
  if (!state.display) return null;
  // Guardar/actualizar plantilla también toma los valores editados a mano.
  applyRoiFromFields();
  if (!state.roi) return null;
  const widthSec = state.roi.tmax - state.roi.tmin;
  const heightHz = state.roi.fmax - state.roi.fmin;
  if (widthSec <= 0 || heightHz <= 0) {
    showToast('Plantilla inválida', 'La caja debe tener ancho temporal y alto frecuencial.');
    return null;
  }

  let tpl = getActiveTemplate();
  const isNew = !tpl;
  if (!tpl) {
    const id = makeTemplateId();
    const defaultLabel = `fonotipo${state.templateCounter}`;
    tpl = {
      id,
      defaultLabel,
      etiqueta: cleanLabel(currentEtiqueta() || defaultLabel),
      color: colorForTemplateIndex(state.templates.length),
      metric: el.metricSelect.value || 'coseno',
      scoreThreshold: Number(el.scoreThreshold.value || 0.85),
      strideSec: Number(el.strideSec.value || 0.10),
      autoAdjust: true,
      autoAdjustMode: 'balanceado',
      showMatches: true,
      expertParams: expertParamsFromUi(),
      useMultiSamples: Boolean(el.useMultiSamples?.checked),
      sampleEstimator: el.sampleEstimator?.value || 'consensus_ncc',
      samples: [],
      previewCache: new Map(),
      matches: [],
      hasSearched: false,
    };
    state.templates.push(tpl);
    state.activeTemplateId = id;
  }

  tpl.useMultiSamples = Boolean(el.useMultiSamples?.checked);
  tpl.sampleEstimator = el.sampleEstimator?.value || tpl.sampleEstimator || 'consensus_ncc';
  tpl.expertParams = expertParamsFromUi();
  if (!Array.isArray(tpl.samples)) tpl.samples = [];

  if (tpl.useMultiSamples && isRoiValid(state.roi)) {
    const currentSupport = tpl.samples.length ? compoundSupportFromSamples(tpl.samples) : null;
    const sample = cloneRoi(state.roi);
    // Cuando la plantilla compuesta ya fue guardada, los campos muestran el soporte.
    // Al buscar o cambiar de panel, no debemos agregar ese soporte como si fuera una
    // nueva muestra; eso cambiaba la firma de muestras y rompía la caché.
    const looksLikeSupport = currentSupport && sameRoiLoose(sample, currentSupport, 0.02, 10);
    const alreadyExists = tpl.samples.some(s => sameRoiLoose(s, sample, 0.02, 10));
    if (!looksLikeSupport && !alreadyExists) {
      tpl.samples.push(sample);
      clearTemplateCompositeCache(tpl);
    }
  }

  const support = tpl.useMultiSamples ? compoundSupportFromSamples(tpl.samples) : null;
  const nextGeometry = support || state.roi;
  const roiChanged = !isNew && !sameRoi(nextGeometry, tpl);
  const wasDraft = Boolean(tpl.isDraft);
  tpl.tmin = nextGeometry.tmin;
  tpl.tmax = nextGeometry.tmax;
  tpl.fmin = nextGeometry.fmin;
  tpl.fmax = nextGeometry.fmax;
  if (isNew || roiChanged || wasDraft) {
    tpl.matches = [];
    tpl.hasSearched = false;
    tpl.autoAdjust = true;
  tpl.autoAdjustMode = 'balanceado';
    tpl.showMatches = true;
  }
  tpl.etiqueta = cleanLabel(currentEtiqueta() || tpl.etiqueta || tpl.defaultLabel);
  for (const m of (tpl.matches || [])) {
    m.etiqueta = tpl.etiqueta;
    m.templateLabel = tpl.etiqueta;
  }
  tpl.metric = el.metricSelect.value || tpl.metric || 'coseno';
  tpl.scoreThreshold = Number(el.scoreThreshold.value || tpl.scoreThreshold || 0.85);
  tpl.strideSec = Number(el.strideSec.value || tpl.strideSec || 0.10);
  if (!(isNew || roiChanged || wasDraft)) {
    tpl.autoAdjustMode = normalizeAutoAdjustMode(el.autoAdjustMode?.value || getTemplateAutoMode(tpl));
    tpl.autoAdjust = isAutoModeActive(tpl.autoAdjustMode);
  }
  tpl.showMatches = Boolean(el.showActiveMatches?.checked ?? tpl.showMatches);
  tpl.isDraft = false;

  state.savedRoi = { ...state.roi, etiqueta: tpl.etiqueta };
  updateSearchButtonsState();
  if (el.btnRemoveTemplate) el.btnRemoveTemplate.disabled = false;
  renderTemplateNavigator();
  applyTemplateToFields(tpl);
  refreshCombinedMatches();
  updateSearchSummaryText();
  drawOverlay();

  if (!silent) {
    showToast(isNew ? 'Plantilla agregada' : 'Plantilla actualizada', `${displayLabelForTemplate(tpl)} quedó guardada.`);
  }
  return tpl;
}

function saveRoi() {
  // Se mantiene como compatibilidad interna: guarda/actualiza sin saltar a búsqueda.
  const tpl = saveCurrentTemplate({ silent: false });
  if (!tpl) return;
  setStatus('Plantilla guardada', 'Puedes agregar otra plantilla o buscar coincidencias.');
  setCoach('Plantilla guardada', 'Pulsa Agregar plantilla + para continuar marcando fonotipos, o Buscar coincidencias para procesar solo las plantillas pendientes.');
  openRoiStep();
}

function addTemplateAndAdvance() {
  const tpl = saveCurrentTemplate({ silent: false });
  if (!tpl) return;
  tpl.isDraft = false;

  // Después de agregar, no se crea una plantilla falsa en el origen.
  // Queda un borrador visual vacío hasta que el usuario dibuje una caja real.
  state.activeTemplateId = null;
  state.roi = null;
  clearFieldsForNewTemplate();
  if (el.roiLabel) el.roiLabel.value = '';
  el.roiSummary.textContent = 'Dibuja una caja para crear la siguiente plantilla.';
  if (el.btnAddTemplate) el.btnAddTemplate.disabled = true;
  renderTemplateNavigator();
  updateSearchButtonsState();
  drawOverlay();
  setStatus('Nueva plantilla', 'Dibuja una nueva caja o pulsa Buscar coincidencias para procesar las plantillas pendientes.');
  setCoach('Nueva plantilla', 'La plantilla anterior quedó guardada. La siguiente plantilla aparecerá cuando dibujes una caja válida.');
  openRoiStep();
}
function searchPendingTemplatesFromTemplatePanel() {
  // Antes de buscar, guardamos la caja activa si es válida, para no perder la última plantilla marcada.
  if (state.display) {
    applyRoiFromFields();
  }
  if (isRoiValid(state.roi)) {
    saveCurrentTemplate({ silent: true });
  }

  const pendingTemplates = getPendingTemplates();
  if (!pendingTemplates.length) {
    if (!state.templates.some(isTemplateValid)) {
      showToast('Sin plantillas válidas', 'Marca al menos una plantilla antes de buscar.');
      return;
    }
    showToast('Sin plantillas nuevas', 'No hay plantillas nuevas pendientes. Usa el panel Búsqueda para recalcular la plantilla activa.');
    setCoach('Sin pendientes', 'Tus búsquedas anteriores se mantienen. Para recalcular una plantilla, selecciónala en Búsqueda y pulsa Buscar similares.');
    openSearchStep();
    return;
  }

  openSearchStep();
  searchEmbedding({ templateIds: pendingTemplates.map(t => t.id), pendingBatch: true });
}
function clearRoi() {
  const tpl = getActiveTemplate();
  if (tpl) {
    tpl.matches = [];
    tpl.tmin = 0;
    tpl.tmax = 0;
    tpl.fmin = 0;
    tpl.fmax = 0;
    state.roi = null;
  } else {
    state.roi = null;
  }
  el.roiTmin.value = 0;
  el.roiTmax.value = 0;
  el.roiFmin.value = 0;
  el.roiFmax.value = 0;
  el.roiSummary.textContent = 'Plantilla limpia. Dibuja una nueva caja.';
  if (el.btnSaveRoi) el.btnSaveRoi.disabled = true;
  refreshCombinedMatches();
  drawOverlay();
  setStatus('Marca plantilla', 'Arrastra sobre el espectrograma para encerrar el patrón que quieres buscar.');
  setCoach('Marca una plantilla', 'Dibuja una caja sobre el sonido que quieres encontrar.');
  openRoiStep();
}

function searchEmbedding(options = {}) {
  if (!state.worker) return;
  // En el panel Búsqueda no creamos plantillas nuevas automáticamente.
  // Solo sincronizamos los parámetros de la plantilla activa para permitir
  // ajustes manuales finos después de la primera búsqueda autoajustada.
  if (!state.templates.length) return;
  const activeBeforeSearch = getActiveTemplate();
  if (activeBeforeSearch) {
    syncActiveTemplateParamsFromUi();
  }

  const forceAll = Boolean(options.all);
  const forceAuto = Boolean(options.forceAuto);
  const explicitIds = Array.isArray(options.templateIds) ? options.templateIds : null;
  const firstRun = !state.hasSearched;
  let templatesToSearch;

  if (explicitIds) {
    const wanted = new Set(explicitIds);
    templatesToSearch = state.templates.filter(t => wanted.has(t.id) && isTemplateValid(t));
  } else if (forceAll) {
    templatesToSearch = state.templates.filter(isTemplateValid);
  } else if (firstRun) {
    templatesToSearch = state.templates.filter(isTemplateValid);
  } else {
    templatesToSearch = [getActiveTemplate()].filter(isTemplateValid);
  }

  if (!templatesToSearch.length) {
    showToast('Sin plantillas válidas', 'Guarda al menos una plantilla antes de buscar.');
    return;
  }

  const isBatchSearch = forceAll || firstRun || templatesToSearch.length > 1 || Boolean(options.pendingBatch);
  openSearchStep();
  state.currentSearchAll = isBatchSearch;
  state.forceAutoSearch = forceAuto;
  if (forceAuto) {
    templatesToSearch.forEach(t => { t.autoAdjust = true; t.autoAdjustMode = 'balanceado'; });
  }
  state.searchQueue = templatesToSearch.map(t => t.id);
  state.searchResultsAccumulator = [];

  showProcessing(
    isBatchSearch ? 'Buscando plantillas pendientes' : 'Buscando similares',
    isBatchSearch ? 'Procesando solo las plantillas nuevas o pendientes...' : 'Comparando con el método seleccionado...',
    10
  );
  setStatus('Buscando', isBatchSearch ? 'Se conservan las coincidencias ya calculadas de otras plantillas.' : 'Procesando plantilla activa.');
  startNextSearchInQueue();
}
function startNextSearchInQueue() {
  const id = state.searchQueue.shift();
  const tpl = state.templates.find(t => t.id === id);
  if (!tpl) {
    if (state.searchQueue.length) startNextSearchInQueue();
    return;
  }
  state.currentSearchTemplateId = id;
  const roi = {
    tmin: tpl.tmin,
    tmax: tpl.tmax,
    fmin: tpl.fmin,
    fmax: tpl.fmax,
    etiqueta: displayLabelForTemplate(tpl),
  };
  const autoMode = state.forceAutoSearch ? 'balanceado' : getTemplateAutoMode(tpl);
  const useAuto = isAutoModeActive(autoMode);
  postSearchStatus(`Buscando ${displayLabelForTemplate(tpl)}...`);
  state.worker.postMessage({
    type: 'search-embedding',
    roi,
    samples: tpl.useMultiSamples ? (tpl.samples || []) : [],
    useMultiSamples: Boolean(tpl.useMultiSamples),
    sampleEstimator: tpl.sampleEstimator || 'consensus_ncc',
    metric: tpl.metric || el.metricSelect.value || 'coseno',
    scoreThreshold: Number(tpl.scoreThreshold ?? el.scoreThreshold.value ?? 0.85),
    strideSec: Number(tpl.strideSec ?? el.strideSec.value ?? 0.10),
    autoAdjust: useAuto,
    autoAdjustMode: autoMode,
    expertParams: tpl.expertParams || expertParamsFromUi(),
    maxMatches: CONFIG.maxMatchesToStore,
  });
}

function postSearchStatus(text) {
  updateProcessing(text, 12);
}

function clearMatches() {
  const tpl = getActiveTemplate();
  if (!tpl) return;
  tpl.matches = [];
  tpl.hasSearched = false;
  tpl.lastAuto = null;
  refreshCombinedMatches();
  updateSearchSummaryText();
  drawOverlay();
  showToast('Coincidencias limpiadas', `Se retiraron las cajas de ${displayLabelForTemplate(tpl)}.`);
}


function normalizeAutoAdjustMode(value) {
  const v = String(value || '').toLowerCase();
  if (v === 'conservador' || v === 'balanceado' || v === 'sensible' || v === 'none') return v;
  if (v === 'ninguno') return 'none';
  return 'balanceado';
}

function isAutoModeActive(mode) {
  return normalizeAutoAdjustMode(mode) !== 'none';
}

function getTemplateAutoMode(tpl) {
  if (!tpl) return 'none';
  if (tpl.autoAdjustMode) return normalizeAutoAdjustMode(tpl.autoAdjustMode);
  return tpl.autoAdjust ? 'balanceado' : 'none';
}

function setAutoAdjustControls(mode) {
  const normalized = normalizeAutoAdjustMode(mode);
  if (el.autoAdjustMode) el.autoAdjustMode.value = normalized;
  updateManualSearchControlState();
}

function updateManualSearchControlState() {
  const autoMode = normalizeAutoAdjustMode(el.autoAdjustMode?.value || 'none');
  const manual = autoMode === 'none';
  [el.scoreThreshold, el.scoreThresholdInput, el.strideSec, el.strideSecInput].forEach(node => {
    if (!node) return;
    node.disabled = !manual;
    node.classList.toggle('is-auto-locked', !manual);
  });
  if (el.expertPanel) el.expertPanel.classList.toggle('is-hidden', !el.expertMode?.checked);
}


function setExpertControls(params = {}) {
  const enabled = Boolean(params.enabled);
  if (el.expertMode) el.expertMode.checked = enabled;
  const pairs = [
    [el.expertMinMatches, el.expertMinMatchesInput, params.minMatches ?? 3, 0],
    [el.expertMaxMatches, el.expertMaxMatchesInput, params.maxMatches ?? 30, 0],
    [el.expertProminence, el.expertProminenceInput, params.prominenceMin ?? 0.035, 3],
    [el.expertGroupFactor, el.expertGroupFactorInput, params.groupFactor ?? 1.0, 2],
  ];
  for (const [range, input, value, decimals] of pairs) {
    if (!range || !input) continue;
    const formatted = Number(value).toFixed(decimals);
    range.value = formatted;
    input.value = formatted;
  }
  updateManualSearchControlState();
}

function expertParamsFromUi() {
  return {
    enabled: Boolean(el.expertMode?.checked),
    minMatches: Number(el.expertMinMatches?.value || 3),
    maxMatches: Number(el.expertMaxMatches?.value || 30),
    prominenceMin: Number(el.expertProminence?.value || 0.035),
    groupFactor: Number(el.expertGroupFactor?.value || 1.0),
  };
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
  const openAudioPicker = () => {
    if (el.fileInput) el.fileInput.value = '';
    el.fileInput.click();
  };
  el.btnOpenAudio.addEventListener('click', openAudioPicker);
  el.btnModalUpload.addEventListener('click', openAudioPicker);
  el.fileInput.addEventListener('change', (ev) => {
    const file = ev.target.files?.[0];
    handleFile(file);
    ev.target.value = '';
  });
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
    state.preventRoiEdit = shouldBlockCanvasRoiEdit();
    state.lockToastShown = false;
    [state.startX, state.startY] = getCanvasXY(ev);
  });
  el.overlayCanvas.addEventListener('mousemove', (ev) => {
    if (!state.dragging || !state.display) return;
    const [x, y] = getCanvasXY(ev);

    if (state.preventRoiEdit) {
      const dist = Math.hypot(x - state.startX, y - state.startY);
      if (dist > 5) {
        state.moved = true;
        if (!state.lockToastShown) {
          showToast('Plantilla ya procesada', 'Pulsa Agregar plantilla + para marcar una nueva, o Quitar plantilla − si quieres reemplazar esta.');
          setCoach('Agrega una nueva plantilla', 'Esta plantilla ya fue buscada. Para evitar cambios accidentales, crea otra plantilla antes de dibujar una nueva caja.');
          state.lockToastShown = true;
        }
      }
      return;
    }

    state.moved = true;
    const roi = rectToRoi(state.startX, state.startY, x, y);
    const ctx = el.overlayCanvas.getContext('2d');
    drawOverlay();
    drawRoi(ctx, roi, '', '#000000', 'rgba(0,0,0,0.04)', 2.5, false, true);
  });
  const finishDrag = (ev) => {
    if (!state.dragging || !state.display) return;
    state.dragging = false;
    const [x, y] = getCanvasXY(ev);

    if (state.preventRoiEdit) {
      const wasMoved = state.moved;
      state.preventRoiEdit = false;
      state.lockToastShown = false;
      if (!wasMoved) {
        el.audioPlayer.currentTime = xToTime(x);
        updatePlayhead(true);
        centerOnCurrentTime(true);
      } else {
        drawOverlay();
      }
      return;
    }

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

  if (el.btnApplyRoi) el.btnApplyRoi.addEventListener('click', applyRoiFromFields);
  if (el.btnSaveRoi) el.btnSaveRoi.addEventListener('click', saveRoi);
  if (el.btnClearRoi) el.btnClearRoi.addEventListener('click', clearRoi);
  if (el.btnAddTemplate) el.btnAddTemplate.addEventListener('click', addTemplateAndAdvance);
  if (el.btnRemoveTemplate) el.btnRemoveTemplate.addEventListener('click', removeActiveTemplate);
  if (el.btnSearchAllTemplates) el.btnSearchAllTemplates.addEventListener('click', searchPendingTemplatesFromTemplatePanel);
  if (el.btnPrevTemplate) el.btnPrevTemplate.addEventListener('click', () => goTemplate(-1));
  if (el.btnNextTemplate) el.btnNextTemplate.addEventListener('click', () => goTemplate(1));
  if (el.btnPrevSearchTemplate) el.btnPrevSearchTemplate.addEventListener('click', () => goTemplate(-1));
  if (el.btnNextSearchTemplate) el.btnNextSearchTemplate.addEventListener('click', () => goTemplate(1));
  el.btnSearch.addEventListener('click', searchEmbedding);
  el.btnClearMatches.addEventListener('click', clearMatches);
  el.btnExportCsv.addEventListener('click', exportCsv);
  if (el.btnExportXlsx) el.btnExportXlsx.addEventListener('click', exportXlsx);
  if (el.btnExportTxt) el.btnExportTxt.addEventListener('click', exportAudacityTxt);
  [el.metricSelect, el.scoreThreshold, el.scoreThresholdInput, el.strideSec, el.strideSecInput, el.roiLabel].forEach(node => {
    if (node) node.addEventListener('change', syncActiveTemplateParamsFromUi);
  });
  if (el.roiLabel) {
    el.roiLabel.addEventListener('input', () => {
      syncActiveTemplateParamsFromUi();
      updateSearchSummaryText();
      drawOverlay();
    });
  }
  if (el.showActiveMatches) el.showActiveMatches.addEventListener('change', () => { syncActiveTemplateParamsFromUi(); drawOverlay(); });
  if (el.autoAdjustMode) el.autoAdjustMode.addEventListener('change', () => { syncActiveTemplateParamsFromUi(); updateManualSearchControlState(); });
  if (el.expertMode) el.expertMode.addEventListener('change', () => { syncActiveTemplateParamsFromUi(); updateManualSearchControlState(); });
  if (el.useMultiSamples) el.useMultiSamples.addEventListener('change', () => {
    const tpl = getActiveTemplate();
    if (tpl) {
      tpl.useMultiSamples = Boolean(el.useMultiSamples.checked);
      if (!Array.isArray(tpl.samples)) tpl.samples = [];
      tpl.sampleEstimator = el.sampleEstimator?.value || tpl.sampleEstimator || 'consensus_ncc';
      clearTemplateCompositeCache(tpl);
      tpl.matches = [];
      tpl.hasSearched = false;
      tpl.autoAdjust = true;
  tpl.autoAdjustMode = 'balanceado';
    }
    updateSamplePanelState(tpl);
    renderTemplateNavigator();
    updateSearchButtonsState();
    drawOverlay();
  });
  if (el.sampleEstimator) el.sampleEstimator.addEventListener('change', () => {
    const tpl = getActiveTemplate();
    if (tpl) {
      const previousEstimator = tpl.sampleEstimator || 'consensus_ncc';
      tpl.sampleEstimator = el.sampleEstimator.value || 'consensus_ncc';

      // IMPORTANTE: no limpiar previewCache aquí.
      // Cambiar de método de plantilla debe permitir volver instantáneamente
      // a un método ya calculado. El caché solo se invalida cuando cambian
      // las muestras, el audio o la configuración del espectrograma.
      if (tpl.sampleEstimator !== previousEstimator) {
        // Los resultados existentes pertenecen al método anterior; marcamos
        // la plantilla como pendiente para que el usuario recalcule si desea,
        // pero conservamos la caché visual de todos los métodos ya calculados.
        tpl.matches = [];
        tpl.hasSearched = false;
        tpl.autoAdjust = true;
  tpl.autoAdjustMode = 'balanceado';
      }
    }
    updateSamplePanelState(tpl);
    updateSearchButtonsState();
  });
  if (el.btnAddSample) el.btnAddSample.addEventListener('click', () => addCurrentSampleToActiveTemplate({ silent: false }));
  if (el.btnRemoveSample) el.btnRemoveSample.addEventListener('click', removeLastSampleFromActiveTemplate);
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
  if (el.expertMinMatches && el.expertMinMatchesInput) syncRangeNumber(el.expertMinMatches, el.expertMinMatchesInput, 0, 1, 20);
  if (el.expertMaxMatches && el.expertMaxMatchesInput) syncRangeNumber(el.expertMaxMatches, el.expertMaxMatchesInput, 0, 5, 200);
  if (el.expertProminence && el.expertProminenceInput) syncRangeNumber(el.expertProminence, el.expertProminenceInput, 3, 0, 0.40);
  if (el.expertGroupFactor && el.expertGroupFactorInput) syncRangeNumber(el.expertGroupFactor, el.expertGroupFactorInput, 2, 0.40, 2.00);
  [el.expertMinMatches, el.expertMinMatchesInput, el.expertMaxMatches, el.expertMaxMatchesInput, el.expertProminence, el.expertProminenceInput, el.expertGroupFactor, el.expertGroupFactorInput].forEach(node => {
    if (node) node.addEventListener('change', syncActiveTemplateParamsFromUi);
  });
  updateManualSearchControlState();
}

attachEvents();
resetPanelsForInitialState();

if (location.protocol === 'file:') {
  showToast('Abre con servidor local', 'No abras el HTML con doble clic. Usa http://localhost o GitHub Pages.', 9000);
}
