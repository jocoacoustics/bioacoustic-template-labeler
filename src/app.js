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
  freqAxisW: 48,
  timeAxisH: 32,
  freqTitleH: 14,
  templateColors: ['#22c55e', '#8b5cf6', '#06b6d4', '#3b82f6', '#f59e0b', '#ec4899', '#14b8a6', '#a855f7', '#84cc16', '#f97316'],
};


const VISUAL_DEFAULTS = Object.freeze({
  freqScale: 'linear', colormap: 'magma_light', contrast: 1.0, brightness: 0.0, gamma: 1.0,
  fftSize: 'auto', quality: 'alta', height: 520, pxPerSec: 55, autoHeight: true,
});
const VISUAL_TILE_PX = 1024;
const VISUAL_MAX_TILE_CACHE = 64;
const VISUAL_MAX_TILE_CACHE_BYTES = 160 * 1024 * 1024;
// v45.8: la escala temporal visible ya no depende del ancho físico del canvas.
// El DOM usa una línea de tiempo virtual acotada para el scrollbar y los canvases
// permanecen del tamaño del viewport. Esto permite zoom extremo sin canvases gigantes.
const VISUAL_MAX_PX_PER_SEC = 100000;
const VISUAL_MAX_VIRTUAL_SCROLL_WIDTH = 8000000;
const VISUAL_MIN_DEEP_TILE_SECONDS = 0.04;
const VISUAL_MAX_QUEUED_REQUESTS = 48;

const visualState = {
  worker: null, workerReady: false, epoch: 1, overview: null, tiles: new Map(), pending: new Set(),
  renderTimer: null, tileTimer: null, recomputeTimer: null, initialized: false,
  playbackRenderTimer: null,
  paintStart: 0, paintEnd: 0, lastPlaybackTileRequestAt: 0,
  requestQueue: [], activeRequestKey: null, requestSeq: 0,
  backgroundWarmScheduled: false, lastPlaybackRenderAt: 0,
  virtualWidth: 0, viewportWidth: 0,
  ...VISUAL_DEFAULTS,
};

const state = {
  file: null,
  objectUrl: null,
  audioBuffer: null,
  samples: null,
  sampleRate: 0,
  duration: 0,
  spectrogramReady: false,
  analysisDisplay: null,
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
  perchWorker: null,
  perchBusy: false,
  perchBackend: null,
  perchAudioReady: false,
  currentPerchTemplateId: null,
  dragging: false,
  moved: false,
  preventRoiEdit: false,
  lockToastShown: false,
  samplePreviewToken: 0,
  workerCompoundWarmKeys: new Set(),
  startX: 0,
  startY: 0,
  zoomDragging: false,
  ruleDrag: null,
  rafId: null,
  lastFollowScrollAt: 0,
};

const el = {
  appShell: document.getElementById('appShell'),
  workspace: document.querySelector('.workspace'),
  sidePanel: document.querySelector('.side-panel'),
  sidePanelResizer: document.getElementById('sidePanelResizer'),
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
  palettePickerButton: document.getElementById('palettePickerButton'),
  palettePickerMenu: document.getElementById('palettePickerMenu'),
  palettePickerLabel: document.getElementById('palettePickerLabel'),
  palettePickerSwatch: document.getElementById('palettePickerSwatch'),
  quickFreqScale: document.getElementById('quickFreqScale'),
  quickColormap: document.getElementById('quickColormap'),
  contrastRange: document.getElementById('contrastRange'),
  contrastValue: document.getElementById('contrastValue'),
  brightnessRange: document.getElementById('brightnessRange'),
  brightnessValue: document.getElementById('brightnessValue'),
  gammaRange: document.getElementById('gammaRange'),
  gammaValue: document.getElementById('gammaValue'),
  visualFftSelect: document.getElementById('visualFftSelect'),
  visualQualitySelect: document.getElementById('visualQualitySelect'),
  visualHeightRange: document.getElementById('visualHeightRange'),
  visualHeightValue: document.getElementById('visualHeightValue'),
  pxPerSecRange: document.getElementById('pxPerSecRange'),
  pxPerSecValue: document.getElementById('pxPerSecValue'),
  btnResetVisual: document.getElementById('btnResetVisual'),
  audioPlayer: document.getElementById('audioPlayer'),
  btnPlayPause: document.getElementById('btnPlayPause'),
  btnBackOne: document.getElementById('btnBackOne'),
  btnForwardOne: document.getElementById('btnForwardOne'),
  playerTime: document.getElementById('playerTime'),
  playerSeek: document.getElementById('playerSeek'),
  btnMute: document.getElementById('btnMute'),
  playbackRate: document.getElementById('playbackRate'),
  spectrogramTitle: document.getElementById('spectrogramTitle'),
  workflowBadge: document.getElementById('workflowBadge'),
  viewerHint: document.getElementById('viewerHint'),
  followPlayback: document.getElementById('followPlayback'),
  btnCenterPlayhead: document.getElementById('btnCenterPlayhead'),
  btnFitAll: document.getElementById('btnFitAll'),
  btnZoomOut: document.getElementById('btnZoomOut'),
  btnZoomIn: document.getElementById('btnZoomIn'),
  zoomSelection: document.getElementById('zoomSelection'),
  zoomLabel: document.getElementById('zoomLabel'),
  viewRangeLabel: document.getElementById('viewRangeLabel'),
  spectrogramViewport: document.getElementById('spectrogramViewport'),
  emptyViewer: document.getElementById('emptyViewer'),
  spectrogramStage: document.getElementById('spectrogramStage'),
  freqAxisCanvas: document.getElementById('freqAxisCanvas'),
  timeAxisCanvas: document.getElementById('timeAxisCanvas'),
  spectrogramCanvas: document.getElementById('spectrogramCanvas'),
  overlayCanvas: document.getElementById('overlayCanvas'),
  canvasLayer: document.getElementById('canvasLayer'),
  playhead: document.getElementById('playhead'),
  playheadAxisLabel: document.getElementById('playheadAxisLabel'),
  zoomRect: document.getElementById('zoomRect'),
  analyticCanvas: document.getElementById('analyticCanvas'),
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
  autoAdjustSegments: document.getElementById('autoAdjustSegments'),
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
  templateEditorGrid: document.getElementById('templateEditorGrid'),
  templatePreviewCard: document.getElementById('templatePreviewCard'),
  samplePreviewCanvas: document.getElementById('samplePreviewCanvas'),
  samplePreviewMeta: document.getElementById('samplePreviewMeta'),
  sampleSummary: document.getElementById('sampleSummary'),
  sampleProgress: document.getElementById('sampleProgress'),
  sampleCountBadge: document.getElementById('sampleCountBadge'),
  btnAddSample: document.getElementById('btnAddSample'),
  btnRemoveSample: document.getElementById('btnRemoveSample'),
  infoDots: Array.from(document.querySelectorAll('.info-dot')),
  btnSearch: document.getElementById('btnSearch'),
  btnClearMatches: document.getElementById('btnClearMatches'),
  matchSummary: document.getElementById('matchSummary'),
  perchTemplateChips: document.getElementById('perchTemplateChips'),
  btnPrevPerchTemplate: document.getElementById('btnPrevPerchTemplate'),
  btnNextPerchTemplate: document.getElementById('btnNextPerchTemplate'),
  perchTemplatePager: document.getElementById('perchTemplatePager'),
  perchTplMode: document.getElementById('perchTplMode'),
  perchTplSample: document.getElementById('perchTplSample'),
  perchTplTime: document.getElementById('perchTplTime'),
  perchTplFreq: document.getElementById('perchTplFreq'),
  perchMultiWarning: document.getElementById('perchMultiWarning'),
  perchSignalMode: document.getElementById('perchSignalMode'),
  perchSignalSegments: document.getElementById('perchSignalSegments'),
  perchSignalHelp: document.getElementById('perchSignalHelp'),
  perchBandPanel: document.getElementById('perchBandPanel'),
  perchFminRange: document.getElementById('perchFminRange'),
  perchFmaxRange: document.getElementById('perchFmaxRange'),
  perchRangeFill: document.getElementById('perchRangeFill'),
  perchFminInput: document.getElementById('perchFminInput'),
  perchFmaxInput: document.getElementById('perchFmaxInput'),
  perchBandRangeText: document.getElementById('perchBandRangeText'),
  perchRangeMinLabel: document.getElementById('perchRangeMinLabel'),
  perchRangeMaxLabel: document.getElementById('perchRangeMaxLabel'),
  perchStride: document.getElementById('perchStride'),
  perchStrideInput: document.getElementById('perchStrideInput'),
  perchWindowEstimate: document.getElementById('perchWindowEstimate'),
  perchScore: document.getElementById('perchScore'),
  perchScoreInput: document.getElementById('perchScoreInput'),
  perchTemporalRefine: document.getElementById('perchTemporalRefine'),
  perchResolutionText: document.getElementById('perchResolutionText'),
  perchStrideResolutionText: document.getElementById('perchStrideResolutionText'),
  perchEdgeAdjustment: document.getElementById('perchEdgeAdjustment'),
  perchEdgeText: document.getElementById('perchEdgeText'),
  perchPeakSeparation: document.getElementById('perchPeakSeparation'),
  perchSeparationText: document.getElementById('perchSeparationText'),
  perchPadding: document.getElementById('perchPadding'),
  perchPaddingInput: document.getElementById('perchPaddingInput'),
  perchExcludeTemplate: document.getElementById('perchExcludeTemplate'),
  perchLocalBadge: document.getElementById('perchLocalBadge'),
  perchProgressWrap: document.getElementById('perchProgressWrap'),
  perchModelStatus: document.getElementById('perchModelStatus'),
  perchProgressPct: document.getElementById('perchProgressPct'),
  perchProgressBar: document.getElementById('perchProgressBar'),
  btnSearchPerch: document.getElementById('btnSearchPerch'),
  btnCancelPerch: document.getElementById('btnCancelPerch'),
  perchSummary: document.getElementById('perchSummary'),
  matchesTable: document.getElementById('matchesTable'),
  resultsFooterSummary: document.getElementById('resultsFooterSummary'),
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
  setPanelOpen('guide', false);
  setPanelOpen('spectrogram-config', false);
  setPanelOpen('roi', false);
  setPanelOpen('search', false);
  setPanelOpen('perch-search', false);
  setPanelOpen('results', false);
}

function openRoiStep() {
  setPanelOpen('guide', false);
  setPanelOpen('roi', true);
  setPanelOpen('search', false);
  setPanelOpen('perch-search', false);
  setPanelOpen('results', false);
}

function focusTemplateStep() {
  // Usado cuando el usuario dibuja una plantilla nueva desde el espectrograma.
  // Dejamos Plantilla arriba y lista para editar etiqueta/coordenadas.
  setPanelOpen('guide', false);
  setPanelOpen('spectrogram-config', false);
  setPanelOpen('roi', true);
  setPanelOpen('search', false);
  setPanelOpen('perch-search', false);
  setPanelOpen('results', false);
  scrollSidePanelTo('roi');
}

function openSearchStep() {
  setPanelOpen('guide', false);
  setPanelOpen('spectrogram-config', false);
  setPanelOpen('roi', false);
  setPanelOpen('search', true);
  setPanelOpen('perch-search', false);
  setPanelOpen('results', false);
  scrollSidePanelTo('search');
}

function openPerchStep() {
  setPanelOpen('guide', false);
  setPanelOpen('spectrogram-config', false);
  setPanelOpen('roi', false);
  setPanelOpen('search', false);
  setPanelOpen('perch-search', true);
  setPanelOpen('results', false);
  scrollSidePanelTo('perch-search');
}

function openResultsStep(origin = 'search') {
  // La tabla Resultados es compartida. Mantenemos abierto el motor que originó la búsqueda.
  const fromPerch = origin === 'perch';
  const target = fromPerch ? 'perch-search' : 'search';
  setPanelOpen('guide', false);
  setPanelOpen('spectrogram-config', false);
  setPanelOpen('roi', false);
  setPanelOpen('search', !fromPerch);
  setPanelOpen('perch-search', fromPerch);
  setPanelOpen('results', true);
  scrollSidePanelTo(target);
  window.setTimeout(() => scrollSidePanelTo(target, 'auto'), 260);
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
  if (visualState.worker) { visualState.worker.terminate(); visualState.worker = null; }
  if (state.perchWorker) { state.perchWorker.terminate(); state.perchWorker = null; }
  state.perchBusy = false;
  state.perchBackend = null;
  state.perchAudioReady = false;
  state.currentPerchTemplateId = null;
  setPerchProgress(0, 'Modelo pendiente · se cargará al buscar', 'idle');
  Object.assign(visualState, {workerReady:false,overview:null,initialized:false,autoHeight:true,epoch:visualState.epoch+1,requestQueue:[],activeRequestKey:null,backgroundWarmScheduled:false,paintStart:0,paintEnd:0}); visualState.tiles.clear(); visualState.pending.clear();

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
  if (el.btnFitAll) el.btnFitAll.disabled = true;
  if (el.btnZoomOut) el.btnZoomOut.disabled = true;
  if (el.btnZoomIn) el.btnZoomIn.disabled = true;
  state.spectrogramReady = false;
  state.analysisDisplay = null;
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
  applyPerchConfigToUi(null);
  updatePerchButtonsState();
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

const PERCH2_DEFAULTS = Object.freeze({
  signalMode: 'auto',
  strideSec: 0.50,
  scoreThreshold: 0.70,
  temporalRefine: true,
  edgeAdjustment: 0.40,
  peakSeparation: 0.50,
  paddingSec: 0.00,
  excludeTemplate: true,
});

function perchNyquist() {
  const nativeNyquist = state.sampleRate > 0 ? state.sampleRate / 2 : 16000;
  return Math.max(100, Math.min(16000, nativeNyquist));
}

function formatKhz(hz) { return `${(Number(hz || 0) / 1000).toFixed(3)} kHz`; }
function formatKhzRange(fminHz, fmaxHz) { return `${(Number(fminHz || 0)/1000).toFixed(3)}–${(Number(fmaxHz || 0)/1000).toFixed(3)} kHz`; }

function getPerchReferenceRoi(tpl) {
  if (!tpl) return null;
  if (tpl.useMultiSamples) {
    // Invariante v48.2: Perch2 usa SOLO la primera muestra real de una plantilla multimuestra.
    const first = Array.isArray(tpl.samples) ? tpl.samples[0] : null;
    return isRoiValid(first) ? cloneRoi(first) : null;
  }
  return isTemplateValid(tpl) ? cloneRoi(tpl) : null;
}

function ensurePerchConfig(tpl) {
  if (!tpl) return null;
  if (!Array.isArray(tpl.perchMatches)) tpl.perchMatches = [];
  const cfg = tpl.perch2 && typeof tpl.perch2 === 'object' ? tpl.perch2 : {};
  // Migración v47 → v47.1: Comparar se sustituye por Automático.
  if (cfg.signalMode === 'compare') cfg.signalMode = 'auto';
  cfg.signalMode = ['auto', 'full', 'band'].includes(cfg.signalMode) ? cfg.signalMode : PERCH2_DEFAULTS.signalMode;
  cfg.strideSec = clamp(Number(cfg.strideSec ?? PERCH2_DEFAULTS.strideSec), 0.25, 2.00);
  cfg.scoreThreshold = clamp(Number(cfg.scoreThreshold ?? PERCH2_DEFAULTS.scoreThreshold), -1, 1);
  cfg.temporalRefine = cfg.temporalRefine !== false;
  cfg.edgeAdjustment = clamp(Number(cfg.edgeAdjustment ?? PERCH2_DEFAULTS.edgeAdjustment), 0, 1);
  cfg.peakSeparation = clamp(Number(cfg.peakSeparation ?? PERCH2_DEFAULTS.peakSeparation), 0, 1);
  cfg.paddingSec = clamp(Number(cfg.paddingSec ?? PERCH2_DEFAULTS.paddingSec), 0, 1.00);
  cfg.excludeTemplate = cfg.excludeTemplate !== false;
  if (!Array.isArray(cfg.candidates)) cfg.candidates = [];
  cfg.hasSearched = Boolean(cfg.hasSearched);
  cfg.bandInitialized = Boolean(cfg.bandInitialized);

  const maxHz = perchNyquist();
  const ref = getPerchReferenceRoi(tpl);
  if (!cfg.bandInitialized && ref) {
    cfg.bandFminHz = clamp(Number(ref.fmin) || 0, 0, maxHz);
    cfg.bandFmaxHz = clamp(Number(ref.fmax) || maxHz, 0, maxHz);
    if (cfg.bandFmaxHz <= cfg.bandFminHz) cfg.bandFmaxHz = Math.min(maxHz, cfg.bandFminHz + 100);
    cfg.bandInitialized = true;
  } else {
    cfg.bandFminHz = clamp(Number(cfg.bandFminHz) || 0, 0, maxHz);
    cfg.bandFmaxHz = clamp(Number(cfg.bandFmaxHz) || maxHz, 0, maxHz);
    if (cfg.bandFmaxHz <= cfg.bandFminHz) cfg.bandFmaxHz = Math.min(maxHz, cfg.bandFminHz + 100);
  }
  tpl.perch2 = cfg;
  return cfg;
}

function invalidateClassicResults(tpl) {
  if (!tpl) return;
  tpl.matches = [];
  tpl.classicCandidates = [];
  tpl.classicPoolMeta = null;
  tpl.hasSearched = false;
  tpl.lastAuto = null;
}

function buildClassicMatchesFromCandidates(tpl) {
  if (!tpl || !Array.isArray(tpl.classicCandidates) || !tpl.classicCandidates.length) return [];
  const threshold = clamp(Number(tpl.scoreThreshold ?? 0.85), 0, 0.99);
  const etiqueta = displayLabelForTemplate(tpl);
  return tpl.classicCandidates
    .filter(m => Number.isFinite(Number(m.score)) && Number(m.score) >= threshold)
    .slice(0, CONFIG.maxMatchesToStore)
    .map(m => ({ ...addEtiquetaToMatch(m, etiqueta), templateId: tpl.id, templateLabel: etiqueta, color: tpl.color, methodKey: 'classic', method: 'Búsqueda clásica' }));
}

function refreshClassicMatchesFromCache(tpl = getActiveTemplate()) {
  if (!tpl || !tpl.hasSearched || !Array.isArray(tpl.classicCandidates) || !tpl.classicCandidates.length) return false;
  tpl.matches = buildClassicMatchesFromCandidates(tpl);
  tpl.lastAuto = null;
  refreshCombinedMatches();
  updateSearchSummaryText();
  drawOverlay();
  return true;
}

function invalidatePerchResults(tpl) {
  if (!tpl) return;
  const cfg = ensurePerchConfig(tpl);
  tpl.perchMatches = [];
  cfg.candidates = [];
  cfg.hasSearched = false;
  cfg.lastRun = null;
}

function hzToMel(hz) {
  return 2595 * Math.log10(1 + Math.max(0, Number(hz) || 0) / 700);
}

function melToHz(mel) {
  return 700 * (Math.pow(10, Math.max(0, Number(mel) || 0) / 2595) - 1);
}

function perchHzToSlider(hz) {
  const maxMel = hzToMel(perchNyquist()) || 1;
  return clamp(Math.round(hzToMel(hz) / maxMel * 1000), 0, 1000);
}

function perchSliderToHz(value) {
  const maxMel = hzToMel(perchNyquist()) || 1;
  return clamp(melToHz(clamp(Number(value) || 0, 0, 1000) / 1000 * maxMel), 0, perchNyquist());
}

function setPerchModeButtons(mode) {
  const safe = ['auto', 'full', 'band'].includes(mode) ? mode : 'auto';
  if (el.perchSignalMode) el.perchSignalMode.value = safe;
  el.perchSignalSegments?.querySelectorAll('[data-perch-mode]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.perchMode === safe);
    btn.setAttribute('aria-checked', btn.dataset.perchMode === safe ? 'true' : 'false');
  });
  // v47.1: solo Banda de frecuencias expone el rango manual.
  if (el.perchBandPanel) el.perchBandPanel.classList.toggle('is-hidden', safe !== 'band');
  updatePerchSignalHelp(safe);
}

function getPerchEffectiveBand(tpl, cfg = ensurePerchConfig(tpl)) {
  const maxHz = perchNyquist();
  if (cfg?.signalMode === 'auto') {
    const ref = getPerchReferenceRoi(tpl);
    if (ref) {
      let fminHz = clamp(Number(ref.fmin) || 0, 0, maxHz);
      let fmaxHz = clamp(Number(ref.fmax) || maxHz, 0, maxHz);
      if (fmaxHz <= fminHz) fmaxHz = Math.min(maxHz, fminHz + 100);
      return { fminHz, fmaxHz, automatic: true };
    }
  }
  let fminHz = clamp(Number(cfg?.bandFminHz) || 0, 0, maxHz);
  let fmaxHz = clamp(Number(cfg?.bandFmaxHz) || maxHz, 0, maxHz);
  if (fmaxHz <= fminHz) fmaxHz = Math.min(maxHz, fminHz + 100);
  return { fminHz, fmaxHz, automatic: false };
}

