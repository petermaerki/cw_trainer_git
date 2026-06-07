/* ------------------------------------------------------------------ */
/*  Web Audio                                                          */
/* ------------------------------------------------------------------ */
let audioCtx = null;
let osc = null, gainNode = null;
let listenOsc = null;

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function startTone() {
  ensureAudio();
  osc      = audioCtx.createOscillator();
  gainNode = audioCtx.createGain();
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  osc.type = 'sine';
  osc.frequency.value = sideToneHz;
  const t = audioCtx.currentTime;
  gainNode.gain.setValueAtTime(0, t);
  gainNode.gain.linearRampToValueAtTime(0.5, t + 0.005);
  osc.start();
}

function stopTone() {
  if (!osc) return;
  const t    = audioCtx.currentTime;
  const fade = 0.018;                          // 18 ms Ausblenden
  gainNode.gain.cancelScheduledValues(t);
  gainNode.gain.setValueAtTime(gainNode.gain.value, t);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t + fade);
  const o = osc, g = gainNode;                 // Referenz halten bis Stop
  osc = null; gainNode = null;
  o.stop(t + fade + 0.002);
  o.onended = () => { try { o.disconnect(); g.disconnect(); } catch(_) {} };
}

/* ------------------------------------------------------------------ */
/*  Audio-Vorwärmung beim ersten User-Interaction                     */
/* ------------------------------------------------------------------ */
function warmAudio() {
  ensureAudio();
  // Stille Kurzpuls, um die Audio-Pipeline zu initialisieren
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g);
  g.connect(audioCtx.destination);
  g.gain.setValueAtTime(0, audioCtx.currentTime);
  o.start();
  o.stop(audioCtx.currentTime + 0.001);
}
document.addEventListener('mousedown',  warmAudio, { once: true });
document.addEventListener('keydown',    warmAudio, { once: true });
document.addEventListener('touchstart', warmAudio, { once: true });

/* ------------------------------------------------------------------ */
/*  Morse-Wiedergabe (Listen-Modus)                                    */
/* ------------------------------------------------------------------ */
function playMorseText(onDone) {
  ensureAudio();
  if (listenOsc) { try { listenOsc.stop(); } catch(_) {} listenOsc = null; }
  const osc2  = audioCtx.createOscillator();
  const gain2 = audioCtx.createGain();
  osc2.connect(gain2);
  gain2.connect(audioCtx.destination);
  osc2.frequency.value = sideToneHz;
  osc2.type = 'sine';
  const startT = audioCtx.currentTime;
  gain2.gain.setValueAtTime(0, startT);        // Gain explizit auf 0
  listenOsc = osc2;

  const dit       = ditMs()  / 1000;
  const dah       = 3 * dit;
  const intra     = dit;
  const charGapT  = 3 * fditMs() / 1000;
  const wordGapT  = 7 * fditMs() / 1000;

  let t = startT + 0.70;  // 0.7 s Pause: Audio-Init + Zeit für Maus→Tastatur-Wechsel
  let prevChar = false;

  for (let i = 0; i < targetText.length; i++) {
    const ch = targetText[i];
    if (ch === ' ') {
      if (prevChar) t += wordGapT;
      prevChar = false;
      continue;
    }
    if (prevChar) t += charGapT;
    const code = MORSE_REV[ch.toUpperCase()];
    if (!code) { prevChar = true; continue; }
    for (let j = 0; j < code.length; j++) {
      const dur = code[j] === '.' ? dit : dah;
      gain2.gain.setValueAtTime(0, t);
      gain2.gain.linearRampToValueAtTime(1, t + 0.005);
      gain2.gain.setValueAtTime(1, t + dur - 0.018);
      gain2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      t += dur;
      if (j < code.length - 1) t += intra;
    }
    prevChar = true;
  }

  const endT = t + 0.25;
  osc2.start(startT + 0.05);  // Oszillator sofort starten (Gain = 0)
  osc2.stop(endT);
  osc2.onended = () => { listenOsc = null; if (onDone) onDone(); };
}

function stopListenAudio() {
  if (listenOsc) { try { listenOsc.stop(); } catch(_) {} listenOsc = null; }
  document.getElementById('listenStopBtn').style.display = 'none';
}
