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

/* ── Musique : boucles synthwave sombres arcade 16 bits ──
   Hommages originaux dans l'esprit « Night Prowler » de Carpenter Brut :
   basse galopante à l'octave, grosse caisse quatre-temps, lead carré
   chiptune en mode mineur. Une piste tirée au hasard à chaque niveau,
   jamais deux fois la même d'affilée. Désactivable dans les paramètres. */
const M_LOOKAHEAD = 0.15;            // avance de planification (s)

/* 21 pistes : bpm, fondamentales des 4 mesures, mélodie en 32 croches
   ('.' = silence). La piste 0 est l'originale, les suivantes plus rapides. */
const MUSIC_TRACKS = [
  { bpm: 126, roots: 'E2 C2 D2 B1', lead: `
    E4 .  G4 E4 B4 A4 G4  E4   C5 .  B4  G4 A4 G4  E4  .
    D5 .  A4 B4 A4 G4 F#4 .    B4 F#4 B4 D5 C5 B4  A4  G4` },
  { bpm: 144, roots: 'A1 F2 G2 E2', lead: `
    A4 .  C5 A4 E5 D5 C5  A4   F4 .   A4 C5 D5 C5  A4  .
    G4 .  B4 D5 C5 B4 G4  .    E4 G#4 B4 E5 D5 C5  B4  G#4` },
  { bpm: 138, roots: 'D2 Bb1 C2 A1', lead: `
    D4 .  F4 D4 A4 G4 F4  D4   Bb4 .  A4 F4  G4  F4  D4 .
    C5 .  G4 A4 G4 F4 E4  .    A4  E4 A4 C#5 D5  C#5 A4 E4` },
  { bpm: 146, roots: 'E2 G2 A2 B1', lead: `
    E5 D5 B4 .  E5 D5 B4  .    G4 B4  D5 .   G4 B4  D5  .
    A4 C5 E5 .  D5 C5 A4  .    B4 .   F#4 A4 B4 D#5 F#5 .` },
  { bpm: 140, roots: 'B1 D2 E2 F#2', lead: `
    B4 .  D5 B4 F#5 E5  D5  B4   D5  .   F#4 A4  B4  A4 F#4 .
    E4 .  G4 B4 C#5 B4  G4  .    F#4 A#4 C#5 F#5 E5  D5 C#5 A#4` },
  { bpm: 142, roots: 'C2 Ab2 Bb1 G2', lead: `
    C5  .  Eb5 C5 G4  .  Bb4 G4   Ab4 .  C5 Eb5 D5 C5  Ab4 .
    Bb4 .  D5  F5 Eb5 D5 Bb4 .    G4  B4 D5 G5  F5 Eb5 D5  B4` },
  { bpm: 150, roots: 'A1 G2 F2 E2', lead: `
    E5 .  C5 E5 A4 .  C5  A4   D5 .  B4  D5 G4 .   B4 G4
    C5 .  A4 C5 F4 .  A4  F4   B4 .  G#4 B4 E4 G#4 B4 D5` },
  { bpm: 136, roots: 'F#2 D2 E2 C#2', lead: `
    F#4 .  A4  F#4 C#5 B4  A4 F#4   D4  .   F#4 A4  B4  A4 F#4 .
    E4  .  G#4 B4  A4  G#4 E4 .     C#5 G#4 E4  G#4 C#5 D5 C#5 B4` },
  { bpm: 148, roots: 'G2 Eb2 F2 D2', lead: `
    G4 .   Bb4 G4 D5 C5 Bb4 G4   Eb5 .   D5 Bb4 C5 Bb4 G4 .
    F4 .   A4  C5 D5 C5 A4  .    D5  F#4 A4 D5  C5 Bb4 A4 F#4` },
  { bpm: 152, roots: 'E2 C2 G2 B1', lead: `
    B4 E4 B4 E4 C5 E4 C5 E4   G4  C5 E5  .  E5 .   D5 C5
    G4 D4 G4 B4 D5 .  B4 G4   F#4 B4 D#5 .  E5 D#5 B4 F#4` },
  { bpm: 134, roots: 'A1 C2 D2 F2', lead: `
    A4 C5 E5 .  E5 .  D5 C5   E4 G4 C5 .  C5 .  B4 G4
    D4 F4 A4 .  A4 .  G4 F4   F4 A4 C5 F5 E5 D5 C5 B4` },
  { bpm: 144, roots: 'D2 F2 G2 Bb1', lead: `
    D5 .  A4  .  D5 .   C5 A4   F4  A4 C5 .  F5 E5  C5 A4
    G4 .  Bb4 D5 C5 Bb4 G4 .    Bb4 D5 F5 .  E5 C#5 A4 C#5` },
  { bpm: 138, roots: 'B1 G2 E2 F#2', lead: `
    F#5 .  D5 F#5 B4  .  D5 B4   G4  B4 D5  G5  F#5 E5 D5 B4
    E4  G4 B4 .   C#5 B4 G4 E4   F#4 .  A#4 C#5 F#5 .  E5 C#5` },
  { bpm: 148, roots: 'E2 D2 C2 B1', lead: `
    E4 G4  B4  E5 .  D5  B4 G4   D4 F#4 A4  D5 .  C5  A4 F#4
    C4 E4  G4  C5 .  B4  G4 E4   B4 D#5 F#5 .  E5 D#5 B4 A4` },
  { bpm: 132, roots: 'C2 Eb2 F2 G2', lead: `
    C5 Eb5 G4  .  C5 Eb5 G4 .    Eb4 G4 Bb4 .  Eb5 D5  Bb4 G4
    F4 Ab4 C5  .  F5 Eb5 C5 Ab4  G4  B4 D5  F5 Eb5 D5  B4  G4` },
  { bpm: 146, roots: 'A1 E2 F2 G2', lead: `
    A4 .  A4 B4 C5 .  C5 D5   E5 .  E5 D5 C5 .  B4 A4
    F4 A4 C5 E5 F5 E5 C5 A4   G4 B4 D5 .  G5 F5 D5 B4` },
  { bpm: 142, roots: 'F#2 A2 B1 C#2', lead: `
    C#5 .  A4  C#5 F#5 .  E5  C#5   A4  .   E4 A4  C#5 .  B4  A4
    B4  .  F#4 B4  D5  .  C#5 B4    G#4 C#5 F5 G#5 F5  E5 C#5 B4` },
  { bpm: 150, roots: 'G2 Bb1 C2 D2', lead: `
    G4 Bb4 D5 G5 .  F5  D5 Bb4   Bb4 D5 F5  .  F5 .   D5  Bb4
    C5 Eb5 G5 .  F5 Eb5 C5 .     D5  .  F#4 A4 D5 C5  Bb4 F#4` },
  { bpm: 140, roots: 'E2 B1 C2 A1', lead: `
    G5 F#5 E5 .  B4 .  E5 .    F#5 E5 D#5 .  B4 .  D#5 .
    G4 A4  B4 C5 .  B4 A4 G4   A4  B4 C5  D5 E5 .  B4  A4` },
  { bpm: 152, roots: 'D2 A1 Bb1 C2', lead: `
    D5  .  D5 E5 F5 .  E5 D5    A4 .  C#5 E5 A5 G5 F5 E5
    Bb4 .  D5 F5 .  E5 D5 Bb4   C5 .  E5  G5 F5 E5 D5 C5` },
  { bpm: 136, roots: 'A1 Bb1 C2 E2', lead: `
    A4 Bb4 A4 .  E4 .  A4 .   Bb4 C5 Bb4 .   F4 .   Bb4 .
    C5 D5  C5 .  G4 .  C5 .   E5  D5 C5  Bb4 A4 G#4 A4  B4` }
];