function updatePerchSignalHelp(mode = null) {
  if (!el.perchSignalHelp) return;
  const tpl = getActiveTemplate();
  const cfg = tpl ? ensurePerchConfig(tpl) : null;
  const safe = mode || cfg?.signalMode || PERCH2_DEFAULTS.signalMode;
  if (safe === 'auto') {
    const band = tpl ? getPerchEffectiveBand(tpl, cfg) : null;
    el.perchSignalHelp.textContent = band
      ? `Automático usa la banda de la muestra usada por Perch2: ${formatKhzRange(band.fminHz, band.fmaxHz)}.`
      : 'Automático usa exclusivamente el rango de frecuencias de la muestra usada por Perch2.';
  } else if (safe === 'band') {
    el.perchSignalHelp.textContent = 'Banda de frecuencias usa el rango manual definido abajo antes de calcular el embedding.';
  } else {
    el.perchSignalHelp.textContent = 'Audio completo entrega a Perch2 los 5 s sin filtro frecuencial previo.';
  }
}

function setPerchProgress(progress = 0, message = '', status = 'idle') {
  const pct = clamp(Number(progress) || 0, 0, 100);
  if (el.perchProgressBar) el.perchProgressBar.style.width = `${pct}%`;
  if (el.perchProgressPct) el.perchProgressPct.textContent = `${Math.round(pct)}%`;
  if (el.perchModelStatus && message) el.perchModelStatus.textContent = message;
  if (el.perchProgressWrap) {
    el.perchProgressWrap.classList.toggle('is-running', status === 'running');
    el.perchProgressWrap.classList.toggle('is-ready', status === 'ready');
    el.perchProgressWrap.classList.toggle('is-error', status === 'error');
  }
}

function setPerchBandHandlesFromHz(fminHz, fmaxHz) {
  if (!el.perchFminRange || !el.perchFmaxRange) return;
  let lo = clamp(Number(fminHz) || 0, 0, perchNyquist());
  let hi = clamp(Number(fmaxHz) || perchNyquist(), 0, perchNyquist());
  if (lo > hi) [lo, hi] = [hi, lo];
  el.perchFminRange.value = String(perchHzToSlider(lo));
  el.perchFmaxRange.value = String(perchHzToSlider(hi));
  updatePerchDualRangeVisual();
}

function updatePerchDualRangeVisual(changed = '') {
  if (!el.perchFminRange || !el.perchFmaxRange) return;
  let lo = Number(el.perchFminRange.value) || 0;
  let hi = Number(el.perchFmaxRange.value) || 1000;
  const minGap = 2;
  if (lo > hi - minGap) {
    if (changed === 'min') lo = Math.max(0, hi - minGap);
    else hi = Math.min(1000, lo + minGap);
  }
  el.perchFminRange.value = String(lo);
  el.perchFmaxRange.value = String(hi);
  el.perchFminRange.style.zIndex = changed === 'min' ? '6' : '3';
  el.perchFmaxRange.style.zIndex = changed === 'max' ? '6' : '4';

  const fmin = perchSliderToHz(lo);
  const fmax = perchSliderToHz(hi);
  if (el.perchRangeFill) {
    el.perchRangeFill.style.left = `${lo / 10}%`;
    el.perchRangeFill.style.width = `${Math.max(0, hi - lo) / 10}%`;
  }
  if (el.perchFminInput) {
    el.perchFminInput.max = (perchNyquist() / 1000).toFixed(3);
    el.perchFminInput.value = (fmin / 1000).toFixed(3);
  }
  if (el.perchFmaxInput) {
    el.perchFmaxInput.max = (perchNyquist() / 1000).toFixed(3);
    el.perchFmaxInput.value = (fmax / 1000).toFixed(3);
  }
  if (el.perchBandRangeText) el.perchBandRangeText.textContent = formatKhzRange(fmin, fmax);
  if (el.perchRangeMinLabel) el.perchRangeMinLabel.textContent = '0.000 kHz';
  if (el.perchRangeMaxLabel) el.perchRangeMaxLabel.textContent = formatKhz(perchNyquist());
}

function syncPerchBandHandlesFromInputs(changed = '') {
  if (!el.perchFminInput || !el.perchFmaxInput) return;
  let lo = clamp(Number(el.perchFminInput.value) * 1000 || 0, 0, perchNyquist());
  let hi = clamp(Number(el.perchFmaxInput.value) * 1000 || perchNyquist(), 0, perchNyquist());
  if (lo >= hi) {
    if (changed === 'min') lo = Math.max(0, hi - 10);
    else hi = Math.min(perchNyquist(), lo + 10);
  }
  setPerchBandHandlesFromHz(lo, hi);
}

function updatePerchWindowEstimate() {
  if (!el.perchWindowEstimate) return;
  const stride = clamp(Number(el.perchStride?.value || el.perchStrideInput?.value || 0.5), 0.25, 2);
  if (!(state.duration > 0)) { el.perchWindowEstimate.textContent = '0'; return; }
  if (state.duration <= 5) { el.perchWindowEstimate.textContent = '1'; return; }
  const maxStart = Math.max(0, state.duration - 5);
  const base = Math.floor(maxStart / stride) + 1;
  const lastStart = (base - 1) * stride;
  const count = Math.abs(lastStart - maxStart) > Math.min(stride * 0.25, 0.05) ? base + 1 : base;
  el.perchWindowEstimate.textContent = String(count);
}

function updatePerchTemplateSummary(tpl = getActiveTemplate()) {
  const ref = getPerchReferenceRoi(tpl);
  if (!tpl || !ref) {
    if (el.perchTplMode) el.perchTplMode.textContent = 'Modo: —';
    if (el.perchTplSample) el.perchTplSample.textContent = 'Muestra Perch2: —';
    if (el.perchTplTime) el.perchTplTime.textContent = 'Tiempo: —';
    if (el.perchTplFreq) el.perchTplFreq.textContent = 'Frecuencia: —';
    if (el.perchMultiWarning) el.perchMultiWarning.classList.add('is-hidden');
    return;
  }
  const multi = Boolean(tpl.useMultiSamples);
  if (el.perchTplMode) el.perchTplMode.textContent = `Modo: ${multi ? 'Multi-muestra' : 'Simple'}`;
  if (el.perchTplSample) el.perchTplSample.textContent = multi ? 'Muestra usada por Perch2: #1' : 'Muestra usada: plantilla simple';
  if (el.perchTplTime) el.perchTplTime.textContent = `Tiempo: ${fmt(ref.tmin,2)}–${fmt(ref.tmax,2)} s`;
  if (el.perchTplFreq) el.perchTplFreq.textContent = `Frecuencia: ${formatKhzRange(ref.fmin, ref.fmax)}`;
  if (el.perchMultiWarning) el.perchMultiWarning.classList.toggle('is-hidden', !multi);
}

function applyPerchConfigToUi(tpl) {
  updatePerchTemplateSummary(tpl);
  const cfg = tpl ? ensurePerchConfig(tpl) : null;
  const mode = cfg?.signalMode || PERCH2_DEFAULTS.signalMode;
  setPerchModeButtons(mode);
  if (el.perchStride) el.perchStride.value = String(cfg?.strideSec ?? PERCH2_DEFAULTS.strideSec);
  if (el.perchStrideInput) el.perchStrideInput.value = Number(cfg?.strideSec ?? PERCH2_DEFAULTS.strideSec).toFixed(2);
  if (el.perchScore) el.perchScore.value = String(cfg?.scoreThreshold ?? PERCH2_DEFAULTS.scoreThreshold);
  if (el.perchScoreInput) el.perchScoreInput.value = Number(cfg?.scoreThreshold ?? PERCH2_DEFAULTS.scoreThreshold).toFixed(2);
  if (el.perchTemporalRefine) el.perchTemporalRefine.checked = cfg?.temporalRefine ?? PERCH2_DEFAULTS.temporalRefine;
  if (el.perchEdgeAdjustment) el.perchEdgeAdjustment.value = String(Math.round(100 * (cfg?.edgeAdjustment ?? PERCH2_DEFAULTS.edgeAdjustment)));
  if (el.perchPeakSeparation) el.perchPeakSeparation.value = String(Math.round(100 * (cfg?.peakSeparation ?? PERCH2_DEFAULTS.peakSeparation)));
  updatePerchProfileControlLabels(cfg);
  if (el.perchPadding) el.perchPadding.value = String(cfg?.paddingSec ?? PERCH2_DEFAULTS.paddingSec);
  if (el.perchPaddingInput) el.perchPaddingInput.value = Number(cfg?.paddingSec ?? PERCH2_DEFAULTS.paddingSec).toFixed(2);
  if (el.perchExcludeTemplate) el.perchExcludeTemplate.checked = cfg?.excludeTemplate ?? PERCH2_DEFAULTS.excludeTemplate;
  setPerchBandHandlesFromHz(cfg?.bandFminHz ?? 0, cfg?.bandFmaxHz ?? perchNyquist());
  updatePerchWindowEstimate();
  updatePerchTemporalResolutionUi(cfg, tpl);
  updatePerchSummary(tpl);
  updatePerchButtonsState();
}

function syncActiveTemplatePerchParamsFromUi({ invalidateExpensive = false, refreshFilters = false } = {}) {
  const tpl = getActiveTemplate();
  if (!tpl) return;
  const cfg = ensurePerchConfig(tpl);
  const previous = `${cfg.signalMode}|${cfg.strideSec}|${Math.round(cfg.bandFminHz)}|${Math.round(cfg.bandFmaxHz)}`;
  cfg.signalMode = ['auto','full','band'].includes(el.perchSignalMode?.value) ? el.perchSignalMode.value : 'auto';
  cfg.strideSec = clamp(Number(el.perchStride?.value ?? el.perchStrideInput?.value ?? cfg.strideSec), 0.25, 2.00);
  cfg.scoreThreshold = clamp(Number(el.perchScore?.value ?? el.perchScoreInput?.value ?? cfg.scoreThreshold), -1, 1);
  cfg.temporalRefine = Boolean(el.perchTemporalRefine?.checked);
  cfg.edgeAdjustment = clamp(Number(el.perchEdgeAdjustment?.value ?? (cfg.edgeAdjustment*100)) / 100, 0, 1);
  cfg.peakSeparation = clamp(Number(el.perchPeakSeparation?.value ?? (cfg.peakSeparation*100)) / 100, 0, 1);
  cfg.paddingSec = clamp(Number(el.perchPadding?.value ?? el.perchPaddingInput?.value ?? cfg.paddingSec), 0, 1.00);
  cfg.excludeTemplate = Boolean(el.perchExcludeTemplate?.checked);
  cfg.bandFminHz = clamp(Number(el.perchFminInput?.value) * 1000 || 0, 0, perchNyquist());
  cfg.bandFmaxHz = clamp(Number(el.perchFmaxInput?.value) * 1000 || perchNyquist(), 0, perchNyquist());
  cfg.bandInitialized = true;
  const current = `${cfg.signalMode}|${cfg.strideSec}|${Math.round(cfg.bandFminHz)}|${Math.round(cfg.bandFmaxHz)}`;
  if (invalidateExpensive && previous !== current) {
    invalidatePerchResults(tpl);
    refreshCombinedMatches();
    drawOverlay();
  } else if (refreshFilters && cfg.candidates.length) {
    refreshPerchMatchesFromCache(tpl);
  }
  updatePerchWindowEstimate();
  updatePerchTemporalResolutionUi(cfg, tpl);
  updatePerchSummary(tpl);
  updatePerchButtonsState();
}

function updatePerchTemporalResolutionUi(cfg = null, tpl = getActiveTemplate()) {
  const stride = clamp(Number(cfg?.strideSec ?? el.perchStride?.value ?? 0.5), 0.25, 2.0);
  const ref = getPerchReferenceRoi(tpl);
  const templateWidth = ref ? Math.max(0, Number(ref.tmax) - Number(ref.tmin)) : 0;
  if (el.perchResolutionText) {
    el.perchResolutionText.textContent = templateWidth > 0
      ? `Ancho mínimo: ${templateWidth.toFixed(3)} s · plantilla`
      : 'Ancho mínimo: — · plantilla';
  }
  if (el.perchStrideResolutionText) el.perchStrideResolutionText.textContent = `Paso: ${stride.toFixed(3)} s`;
  updatePerchProfileControlLabels(cfg);
}

function profileEdgeAlpha(cfg) {
  // 0 = Fino: nivel bajo de prominencia → soporte ancho → caja estrecha.
  // 1 = Conservador: nivel alto → soporte estrecho → caja más amplia.
  const x = clamp(Number(cfg?.edgeAdjustment ?? PERCH2_DEFAULTS.edgeAdjustment), 0, 1);
  return 0.20 + 0.65 * x;
}

function profileRequiredValleyDepth(cfg) {
  // 0 = Unir: exige un valle muy profundo. 1 = Separar: acepta valles más pequeños.
  const x = clamp(Number(cfg?.peakSeparation ?? PERCH2_DEFAULTS.peakSeparation), 0, 1);
  return 0.70 - 0.60 * x;
}

function updatePerchProfileControlLabels(cfg = null) {
  const edge = clamp(Number(cfg?.edgeAdjustment ?? el.perchEdgeAdjustment?.value / 100 ?? PERCH2_DEFAULTS.edgeAdjustment), 0, 1);
  const separation = clamp(Number(cfg?.peakSeparation ?? el.perchPeakSeparation?.value / 100 ?? PERCH2_DEFAULTS.peakSeparation), 0, 1);
  if (el.perchEdgeText) el.perchEdgeText.textContent = edge < 0.28 ? 'Fino' : edge > 0.68 ? 'Conservador' : 'Equilibrado';
  if (el.perchSeparationText) el.perchSeparationText.textContent = separation < 0.28 ? 'Unir' : separation > 0.68 ? 'Separar' : 'Equilibrada';
}

function perchCandidateView(candidate, cfg) {
  if (cfg.signalMode === 'auto') return { score: Number(candidate.scoreBand), source: 'auto' };
  if (cfg.signalMode === 'band') return { score: Number(candidate.scoreBand), source: 'band' };
  return { score: Number(candidate.scoreRaw), source: 'full' };
}

function buildPerchProfilePoints(tpl, cfg, ref) {
  const points=[];
  for (const candidate of cfg.candidates) {
    const view=perchCandidateView(candidate,cfg);
    if (!Number.isFinite(view.score)) continue;
    if (cfg.excludeTemplate && Math.max(candidate.tmin,ref.tmin)<Math.min(candidate.tmax,ref.tmax)) continue;
    points.push({
      ...candidate,
      score:view.score,
      perchSource:view.source,
      center:(Number(candidate.tmin)+Number(candidate.tmax))/2,
    });
  }
  return points.sort((a,b)=>a.center-b.center || b.score-a.score);
}

function splitPerchActiveBlocks(points, cfg) {
  const blocks=[];
  const maxGap=Math.max(1e-6,cfg.strideSec*1.55);
  let current=null;
  let previous=null;
  const flush=()=>{ if(current?.points?.length) blocks.push(current); current=null; };
  for (const point of points) {
    const contiguous=previous && (point.center-previous.center)<=maxGap;
    if (point.score>=cfg.scoreThreshold) {
      if (!current || !contiguous || previous?.score<cfg.scoreThreshold) {
        flush();
        current={points:[],leftOutside:contiguous&&previous?.score<cfg.scoreThreshold?previous:null,rightOutside:null};
      }
      current.points.push(point);
    } else if (current) {
      if (contiguous) current.rightOutside=point;
      flush();
    }
    previous=point;
  }
  flush();
  return blocks;
}

function findPerchLocalPeaks(points) {
  if (!points.length) return [];
  if (points.length===1) return [0];
  const peaks=[];
  const eps=1e-10;
  for (let i=0;i<points.length;i++) {
    const y=points[i].score;
    const left=i>0?points[i-1].score:-Infinity;
    const right=i<points.length-1?points[i+1].score:-Infinity;
    if (y>=left-eps && y>=right-eps && (y>left+eps || y>right+eps)) peaks.push(i);
  }
  if (!peaks.length) {
    let best=0;
    for (let i=1;i<points.length;i++) if(points[i].score>points[best].score) best=i;
    peaks.push(best);
  }
  return peaks;
}

function valleyBetweenPeaks(points, leftPeak, rightPeak) {
  let idx=leftPeak+1;
  if (idx>=rightPeak) return null;
  for (let i=idx+1;i<rightPeak;i++) if(points[i].score<points[idx].score) idx=i;
  return { index:idx, score:points[idx].score };
}

function splitPerchBlockByValleys(block, cfg) {
  const points=block.points;
  const peaks=findPerchLocalPeaks(points);
  if (peaks.length<=1) return [{start:0,end:points.length-1}];
  const requiredDepth=profileRequiredValleyDepth(cfg);
  const boundaries=[];
  for (let i=0;i<peaks.length-1;i++) {
    const leftPeak=peaks[i], rightPeak=peaks[i+1];
    const valley=valleyBetweenPeaks(points,leftPeak,rightPeak);
    if (!valley) continue;
    const minPeak=Math.min(points[leftPeak].score,points[rightPeak].score);
    const scale=Math.max(1e-6,minPeak-cfg.scoreThreshold);
    const depth=clamp((minPeak-valley.score)/scale,0,1);
    if (depth>=requiredDepth) boundaries.push({index:valley.index,depth});
  }
  if (!boundaries.length) return [{start:0,end:points.length-1}];
  const segments=[];
  let start=0;
  for (const boundary of boundaries) {
    if (boundary.index>start) segments.push({start,end:boundary.index,valleyDepth:boundary.depth});
    start=boundary.index;
  }
  if (start<points.length-1) segments.push({start,end:points.length-1});
  return segments.length?segments:[{start:0,end:points.length-1}];
}

function interpolateProfileCross(a,b,level) {
  if (!a || !b) return Number(a?.center ?? b?.center ?? 0);
  const dy=b.score-a.score;
  if (Math.abs(dy)<1e-12) return (a.center+b.center)/2;
  const u=clamp((level-a.score)/dy,0,1);
  return a.center+u*(b.center-a.center);
}

function findProfileCrossLeft(block, startIdx, peakIdx, level) {
  const points=block.points;
  let i=peakIdx;
  while(i>startIdx && points[i-1].score>=level) i--;
  if (i>startIdx) return interpolateProfileCross(points[i-1],points[i],level);
  if (points[startIdx].score<level && startIdx<peakIdx) return interpolateProfileCross(points[startIdx],points[startIdx+1],level);
  if (startIdx===0 && block.leftOutside && block.leftOutside.score<level) return interpolateProfileCross(block.leftOutside,points[0],level);
  return points[startIdx].center;
}

function findProfileCrossRight(block, endIdx, peakIdx, level) {
  const points=block.points;
  let i=peakIdx;
  while(i<endIdx && points[i+1].score>=level) i++;
  if (i<endIdx) return interpolateProfileCross(points[i],points[i+1],level);
  if (points[endIdx].score<level && endIdx>peakIdx) return interpolateProfileCross(points[endIdx-1],points[endIdx],level);
  if (endIdx===points.length-1 && block.rightOutside && block.rightOutside.score<level) return interpolateProfileCross(points[endIdx],block.rightOutside,level);
  return points[endIdx].center;
}

function clampProfileInterval(center, durationSec, paddingSec) {
  // v48.2: el centro proviene del punto medio del soporte del perfil.
  // Solo se desplaza si la caja toca los límites reales del audio.
  const audioEnd=Math.max(0.001,Number(state.duration)||Number(durationSec)||0.001);
  let width=clamp(Number(durationSec)||0.001,0.001,audioEnd);
  let a=Number(center)-width/2;
  let b=Number(center)+width/2;
  if (a<0) { b-=a; a=0; }
  if (b>audioEnd) { a-=b-audioEnd; b=audioEnd; }
  a=Math.max(0,a);
  b=Math.min(audioEnd,b);
  const pad=Math.max(0,Number(paddingSec)||0);
  a=Math.max(0,a-pad);
  b=Math.min(audioEnd,b+pad);
  return {tmin:a,tmax:b};
}

function refinePerchProfileSegment(block, segment, cfg, templateDurationSec) {
  const points=block.points;
  const slice=points.slice(segment.start,segment.end+1);
  if (!slice.length) return null;
  const representative=[...slice].sort((a,b)=>b.score-a.score || a.center-b.center)[0];
  const templateMinDuration=Math.max(0.001,Number(templateDurationSec)||0.001);
  if (slice.length===1) {
    // Una sola ventana no contiene información suficiente para estrechar.
    // Se conservan 5 s, salvo que la propia plantilla sea más larga.
    const windowSec=Math.max(0.001,Number(representative.tmax)-Number(representative.tmin));
    const singleDuration=Math.max(windowSec,templateMinDuration);
    const interval=clampProfileInterval(representative.center,singleDuration,cfg.paddingSec);
    return {
      ...representative,
      tmin:interval.tmin,tmax:interval.tmax,
      rawWindowCount:1,refined:false,peakTime:representative.center,profileWidth:0,
      templateMinDuration,profileDuration:windowSec,eventCenter:representative.center,estimatedDuration:singleDuration,
    };
  }

  let peakIdx=segment.start;
  for (let i=segment.start+1;i<=segment.end;i++) if(points[i].score>points[peakIdx].score) peakIdx=i;
  const peak=points[peakIdx];
  const leftBase=segment.start>0?points[segment.start].score:Math.max(cfg.scoreThreshold,Number(block.leftOutside?.score ?? cfg.scoreThreshold));
  const rightBase=segment.end<points.length-1?points[segment.end].score:Math.max(cfg.scoreThreshold,Number(block.rightOutside?.score ?? cfg.scoreThreshold));
  let baseline=Math.max(cfg.scoreThreshold,leftBase,rightBase);
  if (!(peak.score>baseline+1e-8)) baseline=cfg.scoreThreshold;
  const alpha=profileEdgeAlpha(cfg);
  const level=baseline+alpha*Math.max(0,peak.score-baseline);
  let supportLeft=findProfileCrossLeft(block,segment.start,peakIdx,level);
  let supportRight=findProfileCrossRight(block,segment.end,peakIdx,level);
  if (supportRight<supportLeft) [supportLeft,supportRight]=[supportRight,supportLeft];
  const supportWidth=Math.max(0,supportRight-supportLeft);
  const windowSec=Math.max(0.001,Number(peak.tmax)-Number(peak.tmin));
  const profileDuration=Math.max(0.001,windowSec-supportWidth);
  // v48.2: el ancho mínimo es el de la plantilla usada realmente por Perch2.
  // El paso temporal describe la resolución del perfil, no el ancho mínimo.
  const estimatedDuration=Math.max(templateMinDuration,profileDuration);
  // La ocurrencia se centra en el punto medio de los cruces izquierdo/derecho.
  const eventCenter=(supportLeft+supportRight)/2;
  const interval=clampProfileInterval(eventCenter,estimatedDuration,cfg.paddingSec);
  return {
    ...peak,
    tmin:interval.tmin,
    tmax:interval.tmax,
    rawWindowCount:slice.length,
    refined:true,
    peakTime:peak.center,
    peakScore:peak.score,
    profileLevel:level,
    profileSupportLeft:supportLeft,
    profileSupportRight:supportRight,
    profileWidth:supportWidth,
    profileDuration,
    templateMinDuration,
    eventCenter,
    estimatedDuration,
  };
}

