/* ------------------------------------------------------------------ */
/*  Einstellungen                                                      */
/* ------------------------------------------------------------------ */
let charWpm    = 12;
let farnsWpm   = 12;
let sideToneHz = 600;
let sidetone_variation_plus_minus_hz = 100;

/* ------------------------------------------------------------------ */
/*  Timing-Hilfsfunktionen                                             */
/* ------------------------------------------------------------------ */
const ditMs    = () => 1200 / charWpm;
const fditMs   = () => 1200 / farnsWpm;
const dahThr   = () => 1.5 * ditMs();    // Grenze dit/dah (Tastdauer)
const charGap  = () => 2.5 * ditMs();    // Zeichenende-Timeout
const wordGap  = () => 7.0 * fditMs();   // Wortlücken-Timeout

/* ------------------------------------------------------------------ */
/*  Zustand                                                            */
/* ------------------------------------------------------------------ */
let keyIsDown    = false;
let keyDownAt    = 0;
let lastKeyUpTime = null;
let elements     = [];          // laufende Elemente des aktuellen Zeichens
let charTimer    = null;
let wordTimer    = null;
let timingLog    = [];          // {type, actual, expected}

let targetText  = '';
let targetChars = [];         // Zielzeichen ohne Leerzeichen
let decoded     = [];         // {type:'char'|'space', ch}
let errorCount  = 0;
let startTime   = null;
let clockTimer  = null;
let isDone      = false;

let chartZoom = 1.0, chartPanX = 0;
let sentenceDeck = [];   // verbleibende Satz-Indices (gemischter Stapel)

const RAND_IDX = -1;
const CALL_IDX = -2;
let kochLevel = 40;

function randSentence() {
  const pool = KOCH_ORDER.substring(0, Math.max(2, kochLevel));
  const parts = [];
  for (let g = 0; g < 5; g++) {
    let grp = '';
    for (let c = 0; c < 5; c++)
      grp += pool[Math.floor(Math.random() * pool.length)];
    parts.push(grp);
  }
  return parts.join(' ');
}

function getActiveCats() {
  const cats = [];
  if (document.getElementById('cat-de').checked)    cats.push('de');
  if (document.getElementById('cat-en').checked)    cats.push('en');
  if (document.getElementById('cat-num').checked)   cats.push('num');
  if (document.getElementById('cat-punct').checked) cats.push('punct');
  if (document.getElementById('cat-call').checked)  cats.push('call');
  if (document.getElementById('cat-qcode').checked) cats.push('qcode');
  if (document.getElementById('cat-rand').checked)  cats.push('rand');
  return cats;
}

function getActiveProsigns() {
  const ps = [];
  if (document.getElementById('ps-ar').checked) ps.push('ar');
  if (document.getElementById('ps-bt').checked) ps.push('bt');
  if (document.getElementById('ps-kn').checked) ps.push('kn');
  if (document.getElementById('ps-as').checked) ps.push('as');
  if (document.getElementById('ps-sk').checked) ps.push('sk');
  return ps;
}

function refillDeck() {
  const cats = getActiveCats();
  const activeProsigns = getActiveProsigns();
  const regularCats = cats.filter(c => c !== 'rand' && c !== 'call');
  const pool = [];
  if (regularCats.length > 0)
    SENTENCES.forEach((s, i) => { if (regularCats.includes(s.c)) pool.push(i); });
  if (activeProsigns.length > 0)
    SENTENCES.forEach((s, i) => {
      if (s.c === 'prosign' && s.p && s.p.some(p => activeProsigns.includes(p))) pool.push(i);
    });
  if (cats.includes('call'))
    for (let i = 0; i < 30; i++) pool.push(CALL_IDX);
  if (cats.includes('rand'))
    for (let i = 0; i < 20; i++) pool.push(RAND_IDX);
  sentenceDeck = (pool.length > 0 ? pool : SENTENCES.map((_, i) => i)).slice();
  for (let i = sentenceDeck.length - 1; i > 0; i--) {
    const j = (Date.now() * 2654435761 + i * 1234567 >>> 0) % (i + 1);
    [sentenceDeck[i], sentenceDeck[j]] = [sentenceDeck[j], sentenceDeck[i]];
  }
}
let chartDrag = false, chartDragX = 0, chartDragPan = 0;
let longPressTimer = null;
let sessionChars = 0, sessionErrors = 0;
let chartFitScale = 1;
let appMode = 'key';  // 'key' | 'listen'
let listenLongPressTimer = null;