/* 'E4', 'Bb1', 'F#5' → fréquence en Hz ; '.' → 0 (silence) */
function noteHz(n) {
  if (n === '.') return 0;
  const m = /^([A-G])([#b]?)(\d)$/.exec(n);
  const semi = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]]
    + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * Math.pow(2, ((+m[3] + 1) * 12 + semi - 69) / 12);
}

let mTrack = null;        // piste décodée en cours de lecture
let lastTrackIdx = -1;

function decodeTrack(i) {
  const t = MUSIC_TRACKS[i];
  const roots = t.roots.trim().split(/\s+/).map(noteHz);
  const lead = [];
  t.lead.trim().split(/\s+/).forEach(tok => lead.push(noteHz(tok), 0)); // croche → 2 double-croches
  const loopLen = roots.length * 16;
  while (lead.length < loopLen) lead.push(0);
  lead.length = loopLen;
  return { step: 60 / t.bpm / 4, roots, lead, loopLen };
}

/* Tire une nouvelle piste au hasard, jamais deux fois la même d'affilée */
function nextMusicTrack() {
  let i;
  do { i = Math.floor(Math.random() * MUSIC_TRACKS.length); }
  while (MUSIC_TRACKS.length > 1 && i === lastTrackIdx);
  lastTrackIdx = i;
  mTrack = decodeTrack(i);
}

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
  const p = step % mTrack.loopLen;
  const root = mTrack.roots[Math.floor(p / 16)];
  const s = p % 16;
  const st = mTrack.step;
  /* basse galopante : fondamentale, l'octave sur le 3e seizième de chaque temps */
  tone(s % 4 === 2 ? root * 2 : root, st * 0.85, 'square', 0.055, when);
  if (s % 4 === 0) kickDrum(when);
  if (s % 4 === 2) hatNoise(when);
  /* nappe : quinte tenue sur toute la mesure */
  if (s === 0) {
    tone(root * 2, st * 16, 'sawtooth', 0.025, when);
    tone(root * 3, st * 16, 'sawtooth', 0.018, when);
  }
  const lead = mTrack.lead[p];
  if (lead) tone(lead, st * 2.5, 'square', 0.045, when);
}

function startMusic() {
  stopMusic();
  if (!settings.music) return;
  const ac = ensureAudio();
  if (!ac) return;
  if (!mTrack) nextMusicTrack();
  musicStep = 0;
  let nextT = ac.currentTime + 0.05;
  musicTimer = setInterval(() => {
    if (!settings.music) { stopMusic(); return; }
    while (nextT < ac.currentTime + M_LOOKAHEAD) {
      scheduleMusicStep(musicStep, Math.max(0, nextT - ac.currentTime));
      nextT += mTrack.step;
      musicStep++;
    }
  }, 40);
}
function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}