function buildPerchProfileEvents(points, cfg, ref) {
  const events=[];
  const templateDuration=Math.max(0.001,Number(ref?.tmax)-Number(ref?.tmin));
  for (const block of splitPerchActiveBlocks(points,cfg)) {
    for (const segment of splitPerchBlockByValleys(block,cfg)) {
      const event=refinePerchProfileSegment(block,segment,cfg,templateDuration);
      if (event) events.push(event);
    }
  }
  return events
    .sort((a,b)=>b.score-a.score || a.tmin-b.tmin)
    .slice(0,CONFIG.maxMatchesToStore)
    .sort((a,b)=>a.tmin-b.tmin || b.score-a.score);
}

function buildPerchMatchesFromCandidates(tpl) {
  const cfg=ensurePerchConfig(tpl);
  const ref=getPerchReferenceRoi(tpl);
  if (!ref || !cfg.candidates.length) return [];
  const points=buildPerchProfilePoints(tpl,cfg,ref);
  const etiqueta=displayLabelForTemplate(tpl);
  let events;
  if (!cfg.temporalRefine) {
    events=points
      .filter(point=>point.score>=cfg.scoreThreshold)
      .sort((a,b)=>b.score-a.score || a.tmin-b.tmin)
      .slice(0,CONFIG.maxMatchesToStore)
      .sort((a,b)=>a.tmin-b.tmin || b.score-a.score)
      .map(point=>({...point,rawWindowCount:1,refined:false}));
  } else {
    events=buildPerchProfileEvents(points,cfg,ref);
  }
  const effectiveBand=getPerchEffectiveBand(tpl,cfg);
  return events.map(event=>{
    const frequencyLocalized=event.perchSource==='band' || event.perchSource==='auto';
    const method=event.perchSource==='auto'?'Perch2 · automático':event.perchSource==='band'?'Perch2 · banda':'Perch2 · audio';
    return {
      tmin:Number(event.tmin),tmax:Number(event.tmax),
      fmin:frequencyLocalized?effectiveBand.fminHz:0,
      fmax:frequencyLocalized?effectiveBand.fmaxHz:perchNyquist(),
      frequencyLocalized,
      score:Number(event.score),etiqueta,templateId:tpl.id,templateLabel:etiqueta,color:tpl.color,
      methodKey:'perch2',method,perchSource:event.perchSource,
      rawWindowCount:event.rawWindowCount||1,refined:Boolean(event.refined),
      peakTime:event.peakTime,peakScore:event.peakScore,profileLevel:event.profileLevel,
      profileSupportLeft:event.profileSupportLeft,profileSupportRight:event.profileSupportRight,
      profileWidth:event.profileWidth,profileDuration:event.profileDuration,templateMinDuration:event.templateMinDuration,eventCenter:event.eventCenter,estimatedDuration:event.estimatedDuration,
    };
  });
}

function refreshPerchMatchesFromCache(tpl = getActiveTemplate()) {
  if (!tpl) return;
  tpl.perchMatches = buildPerchMatchesFromCandidates(tpl);
  refreshCombinedMatches();
  updatePerchSummary(tpl);
  drawOverlay();
}

function updatePerchSummary(tpl = getActiveTemplate()) {
  if (!el.perchSummary) return;
  if (!tpl || !isTemplateValid(tpl)) {
    el.perchSummary.textContent = 'Selecciona una plantilla válida para buscar con Perch2.';
    return;
  }
  const cfg = ensurePerchConfig(tpl);
  if (!cfg.hasSearched) {
    const modeText=cfg.signalMode==='auto'?'automático':cfg.signalMode==='band'?'banda de frecuencias':'audio completo';
    const bandText=cfg.signalMode==='auto'?` · ${formatKhzRange(getPerchEffectiveBand(tpl,cfg).fminHz,getPerchEffectiveBand(tpl,cfg).fmaxHz)}`:'';
    el.perchSummary.textContent = `Pendiente · ${modeText}${bandText} · paso ${cfg.strideSec.toFixed(2)} s.`;
    return;
  }
  const totalCandidates = cfg.candidates.length;
  const total = (tpl.perchMatches || []).length;
  const best = total ? Math.max(...tpl.perchMatches.map(m => m.score)) : null;
  const run = cfg.lastRun || {};
  const backend = run.backend || state.perchBackend || 'local';
  el.perchSummary.textContent = `Perch2 · ${totalCandidates} ventanas · ${total} coincidencia${total===1?'':'s'} después de score/perfil temporal${best != null ? ` · mejor coseno ${best.toFixed(3)}` : ''} · ${backend}.`;
}

function updatePerchButtonsState() {
  const tpl = getActiveTemplate();
  const enabled = Boolean(tpl && getPerchReferenceRoi(tpl) && state.samples?.length && !state.perchBusy);
  if (el.btnSearchPerch) el.btnSearchPerch.disabled = !enabled;
  if (el.btnCancelPerch) el.btnCancelPerch.disabled = !state.perchBusy;
  if (el.perchSignalSegments) el.perchSignalSegments.querySelectorAll('button').forEach(btn => { btn.disabled = state.perchBusy; });
  [el.perchStride, el.perchStrideInput, el.perchFminRange, el.perchFmaxRange, el.perchFminInput, el.perchFmaxInput].forEach(node => { if (node) node.disabled = state.perchBusy; });
}

function ensurePerchWorker() {
  if (state.perchWorker) return state.perchWorker;
  if (!state.samples?.length || !(state.sampleRate > 0)) return null;
  const worker = new Worker('src/perch-worker.js?v=48.2');
  state.perchWorker = worker;
  state.perchAudioReady = false;
  worker.onmessage = onPerchWorkerMessage;
  worker.onerror = (err) => {
    console.error(err);
    state.perchBusy = false;
    setPerchProgress(0, err.message || 'Error del worker Perch2', 'error');
    updatePerchButtonsState();
    showToast('Error Perch2', err.message || 'Falló el worker Perch2.', 8000);
  };
  const copy = state.samples.slice();
  worker.postMessage({ type: 'init-audio', samples: copy, sampleRate: state.sampleRate }, [copy.buffer]);
  return worker;
}

function startPerchSearch() {
  const tpl = getActiveTemplate();
  const ref = getPerchReferenceRoi(tpl);
  if (!tpl || !ref) {
    showToast('Sin plantilla Perch2', 'Selecciona una plantilla simple o una multimuestra con al menos una muestra válida.');
    return;
  }
  syncActiveTemplatePerchParamsFromUi();
  const cfg = ensurePerchConfig(tpl);
  const effectiveBand=getPerchEffectiveBand(tpl,cfg);
  if (cfg.signalMode !== 'full' && !(effectiveBand.fmaxHz > effectiveBand.fminHz)) {
    showToast('Banda inválida', 'La Frecuencia máxima debe ser mayor que la Frecuencia mínima.');
    return;
  }
  const worker = ensurePerchWorker();
  if (!worker) return;
  state.perchBusy = true;
  state.currentPerchTemplateId = tpl.id;
  setPerchProgress(1, 'Preparando Perch2 local…', 'running');
  updatePerchButtonsState();
  openPerchStep();
  worker.postMessage({
    type: 'search', mode: cfg.signalMode, strideSec: cfg.strideSec,
    bandFminHz: effectiveBand.fminHz, bandFmaxHz: effectiveBand.fmaxHz,
    template: ref,
  });
}

function cancelPerchSearch() {
  if (!state.perchWorker || !state.perchBusy) return;
  state.perchWorker.postMessage({ type: 'cancel' });
  if (el.perchModelStatus) el.perchModelStatus.textContent = 'Cancelando búsqueda Perch2…';
}

function onPerchWorkerMessage(ev) {
  const msg = ev.data || {};
  if (msg.type === 'perch-audio-ready') {
    state.perchAudioReady = true;
    return;
  }
  if (msg.type === 'perch-model-progress' || msg.type === 'perch-search-progress') {
    setPerchProgress(msg.progress ?? 0, msg.message || 'Procesando Perch2…', 'running');
    return;
  }
  if (msg.type === 'perch-model-ready') {
    state.perchBackend = msg.backend || 'local';
    if (el.perchLocalBadge) el.perchLocalBadge.textContent = `LOCAL · ${String(state.perchBackend).toUpperCase()}`;
    setPerchProgress(100, `Modelo listo · ${state.perchBackend} local`, 'ready');
    return;
  }
  if (msg.type === 'perch-search-ready') {
    const tpl = state.templates.find(t => t.id === state.currentPerchTemplateId);
    state.perchBusy = false;
    if (tpl) {
      const cfg = ensurePerchConfig(tpl);
      cfg.candidates = Array.isArray(msg.candidates) ? msg.candidates : [];
      cfg.hasSearched = true;
      cfg.lastRun = { backend: msg.backend || state.perchBackend || 'local', windows: msg.windows || cfg.candidates.length, contexts: msg.contexts || 1, elapsedMs: msg.elapsedMs || 0, mode: msg.mode || cfg.signalMode, bandFminHz: msg.bandFminHz, bandFmaxHz: msg.bandFmaxHz };
      tpl.perchMatches = buildPerchMatchesFromCandidates(tpl);
    }
    state.currentPerchTemplateId = null;
    setPerchProgress(100, `Modelo listo · ${(msg.backend || state.perchBackend || 'local')} local`, 'ready');
    refreshCombinedMatches();
    renderTemplateNavigator();
    updatePerchButtonsState();
    updatePerchSummary(tpl || getActiveTemplate());
    drawOverlay();
    const n = tpl ? (tpl.perchMatches || []).length : 0;
    setStatus('Revisa resultados', n ? 'Perch2 encontró candidatos similares.' : 'Ajusta el score o el modo de señal si no aparecen coincidencias.');
    showToast('Perch2 terminado', n ? `${n} coincidencia${n===1?'':'s'} después de score y perfil temporal.` : 'Sin coincidencias con los filtros actuales.');
    openResultsStep('perch');
    return;
  }
  if (msg.type === 'perch-cancelled') {
    state.perchBusy = false;
    state.currentPerchTemplateId = null;
    setPerchProgress(0, 'Búsqueda Perch2 cancelada · resultados anteriores conservados', 'idle');
    updatePerchButtonsState();
    showToast('Perch2 cancelado', 'Se conservaron los resultados calculados anteriormente.');
    return;
  }
  if (msg.type === 'perch-error') {
    state.perchBusy = false;
    state.currentPerchTemplateId = null;
    console.error(msg.error);
    setPerchProgress(0, 'Error en Perch2', 'error');
    updatePerchButtonsState();
    showToast('Error Perch2', msg.error || 'Ocurrió un error durante la inferencia.', 9000);
  }
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
  const d = state.analysisDisplay; const disp = d ? `${d.width}x${d.height}:${roundForCache(d.fmin)}:${roundForCache(d.fmax)}:analysis-v43` : 'noanalysis';
  return `${estimator || 'consensus_ncc'}::${outW}x${outH}::${disp}::${body}`;
}

function samplesBaseCacheKey(samples, outW, outH) {
  const valid = (samples || []).filter(isRoiValid);
  const body = valid.map(s => [s.tmin, s.tmax, s.fmin, s.fmax].map(roundForCache).join(',')).join('|');
  const d = state.analysisDisplay; const disp = d ? `${d.width}x${d.height}:${roundForCache(d.fmin)}:${roundForCache(d.fmax)}:analysis-v43` : 'noanalysis';
  return `${outW}x${outH}::${disp}::${body}`;
}

function workerCompoundKey(samples, estimator) {
  const valid = (samples || []).filter(isRoiValid);
  const body = valid.map(s => [s.tmin, s.tmax, s.fmin, s.fmax].map(roundForCache).join(',')).join('|');
  const d = state.analysisDisplay; const disp = d ? `${d.width}x${d.height}:${roundForCache(d.fmin)}:${roundForCache(d.fmax)}:analysis-v43` : 'noanalysis';
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
  // v45.6: la vista previa efectiva vive fuera del bloque multi-muestra y
  // siempre permanece visible. El bloque de muestras aparece solo si se activa.
  if (el.samplePanel) el.samplePanel.classList.toggle('is-hidden', !enabled);
  if (el.sampleEstimator) el.sampleEstimator.disabled = !enabled;
  if (el.btnAddSample) el.btnAddSample.disabled = !enabled || !isRoiValid(state.roi);
  const n = tpl && Array.isArray(tpl.samples) ? tpl.samples.filter(isRoiValid).length : 0;
  if (el.btnRemoveSample) el.btnRemoveSample.disabled = !enabled || n === 0;
  if (el.sampleCountBadge) el.sampleCountBadge.textContent = String(n);
  if (el.sampleSummary && enabled) {
    el.sampleSummary.textContent = n
      ? `● ${n} muestra${n === 1 ? '' : 's'} · ${sampleEstimatorLabel(el.sampleEstimator?.value)} · lista`
      : 'Marca una caja y pulsa Agregar muestra.';
  }
  drawSamplePreview(tpl);
}


function currentPreviewSupport(tpl = getActiveTemplate()) {
  const enabled = Boolean(el.useMultiSamples?.checked);
  const validSamples = tpl && Array.isArray(tpl.samples) ? tpl.samples.filter(isRoiValid) : [];
  if (enabled && validSamples.length) return compoundSupportFromSamples(validSamples);
  if (tpl && isTemplateValid(tpl)) return { tmin: tpl.tmin, tmax: tpl.tmax, fmin: tpl.fmin, fmax: tpl.fmax };
  return isRoiValid(state.roi) ? state.roi : null;
}

function syncTemplatePreviewVisibility(tpl = getActiveTemplate()) {
  const support = currentPreviewSupport(tpl);
  const visible = Boolean(support && isRoiValid(support));
  if (el.templatePreviewCard) {
    el.templatePreviewCard.classList.toggle('is-hidden', !visible);
    el.templatePreviewCard.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }
  if (el.templateEditorGrid) el.templateEditorGrid.classList.toggle('preview-hidden', !visible);
  return visible;
}

function desiredPreviewAspectFromRoi(roi) {
  if (!roi || !state.display) return 1.8;
  const timePx = Math.max(18, Math.abs(timeToX(roi.tmax) - timeToX(roi.tmin)) || 18);
  const freqPx = Math.max(18, Math.abs(freqToY(roi.fmin) - freqToY(roi.fmax)) || 18);
  return clamp(timePx / freqPx, 0.45, 8.0);
}

function syncSamplePreviewCanvasSize(tpl = getActiveTemplate()) {
  const canvas = el.samplePreviewCanvas;
  if (!canvas) return;
  const roi = currentPreviewSupport(tpl);
  const aspect = desiredPreviewAspectFromRoi(roi);
  const host = canvas.parentElement;
  const hostW = Math.max(150, Math.round(host?.clientWidth || 320));
  const maxW = Math.min(hostW, 360);
  const maxH = 260;
  let cssW = maxW;
  let cssH = cssW / Math.max(0.45, aspect);
  if (cssH > maxH) {
    cssH = maxH;
    cssW = cssH * aspect;
  }
  if (cssW < 150) {
    cssW = 150;
    cssH = Math.min(maxH, cssW / Math.max(0.45, aspect));
  }
  cssW = Math.min(hostW, cssW);
  cssH = clamp(cssH, 96, maxH);
  canvas.style.width = `${Math.round(cssW)}px`;
  canvas.style.height = `${Math.round(cssH)}px`;
  canvas.style.maxWidth = '100%';
  canvas.style.margin = '0 auto';
  canvas.style.aspectRatio = `${aspect.toFixed(4)} / 1`;
  const rawDpr = window.devicePixelRatio || 1;
  const pixelW = Math.max(220, Math.round(cssW * rawDpr));
  const pixelH = Math.max(96, Math.round(cssH * rawDpr));
  if (canvas.width !== pixelW || canvas.height !== pixelH) {
    canvas.width = pixelW;
    canvas.height = pixelH;
  }
}