/* ------------------------------------------------------------------ */
/*  Tasten-Ereignisse                                                  */
/* ------------------------------------------------------------------ */
function onKeyDown() {
  if (appMode !== 'key') return;
  if (keyIsDown) return;
  keyIsDown = true;
  // Langer Druck (0.8 s) → neuer Satz
  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    stopTone();
    newText();
  }, 800);
  // Gap-Timing erfassen (vor dem clearTimeout!)
  if (lastKeyUpTime !== null) {
    const gap = Date.now() - lastKeyUpTime;
    const gt  = charTimer !== null ? 'intra' : wordTimer !== null ? 'inter' : 'word';
    const ge  = gt === 'intra' ? ditMs() : gt === 'inter' ? 3 * fditMs() : 7 * fditMs();
    timingLog.push({ type: gt, actual: gap, expected: ge });
    drawChart();
  }
  lastKeyUpTime = null;
  if (!startTime) {
    startTime  = Date.now();
    clockTimer = setInterval(updateClock, 100);
  }
  clearTimeout(charTimer); charTimer = null;
  clearTimeout(wordTimer);  wordTimer = null;
  keyDownAt = Date.now();
  startTone();
  document.getElementById('key-area').classList.add('pressed');
}

function onKeyUp() {
  if (!keyIsDown) return;
  clearTimeout(longPressTimer); longPressTimer = null;
  keyIsDown = false;
  const dur = Date.now() - keyDownAt;
  lastKeyUpTime = Date.now();
  stopTone();
  document.getElementById('key-area').classList.remove('pressed');
  const isDit = dur < dahThr();
  timingLog.push({ type: isDit ? 'dit' : 'dah', actual: dur, expected: isDit ? ditMs() : 3 * ditMs() });
  elements.push(isDit ? '.' : '-');
  drawChart();
  charTimer = setTimeout(finalizeChar, charGap());
  wordTimer  = setTimeout(finalizeWord,  wordGap());
}

/* ------------------------------------------------------------------ */
/*  Morse-Dekodierung                                                  */
/* ------------------------------------------------------------------ */
function finalizeChar() {
  charTimer = null;
  if (elements.length === 0) return;
  const code = elements.join('');
  elements = [];
  addChar(MORSE[code] || '#');
  drawChart();
}

function finalizeWord() {
  wordTimer = null;
  if (elements.length > 0) {
    clearTimeout(charTimer); charTimer = null;
    finalizeChar();
  }
  addSpace();
  drawChart();
}

/* computeDiff → see diff.js */

