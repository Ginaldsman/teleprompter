/* ============================================================
   Teleprompter — lógica da aplicação
   Sem dependências. Rolagem por requestAnimationFrame
   independente da taxa de atualização da tela.
   ============================================================ */

(() => {
  'use strict';

  const STORAGE_KEY = 'teleprompter.prefs.v1';

  const DEFAULTS = Object.freeze({
    text: '',
    speed: 130,        // palavras por minuto
    fontSize: 40,      // px
    lineHeight: 1.5,
    margin: 6,         // % da largura em cada lado
    align: 'left',
    theme: 'dark',
    mirrorH: false,
    mirrorV: false,
    countdown: true,
  });

  const LIMITS = Object.freeze({
    speed: [60, 300],
    fontSize: [24, 72],
    lineHeight: [1.1, 2.2],
    margin: [0, 20],
  });

  const THEME_COLORS = Object.freeze({
    dark: '#0b0d10',
    light: '#eef1f5',
  });

  const $ = (id) => document.getElementById(id);

  const el = {
    editorView: $('editorView'),
    presentationView: $('presentationView'),
    scriptInput: $('scriptInput'),
    clearTextBtn: $('clearTextBtn'),
    wordCount: $('wordCount'),
    durationEstimate: $('durationEstimate'),
    speedRange: $('speedRange'),
    speedOutput: $('speedOutput'),
    fontRange: $('fontRange'),
    fontOutput: $('fontOutput'),
    lineRange: $('lineRange'),
    lineOutput: $('lineOutput'),
    marginRange: $('marginRange'),
    marginOutput: $('marginOutput'),
    mirrorH: $('mirrorH'),
    mirrorV: $('mirrorV'),
    countdownToggle: $('countdownToggle'),
    startBtn: $('startBtn'),
    startBar: $('startBar'),
    startHint: $('startHint'),
    themeColorMeta: $('themeColorMeta'),
    stage: $('stage'),
    stageScroll: $('stageScroll'),
    stageContent: $('stageContent'),
    stageText: $('stageText'),
    progressTrack: $('progressTrack'),
    progressFill: $('progressFill'),
    countdown: $('countdown'),
    countdownValue: $('countdownValue'),
    toast: $('toast'),
    playPauseBtn: $('playPauseBtn'),
    restartBtn: $('restartBtn'),
    exitBtn: $('exitBtn'),
    slowerBtn: $('slowerBtn'),
    fasterBtn: $('fasterBtn'),
    speedReadout: $('speedReadout'),
    fullscreenBtn: $('fullscreenBtn'),
    iconPlay: document.querySelector('#playPauseBtn .icon-play'),
    iconPause: document.querySelector('#playPauseBtn .icon-pause'),
    iconReplay: document.querySelector('#playPauseBtn .icon-replay'),
    iconExpand: document.querySelector('#fullscreenBtn .icon-expand'),
    iconCompress: document.querySelector('#fullscreenBtn .icon-compress'),
    clearDialog: $('clearDialog'),
    cancelClearBtn: $('cancelClearBtn'),
    confirmClearBtn: $('confirmClearBtn'),
  };

  const state = {
    mode: 'edit',
    playing: false,
    countdownActive: false,
    completed: false,
    offset: 0,
    maxOffset: 0,
    pxPerSec: 0,
    lastFrame: 0,
    rafId: 0,
    countdownTimer: 0,
    countdownValue: 3,
    measureRaf: 0,
    toastTimer: 0,
    lastProgress: -1,
    scrollYBefore: 0,
    fsSupported: false,
    suppressPresentationExit: false,
    wakeLock: null,
    saveTimer: 0,
  };

  let prefs = loadPrefs();

  /* ----------------------------------------------------------
     Utilidades
     ---------------------------------------------------------- */

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function snap(value, step) {
    const snapped = Math.round(value / step) * step;
    return Number(snapped.toFixed(4));
  }

  function safeNumber(value, fallback, min, max) {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return fallback;
    return clamp(parsed, min, max);
  }

  function countWords(text) {
    const trimmed = String(text).trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }

  function formatClock(totalSeconds) {
    const seconds = Math.max(0, Math.round(totalSeconds));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes}:${String(rest).padStart(2, '0')}`;
  }

  function formatSpeed(value) {
    return `${value} ppm`;
  }

  function formatFont(value) {
    return `${value} px`;
  }

  function formatLine(value) {
    return `${value.toFixed(2).replace('.', ',')}×`;
  }

  function formatMargin(value) {
    return `${value}%`;
  }

  /* ----------------------------------------------------------
     Persistência
     ---------------------------------------------------------- */

  function loadPrefs() {
    let raw = null;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      raw = null;
    }

    if (!raw) return { ...DEFAULTS };

    let saved = null;
    try {
      saved = JSON.parse(raw);
    } catch {
      return { ...DEFAULTS };
    }

    if (!saved || typeof saved !== 'object') return { ...DEFAULTS };

    return {
      text: typeof saved.text === 'string' ? saved.text : DEFAULTS.text,
      speed: clamp(snap(safeNumber(saved.speed, DEFAULTS.speed, ...LIMITS.speed), 5), ...LIMITS.speed),
      fontSize: clamp(snap(safeNumber(saved.fontSize, DEFAULTS.fontSize, ...LIMITS.fontSize), 2), ...LIMITS.fontSize),
      lineHeight: clamp(snap(safeNumber(saved.lineHeight, DEFAULTS.lineHeight, ...LIMITS.lineHeight), 0.05), ...LIMITS.lineHeight),
      margin: Math.round(safeNumber(saved.margin, DEFAULTS.margin, ...LIMITS.margin)),
      align: saved.align === 'center' ? 'center' : 'left',
      theme: saved.theme === 'light' ? 'light' : 'dark',
      mirrorH: saved.mirrorH === true,
      mirrorV: saved.mirrorV === true,
      countdown: saved.countdown !== false,
    };
  }

  function saveNow() {
    if (state.saveTimer) {
      window.clearTimeout(state.saveTimer);
      state.saveTimer = 0;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* localStorage indisponível (modo privado etc.) — segue funcionando */
    }
  }

  function scheduleSave() {
    if (state.saveTimer) window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(saveNow, 350);
  }

  /* ----------------------------------------------------------
     Interface do editor
     ---------------------------------------------------------- */

  function applyTheme() {
    document.documentElement.dataset.theme = prefs.theme;
    if (el.themeColorMeta) {
      el.themeColorMeta.setAttribute('content', THEME_COLORS[prefs.theme]);
    }
    document.querySelectorAll('input[name="theme"]').forEach((radio) => {
      radio.checked = radio.value === prefs.theme;
    });
  }

  function applyVisualPrefs() {
    const style = document.documentElement.style;
    style.setProperty('--reader-font-size', `${prefs.fontSize}px`);
    style.setProperty('--reader-line-height', String(prefs.lineHeight));
    style.setProperty('--side-pad', `${prefs.margin}%`);
    el.stageText.style.textAlign = prefs.align;
    el.stage.classList.toggle('mirror-x', prefs.mirrorH);
    el.stage.classList.toggle('mirror-y', prefs.mirrorV);
  }

  function syncControls() {
    el.scriptInput.value = prefs.text;
    el.speedRange.value = String(prefs.speed);
    el.fontRange.value = String(prefs.fontSize);
    el.lineRange.value = prefs.lineHeight.toFixed(2);
    el.marginRange.value = String(prefs.margin);
    el.speedOutput.textContent = formatSpeed(prefs.speed);
    el.fontOutput.textContent = formatFont(prefs.fontSize);
    el.lineOutput.textContent = formatLine(prefs.lineHeight);
    el.marginOutput.textContent = formatMargin(prefs.margin);
    el.speedReadout.textContent = formatSpeed(prefs.speed);
    el.mirrorH.checked = prefs.mirrorH;
    el.mirrorV.checked = prefs.mirrorV;
    el.countdownToggle.checked = prefs.countdown;
    document.querySelectorAll('input[name="align"]').forEach((radio) => {
      radio.checked = radio.value === prefs.align;
    });
  }

  function updateStats() {
    const words = countWords(prefs.text);
    const duration = words > 0 ? (words / prefs.speed) * 60 : 0;

    el.wordCount.textContent = words === 1 ? '1 palavra' : `${words} palavras`;
    el.durationEstimate.textContent = words > 0
      ? `≈ ${formatClock(duration)} de leitura`
      : 'sem texto';

    el.startBtn.disabled = words === 0;
    el.clearTextBtn.disabled = words === 0;
    el.startBar.classList.toggle('is-sticky', words > 0);

    el.startHint.textContent = words > 0
      ? 'Funciona na vertical ou na horizontal — o texto se ajusta à tela.'
      : 'Digite ou cole um roteiro para liberar o botão.';
  }

  function syncSpeedDisplay() {
    const label = formatSpeed(prefs.speed);
    el.speedRange.value = String(prefs.speed);
    el.speedOutput.textContent = label;
    el.speedReadout.textContent = label;
  }

  /* ----------------------------------------------------------
     Medidas e rolagem
     ---------------------------------------------------------- */

  function updatePxPerSec() {
    const words = countWords(prefs.text);
    if (words === 0 || state.maxOffset <= 0) {
      state.pxPerSec = 0;
      return;
    }
    const durationSeconds = (words / prefs.speed) * 60;
    state.pxPerSec = state.maxOffset / durationSeconds;
  }

  function applyOffset() {
    el.stageContent.style.transform = `translate3d(0, ${(-state.offset).toFixed(2)}px, 0)`;
  }

  function updateProgress(ratio) {
    const safe = clamp(ratio, 0, 1);
    el.progressFill.style.transform = `scaleX(${safe})`;
    const percent = Math.round(safe * 100);
    if (percent !== state.lastProgress) {
      state.lastProgress = percent;
      el.progressTrack.setAttribute('aria-valuenow', String(percent));
    }
  }

  function measure(preserveProgress) {
    if (state.mode !== 'presentation') return;

    const previousMax = state.maxOffset;
    const ratio = previousMax > 0 ? state.offset / previousMax : 0;
    const contentHeight = el.stageContent.offsetHeight;
    const viewHeight = el.stage.clientHeight;

    state.maxOffset = Math.max(0, contentHeight - viewHeight);

    if (preserveProgress && previousMax > 0 && state.maxOffset > 0) {
      state.offset = clamp(ratio * state.maxOffset, 0, state.maxOffset);
    } else {
      state.offset = clamp(state.offset, 0, state.maxOffset);
    }

    if (state.maxOffset <= 0 && state.completed) {
      state.offset = 0;
    }

    applyOffset();
    updateProgress(state.maxOffset > 0 ? state.offset / state.maxOffset : 1);
    updatePxPerSec();
  }

  function scheduleMeasure() {
    if (state.measureRaf) return;
    state.measureRaf = window.requestAnimationFrame(() => {
      state.measureRaf = 0;
      measure(true);
    });
  }

  function stopLoop() {
    if (state.rafId) {
      window.cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }
    state.lastFrame = 0;
  }

  function frame(timestamp) {
    state.rafId = 0;
    if (!state.playing) return;

    if (state.lastFrame === 0) {
      state.lastFrame = timestamp;
      state.rafId = window.requestAnimationFrame(frame);
      return;
    }

    let dt = (timestamp - state.lastFrame) / 1000;
    state.lastFrame = timestamp;

    if (dt < 0) dt = 0;
    if (dt > 0.25) dt = 0.25; // evita saltos após aba em segundo plano

    const step = state.pxPerSec * dt;

    if (step > 0) {
      state.offset += step;

      if (state.offset >= state.maxOffset) {
        state.offset = state.maxOffset;
        applyOffset();
        updateProgress(1);
        finish();
        return;
      }

      applyOffset();
      updateProgress(state.maxOffset > 0 ? state.offset / state.maxOffset : 1);
    }

    state.rafId = window.requestAnimationFrame(frame);
  }

  function play() {
    if (state.mode !== 'presentation' || state.playing) return;

    cancelCountdown();

    if (state.offset >= state.maxOffset - 0.5) {
      state.offset = 0;
      state.completed = false;
      applyOffset();
      updateProgress(0);
    }

    if (state.maxOffset <= 0) {
      measure(false);
    }

    state.playing = true;
    state.lastFrame = 0;
    hideToast();
    updatePlayUI();
    requestWakeLock();
    focusPresentation();

    if (state.maxOffset <= 0) {
      state.playing = false;
      updatePlayUI();
      showToast('Não há texto suficiente para rolar');
      return;
    }

    state.rafId = window.requestAnimationFrame(frame);
  }

  function pause() {
    if (state.countdownActive) {
      cancelCountdown();
      updatePlayUI();
      return;
    }
    if (!state.playing) return;

    state.playing = false;
    stopLoop();
    releaseWakeLock();
    updatePlayUI();
  }

  function finish() {
    state.playing = false;
    state.completed = true;
    stopLoop();
    releaseWakeLock();
    updatePlayUI();
    showToast('Fim do texto');
  }

  function restart() {
    if (state.mode !== 'presentation') return;

    cancelCountdown();
    state.playing = false;
    stopLoop();
    state.completed = false;
    state.offset = 0;
    state.lastFrame = 0;
    applyOffset();
    updateProgress(0);
    hideToast();
    updatePlayUI();

    if (prefs.countdown) {
      runCountdown(play);
    } else {
      play();
    }
  }

  function togglePlay() {
    if (state.countdownActive) {
      pause();
      return;
    }
    if (state.playing) {
      pause();
      return;
    }
    if (state.completed || state.offset >= state.maxOffset - 0.5) {
      restart();
      return;
    }
    if (prefs.countdown && state.offset <= 0.5) {
      runCountdown(play);
      return;
    }
    play();
  }

  /* ----------------------------------------------------------
     Contagem regressiva
     ---------------------------------------------------------- */

  function pulseCountdown() {
    el.countdownValue.classList.remove('pop');
    void el.countdownValue.offsetWidth;
    el.countdownValue.classList.add('pop');
  }

  function runCountdown(done) {
    cancelCountdown();

    state.countdownActive = true;
    state.countdownValue = 3;
    el.countdownValue.textContent = '3';
    el.countdown.hidden = false;
    pulseCountdown();
    updatePlayUI();
    focusPresentation();

    state.countdownTimer = window.setInterval(() => {
      state.countdownValue -= 1;

      if (state.countdownValue <= 0) {
        cancelCountdown();
        updatePlayUI();
        done();
        return;
      }

      el.countdownValue.textContent = String(state.countdownValue);
      pulseCountdown();
    }, 1000);
  }

  function cancelCountdown() {
    if (state.countdownTimer) {
      window.clearInterval(state.countdownTimer);
      state.countdownTimer = 0;
    }
    if (state.countdownActive) {
      state.countdownActive = false;
      el.countdown.hidden = true;
      el.countdownValue.classList.remove('pop');
    }
  }

  /* ----------------------------------------------------------
     Estados dos botões da apresentação
     ---------------------------------------------------------- */

  function updatePlayUI() {
    const active = state.playing || state.countdownActive;

    el.iconPlay.hidden = active || state.completed;
    el.iconPause.hidden = !active;
    el.iconReplay.hidden = !(state.completed && !active);

    let label = 'Iniciar rolagem';
    if (active) label = 'Pausar rolagem';
    else if (state.completed) label = 'Repetir do começo';

    el.playPauseBtn.setAttribute('aria-label', label);
    el.playPauseBtn.title = label;
    el.playPauseBtn.dataset.state = active ? 'playing' : state.completed ? 'done' : 'paused';
    el.presentationView.dataset.playing = String(state.playing);
  }

  function focusPresentation() {
    if (state.mode === 'presentation') {
      el.presentationView.focus({ preventScroll: true });
    }
  }

  /* ----------------------------------------------------------
     Entrar / sair da apresentação
     ---------------------------------------------------------- */

  function startPresentation() {
    if (state.mode === 'presentation') return;

    if (countWords(prefs.text) === 0) {
      el.scriptInput.focus();
      return;
    }

    saveNow();

    state.mode = 'presentation';
    state.scrollYBefore = window.scrollY || window.pageYOffset || 0;
    state.offset = 0;
    state.maxOffset = 0;
    state.pxPerSec = 0;
    state.playing = false;
    state.completed = false;
    state.countdownActive = false;
    state.lastFrame = 0;
    state.lastProgress = -1;

    el.stageText.textContent = prefs.text;
    el.editorView.hidden = true;
    el.presentationView.hidden = false;
    el.presentationView.tabIndex = -1;
    el.countdown.hidden = true;
    document.documentElement.classList.add('is-presenting');
    document.body.classList.add('is-presenting');

    applyOffset();
    updateProgress(0);
    updatePlayUI();
    focusPresentation();

    // Espera o layout do modo de apresentação antes de medir
    window.requestAnimationFrame(() => {
      if (state.mode !== 'presentation') return;
      measure(false);
      restart();
    });
  }

  function exitPresentation() {
    if (state.mode !== 'presentation') return;

    cancelCountdown();
    state.playing = false;
    stopLoop();
    releaseWakeLock();
    hideToast();

    state.mode = 'edit';

    if (getFullscreenElement()) {
      requestExitFullscreen();
    }

    el.presentationView.hidden = true;
    el.editorView.hidden = false;
    document.documentElement.classList.remove('is-presenting');
    document.body.classList.remove('is-presenting');

    state.offset = 0;
    state.maxOffset = 0;
    state.pxPerSec = 0;
    state.completed = false;
    state.countdownActive = false;
    state.lastProgress = -1;
    el.stageContent.style.transform = 'translate3d(0, 0, 0)';
    el.countdown.hidden = true;
    updateProgress(0);
    updatePlayUI();

    const restoreY = state.scrollYBefore;
    state.scrollYBefore = 0;
    window.scrollTo(0, restoreY);

    el.editorView.focus({ preventScroll: true });
  }

  /* ----------------------------------------------------------
     Tela cheia
     ---------------------------------------------------------- */

  function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function requestExitFullscreen() {
    try {
      if (document.exitFullscreen) {
        const result = document.exitFullscreen();
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    } catch {
      /* ignora */
    }
  }

  function setupFullscreen() {
    const docEl = document.documentElement;
    const supported = Boolean(
      (document.fullscreenEnabled || document.webkitFullscreenEnabled) &&
      (docEl.requestFullscreen || docEl.webkitRequestFullscreen)
    );

    state.fsSupported = supported;
    el.fullscreenBtn.hidden = !supported;

    if (!supported) return;

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  }

  function onFullscreenChange() {
    const active = Boolean(getFullscreenElement());

    el.iconExpand.hidden = active;
    el.iconCompress.hidden = !active;

    const label = active ? 'Sair da tela cheia' : 'Entrar em tela cheia';
    el.fullscreenBtn.setAttribute('aria-label', label);
    el.fullscreenBtn.title = active ? 'Sair da tela cheia' : 'Tela cheia';

    if (!active && state.mode === 'presentation') {
      if (state.suppressPresentationExit) {
        state.suppressPresentationExit = false;
      } else {
        // Esc / gesto do navegador sai da tela cheia e também da apresentação
        exitPresentation();
      }
    }
  }

  function toggleFullscreen() {
    if (!state.fsSupported) return;

    if (getFullscreenElement()) {
      state.suppressPresentationExit = true;
      window.setTimeout(() => {
        state.suppressPresentationExit = false;
      }, 1500);
      requestExitFullscreen();
      return;
    }

    const docEl = document.documentElement;
    try {
      if (docEl.requestFullscreen) {
        const result = docEl.requestFullscreen({ navigationUI: 'hide' });
        if (result && typeof result.catch === 'function') {
          result.catch(() => showToast('Tela cheia indisponível neste navegador'));
        }
      } else if (docEl.webkitRequestFullscreen) {
        docEl.webkitRequestFullscreen();
      }
    } catch {
      showToast('Tela cheia indisponível neste navegador');
    }
  }

  /* ----------------------------------------------------------
     Wake Lock
     ---------------------------------------------------------- */

  function requestWakeLock() {
    if (!('wakeLock' in navigator) || state.wakeLock) return;

    try {
      navigator.wakeLock.request('screen').then((lock) => {
        state.wakeLock = lock;
        lock.addEventListener('release', () => {
          if (state.wakeLock === lock) state.wakeLock = null;
        });
      }).catch(() => {
        state.wakeLock = null;
      });
    } catch {
      state.wakeLock = null;
    }
  }

  function releaseWakeLock() {
    const lock = state.wakeLock;
    if (!lock) return;
    state.wakeLock = null;
    try {
      const result = lock.release();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      /* ignora */
    }
  }

  /* ----------------------------------------------------------
     Aviso rápido
     ---------------------------------------------------------- */

  function showToast(message, duration = 2400) {
    if (!el.toast) return;
    if (state.toastTimer) window.clearTimeout(state.toastTimer);
    el.toast.textContent = message;
    el.toast.classList.add('visible');
    state.toastTimer = window.setTimeout(hideToast, duration);
  }

  function hideToast() {
    if (state.toastTimer) {
      window.clearTimeout(state.toastTimer);
      state.toastTimer = 0;
    }
    if (el.toast) {
      el.toast.classList.remove('visible');
      el.toast.textContent = '';
    }
  }

  /* ----------------------------------------------------------
     Limpar texto
     ---------------------------------------------------------- */

  function clearText() {
    prefs.text = '';
    el.scriptInput.value = '';
    updateStats();
    saveNow();
    el.scriptInput.focus();
  }

  function requestClear() {
    if (!prefs.text) return;

    if (typeof el.clearDialog.showModal === 'function') {
      el.clearDialog.showModal();
      return;
    }

    // Fallback para navegadores sem <dialog>
    if (window.confirm('Limpar todo o roteiro? Essa ação não pode ser desfeita.')) {
      clearText();
    }
  }

  /* ----------------------------------------------------------
     Eventos
     ---------------------------------------------------------- */

  function bindRange(input, output, key, format) {
    const handle = () => {
      const value = Number(input.value);
      if (!Number.isFinite(value)) return;
      prefs[key] = value;
      output.textContent = format(value);
      applyVisualPrefs();
      updateStats();
      updatePxPerSec();
      scheduleSave();
    };
    input.addEventListener('input', handle);
    input.addEventListener('change', saveNow);
  }

  function changeSpeed(delta) {
    const next = clamp(prefs.speed + delta, LIMITS.speed[0], LIMITS.speed[1]);
    if (next === prefs.speed) return;
    prefs.speed = next;
    syncSpeedDisplay();
    updateStats();
    updatePxPerSec();
    saveNow();
  }

  function bindEvents() {
    el.scriptInput.addEventListener('input', () => {
      prefs.text = el.scriptInput.value;
      updateStats();
      scheduleSave();
    });

    bindRange(el.speedRange, el.speedOutput, 'speed', formatSpeed);
    bindRange(el.fontRange, el.fontOutput, 'fontSize', formatFont);
    bindRange(el.lineRange, el.lineOutput, 'lineHeight', formatLine);
    bindRange(el.marginRange, el.marginOutput, 'margin', formatMargin);

    // A velocidade também atualiza o espelho exibido na apresentação
    el.speedRange.addEventListener('input', () => {
      el.speedReadout.textContent = formatSpeed(prefs.speed);
    });

    document.querySelectorAll('input[name="align"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        prefs.align = radio.value === 'center' ? 'center' : 'left';
        applyVisualPrefs();
        saveNow();
      });
    });

    document.querySelectorAll('input[name="theme"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        prefs.theme = radio.value === 'light' ? 'light' : 'dark';
        applyTheme();
        saveNow();
      });
    });

    el.mirrorH.addEventListener('change', () => {
      prefs.mirrorH = el.mirrorH.checked;
      applyVisualPrefs();
      saveNow();
    });

    el.mirrorV.addEventListener('change', () => {
      prefs.mirrorV = el.mirrorV.checked;
      applyVisualPrefs();
      saveNow();
    });

    el.countdownToggle.addEventListener('change', () => {
      prefs.countdown = el.countdownToggle.checked;
      saveNow();
    });

    el.clearTextBtn.addEventListener('click', requestClear);

    el.cancelClearBtn.addEventListener('click', () => {
      el.clearDialog.close();
    });

    el.confirmClearBtn.addEventListener('click', () => {
      el.clearDialog.close();
      clearText();
    });

    // Clique no fundo do diálogo fecha
    el.clearDialog.addEventListener('click', (event) => {
      if (event.target === el.clearDialog) el.clearDialog.close();
    });

    el.startBtn.addEventListener('click', startPresentation);

    el.playPauseBtn.addEventListener('click', togglePlay);
    el.restartBtn.addEventListener('click', restart);
    el.exitBtn.addEventListener('click', exitPresentation);
    el.slowerBtn.addEventListener('click', () => changeSpeed(-10));
    el.fasterBtn.addEventListener('click', () => changeSpeed(10));
    el.fullscreenBtn.addEventListener('click', toggleFullscreen);

    // Atalhos de teclado
    window.addEventListener('keydown', (event) => {
      if (state.mode !== 'presentation') {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          startPresentation();
        }
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault();
        if (event.repeat) return;
        togglePlay();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        exitPresentation();
      }
    });

    // Recalcula medidas ao girar / redimensionar
    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('orientationchange', () => {
      scheduleMeasure();
      window.setTimeout(scheduleMeasure, 250);
    });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scheduleMeasure);
    }

    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(() => {
        if (state.mode === 'presentation') scheduleMeasure();
      });
      observer.observe(el.stage);
      observer.observe(el.stageContent);
    }

    // Evita rolagem/bounce da página durante a apresentação
    el.stage.addEventListener('touchmove', (event) => {
      if (event.cancelable) event.preventDefault();
    }, { passive: false });

    // Salva ao sair da página
    window.addEventListener('pagehide', saveNow);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        saveNow();
      } else {
        state.lastFrame = 0;
        if (state.mode === 'presentation' && state.playing) {
          requestWakeLock();
        }
      }
    });
  }

  /* ----------------------------------------------------------
     Inicialização
     ---------------------------------------------------------- */

  function init() {
    syncControls();
    applyTheme();
    applyVisualPrefs();
    updateStats();
    setupFullscreen();
    bindEvents();
    updatePxPerSec();
    updatePlayUI();
  }

  init();
})();