function drawSamplePreview(tpl = getActiveTemplate()) {
  const previewVisible = syncTemplatePreviewVisibility(tpl);
  const canvas = el.samplePreviewCanvas;
  if (!canvas) return;
  if (!previewVisible) {
    state.samplePreviewToken++;
    setSampleProgress('', 0, false);
    return;
  }
  syncSamplePreviewCanvasSize(tpl);
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, w, h);

  const enabled = Boolean(el.useMultiSamples?.checked);
  const validSamples = tpl && Array.isArray(tpl.samples) ? tpl.samples.filter(isRoiValid) : [];

  // Modo simple: mostrar siempre la ROI activa como plantilla visual.
  if (!enabled) {
    state.samplePreviewToken++;
    setSampleProgress('', 0, false);
    const roi = tpl && isTemplateValid(tpl)
      ? { tmin: tpl.tmin, tmax: tpl.tmax, fmin: tpl.fmin, fmax: tpl.fmax }
      : (isRoiValid(state.roi) ? state.roi : null);
    if (roi && drawSingleTemplatePreview(ctx, w, h, roi, tpl)) return;
    drawPreviewEmpty(ctx, w, h, 'Dibuja una plantilla para ver su vista previa');
    return;
  }

  if (!state.display || !el.spectrogramCanvas || !validSamples.length) {
    state.samplePreviewToken++;
    setSampleProgress('', 0, false);
    drawPreviewEmpty(ctx, w, h, 'Agrega muestras para ver la plantilla compuesta');
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
    putCompositePreview(ctx, cachedPreview, tpl);
    drawSamplePreviewFrame(ctx, w, h, tpl, validSamples.length, estimator, true);
    setSampleProgress('', 100, false);
    warmWorkerCompoundTemplate(tpl, validSamples, estimator);
    return;
  }
  // Compatibilidad con la caché vieja basada en una clave completa.
  if (tpl && tpl.previewCacheKey === cacheKey && tpl.previewImageData) {
    ensureTemplateCompositeCache(tpl).set(estimator, tpl.previewImageData);
    putCompositePreview(ctx, tpl.previewImageData, tpl);
    drawSamplePreviewFrame(ctx, w, h, tpl, validSamples.length, estimator, true);
    setSampleProgress('', 100, false);
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
        putCompositePreview(ctx, composite, activeTpl);
        drawSamplePreviewFrame(ctx, w, h, activeTpl, validSamples.length, estimator, false);
        setSampleProgress('', 100, false);
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

function previewYToFreq(y, h, roi) {
  const frac=clamp(y/Math.max(1,h),0,1), f0=roi.fmin, f1=roi.fmax;
  if(visualState.freqScale==='mel'){const m0=hzToMel(f0),m1=hzToMel(f1);return melToHz(m1-frac*(m1-m0));}
  if(visualState.freqScale==='log'){const l0=hzToVisualLog(f0),l1=hzToVisualLog(f1);return visualLogToHz(l1-frac*(l1-l0));}
  return f1-frac*(f1-f0);
}

function previewTimeTickLabel(sec, duration, { withUnit = false } = {}) {
  sec=Math.max(0,Number(sec)||0);
  const d=Math.max(0,Number(duration)||0);
  let label='';
  if(sec>=60){
    const m=Math.floor(sec/60), s=sec-m*60;
    const decimals=d<=5?2:d<=30?1:0;
    label = decimals ? `${m}:${s.toFixed(decimals).padStart(3+decimals,'0')}` : `${m}:${String(Math.round(s)).padStart(2,'0')}`;
  } else {
    const decimals=d<=3?2:d<=15?1:0;
    label = decimals ? sec.toFixed(decimals) : String(Math.round(sec));
  }
  return withUnit ? `${label} s` : label;
}

function drawPreviewInternalAxes(ctx, w, h, roi) {
  if(!roi || !(roi.tmax>roi.tmin) || !(roi.fmax>roi.fmin)) return;
  const canvas=el.samplePreviewCanvas;
  const cssW=Math.max(1,canvas?.clientWidth||w), dpr=Math.max(1,Math.min(3,w/cssW));
  const fontPx=9.5*dpr, smallPx=8.25*dpr, tick=5*dpr, inset=5*dpr;
  const duration=Math.max(0, roi.tmax-roi.tmin);
  const timeTicks=5;
  const freqTicks=5;

  const strokeText=(text,x,y,align='left',baseline='middle',font=`700 ${fontPx}px Inter, Arial, sans-serif`)=>{
    ctx.save();
    ctx.font=font;
    ctx.textAlign=align;
    ctx.textBaseline=baseline;
    ctx.lineJoin='round';
    ctx.lineWidth=Math.max(2.4, 3.2*dpr);
    ctx.strokeStyle='rgba(255,255,255,.96)';
    ctx.fillStyle='#111827';
    ctx.strokeText(text,x,y);
    ctx.fillText(text,x,y);
    ctx.restore();
  };

  const strokeLine=(x0,y0,x1,y1)=>{
    ctx.save();
    ctx.lineCap='round';
    ctx.strokeStyle='rgba(255,255,255,.96)';
    ctx.lineWidth=Math.max(2,2.5*dpr);
    ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
    ctx.strokeStyle='#111827';
    ctx.lineWidth=Math.max(1,1.2*dpr);
    ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
    ctx.restore();
  };

  const leftX=.75*dpr;
  const bottomY=h-.75*dpr;
  strokeLine(leftX, inset*1.65, leftX, bottomY);
  strokeLine(leftX, bottomY, w-inset, bottomY);

  for(let i=0;i<freqTicks;i++){
    const frac=i/(freqTicks-1);
    const y=inset*1.95 + frac*(bottomY-inset*2.85);
    const freq=roi.fmax - frac*(roi.fmax-roi.fmin);
    strokeLine(leftX, y, leftX+tick, y);
    const label = i===0 ? `${(freq/1000).toFixed(3)} kHz` : (freq/1000).toFixed(3);
    strokeText(label, inset+tick+2*dpr, y, 'left', 'middle');
  }

  for(let i=0;i<timeTicks;i++){
    const frac=i/(timeTicks-1);
    const x=leftX + frac*(w-leftX-inset);
    const rel=duration*frac;
    strokeLine(x, bottomY, x, bottomY-tick);
    if(i===0) continue; // evita choque con la etiqueta inferior de frecuencia
    const align=i===timeTicks-1?'right':'center';
    const labelY = bottomY - tick - 2*dpr;
    const xLabel = i===timeTicks-1 ? Math.min(x, w-inset) : x;
    const label = i===timeTicks-1 ? previewTimeTickLabel(rel,duration,{withUnit:true}) : previewTimeTickLabel(rel,duration);
    strokeText(label, xLabel, labelY, align, 'bottom');
  }
}

function drawSingleTemplatePreview(ctx, w, h, roi, tpl = getActiveTemplate()) {
  if (!roi || !visualState.overview || !state.display) return false;
  const img=ctx.createImageData(w,h), baseMin=visualState.overview.vmin, baseMax=visualState.overview.vmax, range=Math.max(1e-6,baseMax-baseMin);
  for(let x=0;x<w;x++){
    const t=roi.tmin+((x+.5)/w)*Math.max(1e-9,roi.tmax-roi.tmin);
    const cache=bestVisualCacheForTime(t)||visualState.overview;
    const col=clamp(Math.floor((t-cache.start)/Math.max(1e-9,cache.end-cache.start)*cache.cols),0,cache.cols-1);
    for(let y=0;y<h;y++){
      const freq=previewYToFreq(y+.5,h,roi), row=visualSourceRow(cache,freq), raw=cache.db[col*cache.rows+row];
      let norm=(raw-baseMin)/range; norm=(norm-.5)*visualState.contrast+.5+visualState.brightness; norm=Math.pow(clamp(norm,0,1),visualState.gamma);
      const rgb=(window.V45_COLORMAPS||{}).color ? window.V45_COLORMAPS.color(visualState.colormap,norm):[Math.round(norm*255),Math.round(norm*255),Math.round(norm*255)];
      const i=(y*w+x)*4; img.data[i]=rgb[0];img.data[i+1]=rgb[1];img.data[i+2]=rgb[2];img.data[i+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
  drawPreviewInternalAxes(ctx,w,h,roi);
  const color = tpl?.color || '#06b6d4';
  if (el.samplePreviewCanvas) { el.samplePreviewCanvas.style.borderColor = color; el.samplePreviewCanvas.style.boxShadow = `0 0 0 1px ${color}33`; }
  const dur = Math.max(0, roi.tmax - roi.tmin);
  if (el.samplePreviewMeta) el.samplePreviewMeta.textContent = `Duración: ${dur.toFixed(2)} s · Rango: ${(roi.fmin/1000).toFixed(3)}–${(roi.fmax/1000).toFixed(3)} kHz`;
  return true;
}

function themeCompositePreviewImage(imageData) {
  if (!imageData || !imageData.data) return imageData;
  const src=imageData.data, out=new Uint8ClampedArray(src.length);
  for(let i=0;i<src.length;i+=4){
    let norm=(0.2126*src[i]+0.7152*src[i+1]+0.0722*src[i+2])/255;
    norm=(norm-.5)*visualState.contrast+.5+visualState.brightness;
    norm=Math.pow(clamp(norm,0,1),visualState.gamma);
    const rgb=(window.V45_COLORMAPS||{}).color ? window.V45_COLORMAPS.color(visualState.colormap,norm):[Math.round(norm*255),Math.round(norm*255),Math.round(norm*255)];
    out[i]=rgb[0];out[i+1]=rgb[1];out[i+2]=rgb[2];out[i+3]=src[i+3];
  }
  return new ImageData(out,imageData.width,imageData.height);
}
function remapCompositePreviewScale(imageData, tpl) {
  if (!imageData || visualState.freqScale==='linear') return imageData;
  const support=tpl && Array.isArray(tpl.samples) ? compoundSupportFromSamples(tpl.samples) : null;
  if(!support || !(support.fmax>support.fmin)) return imageData;
  const w=imageData.width,h=imageData.height,src=imageData.data,out=new Uint8ClampedArray(src.length);
  for(let y=0;y<h;y++){
    const freq=previewYToFreq(y+.5,h,support);
    const sy=clamp(Math.round(((support.fmax-freq)/(support.fmax-support.fmin))*Math.max(0,h-1)),0,h-1);
    for(let x=0;x<w;x++){const si=(sy*w+x)*4,di=(y*w+x)*4;out[di]=src[si];out[di+1]=src[si+1];out[di+2]=src[si+2];out[di+3]=src[si+3];}
  }
  return new ImageData(out,w,h);
}
function putCompositePreview(ctx,imageData,tpl){ctx.putImageData(remapCompositePreviewScale(themeCompositePreviewImage(imageData),tpl),0,0);}

function drawSamplePreviewFrame(ctx, w, h, tpl, sampleCount, estimatorValue, fromCache = false) {
  const color = tpl?.color || '#00e5ff';
  // El marco se aplica como borde CSS del canvas para no tapar píxeles
  // importantes de la plantilla compuesta.
  if (el.samplePreviewCanvas) {
    el.samplePreviewCanvas.style.borderColor = color;
    el.samplePreviewCanvas.style.boxShadow = `0 0 0 1px ${color}33`;
  }
  const support = tpl && Array.isArray(tpl.samples) ? compoundSupportFromSamples(tpl.samples) : null;
  if (support) drawPreviewInternalAxes(ctx,w,h,support);
  const estimator = sampleEstimatorLabel(estimatorValue);
  const cacheNote = fromCache ? ' · caché' : '';
  if (el.samplePreviewMeta) {
    if (support) {
      const dur = Math.max(0, support.tmax - support.tmin);
      el.samplePreviewMeta.textContent = `Duración: ${dur.toFixed(2)} s · Rango: ${(support.fmin/1000).toFixed(3)}–${(support.fmax/1000).toFixed(3)} kHz · ${sampleCount} muestra(s) · ${estimator}${cacheNote}`;
    } else {
      el.samplePreviewMeta.textContent = `${sampleCount} muestra(s) · ${estimator}${cacheNote}`;
    }
  }
}

function drawPreviewEmpty(ctx, w, h, text) {
  if (el.samplePreviewCanvas) {
    el.samplePreviewCanvas.style.borderColor = '#dbe4ee';
    el.samplePreviewCanvas.style.boxShadow = 'none';
  }
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, w, h);
  if (el.samplePreviewMeta && text) el.samplePreviewMeta.textContent = text;
  if (!text) return;
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);
}

function buildCompositePreviewImage(samples, outW, outH, estimator) {
  if (!samples.length || !state.analysisDisplay || !el.analyticCanvas) return null;
  const source = el.analyticCanvas;
  const support = compoundSupportFromSamples(samples);
  if (!support || !isRoiValid(support)) return null;

  const supportWidth = Math.max(4, Math.round(Math.max(...samples.map(s => Math.abs(analysisTimeToX(s.tmax) - analysisTimeToX(s.tmin))))));
  const sy1 = analysisFreqToY(support.fmax);
  const sy2 = analysisFreqToY(support.fmin);
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
  const source = el.analyticCanvas;
  const ctx = source.getContext('2d', { willReadFrequently: true });
  const x1 = Math.floor(analysisTimeToX(roi.tmin));
  const x2 = Math.ceil(analysisTimeToX(roi.tmax));
  const y1 = Math.floor(analysisFreqToY(roi.fmax));
  const y2 = Math.ceil(analysisFreqToY(roi.fmin));
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
  invalidateClassicResults(tpl);
  invalidatePerchResults(tpl);
  tpl.autoAdjust = true;
  tpl.autoAdjustMode = 'balanceado';
  tpl.showMatches = true;
  tpl.isDraft = false;
  state.activeTemplateId = tpl.id;
  if (el.useMultiSamples) el.useMultiSamples.checked = true;
  if (el.sampleEstimator) el.sampleEstimator.value = tpl.sampleEstimator;
  updateSamplePanelState(tpl);
  applyPerchConfigToUi(tpl);
  renderTemplateNavigator();
  updateSearchButtonsState();
  refreshCombinedMatches();
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
  invalidateClassicResults(tpl);
  invalidatePerchResults(tpl);
  tpl.autoAdjust = true;
  tpl.autoAdjustMode = 'balanceado';
  updateSamplePanelState(tpl);
  renderTemplateNavigator();
  refreshCombinedMatches();
  updateSamplePanelState(tpl);
  applyPerchConfigToUi(tpl);
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
  updatePerchButtonsState();
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
    classicCandidates: [],
    classicPoolMeta: null,
    perchMatches: [],
    perch2: null,
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

  const prevMetric = tpl.metric;
  const prevStride = Number(tpl.strideSec);
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
  if (tpl.hasSearched && (prevMetric !== tpl.metric || Math.abs(prevStride - tpl.strideSec) > 1e-9)) invalidateClassicResults(tpl);
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
    applyPerchConfigToUi(null);
    el.roiSummary.textContent = 'Sin plantilla.';
    state.roi = null;
    drawOverlay();
    return;
  }
  state.roi = { tmin: tpl.tmin, tmax: tpl.tmax, fmin: tpl.fmin, fmax: tpl.fmax };
  el.roiTmin.value = fmt(tpl.tmin, 3);
  el.roiTmax.value = fmt(tpl.tmax, 3);
  el.roiFmin.value = fmt(tpl.fmin / 1000, 3);
  el.roiFmax.value = fmt(tpl.fmax / 1000, 3);
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
  applyPerchConfigToUi(tpl);
  if (el.btnSaveRoi) el.btnSaveRoi.disabled = false;
  if (el.btnClearRoi) el.btnClearRoi.disabled = false;
  if (el.btnRemoveTemplate) el.btnRemoveTemplate.disabled = false;
  updateSearchButtonsState();
  el.roiSummary.textContent = `Plantilla activa: ${displayLabelForTemplate(tpl)} · t=[${fmt(tpl.tmin)}, ${fmt(tpl.tmax)}] s · f=[${fmt(tpl.fmin, 1)}, ${fmt(tpl.fmax, 1)}] Hz`;
  drawOverlay();
}

function renderTemplateNavigator() {
  const chipTargets = [el.templateChips, el.searchTemplateChips, el.perchTemplateChips].filter(Boolean);
  for (const target of chipTargets) target.innerHTML = '';

  if (!state.templates.length) {
    if (el.templatePager) el.templatePager.textContent = 'Sin plantillas';
    if (el.searchTemplatePager) el.searchTemplatePager.textContent = 'Sin plantillas';
    if (el.perchTemplatePager) el.perchTemplatePager.textContent = 'Sin plantillas';
    if (el.btnPrevTemplate) el.btnPrevTemplate.disabled = true;
    if (el.btnNextTemplate) el.btnNextTemplate.disabled = true;
    if (el.btnPrevSearchTemplate) el.btnPrevSearchTemplate.disabled = true;
    if (el.btnNextSearchTemplate) el.btnNextSearchTemplate.disabled = true;
    if (el.btnPrevPerchTemplate) el.btnPrevPerchTemplate.disabled = true;
    if (el.btnNextPerchTemplate) el.btnNextPerchTemplate.disabled = true;
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
      const searchedSomewhere = Boolean(tpl.hasSearched || tpl.perch2?.hasSearched);
      const statusIcon = !isTemplateValid(tpl) ? '○' : (searchedSomewhere ? '✓' : '!');
      const statusText = !isTemplateValid(tpl) ? 'sin caja válida' : (searchedSomewhere ? 'con resultados' : 'pendiente');
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
    if (el.perchTemplatePager) el.perchTemplatePager.textContent = 'Selecciona una plantilla';
    if (el.btnPrevTemplate) el.btnPrevTemplate.disabled = true;
    if (el.btnNextTemplate) el.btnNextTemplate.disabled = true;
    if (el.btnPrevSearchTemplate) el.btnPrevSearchTemplate.disabled = true;
    if (el.btnNextSearchTemplate) el.btnNextSearchTemplate.disabled = true;
    if (el.btnPrevPerchTemplate) el.btnPrevPerchTemplate.disabled = true;
    if (el.btnNextPerchTemplate) el.btnNextPerchTemplate.disabled = true;
    if (el.btnRemoveTemplate) el.btnRemoveTemplate.disabled = true;
    if (typeof updateSearchButtonsState === 'function') updateSearchButtonsState();
    return;
  }

  const idx = activeIdx;
  const tpl = state.templates[idx];
  const pagerText = `Plantilla ${idx + 1} de ${state.templates.length} · ${displayLabelForTemplate(tpl)}`;
  if (el.templatePager) el.templatePager.textContent = pagerText;
  if (el.searchTemplatePager) el.searchTemplatePager.textContent = pagerText;
  if (el.perchTemplatePager) el.perchTemplatePager.textContent = pagerText;
  if (el.btnPrevTemplate) el.btnPrevTemplate.disabled = state.templates.length <= 1;
  if (el.btnNextTemplate) el.btnNextTemplate.disabled = state.templates.length <= 1;
  if (el.btnPrevSearchTemplate) el.btnPrevSearchTemplate.disabled = state.templates.length <= 1;
  if (el.btnNextSearchTemplate) el.btnNextSearchTemplate.disabled = state.templates.length <= 1;
  if (el.btnPrevPerchTemplate) el.btnPrevPerchTemplate.disabled = state.templates.length <= 1;
  if (el.btnNextPerchTemplate) el.btnNextPerchTemplate.disabled = state.templates.length <= 1;
  if (el.btnRemoveTemplate) el.btnRemoveTemplate.disabled = false;
  if (typeof updateSearchButtonsState === 'function') updateSearchButtonsState();
}
function setActiveTemplate(id) {
  syncActiveTemplateParamsFromUi();
  syncActiveTemplatePerchParamsFromUi();
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
  applyPerchConfigToUi(null);
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
  syncActiveTemplatePerchParamsFromUi();
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
  return state.templates.flatMap(tpl => [
    ...(tpl.matches || []),
    ...(tpl.perchMatches || []),
  ].map(m => ({ ...m })));
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
    el.matchSummary.textContent = `${label}: ${total} coincidencias encontradas. Mejor score: ${best.toFixed(3)}.${autoNote}${Array.isArray(tpl.classicCandidates)&&tpl.classicCandidates.length ? ' Score mínimo interactivo disponible.' : ''}`;
  } else if (tpl.hasSearched) {
    el.matchSummary.textContent = `${label}: sin coincidencias.${autoNote}`;
  } else {
    el.matchSummary.textContent = `${label}: pendiente de búsqueda.`;
  }
  return total;
}

function formatPlayerTime(sec) {
  const v = Math.max(0, Number(sec) || 0);
  const m = Math.floor(v / 60);
  const s = Math.floor(v % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function syncCustomPlayer() {
  if (!el.audioPlayer) return;
  const d = Number.isFinite(el.audioPlayer.duration) ? el.audioPlayer.duration : (state.duration || 0);
  const t = Math.max(0, Math.min(d || Infinity, el.audioPlayer.currentTime || 0));
  if (el.playerTime) el.playerTime.textContent = `${formatPlayerTime(t)} / ${formatPlayerTime(d)}`;
  if (el.playerSeek) {
    el.playerSeek.max = String(Math.max(d, 0.01));
    if (!el.playerSeek.matches(':active')) el.playerSeek.value = String(t);
  }
  if (el.btnPlayPause) {
    el.btnPlayPause.textContent = el.audioPlayer.paused ? '▶' : '❚❚';
    el.btnPlayPause.setAttribute('aria-label', el.audioPlayer.paused ? 'Reproducir' : 'Pausar');
  }
  if (el.btnMute) el.btnMute.textContent = el.audioPlayer.muted ? '🔇' : '🔊';
}

function ensureWorker() {
  if (state.worker) {
    state.worker.terminate();
  }
  state.worker = new Worker('src/audio-worker.js?v=48.2');
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
    state.analysisDisplay = {
      width: msg.width, height: msg.height, duration: msg.duration, fmin: msg.fmin, fmax: msg.fmax,
      nFrames: msg.nFrames, nFreq: msg.nFreq, hopLength: msg.hopLength, sampleRate: msg.sampleRate,
    };
    const fitPps = visualFitPxPerSec();
    visualState.pxPerSec = fitPps; // v45 UX: mostrar el audio completo por defecto; +/− profundizan el zoom
    state.display = {
      width: visualViewportWidth(), virtualWidth: visualStageWidth(), height: visualState.height, duration: msg.duration, fmin: msg.fmin, fmax: msg.fmax,
      nFrames: msg.nFrames, nFreq: msg.nFreq, hopLength: msg.hopLength, sampleRate: msg.sampleRate,
      freqScale: visualState.freqScale, colormap: visualState.colormap,
    };
    state.duration = msg.duration;
    el.spectrogramTitle.textContent = `Espectrograma · ${state.file?.name || 'audio cargado'}`;
    renderAnalyticSpectrogramImage(msg.imageBuffer, msg.width, msg.height);
    closeWelcome();
    state.spectrogramReady = true;
    initializeVisualEngine();
    setStatus('Marca plantilla', 'Arrastra sobre el espectrograma para encerrar el patrón que quieres buscar.');
    setCoach('Marca una plantilla', 'Dale play si quieres ubicar el sonido. Luego arrastra una caja roja sobre la región acústica que deseas usar como plantilla.');
    showToast('Espectrograma listo', 'Ahora arrastra una caja sobre el patrón acústico de interés.');
    enableAfterSpectrogram();
    openRoiStep();
    return;
  }

  if (msg.type === 'spectrogram-image-ready') { return; }

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
      tpl.classicCandidates = Array.isArray(msg.candidatePool) ? msg.candidatePool.map(m => ({...m})) : (msg.matches || []).map(m => ({...m}));
      tpl.classicPoolMeta = msg.poolMeta || null;
      tpl.matches = (msg.matches || []).map(m => ({ ...addEtiquetaToMatch(m, etiqueta), templateId: tpl.id, templateLabel: etiqueta, color: tpl.color, methodKey: 'classic', method: 'Búsqueda clásica' }));
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
  if (el.btnFitAll) el.btnFitAll.disabled = false;
  if (el.btnZoomOut) el.btnZoomOut.disabled = false;
  if (el.btnZoomIn) el.btnZoomIn.disabled = false;
}


function currentSpectrogramConfig() {
  // Motor ANALÍTICO: queda congelado en la representación canónica de v43.
  // Los controles visuales de v45 nunca modifican esta matriz.
  return { ...CONFIG, freqScale: 'linear', colormap: 'magma', maxDisplayWidth: CONFIG.maxDisplayWidth };
}

function readVisualControls() {
  visualState.freqScale = el.freqScaleSelect?.value || 'linear';
  visualState.colormap = el.colormapSelect?.value || 'magma_light';
  if (el.quickFreqScale && el.quickFreqScale.value !== visualState.freqScale) el.quickFreqScale.value = visualState.freqScale;
  if (el.quickColormap && el.quickColormap.value !== visualState.colormap) el.quickColormap.value = visualState.colormap;
  visualState.contrast = Number(el.contrastRange?.value ?? 1);
  visualState.brightness = Number(el.brightnessRange?.value ?? 0);
  visualState.gamma = Number(el.gammaRange?.value ?? 1);
  visualState.fftSize = el.visualFftSelect?.value || 'auto';
  visualState.quality = el.visualQualitySelect?.value || 'alta';
  if (!visualState.autoHeight) visualState.height = Number(el.visualHeightRange?.value ?? visualState.height ?? 520);
  if (el.contrastValue) el.contrastValue.textContent = visualState.contrast.toFixed(2);
  if (el.brightnessValue) el.brightnessValue.textContent = visualState.brightness.toFixed(2);
  if (el.gammaValue) el.gammaValue.textContent = visualState.gamma.toFixed(2);
  if (el.visualHeightValue) el.visualHeightValue.textContent = visualState.autoHeight ? `Automática · ${Math.round(visualState.height)} px` : `${Math.round(visualState.height)} px`;
}

function applySpectrogramSettings({ recompute = false, relayout = false } = {}) {
  readVisualControls();
  if (!state.spectrogramReady || !visualState.initialized) return;
  if (recompute) scheduleVisualRecompute();
  else {
    if (relayout) layoutSpectrogramStage();
    drawAxes(); drawOverlay(); scheduleVisualRender();
  }
}

async function handleFile(file) {
  if (!file) return;
  resetForNewAudio();
  state.file = file;
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = URL.createObjectURL(file);
  el.audioPlayer.preload = 'auto';
  el.audioPlayer.src = state.objectUrl;
  el.audioPlayer.load();
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
      samples: processed.slice(),
      sampleRate: processingSampleRate,
      config: currentSpectrogramConfig(),
    });
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