function prosignDisplay(s) {
  return s.replace(/\+/g, '<AR>').replace(/=/g, '<BT>').replace(/\(/g, '<KN>')
           .replace(/&/g, '<AS>').replace(/~/g, '<SK>');
}

function renderDiff() {
  const actualText = decoded.map(item => item.type === 'space' ? ' ' : item.ch).join('');
  const diff = computeDiff(targetText, actualText);
  errorCount = diff.error;
  const diffIstEl = document.getElementById('diff-ist');

  // Soll: Zieltext direkt (im Listen-Modus erst nach dem Check anzeigen)
  document.getElementById('diff-soll').textContent =
    (appMode === 'listen' && !isDone) ? '' : prosignDisplay(targetText);

  if (appMode === 'listen' && !isDone) {
    diffIstEl.replaceChildren();
  } else {
    renderActualFromTaggedString(diff.tagged, diffIstEl);
  }
}

/* ------------------------------------------------------------------ */
/*  Vergleich und Anzeige                                              */
/* ------------------------------------------------------------------ */
function addChar(ch) {
  if (ch === '<HH>') {
    // Korrekturprosign: trailing Spaces überspringen, dann letzten Buchstaben löschen
    while (decoded.length > 0 && decoded[decoded.length - 1].type === 'space') decoded.pop();
    if (decoded.length > 0) decoded.pop();
    renderDiff();
    updateStats();
    return;
  }
  if (isDone) {
    if (ch.toUpperCase() === 'K') { newText(); return; }
  }
  decoded.push({ type: 'char', ch });
  renderDiff();
  updateStats();
  if (!isDone) checkDone();
}

function addSpace() {
  decoded.push({ type: 'space' });
  renderDiff();
  if (!isDone) checkDone();
}

function updateClock() {}

function updateStats() {
  document.getElementById('stats').textContent = 'Errors: ' + errorCount;
}

function checkDone() {
  const sentCount = decoded.filter(x => x.type === 'char').length;
  if (sentCount < targetChars.length) return;
  isDone = true;
  clearTimeout(charTimer); charTimer = null;
  clearTimeout(wordTimer);  wordTimer = null;
  clearInterval(clockTimer); clockTimer = null;
  updateStats();
  document.getElementById('timingChart').style.cursor = 'grab';
  if (errorCount === 0) {
    document.getElementById('bravo').textContent = 'Bravo!';
  }
  // Effective WPM (PARIS method: 5 chars = 1 word)
  if (startTime) {
    const elapsedMin = (Date.now() - startTime) / 60000;
    const charsSent  = decoded.filter(x => x.type === 'char').length;
    const wpm        = Math.round(charsSent / 5 / elapsedMin * 10) / 10;
    document.getElementById('wpm-result').textContent =
      'Actual: ' + wpm.toFixed(1) + ' WPM  (' + charsSent + ' chars in ' +
      (elapsedMin * 60).toFixed(1) + ' s)';
  }
  // Session error rate
  sessionChars  += targetChars.length;
  sessionErrors += errorCount;
  const pct = sessionChars > 0 ? (sessionErrors / sessionChars * 100).toFixed(2) : '0.00';
  document.getElementById('session-stats').textContent =
    'Session: ' + sessionChars + ' chars, ' + sessionErrors +
    ' errors = ' + pct + '%';
}

/* ------------------------------------------------------------------ */
/*  Neuer Text                                                         */
/* ------------------------------------------------------------------ */
function newText() {
  clearTimeout(charTimer); charTimer = null;
  clearTimeout(wordTimer);  wordTimer = null;
  clearInterval(clockTimer); clockTimer = null;
  stopTone();
  keyIsDown  = false;
  elements   = [];
  decoded    = [];
  errorCount = 0;
  startTime  = null;
  isDone     = false;
  timingLog     = [];
  lastKeyUpTime = null;
  chartZoom = 1.0;
  chartPanX = 0;
  document.getElementById('key-area').classList.remove('pressed');
  document.getElementById('bravo').textContent = '';
  document.getElementById('wpm-result').textContent = '';
  document.getElementById('stats').textContent = 'Errors: 0';
  const cv = document.getElementById('timingChart');
  cv.width = 0;
  cv.style.cursor = 'default';

  if (sentenceDeck.length === 0) refillDeck();
  const _idx = sentenceDeck.pop();
  let s;
  if (_idx === RAND_IDX) {
    s = randSentence();
  } else if (_idx === CALL_IDX) {
    const call = generateCallsign();
    const reps = 1 + Math.floor(Math.random() * 2);
    s = Array(reps).fill(call).join(' ');
  } else {
    s = SENTENCES[_idx].s.replace(/\{CALL\}/g, generateCallsign);
  }
  targetText  = s;
  targetChars = s.replace(/\s+/g, '').split('');
  renderDiff();
  // Listen-mode reset
  if (appMode === 'listen') {
    document.getElementById('listen-input').value = '';
    document.getElementById('listen-input').readOnly = true;
    document.getElementById('listenPlayBtn').style.display = '';
    document.getElementById('listenStopBtn').style.display = 'none';
    document.getElementById('listenReplayBtn').style.display = 'none';
    document.getElementById('listenCheckBtn').style.display = 'none';
  }
}

/* ------------------------------------------------------------------ */
/*  Listen-Modus                                                       */
/* ------------------------------------------------------------------ */
function submitListen() {
  const typed = document.getElementById('listen-input').value;
  if (!typed.trim()) return;   // nichts eingegeben → kein Check
  decoded = [];
  for (let i = 0; i < typed.length; i++) {
    if (typed[i] === ' ') {
      if (decoded.length > 0 && decoded[decoded.length - 1].type !== 'space')
        decoded.push({ type: 'space' });
    } else {
      decoded.push({ type: 'char', ch: typed[i] });
    }
  }
  errorCount = 0;
  isDone = true;
  renderDiff();
  updateStats();
  if (errorCount === 0) document.getElementById('bravo').textContent = 'Bravo!';
  sessionChars  += targetChars.length;
  sessionErrors += errorCount;
  const pct = sessionChars > 0 ? (sessionErrors / sessionChars * 100).toFixed(2) : '0.00';
  document.getElementById('session-stats').textContent =
    'Session: ' + sessionChars + ' chars, ' + sessionErrors + ' errors = ' + pct + '%';
  document.getElementById('listen-input').readOnly = true;
  document.getElementById('listenCheckBtn').style.display = 'none';
  stopListenAudio();
}

function setMode(mode) {
  appMode = mode;
  document.getElementById('btn-mode-key').classList.toggle('active',    mode === 'key');
  document.getElementById('btn-mode-listen').classList.toggle('active', mode === 'listen');
  document.getElementById('key-area').style.display          = mode === 'key'    ? '' : 'none';
  document.getElementById('listen-controls').style.display   = mode === 'listen' ? '' : 'none';
  document.getElementById('chart-wrap').style.display        = mode === 'key'    ? '' : 'none';
  document.getElementById('hint-key').style.display    = mode === 'key'    ? '' : 'none';
  document.getElementById('hint-listen').style.display = mode === 'listen' ? '' : 'none';
  newText();
  if (mode === 'listen') document.getElementById('listen-input').focus();
}

function startListenPlay() {
  document.getElementById('listen-input').readOnly = false;
  playMorseText(() => {
    document.getElementById('listenStopBtn').style.display = 'none';
    document.getElementById('listen-input').focus();
  });
  document.getElementById('listenPlayBtn').style.display   = 'none';
  document.getElementById('listenStopBtn').style.display   = '';
  document.getElementById('listenReplayBtn').style.display = '';
  document.getElementById('listenCheckBtn').style.display  = '';
  document.getElementById('listen-input').focus();
}
document.getElementById('listenPlayBtn').addEventListener('click', startListenPlay);
document.getElementById('listenStopBtn').addEventListener('click', stopListenAudio);
document.getElementById('listenReplayBtn').addEventListener('click', () => {
  playMorseText(() => {
    document.getElementById('listenStopBtn').style.display = 'none';
  });
  document.getElementById('listenStopBtn').style.display = '';
  document.getElementById('listen-input').focus();
});
document.getElementById('listenCheckBtn').addEventListener('click', submitListen);
document.getElementById('listen-input').addEventListener('keydown', e => {
  if (e.key === 'Escape') { stopListenAudio(); return; }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (isDone) {
      newText();
      startListenPlay();
    } else if (document.getElementById('listenPlayBtn').style.display !== 'none') {
      startListenPlay();
    } else {
      submitListen();
    }
  }
});

