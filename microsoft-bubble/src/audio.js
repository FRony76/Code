'use strict';
/* ── audio.js ─ sons synthétiques via Web Audio API, aucun fichier audio ── */

let audioCtx = null;
let musicTimer = null;
let musicStep = 0;

function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

/* Oscillateur simple avec enveloppe exponentielle décroissante */
function tone(freq, dur, type = 'sine', vol = 0.25, when = 0) {
  if (!settings.sound) return;
  const ac = ensureAudio();
  if (!ac) return;
  const t = ac.currentTime + when;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ac.destination);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.start(t);
  osc.stop(t + dur);
}

/* Bruit blanc court (tir) */
function noiseBurst(dur = 0.05, vol = 0.12) {
  if (!settings.sound) return;
  const ac = ensureAudio();
  if (!ac) return;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const gain = ac.createGain();
  gain.gain.value = vol;
  src.connect(gain);
  gain.connect(ac.destination);
  src.start();
}

const sfx = {
  shoot() { noiseBurst(0.05, 0.12); },
  /* Hauteur du pop liée à la couleur éclatée */
  pop(colorIndex = 0) { tone(440 + Math.max(0, colorIndex) * 40, 0.18, 'sine', 0.25); },
  combo(n) {
    [523, 659, 784].slice(0, Math.min(3, n))
      .forEach((f, i) => tone(f, 0.15, 'triangle', 0.2, i * 0.06));
  },
  levelUp() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.25, i * 0.12)); },
  gameOver() { tone(220, 0.5, 'sawtooth', 0.16); tone(147, 0.7, 'sawtooth', 0.16, 0.25); },
  /* Arpège pentatonique */
  powerup() { [392, 440, 523, 587, 659].forEach((f, i) => tone(f, 0.12, 'sine', 0.2, i * 0.05)); }
};

/* ── Boucle musicale : synthwave sombre arcade 16 bits, en boucle ──
   Hommage original dans l'esprit « Night Prowler » de Carpenter Brut :
   basse galopante à l'octave, grosse caisse quatre-temps, lead carré
   chiptune en mi mineur. Désactivable dans les paramètres. */
const MUSIC_BPM = 126;
const M_STEP = 60 / MUSIC_BPM / 4;   // durée d'une double-croche (s)
const M_LOOKAHEAD = 0.15;            // avance de planification (s)

/* Progression sur 4 mesures : Em → C → D → Bm (fondamentales en Hz) */
const BASS_ROOTS = [82.41, 65.41, 73.42, 61.74]; // E2 C2 D2 B1

/* Mélodie « rôdeuse », 64 double-croches (0 = silence) */
const LEAD_SEQ = [
  329.6, 0, 0, 0, 392.0, 0, 329.6, 0, 493.9, 0, 440.0, 0, 392.0, 0, 329.6, 0,
  523.3, 0, 0, 0, 493.9, 0, 392.0, 0, 440.0, 0, 392.0, 0, 329.6, 0, 0, 0,
  587.3, 0, 0, 0, 440.0, 0, 493.9, 0, 440.0, 0, 392.0, 0, 370.0, 0, 0, 0,
  493.9, 0, 370.0, 0, 493.9, 0, 587.3, 0, 523.3, 0, 493.9, 0, 440.0, 0, 392.0, 0
];

/* Grosse caisse : sinus en chute de hauteur, planifiée à t+when */
function kickDrum(when) {
  if (!settings.sound) return;
  const ac = ensureAudio();
  if (!ac) return;
  const t = ac.currentTime + when;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
  gain.gain.setValueAtTime(0.3, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.13);
}

/* Charley : bruit blanc très court, planifié à t+when */
function hatNoise(when, dur = 0.03, vol = 0.04) {
  if (!settings.sound) return;
  const ac = ensureAudio();
  if (!ac) return;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const gain = ac.createGain();
  gain.gain.value = vol;
  src.connect(gain);
  gain.connect(ac.destination);
  src.start(ac.currentTime + when);
}

/* Planifie une double-croche de la boucle (when = délai relatif en s) */
function scheduleMusicStep(step, when) {
  const bar = Math.floor(step / 16) % 4;
  const s = step % 16;
  const root = BASS_ROOTS[bar];
  /* basse galopante : fondamentale, l'octave sur le 3e seizième de chaque temps */
  tone(s % 4 === 2 ? root * 2 : root, M_STEP * 0.85, 'square', 0.055, when);
  if (s % 4 === 0) kickDrum(when);
  if (s % 4 === 2) hatNoise(when);
  /* nappe : quinte tenue sur toute la mesure */
  if (s === 0) {
    tone(root * 2, M_STEP * 16, 'sawtooth', 0.025, when);
    tone(root * 3, M_STEP * 16, 'sawtooth', 0.018, when);
  }
  const lead = LEAD_SEQ[step % LEAD_SEQ.length];
  if (lead) tone(lead, M_STEP * 2.5, 'square', 0.045, when);
}

function startMusic() {
  stopMusic();
  if (!settings.music) return;
  const ac = ensureAudio();
  if (!ac) return;
  musicStep = 0;
  let nextT = ac.currentTime + 0.05;
  musicTimer = setInterval(() => {
    if (!settings.music) { stopMusic(); return; }
    while (nextT < ac.currentTime + M_LOOKAHEAD) {
      scheduleMusicStep(musicStep, Math.max(0, nextT - ac.currentTime));
      nextT += M_STEP;
      musicStep++;
    }
  }, 40);
}
function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}