function renderAnalyticSpectrogramImage(buffer, width, height) {
  const c = el.analyticCanvas;
  c.width = width; c.height = height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.putImageData(new ImageData(new Uint8ClampedArray(buffer), width, height), 0, 0);
  el.emptyViewer.hidden = true;
  el.spectrogramStage.hidden = false;
  el.spectrogramViewport.classList.remove('empty');
}

// Alias de compatibilidad con v43: el render analítico queda oculto en v45.
function renderSpectrogramImage(buffer, width, height) { renderAnalyticSpectrogramImage(buffer, width, height); }

function visualViewportWidth(){
  return Math.max(320,(el.spectrogramViewport?.clientWidth||900)-CONFIG.freqAxisW);
}
function visualFitPxPerSec(){
  const w=visualViewportWidth();
  return state.duration>0 ? w/state.duration : 1;
}
function visualMaxPxPerSec(){
  return Math.max(visualFitPxPerSec(),VISUAL_MAX_PX_PER_SEC);
}
function visualStageWidth(){
  const viewW=visualViewportWidth();
  if(!(state.duration>0)) return viewW;
  // Ancho virtual del scrollbar. Puede ser muy grande, pero está acotado y no
  // determina el tamaño del canvas ni la resolución del espectrograma.
  return Math.max(viewW,Math.min(VISUAL_MAX_VIRTUAL_SCROLL_WIDTH,Math.round(state.duration*Math.max(visualFitPxPerSec(),visualState.pxPerSec))));
}
function visualViewDuration(pps=visualState.pxPerSec){
  return state.duration>0 ? Math.min(state.duration,visualViewportWidth()/Math.max(pps,1e-9)) : 0;
}
function visualMaxViewStart(pps=visualState.pxPerSec){
  return Math.max(0,state.duration-visualViewDuration(pps));
}
function visualMaxScrollLeft(virtualWidth=visualStageWidth()){
  return Math.max(0,virtualWidth-visualViewportWidth());
}
function visualViewStartTime(){
  const maxT=visualMaxViewStart();
  const maxScroll=visualMaxScrollLeft(visualState.virtualWidth||visualStageWidth());
  if(!(maxT>0)||!(maxScroll>0)) return 0;
  return clamp((el.spectrogramViewport?.scrollLeft||0)/maxScroll,0,1)*maxT;
}
function scrollLeftForViewStartTime(t0){
  const maxT=visualMaxViewStart();
  const maxScroll=visualMaxScrollLeft(visualState.virtualWidth||visualStageWidth());
  if(!(maxT>0)||!(maxScroll>0)) return 0;
  return clamp(Number(t0)||0,0,maxT)/maxT*maxScroll;
}
function setVisualViewStartTime(t0){
  if(!el.spectrogramViewport)return;
  el.spectrogramViewport.scrollLeft=scrollLeftForViewStartTime(t0);
  syncViewportLayerPosition();
}
function physicalTemporalPps(nfft=effectiveVisualNfft()){
  if(!(state.sampleRate>0)) return Math.max(1,visualState.pxPerSec);
  // Un hop de nfft/16 es el detalle temporal útil máximo del visor. Por encima
  // de este nivel seguimos permitiendo zoom geométrico, pero no inventamos
  // columnas espectrales nuevas entre ventanas físicamente distintas.
  const minHop=Math.max(1,Math.floor(nfft/16));
  return Math.max(1,state.sampleRate/minHop);
}
function effectiveVisualNfft(){
  if(String(visualState.fftSize)!=='auto') return Number(visualState.fftSize)||2048;
  const pps=Math.max(visualFitPxPerSec(),visualState.pxPerSec);
  let temporalNfft;
  if(state.sampleRate>=96000){
    temporalNfft=pps>=5000?256:pps>=1200?512:pps>=300?1024:pps>=80?2048:4096;
  }else{
    temporalNfft=pps>=3000?256:pps>=700?512:pps>=170?1024:2048;
  }
  const fullSpan=Math.max(1,(state.analysisDisplay?.fmax??state.sampleRate/2)-(state.analysisDisplay?.fmin??0));
  const visibleSpan=Math.max(1,(state.display?.fmax??fullSpan)-(state.display?.fmin??0));
  const freqZoom=fullSpan/visibleSpan;
  let spectralNfft=temporalNfft;
  if(freqZoom>=16) spectralNfft=Math.max(spectralNfft,16384);
  else if(freqZoom>=8) spectralNfft=Math.max(spectralNfft,8192);
  else if(freqZoom>=3.5) spectralNfft=Math.max(spectralNfft,4096);
  // Compromiso tiempo-frecuencia: en zoom temporal extremo no conviene usar
  // ventanas enormes aunque también exista zoom vertical.
  const cap=pps>=20000?1024:pps>=5000?2048:pps>=1000?4096:16384;
  return Math.max(256,Math.min(spectralNfft,cap));
}
function visualCacheConfigKey(nfft=effectiveVisualNfft()){ return `${visualState.epoch}|${nfft}|${visualState.quality}`; }
function visualCurrentLevel(){
  const p=Math.max(visualFitPxPerSec(),visualState.pxPerSec,.01);
  return Math.pow(2,Math.ceil(Math.log2(p)*2)/2);
}
function visualTileSpec(level=visualCurrentLevel(),nfft=effectiveVisualNfft()){
  const naturalDur=Math.max(VISUAL_MIN_DEEP_TILE_SECONDS,VISUAL_TILE_PX/Math.max(level,1e-9));
  const spectralMaxDur=nfft>=16384?12:nfft>=8192?20:nfft>=4096?45:Infinity;
  const tileDur=Math.min(naturalDur,spectralMaxDur);
  const usefulPps=Math.min(level,physicalTemporalPps(nfft));
  const cols=clamp(Math.ceil(tileDur*usefulPps),64,VISUAL_TILE_PX);
  return {level,tileDur,cols,nfft,usefulPps};
}
function visualColsForTileSpan(spec,span){
  return clamp(Math.ceil(Math.max(1e-6,span)*spec.usefulPps),32,spec.cols);
}
function visualTileKey(spec,index){
  return `${visualCacheConfigKey(spec.nfft)}|L${spec.level.toFixed(6)}|D${spec.tileDur.toFixed(6)}|T${index}`;
}