/* ------------------------------------------------------------------ */
/*  Timing-Chart                                                       */
/* ------------------------------------------------------------------ */
function drawChart(zoom, panArg) {
  if (timingLog.length === 0) return;
  const canvas = document.getElementById('timingChart');
  const ctx    = canvas.getContext('2d');
  const ROW_H  = 24, GAP = 8, PAD_L = 30, PAD_T = 3;
  const W      = canvas.parentElement.offsetWidth || 640;
  canvas.width  = W;
  canvas.height = PAD_T * 2 + ROW_H * 2 + GAP;

  const totalExpected = timingLog.reduce((s, e) => s + e.expected, 0);
  chartFitScale = Math.max(0.1, (W - PAD_L - 4) / totalExpected);

  let scale, panX;
  if (zoom !== undefined) {
    scale = chartFitScale * zoom;
    const totalW = totalExpected * scale;
    panX = Math.min(0, Math.max(W - PAD_L - totalW - 8, panArg || 0));
  } else {
    scale = chartFitScale;   // 100 %
    panX  = 0;
  }

  ctx.clearRect(0, 0, W, canvas.height);
  ctx.fillStyle = '#666';
  ctx.font = '11px monospace';
  ctx.fillText('Soll', 0, PAD_T + ROW_H - 6);
  ctx.fillText('Ist',  0, PAD_T + ROW_H + GAP + ROW_H - 6);

  const C = {
    dit:   { s: '#a8c8e8', i: '#1a5fa8' },
    dah:   { s: '#a8c8e8', i: '#1a5fa8' },
    intra: { s: '#e0e0e0', i: '#c0c0c0' },
    inter: { s: '#c8c8c8', i: '#999' },
    word:  { s: '#b0b0b0', i: '#777' },
  };

  ctx.save();
  ctx.beginPath(); ctx.rect(PAD_L, 0, W - PAD_L, canvas.height); ctx.clip();

  let x = PAD_L + panX;
  for (const e of timingLog) {
    const sw = Math.max(1, e.expected * scale - 1);
    const iw = Math.max(1, e.actual   * scale - 1);
    // sw/iw now based on local scale
    if (x + sw > PAD_L && x < W) {
      ctx.fillStyle = C[e.type].s;
      ctx.fillRect(x, PAD_T, sw, ROW_H);
      ctx.fillStyle = C[e.type].i;
      ctx.fillRect(x, PAD_T + ROW_H + GAP, iw, ROW_H);
    }
    x += e.expected * scale;
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  Chart Zoom / Pan                                                   */
/* ------------------------------------------------------------------ */
const chartEl = document.getElementById('timingChart');
chartEl.style.cursor = 'default';
chartEl.addEventListener('wheel', e => {
  if (!isDone || timingLog.length === 0) return;
  e.preventDefault();
  const rect = chartEl.getBoundingClientRect();
  const mx = e.clientX - rect.left - 30;
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  const prev = chartZoom;
  chartZoom = Math.max(0.1, Math.min(30, chartZoom * factor));
  chartPanX = mx - (mx - chartPanX) * (chartZoom / prev);
  drawChart(chartZoom, chartPanX);
}, { passive: false });
chartEl.addEventListener('mousedown', e => {
  if (!isDone) return;
  chartDrag = true; chartDragX = e.clientX; chartDragPan = chartPanX;
  chartEl.style.cursor = 'grabbing';
});
document.addEventListener('mousemove', e => {
  if (!chartDrag) return;
  chartPanX = chartDragPan + (e.clientX - chartDragX);
  drawChart(chartZoom, chartPanX);
});
document.addEventListener('mouseup', () => {
  if (chartDrag) { chartDrag = false; chartEl.style.cursor = 'grab'; }
});

/* ------------------------------------------------------------------ */
/*  Einstellungen übernehmen                                           */
/* ------------------------------------------------------------------ */
document.getElementById('charWpm').addEventListener('change', e => {
  const v = parseInt(e.target.value, 10);
  if (v >= 5 && v <= 60) charWpm = v;
});
document.getElementById('farnsWpm').addEventListener('change', e => {
  const v = parseInt(e.target.value, 10);
  if (v >= 5 && v <= 60) farnsWpm = v;
});
document.getElementById('sidetoneHz').addEventListener('change', e => {
  const v = parseInt(e.target.value, 10);
  if (v >= 200 && v <= 1200) sideToneHz = v;
});
document.getElementById('sidetoneVariation').addEventListener('change', e => {
  const v = parseInt(e.target.value, 10);
  if (v >= 0 && v <= 500) sidetone_variation_plus_minus_hz = v;
});

/* ------------------------------------------------------------------ */
/*  Tastatureingabe  (L-Ctrl / R-Ctrl / Leertaste)                    */
/* ------------------------------------------------------------------ */
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'n' || e.key === 'N') {
    if (isDone) { newText(); return; }
  }
  if ((e.key === 'Control' || e.key === ' ') && !e.repeat) {
    e.preventDefault();
    onKeyDown();
  }
});
document.addEventListener('keyup', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === 'Control' || e.key === ' ') {
    e.preventDefault();
    onKeyUp();
  }
});

/* ------------------------------------------------------------------ */
/*  Maus / Touch auf der Taste-Fläche                                  */
/* ------------------------------------------------------------------ */
const ka = document.getElementById('key-area');
ka.addEventListener('mousedown',  e => { e.preventDefault(); onKeyDown(); });
document.addEventListener('mouseup', () => { if (keyIsDown) onKeyUp(); });
ka.addEventListener('touchstart', e => { e.preventDefault(); onKeyDown(); }, { passive: false });
document.addEventListener('touchend', () => { if (keyIsDown) onKeyUp(); });

/* Fokus verloren → Taste loslassen */
window.addEventListener('blur', () => { if (keyIsDown) onKeyUp(); });

/* ------------------------------------------------------------------ */
/*  Neuer-Text-Button                                                  */
/* ------------------------------------------------------------------ */
document.getElementById('newTextBtn').addEventListener('click', newText);

/* ------------------------------------------------------------------ */
/*  Category filter checkboxes                                         */
/* ------------------------------------------------------------------ */
document.getElementById('kochLevel').addEventListener('change', e => {
  const v = parseInt(e.target.value, 10);
  if (v >= 2 && v <= 48) kochLevel = v;
});

['cat-de','cat-en','cat-num','cat-punct','cat-call','cat-qcode','cat-rand',
 'ps-ar','ps-bt','ps-kn','ps-as','ps-sk'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    refillDeck();
  });
});

window.addEventListener('resize', () => {
  if (timingLog.length > 0) drawChart();
});

/* Start */
refillDeck();
newText();