function initializeVisualEngine(){
  if(visualState.worker){ visualState.worker.terminate(); visualState.worker=null; }
  visualState.overview=null; visualState.tiles.clear(); visualState.pending.clear(); visualState.requestQueue=[]; visualState.activeRequestKey=null;
  visualState.workerReady=false; visualState.initialized=true; visualState.paintStart=0; visualState.paintEnd=0; visualState.backgroundWarmScheduled=false;
  readVisualControls();
  if(visualState.autoHeight) syncAutoVisualHeight(true);
  const fit=visualFitPxPerSec(),max=visualMaxPxPerSec(); visualState.pxPerSec=Math.max(fit,Math.min(visualState.pxPerSec,max));
  syncVisualZoomUi(); layoutSpectrogramStage(true); drawAxes(); drawOverlay();
  visualState.worker=new Worker('src/visual-worker.js?v=48.2');
  visualState.worker.onmessage=handleVisualWorkerMessage;
  visualState.worker.onerror=(err)=>{console.error(err);visualState.activeRequestKey=null;hideProcessing();showToast('Error del visor',err.message||'Falló el motor visual.',7000);};
  const copy=state.samples ? state.samples.slice() : new Float32Array();
  visualState.worker.postMessage({type:'init',samples:copy,sampleRate:state.sampleRate,duration:state.duration},[copy.buffer]);
  updateProcessing('Construyendo vista general multirresolución...',82);
}
function handleVisualWorkerMessage(ev){
  const m=ev.data||{};
  if(m.type==='ready'){visualState.workerReady=true;requestVisualOverview();pumpVisualQueue();return;}
  if(m.type==='progress'){updateProcessing(m.text||'Construyendo vista general...',88);return;}
  if(m.key){visualState.pending.delete(m.key);if(visualState.activeRequestKey===m.key)visualState.activeRequestKey=null;}
  if(m.type==='error'){console.error(m.message);pumpVisualQueue();return;}
  if(m.type!=='result'){pumpVisualQueue();return;}
  if(m.epoch!==visualState.epoch){pumpVisualQueue();return;}
  const cache={...m,db:new Float32Array(m.db)};
  if(m.overview){
    visualState.overview=cache;
    renderVisualSpectrogram();requestVisibleVisualTiles(true);hideProcessing();
    showToast('Visor multirresolución listo','Timeline virtual, zoom profundo y carga predictiva activos.');
    scheduleBackgroundVisualWarmup();
  }else{
    cache.bytes=cache.db?.byteLength||0;
    visualState.tiles.set(m.key,cache);
    trimVisualTileCache();
    // Sustituir inmediatamente el fallback por el tile fino recién llegado.
    scheduleVisualRender(el.audioPlayer&&!el.audioPlayer.paused?18:0);
  }
  pumpVisualQueue();
}
function trimVisualTileCache(){
  let bytes=0;for(const c of visualState.tiles.values())bytes+=Number(c.bytes||c.db?.byteLength||0);
  while(visualState.tiles.size>VISUAL_MAX_TILE_CACHE||bytes>VISUAL_MAX_TILE_CACHE_BYTES){
    const k=visualState.tiles.keys().next().value;if(k==null)break;
    const c=visualState.tiles.get(k);bytes-=Number(c?.bytes||c?.db?.byteLength||0);visualState.tiles.delete(k);
  }
}
function pumpVisualQueue(){
  if(!visualState.workerReady||!visualState.worker||visualState.activeRequestKey)return;
  while(visualState.requestQueue.length){
    const job=visualState.requestQueue.shift();
    if(!visualState.pending.has(job.key))continue;
    visualState.activeRequestKey=job.key;
    visualState.worker.postMessage({type:'analyze',id:job.key,key:job.key,epoch:visualState.epoch,start:job.start,end:job.end,cols:job.cols,nfft:job.nfft,quality:job.quality,overview:job.overview});
    return;
  }
}
function postVisualAnalyze({key,start,end,cols,overview=false,nfft=effectiveVisualNfft(),priority=50,quality=visualState.quality}){
  if(!visualState.workerReady||!key||end<=start)return;
  if(visualState.pending.has(key)||visualState.tiles.has(key))return;
  visualState.pending.add(key);
  visualState.requestQueue.push({key,start,end,cols:Math.max(8,Math.round(cols)),overview,nfft,quality,priority,seq:++visualState.requestSeq});
  visualState.requestQueue.sort((a,b)=>b.priority-a.priority||a.seq-b.seq);
  while(visualState.requestQueue.length>VISUAL_MAX_QUEUED_REQUESTS){
    const dropped=visualState.requestQueue.pop();
    if(dropped&&dropped.key!==visualState.activeRequestKey)visualState.pending.delete(dropped.key);
  }
  pumpVisualQueue();
}
function requestVisualOverview(){
  if(!visualState.workerReady)return;
  const cols=Math.max(900,Math.round((el.spectrogramViewport?.clientWidth||900)*1.2));
  const nfft=effectiveVisualNfft();
  postVisualAnalyze({key:`overview:${visualCacheConfigKey(nfft)}`,start:0,end:Math.max(state.duration,.001),cols,overview:true,nfft,priority:1000});
}
function scheduleBackgroundVisualWarmup(){
  if(visualState.backgroundWarmScheduled||!visualState.overview)return;
  visualState.backgroundWarmScheduled=true;
  window.setTimeout(()=>{
    if(!visualState.workerReady||!visualState.overview||!(state.duration>0))return;
    // Precarga ligera: 4–8 bloques que cubren TODO el audio a resolución media.
    // Usa FFT/quality económicos para que una interacción del usuario nunca quede
    // esperando detrás de un trabajo pesado de background.
    const chunks=clamp(Math.ceil(state.duration/20),4,8);
    const tileDur=state.duration/chunks;
    const nfft=Math.min(1024,visualState.overview.nfft||1024);
    for(let i=0;i<chunks;i++){
      const start=i*tileDur,end=i===chunks-1?state.duration:(i+1)*tileDur;
      const cols=clamp(Math.ceil((end-start)*24),256,512);
      const key=`${visualState.epoch}|${nfft}|rapida|warm|C${chunks}|T${i}`;
      postVisualAnalyze({key,start,end,cols,nfft,priority:4,quality:'rapida'});
    }
  },700);
}
function pruneQueuedInteractiveVisualRequests(){
  if(!visualState.requestQueue.length)return;
  const keep=[];
  for(const job of visualState.requestQueue){
    if(job.overview||job.priority<100){keep.push(job);continue;}
    visualState.pending.delete(job.key);
  }
  visualState.requestQueue=keep;
}
function requestVisibleVisualTiles(immediate=false){
  clearTimeout(visualState.tileTimer);
  const run=()=>{
    if(!visualState.workerReady||!state.duration)return;
    if(immediate)pruneQueuedInteractiveVisualRequests();
    const fit=visualFitPxPerSec(),targetNfft=effectiveVisualNfft();
    const needsSpectralDetail=Boolean(visualState.overview&&visualState.overview.nfft!==targetNfft);
    if(visualState.pxPerSec<=fit*1.06&&!needsSpectralDetail)return;
    const spec=visualTileSpec(Math.max(fit,visualCurrentLevel()),targetNfft);
    const tileQuality=targetNfft>=16384?'rapida':targetNfft>=8192?'media':visualState.quality;
    const t0=visualViewStartTime(),t1=Math.min(state.duration,t0+visualViewDuration());
    const maxI=Math.max(0,Math.ceil(state.duration/spec.tileDur)-1);
    const i0=clamp(Math.floor(t0/spec.tileDur),0,maxI);
    const i1=clamp(Math.floor(Math.max(t0,t1-1e-12)/spec.tileDur),0,maxI);
    const center=(i0+i1)/2;
    for(let i=i0;i<=i1;i++){
      const start=i*spec.tileDur,end=Math.min(state.duration,(i+1)*spec.tileDur);
      postVisualAnalyze({key:visualTileKey(spec,i),start,end,cols:visualColsForTileSpan(spec,end-start),nfft:targetNfft,priority:260-Math.abs(i-center)*4,quality:tileQuality});
    }
    const playing=Boolean(el.audioPlayer&&!el.audioPlayer.paused&&!el.audioPlayer.ended);
    const rate=Math.max(.5,Number(el.audioPlayer?.playbackRate||1));
    const ahead=playing?Math.min(18,Math.max(8,Math.ceil(8*rate))):3;
    const behind=playing?2:2;
    for(let d=1;d<=ahead;d++){
      const i=i1+d;if(i>maxI)break;
      const start=i*spec.tileDur,end=Math.min(state.duration,(i+1)*spec.tileDur);
      postVisualAnalyze({key:visualTileKey(spec,i),start,end,cols:visualColsForTileSpan(spec,end-start),nfft:targetNfft,priority:210-d*5,quality:tileQuality});
    }
    for(let d=1;d<=behind;d++){
      const i=i0-d;if(i<0)break;
      const start=i*spec.tileDur,end=Math.min(state.duration,(i+1)*spec.tileDur);
      postVisualAnalyze({key:visualTileKey(spec,i),start,end,cols:visualColsForTileSpan(spec,end-start),nfft:targetNfft,priority:120-d*5,quality:tileQuality});
    }
  };
  if(immediate)run();else visualState.tileTimer=setTimeout(run,35);
}
function clearVisualSpectralCaches(){
  visualState.epoch++;visualState.overview=null;visualState.tiles.clear();visualState.pending.clear();visualState.requestQueue=[];visualState.activeRequestKey=null;visualState.paintStart=0;visualState.paintEnd=0;visualState.backgroundWarmScheduled=false;
}
function scheduleVisualRecompute(){clearTimeout(visualState.recomputeTimer);visualState.recomputeTimer=setTimeout(()=>{clearVisualSpectralCaches();requestVisualOverview();},180);}
function scheduleVisualRender(delay=16){clearTimeout(visualState.renderTimer);visualState.renderTimer=setTimeout(renderVisualSpectrogram,Math.max(0,delay));}
function bestVisualCacheForTime(t){
  const targetNfft=effectiveVisualNfft();
  const targetPps=Math.min(Math.max(1,visualState.pxPerSec),physicalTemporalPps(targetNfft));
  let best=visualState.overview||null,bestScore=-Infinity;
  const scoreCache=(c)=>{
    if(!c||t<c.start-1e-9||t>c.end+1e-9)return -Infinity;
    const temporal=Math.min(1,Math.max(0,c.pps||0)/targetPps);
    const spectral=Math.min(1,Math.max(0,c.nfft||0)/targetNfft);
    const exactNfft=c.nfft===targetNfft?8:0;
    return temporal*72+spectral*24+exactNfft+Math.log2(1+Math.max(0,c.pps||0))*.25;
  };
  if(best)bestScore=scoreCache(best);
  for(const c of visualState.tiles.values()){
    const s=scoreCache(c);if(s>bestScore){best=c;bestScore=s;}
  }
  return best||visualState.overview;
}
function visualSourceRow(cache,freq){return clamp(Math.round(freq/(state.sampleRate/cache.nfft)),0,cache.rows-1);}
function renderVisualSpectrogram(){
  if(!visualState.overview||!state.display)return;
  readVisualControls();
  const viewW=visualViewportWidth();
  if(state.display.width!==viewW){layoutSpectrogramStage(false);drawAxes();drawOverlay();}
  state.display.height=visualState.height;state.display.freqScale=visualState.freqScale;state.display.colormap=visualState.colormap;
  syncViewportLayerPosition();
  const W=Math.max(1,Math.round(state.display.width));
  const H=Math.max(1,Math.round(visualState.height));
  const t0=visualViewStartTime();
  const ctx=el.spectrogramCanvas.getContext('2d');
  const bg=(window.V45_COLORMAPS||{}).color ? window.V45_COLORMAPS.color(visualState.colormap,0):[255,255,255];
  ctx.fillStyle=`rgb(${bg[0]},${bg[1]},${bg[2]})`;ctx.fillRect(0,0,W,H);
  const img=ctx.createImageData(W,H),baseMin=visualState.overview.vmin,baseMax=visualState.overview.vmax,range=Math.max(1e-6,baseMax-baseMin);
  const sources=new Array(W),sourceCols=new Int32Array(W);
  for(let x=0;x<W;x++){
    const t=clamp(t0+(x+.5)/Math.max(visualState.pxPerSec,1e-9),0,state.duration);
    const c=bestVisualCacheForTime(t)||visualState.overview;sources[x]=c;
    sourceCols[x]=clamp(Math.floor((t-c.start)/Math.max(1e-9,c.end-c.start)*c.cols),0,c.cols-1);
  }
  for(let y=0;y<H;y++){
    const freq=yToFreq((y/H)*state.display.height);
    for(let x=0;x<W;x++){
      const c=sources[x],row=visualSourceRow(c,freq),raw=c.db[sourceCols[x]*c.rows+row];
      let norm=(raw-baseMin)/range; norm=(norm-.5)*visualState.contrast+.5+visualState.brightness; norm=Math.pow(clamp(norm,0,1),visualState.gamma);
      const rgb=(window.V45_COLORMAPS||{}).color ? window.V45_COLORMAPS.color(visualState.colormap,norm):[Math.round(norm*255),Math.round(norm*255),Math.round(norm*255)];
      const idx=(y*W+x)*4;img.data[idx]=rgb[0];img.data[idx+1]=rgb[1];img.data[idx+2]=rgb[2];img.data[idx+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
  visualState.paintStart=t0; visualState.paintEnd=Math.min(state.duration,t0+visualViewDuration());
  drawAxes();drawOverlay();updatePlayhead(false);updateViewRangeLabel();
}
function visualZoomSliderValue(pps=visualState.pxPerSec){
  const fit=Math.max(1e-9,visualFitPxPerSec()),max=Math.max(fit,visualMaxPxPerSec());
  if(max<=fit*(1+1e-9))return 0;
  return clamp(Math.log(Math.max(fit,pps)/fit)/Math.log(max/fit),0,1);
}
function visualZoomFromSlider(value){
  const fit=Math.max(1e-9,visualFitPxPerSec()),max=Math.max(fit,visualMaxPxPerSec());
  return fit*Math.pow(max/fit,clamp(Number(value)||0,0,1));
}
function syncVisualZoomUi(){
  const fit=visualFitPxPerSec(),max=visualMaxPxPerSec();visualState.pxPerSec=clamp(visualState.pxPerSec,fit,max);
  if(el.pxPerSecRange){
    // El slider es logarítmico: da control fino cerca de "Ver todo" y permite
    // alcanzar 100 000 px/s sin comprimir toda la zona útil en unos pocos píxeles.
    el.pxPerSecRange.min='0';el.pxPerSecRange.max='1';el.pxPerSecRange.step='0.001';el.pxPerSecRange.value=String(visualZoomSliderValue(visualState.pxPerSec));
  }
  const p=visualState.pxPerSec;
  const txt=p<1?p.toFixed(3):p<10?p.toFixed(2):p<1000?p.toFixed(1):Math.round(p).toLocaleString('es-EC');
  if(el.pxPerSecValue)el.pxPerSecValue.textContent=`${txt} px/s`;if(el.zoomLabel)el.zoomLabel.textContent=`${txt} px/s`;
}
function setVisualZoom(next,anchorTime=null){
  if(!state.display)return;
  const old=Math.max(visualState.pxPerSec,1e-9);
  const oldStart=visualViewStartTime(),oldDur=visualViewDuration(old);
  const anchor=clamp(anchorTime==null?oldStart+oldDur/2:Number(anchorTime),0,state.duration);
  const frac=oldDur>0?clamp((anchor-oldStart)/oldDur,0,1):.5;
  const fit=visualFitPxPerSec(),max=visualMaxPxPerSec();
  visualState.pxPerSec=clamp(next,fit,max);syncVisualZoomUi();
  layoutSpectrogramStage(false);
  const newDur=visualViewDuration();
  let newStart=clamp(anchor-frac*newDur,0,visualMaxViewStart());
  if(oldStart<=1e-6&&anchorTime!=null&&anchor<=oldDur*.15)newStart=0;
  setVisualViewStartTime(newStart);
  drawAxes();drawOverlay();renderVisualSpectrogram();requestVisibleVisualTiles(true);
}
function fitVisualAll(){
  visualState.pxPerSec=visualFitPxPerSec();syncVisualZoomUi();state.display.fmin=state.analysisDisplay.fmin;state.display.fmax=state.analysisDisplay.fmax;
  layoutSpectrogramStage(false);setVisualViewStartTime(0);drawAxes();drawOverlay();renderVisualSpectrogram();requestVisibleVisualTiles(true);
}
function applyTimeInterval(a,b){
  let t0=clamp(Math.min(a,b),0,state.duration),t1=clamp(Math.max(a,b),0,state.duration);
  if(t1-t0<.0001)return;
  const viewW=visualViewportWidth();
  visualState.pxPerSec=clamp(viewW/(t1-t0),visualFitPxPerSec(),visualMaxPxPerSec());
  syncVisualZoomUi();layoutSpectrogramStage(false);setVisualViewStartTime(t0);
  drawAxes();drawOverlay();renderVisualSpectrogram();requestVisibleVisualTiles(true);
}
function applyFreqRange(a,b){
  if(!state.analysisDisplay)return;
  let low=clamp(Math.min(a,b),state.analysisDisplay.fmin,state.analysisDisplay.fmax),high=clamp(Math.max(a,b),state.analysisDisplay.fmin,state.analysisDisplay.fmax);
  if(high-low<1)return;
  state.display.fmin=low;state.display.fmax=high;drawAxes();drawOverlay();renderVisualSpectrogram();requestVisibleVisualTiles(true);drawSamplePreview();
}
function updateViewRangeLabel(){
  if(!state.display||!el.viewRangeLabel)return;
  const a=visualViewStartTime(),b=Math.min(state.duration,a+visualViewDuration());
  el.viewRangeLabel.textContent=`${formatAxisTime(a,true)} – ${formatAxisTime(b,true)}`;
}
function analysisTimeToX(t){const d=state.analysisDisplay;return d?(t/d.duration)*d.width:0;}
function analysisFreqToY(f){const d=state.analysisDisplay;if(!d)return 0;return ((d.fmax-f)/Math.max(1e-9,d.fmax-d.fmin))*d.height;}


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

function visualAutoHeight(){
  const viewportH = Math.max(0, el.spectrogramViewport?.clientHeight || 0);
  const axisHeaderH = CONFIG.timeAxisH + (CONFIG.freqTitleH || 0);
  if (viewportH > axisHeaderH + 180) return Math.max(260, Math.floor(viewportH - axisHeaderH - 1));
  const cardH = Math.max(0, document.querySelector('.spectrogram-card')?.clientHeight || 0);
  return Math.max(300, Math.min(680, Math.floor(cardH * 0.62) || 520));
}

function syncAutoVisualHeight(force=false){
  if (!visualState.autoHeight && !force) return false;
  const next = visualAutoHeight();
  if (!(next > 0) || Math.abs(next - visualState.height) < 2) return false;
  visualState.height = next;
  if (el.visualHeightRange) el.visualHeightRange.value = String(clamp(next, Number(el.visualHeightRange.min||300), Number(el.visualHeightRange.max||760)));
  if (el.visualHeightValue) el.visualHeightValue.textContent = `Automática · ${Math.round(next)} px`;
  return true;
}

function resetHiDpiContext(ctx, canvas, cssWidth, cssHeight) {
  const dpr = Number(canvas.dataset.dpr || 1);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { dpr, W: cssWidth, H: cssHeight };
}

function syncViewportLayerPosition(){
  if(!state.display||!el.spectrogramViewport)return;
  const maxScroll=visualMaxScrollLeft(visualState.virtualWidth||visualStageWidth());
  const scroll=clamp(el.spectrogramViewport.scrollLeft||0,0,maxScroll);
  // Compensamos el scroll con transform (compositor) en vez de relayout por `left`.
  // El CSS conserva left=freqAxisW; translateX(scroll) neutraliza el desplazamiento
  // del contenedor y mantiene canvas/regla temporal fijos en el viewport.
  const tx=`translate3d(${scroll}px,0,0)`;
  if(el.canvasLayer)el.canvasLayer.style.transform=tx;
  if(el.timeAxisCanvas)el.timeAxisCanvas.style.transform=tx;
}

function layoutSpectrogramStage(recalcAutoHeight = true) {
  if (!state.display) return;
  const virtualWidth = visualStageWidth();
  const viewW = visualViewportWidth();
  if (recalcAutoHeight) syncAutoVisualHeight();
  const visualHeight = Math.round(visualState.height || 520);
  visualState.virtualWidth=virtualWidth;visualState.viewportWidth=viewW;
  state.display.width = viewW; state.display.virtualWidth=virtualWidth; state.display.height = visualHeight; state.visualHeight=visualHeight; state.visualScaleY=1;
  el.spectrogramStage.style.width = `${CONFIG.freqAxisW + virtualWidth}px`;
  const axisHeaderH = CONFIG.timeAxisH + (CONFIG.freqTitleH || 0);
  el.spectrogramStage.style.height = `${axisHeaderH + visualHeight}px`;
  el.canvasLayer.style.top = `${axisHeaderH}px`;
  el.canvasLayer.style.width = `${viewW}px`; el.canvasLayer.style.height = `${visualHeight}px`;
  for (const c of [el.spectrogramCanvas, el.overlayCanvas]) { c.width=viewW; c.height=visualHeight; c.style.width=`${viewW}px`; c.style.height=`${visualHeight}px`; }
  el.freqAxisCanvas.style.width=`${CONFIG.freqAxisW}px`; el.freqAxisCanvas.style.height=`${visualHeight}px`; el.freqAxisCanvas.style.top=`${axisHeaderH}px`; setupHiDpiCanvas(el.freqAxisCanvas,CONFIG.freqAxisW,visualHeight);
  el.timeAxisCanvas.style.width=`${viewW}px`; el.timeAxisCanvas.style.height=`${CONFIG.timeAxisH}px`; el.timeAxisCanvas.style.top=`0px`; setupHiDpiCanvas(el.timeAxisCanvas,viewW,CONFIG.timeAxisH);
  el.playhead.style.height=`${visualHeight}px`;
  const maxScroll=visualMaxScrollLeft(virtualWidth);
  if(el.spectrogramViewport.scrollLeft>maxScroll)el.spectrogramViewport.scrollLeft=maxScroll;
  syncViewportLayerPosition();
  syncVisualZoomUi();
}

function timeToX(t) { return (clamp(Number(t)||0,0,state.duration)-visualViewStartTime()) * visualState.pxPerSec; }
function xToTime(x) { return clamp(visualViewStartTime()+(Number(x)||0)/Math.max(visualState.pxPerSec,1e-9),0,state.duration); }

function hzToMel(hz) {
  return 2595 * Math.log10(1 + Math.max(0, hz) / 700);
}

function melToHz(mel) {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}
function hzToVisualLog(hz){ return Math.log1p(Math.max(0,hz)/100); }
function visualLogToHz(v){ return 100 * Math.expm1(v); }

function freqToY(f) {
  if(!state.display)return 0;const f0=state.display.fmin,f1=state.display.fmax,H=state.display.height;
  if(visualState.freqScale==='mel'){const m0=hzToMel(f0),m1=hzToMel(f1);return ((m1-hzToMel(f))/Math.max(m1-m0,1e-9))*H;}
  if(visualState.freqScale==='log'){const l0=hzToVisualLog(f0),l1=hzToVisualLog(f1);return ((l1-hzToVisualLog(f))/Math.max(l1-l0,1e-9))*H;}
  return ((f1-f)/Math.max(f1-f0,1e-9))*H;
}
function yToFreq(y) {
  if(!state.display)return 0;const f0=state.display.fmin,f1=state.display.fmax,H=state.display.height;
  if(visualState.freqScale==='mel'){const m0=hzToMel(f0),m1=hzToMel(f1),m=m1-(y/Math.max(1,H))*(m1-m0);return melToHz(m);}
  if(visualState.freqScale==='log'){const l0=hzToVisualLog(f0),l1=hzToVisualLog(f1),v=l1-(y/Math.max(1,H))*(l1-l0);return visualLogToHz(v);}
  return f1-(y/Math.max(1,H))*(f1-f0);
}

function drawAxes() {
  if (!state.display) return;
  drawTimeAxis();
  drawFreqAxis();
}

function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const x = raw / pow;
  const nice = x <= 1 ? 1 : x <= 2 ? 2 : x <= 2.5 ? 2.5 : x <= 5 ? 5 : 10;
  return nice * pow;
}

function formatAxisTime(sec, compact=false, step=null) {
  sec=Math.max(0,Number(sec)||0);
  const hasStep=step!==null&&step!==undefined&&Number.isFinite(Number(step));
  const sStep=hasStep?Number(step):null;
  const decimals=hasStep ? (sStep<0.1?2:sStep<1?1:0) : (visualState.pxPerSec>=500?2:visualState.pxPerSec>=90?1:0);
  if(sec<1e-9) return decimals ? (0).toFixed(decimals) : '0';
  if(sec>=60){
    const m=Math.floor(sec/60), s=sec-m*60;
    if(decimals){
      const ss=s.toFixed(decimals).padStart(3+decimals,'0');
      return `${m}:${ss}`;
    }
    return `${m}:${String(Math.round(s)).padStart(2,'0')}`;
  }
  return decimals ? sec.toFixed(decimals) : `${Math.round(sec)}`;
}

function drawTimeAxis() {
  const ctx = el.timeAxisCanvas.getContext('2d');
  const W = state.display.width, H = CONFIG.timeAxisH;
  resetHiDpiContext(ctx, el.timeAxisCanvas, W, H);
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='#e4eaf2';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,H-.5);ctx.lineTo(W,H-.5);ctx.stroke();
  const viewW=state.display.width||visualViewportWidth();
  const visibleSec=Math.max(1e-6,visualViewDuration());
  const major=Math.max(.01,niceStep(visibleSec/Math.max(5,Math.floor(viewW/95))));
  const minor=major/5;
  const viewStart=visualViewStartTime(),viewEnd=Math.min(state.duration,viewStart+visibleSec);
  const firstTick=Math.max(0,Math.floor(viewStart/minor)*minor);
  const labelY = 13;
  ctx.font='600 11px Inter, Arial, sans-serif';ctx.textBaseline='top';ctx.fillStyle='#334155';
  for(let t=firstTick;t<=viewEnd+minor*.5;t+=minor){
    const x=timeToX(t); if(x<-2||x>W+2)continue; const isMajor=Math.abs((t/major)-Math.round(t/major))<1e-5;
    ctx.strokeStyle=isMajor?'#b8c4d3':'#ced8e4';
    ctx.lineWidth=isMajor?1.0:0.8;
    ctx.beginPath();ctx.moveTo(x+.5,H-(isMajor?5:3));ctx.lineTo(x+.5,H);ctx.stroke();
    if(isMajor){ctx.textAlign=x<16?'left':x>W-16?'right':'center';ctx.fillStyle='#475569';ctx.fillText(formatAxisTime(t,false,major),clamp(x,2,W-2),labelY);}
  }
  if(state.ruleDrag && state.ruleDrag.type==='time'){
    const a=clamp(state.ruleDrag.start||0,0,W), b=clamp((state.ruleDrag.current??a),0,W);
    const x0=Math.min(a,b), x1=Math.max(a,b), mid=(x0+x1)/2;
    ctx.save();
    ctx.fillStyle='rgba(37,99,235,.10)'; ctx.fillRect(x0,0,Math.max(1,x1-x0),H-1);
    ctx.strokeStyle='rgba(37,99,235,.70)'; ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(x0+.5,0); ctx.lineTo(x0+.5,H); ctx.moveTo(x1+.5,0); ctx.lineTo(x1+.5,H); ctx.stroke();
    ctx.fillStyle='#2563eb'; ctx.fillRect(x0-1.5,H-10,3,10); ctx.fillRect(x1-1.5,H-10,3,10);
    ctx.fillStyle='#1d4ed8'; ctx.textAlign='center'; ctx.font='600 10px Inter, Arial, sans-serif'; ctx.fillText(`${prettyTime(xToTime(x0))} – ${prettyTime(xToTime(x1))}`, mid, 1);
    ctx.restore();
  }
}

function freqAxisStep() {
  const span=Math.max(1,state.display.fmax-state.display.fmin);
  const targetCount=Math.max(7,Math.floor((state.visualHeight||520)/36));
  return niceStep(span/targetCount);
}

function formatFreqTick(hz){
  return (Math.max(0,Number(hz)||0)/1000).toFixed(3);
}

function drawFreqAxis() {
  const ctx=el.freqAxisCanvas.getContext('2d');
  const W=CONFIG.freqAxisW,H=state.visualHeight||state.display.height;
  resetHiDpiContext(ctx,el.freqAxisCanvas,W,H);
  ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='#e4eaf2';ctx.beginPath();ctx.moveTo(W-.5,0);ctx.lineTo(W-.5,H);ctx.stroke();
  ctx.font='600 10.5px Inter, Arial, sans-serif';ctx.textAlign='right';ctx.textBaseline='middle';ctx.fillStyle='#475569';
  const step=freqAxisStep();
  const minor=step/2;
  const firstMinor=Math.ceil(state.display.fmin/minor-1e-9)*minor;
  for(let f=firstMinor;f<=state.display.fmax+minor*.1;f+=minor){
    const y=freqToY(f); if(y<2||y>H-2)continue;
    const isMajor=Math.abs((f/step)-Math.round(f/step))<1e-5;
    ctx.strokeStyle=isMajor?'#b8c4d3':'#d7e0ea';
    ctx.lineWidth=isMajor?1.0:0.8;
    ctx.beginPath();ctx.moveTo(isMajor?W-4:W-2,y+.5);ctx.lineTo(W,y+.5);ctx.stroke();
    if(isMajor && y>=6 && y<=H-6){ctx.fillStyle='#475569';ctx.fillText(formatFreqTick(f),W-4,y);}
  }
  if(visualState.freqScale==='linear' && state.display.fmin<=1){
    ctx.strokeStyle='#b8c4d3'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(W-4,H-1.5); ctx.lineTo(W,H-1.5); ctx.stroke();
    ctx.fillStyle='#475569'; ctx.textAlign='right'; ctx.textBaseline='middle';
    // Mantener el 0 completamente dentro del lienzo, pero pegado a su marca inferior.
    ctx.fillText('0.000',W-4,H-8);
  }
  if(state.ruleDrag && state.ruleDrag.type==='freq'){
    const a=clamp(state.ruleDrag.start||0,0,H), b=clamp((state.ruleDrag.current??a),0,H);
    const y0=Math.min(a,b), y1=Math.max(a,b), mid=(y0+y1)/2;
    ctx.save();
    ctx.fillStyle='rgba(37,99,235,.10)'; ctx.fillRect(0,y0,W-1,Math.max(1,y1-y0));
    ctx.strokeStyle='rgba(37,99,235,.72)'; ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(0,y0+.5); ctx.lineTo(W,y0+.5); ctx.moveTo(0,y1+.5); ctx.lineTo(W,y1+.5); ctx.stroke();
    ctx.fillStyle='#2563eb'; ctx.fillRect(W-10,y0-1.5,10,3); ctx.fillRect(W-10,y1-1.5,10,3);
    ctx.save(); ctx.translate(8, mid); ctx.rotate(-Math.PI/2); ctx.textAlign='center'; ctx.font='600 10px Inter, Arial, sans-serif'; ctx.fillStyle='#1d4ed8';
    const fTop=yToFreq(y0), fBottom=yToFreq(y1); ctx.fillText(`${prettyFreq(fBottom)} – ${prettyFreq(fTop)}`,0,0); ctx.restore();
    ctx.restore();
  }
}

function chooseTimeStep(duration) { return niceStep(Math.max(.01,duration)/8); }
function chooseFreqStep() { return freqAxisStep(); }
function prettyTime(sec) { return formatAxisTime(sec,true); }
function prettyFreq(hz) { return `${formatFreqTick(hz)} kHz`; }


function drawScientificGrid(ctx){
  if(!state.display)return;
  const viewW=state.display.width||visualViewportWidth();
  const visibleSec=Math.max(1e-6,visualViewDuration());
  const tStep=Math.max(.01,niceStep(visibleSec/Math.max(4,Math.floor(viewW/95))));
  const viewStart=visualViewStartTime(),viewEnd=Math.min(state.duration,viewStart+visibleSec);
  ctx.save();ctx.lineWidth=1;ctx.strokeStyle='rgba(71,85,105,0.10)';
  const t0=Math.max(0,Math.floor(viewStart/tStep)*tStep);
  for(let t=t0;t<=viewEnd+tStep*.25;t+=tStep){const x=timeToX(t);if(x<-1||x>state.display.width+1)continue;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,state.display.height);ctx.stroke();}
  const fStep=freqAxisStep(),f0=Math.ceil(state.display.fmin/fStep)*fStep;
  ctx.strokeStyle='rgba(71,85,105,0.08)';
  for(let f=f0;f<=state.display.fmax+1e-9;f+=fStep){const y=freqToY(f);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(state.display.width,y);ctx.stroke();}
  ctx.restore();
}
function drawOverlay() {
  if (!state.display || !el.overlayCanvas.width) return;
  const ctx = el.overlayCanvas.getContext('2d');
  ctx.clearRect(0, 0, el.overlayCanvas.width, el.overlayCanvas.height);
  drawScientificGrid(ctx);
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

function drawAnnotationLabel(ctx,x,y,lines,color){
  const arr=Array.isArray(lines)?lines:[String(lines||'')]; if(!arr.length||!arr[0])return;
  ctx.save();ctx.font='600 10px Inter, Arial, sans-serif';
  const widths=arr.map(v=>ctx.measureText(v).width),w=Math.max(...widths)+10,h=arr.length*12+6;
  const px=clamp(x,2,Math.max(2,state.display.width-w-2)),py=clamp(y-h-3,2,Math.max(2,state.display.height-h-2));
  ctx.fillStyle='rgba(255,255,255,.92)';ctx.strokeStyle=color;ctx.lineWidth=1.25;
  if(ctx.roundRect){ctx.beginPath();ctx.roundRect(px,py,w,h,4);ctx.fill();ctx.stroke();}else{ctx.fillRect(px,py,w,h);ctx.strokeRect(px,py,w,h);}
  ctx.fillStyle='#142033';ctx.textBaseline='top';arr.forEach((v,i)=>ctx.fillText(v,px+5,py+3+i*12));ctx.restore();
}

function drawMatches(ctx) {
  const matches = state.matches || [];
  for (const m of matches.slice(0, CONFIG.maxMatchesToDraw)) {
    const tpl = state.templates.find(t => t.id === m.templateId); if (tpl && tpl.showMatches === false) continue;
    const color=m.color||tpl?.color||'#06b6d4',x1=timeToX(m.tmin),x2=timeToX(m.tmax);
    const y1=m.frequencyLocalized===false?0:freqToY(m.fmax),y2=m.frequencyLocalized===false?state.display.height:freqToY(m.fmin);
    const rx=Math.min(x1,x2),ry=Math.min(y1,y2),rw=Math.abs(x2-x1),rh=Math.abs(y2-y1);
    ctx.save();ctx.lineWidth=1.6;ctx.strokeStyle=color;ctx.fillStyle=hexToRgba(color,.055);ctx.fillRect(rx,ry,rw,rh);ctx.strokeRect(rx,ry,rw,rh);ctx.restore();
    drawAnnotationLabel(ctx,rx,ry,[displayLabelForTemplate(tpl||{})||m.etiqueta||'coincidencia',`${m.method || (m.methodKey === 'perch2' ? 'Perch2' : 'Búsqueda')} · score: ${Number(m.score).toFixed(2)}`],color);
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
  const x1=timeToX(roi.tmin),x2=timeToX(roi.tmax),y1=freqToY(roi.fmax),y2=freqToY(roi.fmin);
  const rx=Math.min(x1,x2),ry=Math.min(y1,y2),rw=Math.abs(x2-x1),rh=Math.abs(y2-y1);
  ctx.save();ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.lineWidth=Math.min(2.2,lineWidth||1.8);if(dashed)ctx.setLineDash([7,4]);ctx.fillRect(rx,ry,rw,rh);ctx.strokeRect(rx,ry,rw,rh);ctx.setLineDash([]);
  if(doubleBorder){ctx.lineWidth=1.2;ctx.strokeStyle='rgba(15,23,42,.82)';ctx.strokeRect(rx+3,ry+3,Math.max(0,rw-6),Math.max(0,rh-6));}
  ctx.restore(); if(label)drawAnnotationLabel(ctx,rx,ry,[label],stroke);
}

function showZoomRectCanvas(x1,y1,x2,y2){if(!el.zoomRect)return;el.zoomRect.style.display='block';el.zoomRect.style.left=`${Math.min(x1,x2)}px`;el.zoomRect.style.top=`${Math.min(y1,y2)}px`;el.zoomRect.style.width=`${Math.abs(x2-x1)}px`;el.zoomRect.style.height=`${Math.abs(y2-y1)}px`;}
function hideZoomRectCanvas(){if(el.zoomRect)el.zoomRect.style.display='none';}

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
  el.roiFmin.value = fmt(clipped.fmin / 1000, 3);
  el.roiFmax.value = fmt(clipped.fmax / 1000, 3);
  if (el.btnSaveRoi) el.btnSaveRoi.disabled = false;
  if (el.btnClearRoi) el.btnClearRoi.disabled = false;
  const validNow = isRoiValid(clipped);
  let activeTpl = getActiveTemplate();
  let createdNewFromSearched = false;

  // Si la plantilla activa ya fue buscada y el usuario dibuja una nueva caja,
  // interpretamos la acción como creación de una plantilla nueva.
  // Esto evita reemplazar accidentalmente una plantilla ya procesada.
  if (validNow && activeTpl && (activeTpl.hasSearched || activeTpl.perch2?.hasSearched) && isTemplateValid(activeTpl) && !sameRoi(clipped, activeTpl)) {
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
    invalidatePerchResults(activeTpl);
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
  if (doFollow && !state.dragging && el.followPlayback.checked) scrollToPlayhead(t);
  const x = timeToX(t);
  const visible=x>=-2&&x<=state.display.width+2;
  el.playhead.style.left = `${x}px`;
  el.playhead.style.visibility=visible?'visible':'hidden';
  if(el.playheadAxisLabel){
    el.playheadAxisLabel.hidden=!visible;
    if(visible){
      el.playheadAxisLabel.textContent=`${t.toFixed(2)} s`;
      el.playheadAxisLabel.style.left=`${CONFIG.freqAxisW+(el.spectrogramViewport.scrollLeft||0)+x}px`;
    }
  }
}

function scrollToPlayhead(t, force = false, fraction = 0.40) {
  if (!state.display) return;
  if (!force && !el.followPlayback.checked) return;
  const visibleSec=visualViewDuration();
  const targetStart=clamp((Number(t)||0)-visibleSec*clamp(fraction,0,1),0,visualMaxViewStart());
  const target=scrollLeftForViewStartTime(targetStart);
  if (Math.abs(target - (el.spectrogramViewport.scrollLeft || 0)) < 0.1) return;
  el.spectrogramViewport.scrollLeft = target;
  syncViewportLayerPosition();
}

function centerOnCurrentTime(force = true) {
  if (!state.display) return;
  scrollToPlayhead(el.audioPlayer.currentTime || 0, force, .5);
  scheduleVisualRender(0);requestVisibleVisualTiles(true);updatePlayhead(false);
}

function startAnimationLoop() {
  if (state.rafId !== null) cancelAnimationFrame(state.rafId);
  visualState.lastPlaybackRenderAt=0;
  const loop = (now=performance.now()) => {
    updatePlayhead(true);
    // Canvas fijo del viewport: se repinta a ~30 fps. Si el tile fino aún no
    // llegó, bestVisualCacheForTime usa automáticamente un nivel inferior;
    // por eso el espectrograma nunca queda blanco durante la reproducción.
    if(now-(visualState.lastPlaybackRenderAt||0)>=30){
      visualState.lastPlaybackRenderAt=now;
      scheduleVisualRender(0);
    }
    if(now-(visualState.lastPlaybackTileRequestAt||0)>=90){
      visualState.lastPlaybackTileRequestAt=now;
      requestVisibleVisualTiles(true);
    }
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
  el.matchesTable.querySelector('tbody').innerHTML = `<tr><td colspan="8" class="muted-cell">${escapeHtml(message)}</td></tr>`;
  if (el.resultsFooterSummary) el.resultsFooterSummary.innerHTML = `<span class="ui-icon"><svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg></span><strong>0 coincidencias</strong><span>· ordenado por score</span>`;
}

function sortMatchesForTable(matches) {
  const key = state.tableSort?.key || 'score';
  const dir = state.tableSort?.dir === 'asc' ? 1 : -1;
  const arr = matches.map((m, idx) => ({ ...m, _rank: idx + 1 }));
  const valueFor = (m) => {
    if (key === 'rank') return m._rank;
    if (key === 'etiqueta') return String(m.etiqueta || '').toLowerCase();
    if (key === 'plantilla') return String(m.templateLabel || '').toLowerCase();
    if (key === 'method') return String(m.method || (m.methodKey === 'perch2' ? 'Perch2' : 'Búsqueda clásica')).toLowerCase();
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
    const methodText = m.method || (m.methodKey === 'perch2' ? 'Perch2' : 'Búsqueda clásica');
    const methodClass = m.methodKey === 'perch2' ? 'perch' : 'classic';
    tr.innerHTML = `<td>${m._rank}</td><td class="label-pill-cell"><span class="label-pill editable-label" contenteditable="true" data-template-id="${escapeHtml(m.templateId || '')}" style="--tpl-color:${m.color || '#00e5ff'}">${labelText}</span></td><td><span class="method-badge ${methodClass}">${escapeHtml(methodText)}</span></td><td>${m.score.toFixed(3)}</td><td>${m.tmin.toFixed(2)}</td><td>${m.tmax.toFixed(2)}</td><td>${m.frequencyLocalized === false ? '—' : (m.fmin/1000).toFixed(3)}</td><td>${m.frequencyLocalized === false ? '—' : (m.fmax/1000).toFixed(3)}</td>`;
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
  if (el.resultsFooterSummary) {
    const key=state.tableSort?.key || 'score';
    el.resultsFooterSummary.innerHTML=`<span class="ui-icon"><svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg></span><strong>${state.matches.length} coincidencia${state.matches.length===1?'':'s'}</strong><span>· ordenado por ${escapeHtml(key)}</span>`;
  }
}

function updateTemplateLabel(templateId, newLabel, options = {}) {
  const tpl = state.templates.find(t => t.id === templateId);
  if (!tpl) return;
  const finalLabel = cleanLabel(newLabel || tpl.defaultLabel || displayLabelForTemplate(tpl));
  tpl.etiqueta = finalLabel;
  for (const m of [...(tpl.matches || []), ...(tpl.perchMatches || [])]) {
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
  const header = ['audio','plantilla','metodo','tmin','tmax','fmin','fmax','etiqueta','score','estado'];
  const rows = state.matches.map(m => [
    state.file?.name || '',
    m.templateLabel || '',
    m.method || (m.methodKey === 'perch2' ? 'Perch2' : 'Búsqueda clásica'),
    m.tmin.toFixed(6),
    m.tmax.toFixed(6),
    m.frequencyLocalized === false ? '' : m.fmin.toFixed(3),
    m.frequencyLocalized === false ? '' : m.fmax.toFixed(3),
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
  const header = ['audio','plantilla','metodo','tmin','tmax','fmin','fmax','etiqueta','score','estado'];
  const rows = state.matches.map(m => [
    state.file?.name || '',
    m.templateLabel || '',
    m.method || (m.methodKey === 'perch2' ? 'Perch2' : 'Búsqueda clásica'),
    Number(m.tmin.toFixed(6)),
    Number(m.tmax.toFixed(6)),
    m.frequencyLocalized === false ? '' : Number(m.fmin.toFixed(3)),
    m.frequencyLocalized === false ? '' : Number(m.fmax.toFixed(3)),
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
    if (m.frequencyLocalized !== false) lines.push(`\\\t${m.fmin.toFixed(6)}\t${m.fmax.toFixed(6)}`);
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
    fmin: Number(el.roiFmin.value) * 1000,
    fmax: Number(el.roiFmax.value) * 1000,
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
      perchMatches: [],
      perch2: null,
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
    invalidateClassicResults(tpl);
    invalidatePerchResults(tpl);
    tpl.autoAdjust = true;
  tpl.autoAdjustMode = 'balanceado';
    tpl.showMatches = true;
  }
  tpl.etiqueta = cleanLabel(currentEtiqueta() || tpl.etiqueta || tpl.defaultLabel);
  for (const m of [...(tpl.matches || []), ...(tpl.perchMatches || [])]) {
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
    invalidateClassicResults(tpl);
    invalidatePerchResults(tpl);
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
  renderTemplateNavigator();
  applyPerchConfigToUi(tpl);
  updateSearchButtonsState();
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
  invalidateClassicResults(tpl);
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
  syncAutoAdjustSegments(normalized);
  updateManualSearchControlState();
}

function syncAutoAdjustSegments(mode = null) {
  const normalized = normalizeAutoAdjustMode(mode || el.autoAdjustMode?.value || 'none');
  if (!el.autoAdjustSegments) return;
  el.autoAdjustSegments.querySelectorAll('[data-auto-mode]').forEach(btn => {
    btn.classList.toggle('active', normalizeAutoAdjustMode(btn.dataset.autoMode) === normalized);
    btn.setAttribute('aria-checked', normalizeAutoAdjustMode(btn.dataset.autoMode) === normalized ? 'true' : 'false');
  });
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

function getAxisCanvasXY(ev,canvas,logicalW,logicalH){const r=canvas.getBoundingClientRect();return [clamp((ev.clientX-r.left)*logicalW/Math.max(1,r.width),0,logicalW),clamp((ev.clientY-r.top)*logicalH/Math.max(1,r.height),0,logicalH)];}

const PALETTE_LABELS = {magma_light:'Magma clara',magma_r:'Magma invertida',magma:'Magma',inferno_r:'Inferno invertida',inferno:'Inferno',plasma_r:'Plasma invertida',plasma:'Plasma',viridis_r:'Viridis invertida',viridis:'Viridis',cividis:'Cividis',turbo:'Turbo',hot:'Hot',gray:'Grises',gray_r:'Grises invertidos'};
function paletteClassName(value){return 'palette-'+String(value||'magma_light').replace(/_/g,'-');}
function syncPalettePicker(value=visualState.colormap){
  if(el.palettePickerLabel) el.palettePickerLabel.textContent=PALETTE_LABELS[value]||value;
  if(el.palettePickerSwatch){el.palettePickerSwatch.className=`palette-swatch ${paletteClassName(value)}`;}
  if(el.palettePickerMenu) el.palettePickerMenu.querySelectorAll('[data-palette]').forEach(btn=>btn.classList.toggle('active',btn.dataset.palette===value));
}


function sidePanelDefaultWidthPx() {
  return clamp(window.innerWidth * 0.33, 360, 560);
}

function sidePanelWidthLimits() {
  const min = 250;
  const max = Math.max(min, Math.min(720, window.innerWidth * 0.56));
  return { min, max };
}

function setSidePanelWidth(px, persist = false) {
  if (!el.sidePanel || !el.workspace || window.innerWidth <= 980) return;
  const { min, max } = sidePanelWidthLimits();
  const width = clamp(Number(px) || sidePanelDefaultWidthPx(), min, max);
  document.documentElement.style.setProperty('--side-panel-w', `${Math.round(width)}px`);
  if (el.sidePanelResizer) {
    el.sidePanelResizer.setAttribute('aria-valuemin', String(Math.round(min)));
    el.sidePanelResizer.setAttribute('aria-valuemax', String(Math.round(max)));
    el.sidePanelResizer.setAttribute('aria-valuenow', String(Math.round(width)));
  }
  if (persist) {
    try { localStorage.setItem('bioacoustic-v45.8-side-panel-width', String(Math.round(width))); } catch (_) {}
  }
}

function refreshAfterSidePanelResize(keepFit = false) {
  if (!state.display) return;
  const oldStart=visualViewStartTime();
  if (keepFit) visualState.pxPerSec = visualFitPxPerSec();
  syncVisualZoomUi();
  layoutSpectrogramStage(false);
  setVisualViewStartTime(keepFit?0:oldStart);
  drawAxes();
  drawOverlay();
  renderVisualSpectrogram();
  requestVisibleVisualTiles(true);
  drawSamplePreview();
}

function attachSidePanelResizer() {
  const handle = el.sidePanelResizer;
  if (!handle || !el.sidePanel) return;
  handle.tabIndex = 0;
  try {
    const saved = Number(localStorage.getItem('bioacoustic-v45.8-side-panel-width') || localStorage.getItem('bioacoustic-v45.7.4-side-panel-width') || localStorage.getItem('bioacoustic-v45.7.3-side-panel-width') || localStorage.getItem('bioacoustic-v45.7.2-side-panel-width'));
    if (Number.isFinite(saved) && saved > 0) setSidePanelWidth(saved, false);
    else setSidePanelWidth(el.sidePanel.getBoundingClientRect().width || sidePanelDefaultWidthPx(), false);
  } catch (_) {
    setSidePanelWidth(el.sidePanel.getBoundingClientRect().width || sidePanelDefaultWidthPx(), false);
  }

  let startX = 0;
  let startWidth = 0;
  let keepFit = false;
  let raf = 0;
  const queueRefresh = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => refreshAfterSidePanelResize(keepFit));
  };
  const onMove = (ev) => {
    const dx = ev.clientX - startX;
    setSidePanelWidth(startWidth - dx, false);
    queueRefresh();
  };
  const onUp = () => {
    document.body.classList.remove('is-resizing-sidepanel');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    const width = el.sidePanel.getBoundingClientRect().width;
    setSidePanelWidth(width, true);
    queueRefresh();
  };
  handle.addEventListener('pointerdown', (ev) => {
    if (window.innerWidth <= 980) return;
    startX = ev.clientX;
    startWidth = el.sidePanel.getBoundingClientRect().width;
    const fit = visualFitPxPerSec();
    keepFit = Boolean(state.display && Math.abs(visualState.pxPerSec - fit) <= Math.max(0.05, fit * 0.025));
    document.body.classList.add('is-resizing-sidepanel');
    handle.setPointerCapture?.(ev.pointerId);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    ev.preventDefault();
  });
  handle.addEventListener('dblclick', () => {
    try { localStorage.removeItem('bioacoustic-v45.8-side-panel-width'); localStorage.removeItem('bioacoustic-v45.7.4-side-panel-width'); localStorage.removeItem('bioacoustic-v45.7.3-side-panel-width'); localStorage.removeItem('bioacoustic-v45.7.2-side-panel-width'); } catch (_) {}
    document.documentElement.style.removeProperty('--side-panel-w');
    refreshAfterSidePanelResize(true);
  });
  handle.addEventListener('keydown', (ev) => {
    if (!['ArrowLeft','ArrowRight','Home'].includes(ev.key) || window.innerWidth <= 980) return;
    ev.preventDefault();
    const current = el.sidePanel.getBoundingClientRect().width;
    if (ev.key === 'Home') {
      try { localStorage.removeItem('bioacoustic-v45.8-side-panel-width'); localStorage.removeItem('bioacoustic-v45.7.4-side-panel-width'); localStorage.removeItem('bioacoustic-v45.7.3-side-panel-width'); localStorage.removeItem('bioacoustic-v45.7.2-side-panel-width'); } catch (_) {}
      document.documentElement.style.removeProperty('--side-panel-w');
      refreshAfterSidePanelResize(true);
      return;
    }
    // Flecha izquierda mueve el separador a la izquierda = panel derecho más ancho.
    setSidePanelWidth(current + (ev.key === 'ArrowLeft' ? 20 : -20), true);
    refreshAfterSidePanelResize(false);
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth <= 980 || !el.sidePanel) return;
    setSidePanelWidth(el.sidePanel.getBoundingClientRect().width || sidePanelDefaultWidthPx(), false);
  });
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
  if(el.btnFitAll)el.btnFitAll.addEventListener('click',fitVisualAll);
  if(el.btnZoomIn)el.btnZoomIn.addEventListener('click',()=>setVisualZoom(visualState.pxPerSec*1.35,el.audioPlayer.currentTime||null));
  if(el.btnZoomOut)el.btnZoomOut.addEventListener('click',()=>setVisualZoom(visualState.pxPerSec/1.35,el.audioPlayer.currentTime||null));
  if(el.zoomSelection)el.zoomSelection.addEventListener('change',()=>el.spectrogramViewport.classList.toggle('zoom-select-on',el.zoomSelection.checked));
  const applyVisualScale = (value) => {
    if(el.freqScaleSelect) el.freqScaleSelect.value=value;
    if(el.quickFreqScale) el.quickFreqScale.value=value;
    readVisualControls(); if(state.display) state.display.freqScale=visualState.freqScale; drawAxes(); drawOverlay(); renderVisualSpectrogram(); drawSamplePreview();
  };
  const applyVisualPalette = (value) => {
    if(el.colormapSelect) el.colormapSelect.value=value;
    if(el.quickColormap) el.quickColormap.value=value;
    readVisualControls(); syncPalettePicker(value); renderVisualSpectrogram(); drawSamplePreview();
  };
  if(el.freqScaleSelect)el.freqScaleSelect.addEventListener('change',()=>applyVisualScale(el.freqScaleSelect.value));
  if(el.quickFreqScale)el.quickFreqScale.addEventListener('change',()=>applyVisualScale(el.quickFreqScale.value));
  if(el.colormapSelect)el.colormapSelect.addEventListener('change',()=>applyVisualPalette(el.colormapSelect.value));
  if(el.quickColormap)el.quickColormap.addEventListener('change',()=>applyVisualPalette(el.quickColormap.value));
  syncPalettePicker(el.colormapSelect?.value || visualState.colormap);
  if(el.palettePickerButton && el.palettePickerMenu){
    el.palettePickerButton.addEventListener('click',(ev)=>{ev.stopPropagation();const open=el.palettePickerMenu.hidden;el.palettePickerMenu.hidden=!open;el.palettePickerButton.setAttribute('aria-expanded',open?'true':'false');});
    el.palettePickerMenu.querySelectorAll('[data-palette]').forEach(btn=>btn.addEventListener('click',()=>{applyVisualPalette(btn.dataset.palette);el.palettePickerMenu.hidden=true;el.palettePickerButton.setAttribute('aria-expanded','false');}));
    document.addEventListener('click',(ev)=>{if(!ev.target.closest('#palettePicker')){el.palettePickerMenu.hidden=true;el.palettePickerButton.setAttribute('aria-expanded','false');}});
  }
  [el.contrastRange,el.brightnessRange,el.gammaRange].forEach(n=>n&&n.addEventListener('input',()=>{readVisualControls();renderVisualSpectrogram();drawSamplePreview();}));
  [el.visualFftSelect,el.visualQualitySelect].forEach(n=>n&&n.addEventListener('change',()=>applySpectrogramSettings({recompute:true})));
  if(el.visualHeightRange)el.visualHeightRange.addEventListener('input',()=>{visualState.autoHeight=false;applySpectrogramSettings({relayout:true});drawSamplePreview();});
  if(el.pxPerSecRange)el.pxPerSecRange.addEventListener('input',()=>{setVisualZoom(visualZoomFromSlider(Number(el.pxPerSecRange.value)),null);drawSamplePreview();});
  if(el.btnResetVisual)el.btnResetVisual.addEventListener('click',()=>{Object.assign(visualState,VISUAL_DEFAULTS);if(el.freqScaleSelect)el.freqScaleSelect.value=VISUAL_DEFAULTS.freqScale;if(el.quickFreqScale)el.quickFreqScale.value=VISUAL_DEFAULTS.freqScale;if(el.colormapSelect)el.colormapSelect.value=VISUAL_DEFAULTS.colormap;if(el.quickColormap)el.quickColormap.value=VISUAL_DEFAULTS.colormap;if(el.contrastRange)el.contrastRange.value=VISUAL_DEFAULTS.contrast;if(el.brightnessRange)el.brightnessRange.value=VISUAL_DEFAULTS.brightness;if(el.gammaRange)el.gammaRange.value=VISUAL_DEFAULTS.gamma;if(el.visualFftSelect)el.visualFftSelect.value=VISUAL_DEFAULTS.fftSize;if(el.visualQualitySelect)el.visualQualitySelect.value=VISUAL_DEFAULTS.quality;if(el.visualHeightRange)el.visualHeightRange.value=VISUAL_DEFAULTS.height;visualState.autoHeight=true;syncAutoVisualHeight(true);readVisualControls();syncPalettePicker(VISUAL_DEFAULTS.colormap);fitVisualAll();scheduleVisualRecompute();drawSamplePreview();});

  el.audioPlayer.addEventListener('play', () => { startAnimationLoop(); syncCustomPlayer(); });
  el.audioPlayer.addEventListener('pause', () => { stopAnimationLoop(); syncCustomPlayer(); });
  el.audioPlayer.addEventListener('ended', () => { stopAnimationLoop(); syncCustomPlayer(); });
  el.audioPlayer.addEventListener('loadedmetadata', syncCustomPlayer);
  el.audioPlayer.addEventListener('durationchange', syncCustomPlayer);
  el.audioPlayer.addEventListener('timeupdate', () => { updatePlayhead(false); syncCustomPlayer(); });
  el.audioPlayer.addEventListener('seeked', () => { updatePlayhead(false); syncCustomPlayer(); });
  if(el.btnPlayPause)el.btnPlayPause.addEventListener('click',()=>{el.audioPlayer.paused?el.audioPlayer.play():el.audioPlayer.pause();});
  if(el.btnBackOne)el.btnBackOne.addEventListener('click',()=>{el.audioPlayer.currentTime=clamp((el.audioPlayer.currentTime||0)-1,0,state.duration||0);syncCustomPlayer();});
  if(el.btnForwardOne)el.btnForwardOne.addEventListener('click',()=>{el.audioPlayer.currentTime=clamp((el.audioPlayer.currentTime||0)+1,0,state.duration||0);syncCustomPlayer();});
  if(el.playerSeek)el.playerSeek.addEventListener('input',()=>{el.audioPlayer.currentTime=clamp(Number(el.playerSeek.value)||0,0,state.duration||0);updatePlayhead(true);syncCustomPlayer();});
  if(el.btnMute)el.btnMute.addEventListener('click',()=>{el.audioPlayer.muted=!el.audioPlayer.muted;syncCustomPlayer();});
  if(el.playbackRate)el.playbackRate.addEventListener('change',()=>{el.audioPlayer.playbackRate=Number(el.playbackRate.value)||1;});
  el.spectrogramViewport.addEventListener('scroll',()=>{
    if(!state.display)return;
    const mx=visualMaxScrollLeft(visualState.virtualWidth||visualStageWidth());
    if(el.spectrogramViewport.scrollLeft>mx+1)el.spectrogramViewport.scrollLeft=mx;
    syncViewportLayerPosition();
    const playing=Boolean(el.audioPlayer && !el.audioPlayer.paused && !el.audioPlayer.ended);
    if(!playing){scheduleVisualRender(0);requestVisibleVisualTiles();}
    updatePlayhead(false); updateViewRangeLabel();
  });
  // Arrastrar regla temporal = zoom solo en tiempo; regla vertical = zoom solo en frecuencia.
  el.timeAxisCanvas.addEventListener('mousedown',(ev)=>{if(!state.display)return;const [x]=getAxisCanvasXY(ev,el.timeAxisCanvas,state.display.width,CONFIG.timeAxisH);state.ruleDrag={type:'time',start:x,current:x};drawAxes();ev.preventDefault();});
  el.freqAxisCanvas.addEventListener('mousedown',(ev)=>{if(!state.display)return;const [,y]=getAxisCanvasXY(ev,el.freqAxisCanvas,CONFIG.freqAxisW,state.display.height);state.ruleDrag={type:'freq',start:y,current:y};drawAxes();ev.preventDefault();});
  el.timeAxisCanvas.addEventListener('mousemove',(ev)=>{if(!state.ruleDrag||state.ruleDrag.type!=='time'||!state.display)return;const [x]=getAxisCanvasXY(ev,el.timeAxisCanvas,state.display.width,CONFIG.timeAxisH);state.ruleDrag.current=x;drawAxes();});
  el.freqAxisCanvas.addEventListener('mousemove',(ev)=>{if(!state.ruleDrag||state.ruleDrag.type!=='freq'||!state.display)return;const [,y]=getAxisCanvasXY(ev,el.freqAxisCanvas,CONFIG.freqAxisW,state.display.height);state.ruleDrag.current=y;drawAxes();});
  window.addEventListener('mousemove',(ev)=>{if(!state.ruleDrag||!state.display)return;const rd=state.ruleDrag;if(rd.type==='time'){const [x]=getAxisCanvasXY(ev,el.timeAxisCanvas,state.display.width,CONFIG.timeAxisH);rd.current=x;}else{const [,y]=getAxisCanvasXY(ev,el.freqAxisCanvas,CONFIG.freqAxisW,state.display.height);rd.current=y;}drawAxes();});
  window.addEventListener('mouseup',(ev)=>{if(!state.ruleDrag||!state.display)return;const rd=state.ruleDrag;state.ruleDrag=null;drawAxes();if(rd.type==='time'){const [x]=getAxisCanvasXY(ev,el.timeAxisCanvas,state.display.width,CONFIG.timeAxisH);if(Math.abs(x-rd.start)>10)applyTimeInterval(xToTime(rd.start),xToTime(x));}else{const [,y]=getAxisCanvasXY(ev,el.freqAxisCanvas,CONFIG.freqAxisW,state.display.height);if(Math.abs(y-rd.start)>10)applyFreqRange(yToFreq(rd.start),yToFreq(y));}});


  el.overlayCanvas.addEventListener('mousedown', (ev) => {
    if (!state.display) return;
    state.dragging = true;
    state.zoomDragging = Boolean(el.zoomSelection?.checked);
    state.moved = false;
    state.preventRoiEdit = shouldBlockCanvasRoiEdit();
    state.lockToastShown = false;
    [state.startX, state.startY] = getCanvasXY(ev);
  });
  el.overlayCanvas.addEventListener('mousemove', (ev) => {
    if (!state.dragging || !state.display) return;
    const [x, y] = getCanvasXY(ev);
    if (state.zoomDragging) {
      state.moved = true;
      showZoomRectCanvas(state.startX,state.startY,x,y);
      return;
    }

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
    if (state.zoomDragging) {
      const moved=state.moved; state.zoomDragging=false; hideZoomRectCanvas();
      if(moved && Math.hypot(x-state.startX,y-state.startY)>8){const r=rectToRoi(state.startX,state.startY,x,y);applyTimeInterval(r.tmin,r.tmax);applyFreqRange(r.fmin,r.fmax);} return;
    }

    if (state.preventRoiEdit) {
      const wasMoved = state.moved;
      state.preventRoiEdit = false;
      state.lockToastShown = false;
      if (!wasMoved) {
        el.audioPlayer.currentTime = xToTime(x);
        updatePlayhead(false);
      } else {
        drawOverlay();
      }
      return;
    }

    if (!state.moved) {
      el.audioPlayer.currentTime = xToTime(x);
      updatePlayhead(false);
      return;
    }
    setRoi(rectToRoi(state.startX, state.startY, x, y));
  };
  el.overlayCanvas.addEventListener('mouseup', finishDrag);
  el.overlayCanvas.addEventListener('mouseleave', finishDrag);

  // v45.6: marcado táctil real en móvil. El gesto dentro del canvas no desplaza la página.
  const touchPoint=(ev)=>{const t=ev.touches?.[0]||ev.changedTouches?.[0];return t?getCanvasXY({clientX:t.clientX,clientY:t.clientY}):[0,0];};
  el.overlayCanvas.addEventListener('touchstart',(ev)=>{
    if(!state.display)return; ev.preventDefault();
    state.dragging=true; state.zoomDragging=Boolean(el.zoomSelection?.checked); state.moved=false; state.preventRoiEdit=shouldBlockCanvasRoiEdit(); state.lockToastShown=false;
    [state.startX,state.startY]=touchPoint(ev);
  },{passive:false});
  el.overlayCanvas.addEventListener('touchmove',(ev)=>{
    if(!state.dragging||!state.display)return; ev.preventDefault(); const [x,y]=touchPoint(ev);
    if(state.zoomDragging){state.moved=true;showZoomRectCanvas(state.startX,state.startY,x,y);return;}
    if(state.preventRoiEdit){if(Math.hypot(x-state.startX,y-state.startY)>5)state.moved=true;return;}
    state.moved=true; const roi=rectToRoi(state.startX,state.startY,x,y); const ctx=el.overlayCanvas.getContext('2d'); drawOverlay(); drawRoi(ctx,roi,'','#000000','rgba(0,0,0,0.04)',2.5,false,true);
  },{passive:false});
  el.overlayCanvas.addEventListener('touchend',(ev)=>{
    if(!state.dragging||!state.display)return; ev.preventDefault(); state.dragging=false; const [x,y]=touchPoint(ev);
    if(state.zoomDragging){const moved=state.moved;state.zoomDragging=false;hideZoomRectCanvas();if(moved&&Math.hypot(x-state.startX,y-state.startY)>8){const r=rectToRoi(state.startX,state.startY,x,y);applyTimeInterval(r.tmin,r.tmax);applyFreqRange(r.fmin,r.fmax);}return;}
    if(state.preventRoiEdit){const moved=state.moved;state.preventRoiEdit=false;if(!moved){el.audioPlayer.currentTime=xToTime(x);updatePlayhead(false);}else drawOverlay();return;}
    if(!state.moved){el.audioPlayer.currentTime=xToTime(x);updatePlayhead(false);return;} setRoi(rectToRoi(state.startX,state.startY,x,y));
  },{passive:false});

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
  if (el.btnPrevPerchTemplate) el.btnPrevPerchTemplate.addEventListener('click', () => goTemplate(-1));
  if (el.btnNextPerchTemplate) el.btnNextPerchTemplate.addEventListener('click', () => goTemplate(1));
  el.btnSearch.addEventListener('click', searchEmbedding);
  el.btnClearMatches.addEventListener('click', clearMatches);
  el.btnExportCsv.addEventListener('click', exportCsv);
  if (el.btnExportXlsx) el.btnExportXlsx.addEventListener('click', exportXlsx);
  if (el.btnExportTxt) el.btnExportTxt.addEventListener('click', exportAudacityTxt);
  [el.metricSelect, el.scoreThreshold, el.scoreThresholdInput, el.strideSec, el.strideSecInput, el.roiLabel].forEach(node => {
    if (node) node.addEventListener('change', syncActiveTemplateParamsFromUi);
  });
  [el.metricSelect, el.strideSec, el.strideSecInput].forEach(node => {
    if (node) node.addEventListener('change', () => { refreshCombinedMatches(); updateSearchSummaryText(); drawOverlay(); updateSearchButtonsState(); });
  });
  if (el.roiLabel) {
    el.roiLabel.addEventListener('input', () => {
      syncActiveTemplateParamsFromUi();
      updateSearchSummaryText();
      drawOverlay();
    });
  }
  if (el.showActiveMatches) el.showActiveMatches.addEventListener('change', () => { syncActiveTemplateParamsFromUi(); drawOverlay(); });
  if (el.autoAdjustMode) el.autoAdjustMode.addEventListener('change', () => { syncAutoAdjustSegments(); syncActiveTemplateParamsFromUi(); updateManualSearchControlState(); });
  if (el.autoAdjustSegments) {
    el.autoAdjustSegments.querySelectorAll('[data-auto-mode]').forEach(btn => btn.addEventListener('click', () => {
      const mode=normalizeAutoAdjustMode(btn.dataset.autoMode);
      if(el.autoAdjustMode) el.autoAdjustMode.value=mode;
      syncAutoAdjustSegments(mode); syncActiveTemplateParamsFromUi(); updateManualSearchControlState();
    }));
  }
  if (el.expertMode) el.expertMode.addEventListener('change', () => { syncActiveTemplateParamsFromUi(); updateManualSearchControlState(); });
  if (el.useMultiSamples) el.useMultiSamples.addEventListener('change', () => {
    const tpl = getActiveTemplate();
    if (tpl) {
      tpl.useMultiSamples = Boolean(el.useMultiSamples.checked);
      if (!Array.isArray(tpl.samples)) tpl.samples = [];
      tpl.sampleEstimator = el.sampleEstimator?.value || tpl.sampleEstimator || 'consensus_ncc';
      clearTemplateCompositeCache(tpl);
      invalidateClassicResults(tpl);
      invalidatePerchResults(tpl);
      tpl.autoAdjust = true;
  tpl.autoAdjustMode = 'balanceado';
    }
    updateSamplePanelState(tpl);
    applyPerchConfigToUi(tpl);
    renderTemplateNavigator();
    updateSearchButtonsState();
    refreshCombinedMatches();
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
        invalidateClassicResults(tpl);
        tpl.autoAdjust = true;
  tpl.autoAdjustMode = 'balanceado';
      }
    }
    updateSamplePanelState(tpl);
    updateSearchButtonsState();
    refreshCombinedMatches();
    updateSearchSummaryText();
    drawOverlay();
  });
  if (el.btnAddSample) el.btnAddSample.addEventListener('click', () => addCurrentSampleToActiveTemplate({ silent: false }));
  if (el.btnRemoveSample) el.btnRemoveSample.addEventListener('click', removeLastSampleFromActiveTemplate);

  if (el.perchSignalSegments) {
    el.perchSignalSegments.querySelectorAll('[data-perch-mode]').forEach(btn => btn.addEventListener('click', () => {
      const mode = btn.dataset.perchMode || 'auto';
      setPerchModeButtons(mode);
      syncActiveTemplatePerchParamsFromUi({ invalidateExpensive: true });
    }));
  }
  if (el.perchStride && el.perchStrideInput) {
    el.perchStride.addEventListener('input', () => { el.perchStrideInput.value = Number(el.perchStride.value).toFixed(2); updatePerchWindowEstimate(); updatePerchTemporalResolutionUi(); });
    el.perchStride.addEventListener('change', () => syncActiveTemplatePerchParamsFromUi({ invalidateExpensive: true }));
    el.perchStrideInput.addEventListener('input', () => { const v=clamp(Number(el.perchStrideInput.value)||0.5,0.25,2); el.perchStride.value=String(v); updatePerchWindowEstimate(); updatePerchTemporalResolutionUi(); });
    el.perchStrideInput.addEventListener('change', () => syncActiveTemplatePerchParamsFromUi({ invalidateExpensive: true }));
  }
  if (el.perchFminRange) {
    el.perchFminRange.addEventListener('input', () => updatePerchDualRangeVisual('min'));
    el.perchFminRange.addEventListener('change', () => syncActiveTemplatePerchParamsFromUi({ invalidateExpensive: true }));
  }
  if (el.perchFmaxRange) {
    el.perchFmaxRange.addEventListener('input', () => updatePerchDualRangeVisual('max'));
    el.perchFmaxRange.addEventListener('change', () => syncActiveTemplatePerchParamsFromUi({ invalidateExpensive: true }));
  }
  if (el.perchFminInput) el.perchFminInput.addEventListener('change', () => { syncPerchBandHandlesFromInputs('min'); syncActiveTemplatePerchParamsFromUi({ invalidateExpensive: true }); });
  if (el.perchFmaxInput) el.perchFmaxInput.addEventListener('change', () => { syncPerchBandHandlesFromInputs('max'); syncActiveTemplatePerchParamsFromUi({ invalidateExpensive: true }); });
  if (el.perchScore && el.perchScoreInput) {
    el.perchScore.addEventListener('input', () => { el.perchScoreInput.value = Number(el.perchScore.value).toFixed(2); syncActiveTemplatePerchParamsFromUi({ refreshFilters: true }); });
    el.perchScoreInput.addEventListener('input', () => { const v=clamp(Number(el.perchScoreInput.value)||0,-1,1); el.perchScore.value=String(v); syncActiveTemplatePerchParamsFromUi({ refreshFilters: true }); });
  }
  if (el.perchExcludeTemplate) el.perchExcludeTemplate.addEventListener('change', () => syncActiveTemplatePerchParamsFromUi({ refreshFilters: true }));
  if (el.perchTemporalRefine) el.perchTemporalRefine.addEventListener('change', () => syncActiveTemplatePerchParamsFromUi({ refreshFilters: true }));
  if (el.perchEdgeAdjustment) el.perchEdgeAdjustment.addEventListener('input', () => { updatePerchProfileControlLabels(); syncActiveTemplatePerchParamsFromUi({ refreshFilters: true }); });
  if (el.perchPeakSeparation) el.perchPeakSeparation.addEventListener('input', () => { updatePerchProfileControlLabels(); syncActiveTemplatePerchParamsFromUi({ refreshFilters: true }); });
  if (el.perchPadding && el.perchPaddingInput) {
    el.perchPadding.addEventListener('input', () => { el.perchPaddingInput.value=Number(el.perchPadding.value).toFixed(2); syncActiveTemplatePerchParamsFromUi({ refreshFilters: true }); });
    el.perchPaddingInput.addEventListener('input', () => { const v=clamp(Number(el.perchPaddingInput.value)||0,0,1); el.perchPadding.value=String(v); syncActiveTemplatePerchParamsFromUi({ refreshFilters: true }); });
  }

  if (el.btnSearchPerch) el.btnSearchPerch.addEventListener('click', startPerchSearch);
  if (el.btnCancelPerch) el.btnCancelPerch.addEventListener('click', cancelPerchSearch);

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
        state.tableSort.dir = (key === 'etiqueta' || key === 'method') ? 'asc' : 'desc';
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

  syncRangeNumber(el.scoreThreshold, el.scoreThresholdInput, 3, 0, 0.99);
  const refreshClassicScoreFromUi = () => {
    const tpl=getActiveTemplate();
    if (!tpl) return;
    tpl.scoreThreshold=clamp(Number(el.scoreThreshold.value||0),0,0.99);
    if (tpl.hasSearched && Array.isArray(tpl.classicCandidates) && tpl.classicCandidates.length) refreshClassicMatchesFromCache(tpl);
  };
  if (el.scoreThreshold) el.scoreThreshold.addEventListener('input', refreshClassicScoreFromUi);
  if (el.scoreThresholdInput) el.scoreThresholdInput.addEventListener('input', () => {
    const v=clamp(Number(el.scoreThresholdInput.value)||0,0,0.99);
    el.scoreThreshold.value=String(v);
    refreshClassicScoreFromUi();
  });

  syncRangeNumber(el.strideSec, el.strideSecInput, 2, 0.01, 1.00);
  if (el.expertMinMatches && el.expertMinMatchesInput) syncRangeNumber(el.expertMinMatches, el.expertMinMatchesInput, 0, 1, 20);
  if (el.expertMaxMatches && el.expertMaxMatchesInput) syncRangeNumber(el.expertMaxMatches, el.expertMaxMatchesInput, 0, 5, 200);
  if (el.expertProminence && el.expertProminenceInput) syncRangeNumber(el.expertProminence, el.expertProminenceInput, 3, 0, 0.40);
  if (el.expertGroupFactor && el.expertGroupFactorInput) syncRangeNumber(el.expertGroupFactor, el.expertGroupFactorInput, 2, 0.40, 2.00);
  [el.expertMinMatches, el.expertMinMatchesInput, el.expertMaxMatches, el.expertMaxMatchesInput, el.expertProminence, el.expertProminenceInput, el.expertGroupFactor, el.expertGroupFactorInput].forEach(node => {
    if (node) node.addEventListener('change', syncActiveTemplateParamsFromUi);
  });
  updateManualSearchControlState();
  setPerchModeButtons('full');
  updatePerchDualRangeVisual();
  updatePerchWindowEstimate();
  updatePerchButtonsState();
  window.addEventListener('keydown',(ev)=>{const tag=(ev.target&&ev.target.tagName||'').toLowerCase();if(['input','select','textarea','button'].includes(tag))return;if(ev.key==='+'||ev.key==='='){ev.preventDefault();setVisualZoom(visualState.pxPerSec*1.25,el.audioPlayer.currentTime||null);}else if(ev.key==='-'||ev.key==='_'){ev.preventDefault();setVisualZoom(visualState.pxPerSec/1.25,el.audioPlayer.currentTime||null);}else if(ev.key==='0'){ev.preventDefault();fitVisualAll();}else if(ev.key.toLowerCase()==='z'){ev.preventDefault();el.zoomSelection.checked=!el.zoomSelection.checked;el.spectrogramViewport.classList.toggle('zoom-select-on',el.zoomSelection.checked);}else if(ev.key==='Escape'){el.zoomSelection.checked=false;el.spectrogramViewport.classList.remove('zoom-select-on');hideZoomRectCanvas();}else if(ev.key===' '){ev.preventDefault();el.audioPlayer.paused?el.audioPlayer.play():el.audioPlayer.pause();}else if(ev.key==='ArrowLeft'){ev.preventDefault();el.audioPlayer.currentTime=clamp((el.audioPlayer.currentTime||0)-1,0,state.duration);updatePlayhead(true);}else if(ev.key==='ArrowRight'){ev.preventDefault();el.audioPlayer.currentTime=clamp((el.audioPlayer.currentTime||0)+1,0,state.duration);updatePlayhead(true);}});
  window.addEventListener('resize',()=>{if(!state.display)return;const start=visualViewStartTime();if(visualState.autoHeight)syncAutoVisualHeight(true);syncVisualZoomUi();layoutSpectrogramStage(true);setVisualViewStartTime(start);drawAxes();drawOverlay();renderVisualSpectrogram();requestVisibleVisualTiles(true);});
}

attachEvents();
attachSidePanelResizer();
resetPanelsForInitialState();

if (location.protocol === 'file:') {
  showToast('Abre con servidor local', 'No abras el HTML con doble clic. Usa http://localhost o GitHub Pages.', 9000);
}

