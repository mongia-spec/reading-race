// music.js — procedural Arabian/Omani music + SFX engine (Web Audio, no samples)
// «سلّة الخير: رحلة إلى بيت الجدّة»
//
// Instruments are synthesized with real-instrument techniques:
//  - oud / qanun / pizzicato / oud-bass: Karplus-Strong strings rendered once into
//    cached AudioBuffers (pluck-position comb + body resonance biquads), replayed
//    with exact playbackRate so quarter-tones (maqam) are precise.
//  - ney: band-limited periodic wave + breath noise, delayed vibrato, portamento.
//  - darbuka (doum/tek/ka), daf, riq jingles, layered hand claps, sea waves, drones.
//  - convolution reverb from a generated impulse response, compressor + limiter.
//
// export createAudio(), renderOffline(name, seconds), encodeWAV(buffer), themeNames, sfxNames

/* ------------------------------------------------------------------ utils */
const TAU = Math.PI * 2;
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// RBJ biquad applied in place to a Float32Array (used only for baked string buffers)
function biquad(data, sr, type, f, Q, dB = 0) {
  const A = Math.pow(10, dB / 40), w = TAU * f / sr, cs = Math.cos(w), sn = Math.sin(w);
  const al = sn / (2 * Q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
  else if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else { // high shelf
    const s = 2 * Math.sqrt(A) * al;
    b0 = A * ((A + 1) + (A - 1) * cs + s); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - s);
    a0 = (A + 1) - (A - 1) * cs + s; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - s;
  }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y; data[i] = y;
  }
}

/* ------------------------------------------------------------------ maqamat (cents) */
const MAQAM = {
  bayati:   [0, 150, 300, 500, 700, 800, 1000],
  hijaz:    [0, 100, 400, 500, 700, 800, 1000],
  rast:     [0, 200, 350, 500, 700, 900, 1050],
  kurd:     [0, 100, 300, 500, 700, 800, 1000],
  ajam:     [0, 200, 400, 500, 700, 900, 1100],
  nahawand: [0, 200, 300, 500, 700, 800, 1100],
};
function degCents(scale, deg) {
  const o = Math.floor(deg / 7), i = ((deg % 7) + 7) % 7;
  return o * 1200 + scale[i];
}
function degHz(scale, tonic, oct, deg) {
  return midiHz(tonic + 12 * oct) * Math.pow(2, degCents(scale, deg) / 1200);
}

/* ------------------------------------------------------------------ string models */
const STRING = {
  //        T60  excitation-LP  pluck pos  length  body EQ
  oud:   { t60: 1.5, bright: 0.33, pos: 0.18, len: 1.7, pick: 0.22,
           eq: [['hp', 70, 0.7], ['peak', 115, 1.3, 5], ['peak', 240, 1.6, 4], ['peak', 520, 2, 2], ['shelf', 2600, 0.7, -7]] },
  qanun: { t60: 2.4, bright: 0.62, pos: 0.12, len: 2.3, pick: 0.3,
           eq: [['hp', 120, 0.7], ['peak', 320, 1.4, 3], ['peak', 1500, 1.2, 2], ['shelf', 5000, 0.7, -3]] },
  pizz:  { t60: 0.32, bright: 0.42, pos: 0.15, len: 0.65, pick: 0.12,
           eq: [['hp', 90, 0.7], ['peak', 280, 2, 6], ['peak', 1000, 1.5, 3], ['shelf', 3500, 0.7, -8]] },
  bass:  { t60: 2.0, bright: 0.22, pos: 0.22, len: 1.9, pick: 0.1,
           eq: [['hp', 38, 0.7], ['peak', 95, 1.2, 6], ['peak', 200, 1.4, 2], ['shelf', 1400, 0.7, -10]] },
};

/* ------------------------------------------------------------------ themes */
// Phrase tokens: [~]deg|r [_dur] [*]   deg = scale degree (0 = tonic, negative = below)
//   ~ trill (ney), * oud/qanun tremolo (risha), dur in sequencer steps (default 2)
// Bar lead codes: N ney, O oud, Q qanun, P pizzicato; combos e.g. 'NO'
// Drum lanes per bar: darb (D d doum, T t tek, k ka), clap (C c), riq (J j), daf (F f)
const THEMES = {
  title: {
    maqam: 'rast', tonic: 55, bpm: 96, steps: 16, beat: 4, level: 0.85,
    oct: { N: 1, O: 0, Q: 1, P: 0, bass: -1 },
    phrases: [
      ['Q', '0 2 4 7 4 2 4_4'], ['Q', '3 5 4 2 1_4 r_4'],
      ['N', '4_4 5 4 3 2 3_4'], ['N', '4_8 r_8'],
      ['N', '5 6 7_4 6 5 4_4'], ['N', '3 4 3 2 1_8'],
      ['O', '2 3 4 3 2 1 2 1'], ['O', '0_8* r_8'],
      ['N', '7_4 6 5 6_4 5 4'], ['N', '5_4 4 3 4_8'],
      ['O', '4 5 4 3 2 3 4_4'], ['O', '3 2 1 2 0_8*'],
      ['NO', '0 1 2 3 4_4 5_4'], ['NO', '6 5 4 3 4_8'],
      ['NO', '2 3 4 3 2 1 2_4'], ['NO', '0_12 r_4'],
    ],
    bass: [0, 0, 0, 0, 0, 3, 0, 0, 4, 4, 0, 0, 0, 3, 4, 0],
    bassPat: [[0, 0, 5, 1], [6, 0, 2, 0.5], [8, 4, 4, 0.75], [12, 0, 4, 0.55]],
    drums: {
      darb: { main: 'd.t...t.d...t...', alt: 'd.tk.kt.d.k.t.k.', fill: 'D.TkTkTkD.TkTkTT' },
      riq: { main: '....j.......j...' },
      daf: { main: 'f.......f.......' },
    },
  },
  g1: { // interior villages — Bayati, maqsum
    maqam: 'bayati', tonic: 62, bpm: 104, steps: 16, beat: 4, level: 0.85,
    oct: { N: 0, O: -1, Q: 0, P: 0, bass: -2 },
    phrases: [
      ['N', '0 1 2_4 3 2 1 2'], ['N', '3_4 4_6 r_6'],
      ['O', '4 3 2 3 2 1 0_4'], ['O', '2 1_1 2_1 1 0 0_8*'],
      ['N', '0 1 2 3 4_4 5 4'], ['N', '3 4_1 3_1 2_4 r_8'],
      ['O', '4 5 4 3 2_4 3 2'], ['O', '1 2 1 0 0_8*'],
      ['N', '4_4 4 5 6_4 5 4'], ['N', '5 6 7_8 r_4'],
      ['Q', '7 6 5 4 5 4 3 2'], ['Q', '3 4 3 2 1_4 r_4'],
      ['NO', '2 3 4 3 2 1 2 3'], ['NO', '4_6 3 2_4 1_4'],
      ['NO', '0 1 2 1 0 -1 0_4'], ['NO', '0_12 r_4'],
    ],
    bass: [0, 0, 0, 0, 0, 0, 3, 0, 3, 3, 4, 0, 0, 4, 0, 0],
    bassPat: [[0, 0, 5, 1], [6, 0, 2, 0.5], [8, 4, 4, 0.75], [12, 0, 4, 0.55]],
    drums: {
      darb: { main: 'D.T...T.D...T...', alt: 'D.Tk.kT.D.k.T.k.', fill: 'D.TkTkTkD.TkTkTT' },
      riq: { main: '..j...j...j...j.' },
      daf: { main: 'F.......f.......' },
    },
  },
  g2: { // coast — Kurd, khaleeji 12/8 with waves
    maqam: 'kurd', tonic: 64, bpm: 106, steps: 12, beat: 3, level: 0.85, waves: true,
    oct: { N: 0, O: -1, Q: 0, P: 0, bass: -2 },
    phrases: [
      ['N', '0_3 2 3_1 4_3 3_3'], ['N', '2 1_1 2_3 0_6'],
      ['O', '4_3 3 2_1 3_3 4_3'], ['O', '3 2_1 1_3 0_6*'],
      ['N', '0_3 2 3_1 4_3 5_3'], ['N', '6 5_1 4_3 3_6'],
      ['O', '5 4_1 3 2_1 3_3 2_3'], ['O', '1 2_1 1 -1_1 0_6*'],
      ['NO', '4_3 4 5_1 6_3 5_3'], ['NO', '4 3_1 4_3 2_6'],
      ['NO', '3_3 3 4_1 5_3 4_3'], ['NO', '3 2_1 3_3 1_6'],
      ['Q', '0_3 2 3_1 4_3 3 2_1'], ['Q', '3_3 4 3_1 2_6*'],
      ['NO', '1 2_1 1 0_1 1_3 -1_3'], ['NO', '0_9 r_3'],
    ],
    bass: [0, 0, 3, 0, 0, 3, 4, 0, 3, 3, 4, 4, 0, 3, 4, 0],
    bassPat: [[0, 0, 5, 1], [6, 4, 3, 0.75], [9, 0, 3, 0.5]],
    drums: {
      darb: { main: 'D..T.TD..T.k', alt: 'D..T.TD.kT.T', fill: 'D.kTkTD.kTTT' },
      clap: { main: '...C.C...C.C' },
      riq: { main: '.j..j..j..j.' },
      daf: { main: 'F.....f.....' },
    },
  },
  g3: { // mountains — Hijaz, saidi, echoing ney
    maqam: 'hijaz', tonic: 62, bpm: 100, steps: 16, beat: 4, level: 0.85, echo: 0.45,
    oct: { N: 0, O: -1, Q: 0, P: 0, bass: -2 },
    phrases: [
      ['N', '4_6 3 2_4 1_4'], ['N', '2_4 0_8 r_4'],
      ['O', '0 1 2 3 4_4 3 2'], ['O', '1 2 1 0 0_8*'],
      ['N', '4_4 5 4 3_4 4_4'], ['N', '5 6 7_8 r_4'],
      ['O', '7 6 5 4 5 4 3 2'], ['O', '3 2 1 2 0_8*'],
      ['N', '7_6 6 5_4 4_4'], ['N', '5 4 3_4 4_8'],
      ['Q', '4_1 5_1 4_1 3_1 2 3 4_1 5_1 4_1 3_1 2_4'], ['Q', '1 2 3 2 1_4 0_4'],
      ['NO', '0 2 3 4 5_4 4_4'], ['NO', '3 4 3 2 1_4 2_4'],
      ['NO', '4_4 3 2 1 2 1 0'], ['NO', '0_12 r_4'],
    ],
    bass: [4, 0, 0, 0, 4, 3, 3, 0, 3, 4, 4, 0, 0, 3, 4, 0],
    bassPat: [[0, 0, 4, 1], [6, 0, 2, 0.6], [8, 0, 4, 0.8], [12, 4, 4, 0.55]],
    drums: {
      darb: { main: 'D.T...D.D...T...', alt: 'D.T.k.D.D.k.T.k.', fill: 'D.TkTkD.DkTkTTTT' },
      daf: { main: 'F.......f.......' },
      riq: { main: '....j.......j...', oddOnly: true },
    },
  },
  g4: { // khareef / desert — Rast, baladi with daf + claps
    maqam: 'rast', tonic: 60, bpm: 110, steps: 16, beat: 4, level: 0.85,
    oct: { N: 0, O: -1, Q: 1, P: 0, bass: -2 },
    phrases: [
      ['N', '0 1 2 3 4_6 r_2'], ['N', '5 4 3 4 2_4 r_4'],
      ['O', '4 3 2 1 2 3 2 1'], ['O', '0 1 2 1 0_8*'],
      ['N', '4 5 6 7 6_4 5_4'], ['N', '4 5 4 3 2_8'],
      ['O', '3 4 3 2 1_4 2_4'], ['O', '3 2 1 -1 0_8*'],
      ['Q', '7 7 6 5 6 6 5 4'], ['Q', '5 5 4 3 4_8*'],
      ['N', '4_4 5 6 7_4 6 5'], ['N', '4 3 2 1 2_8'],
      ['NO', '0 2 4 2 3 5 4_4'], ['NO', '3 2 1 2 3_4 2_4'],
      ['NO', '1 2 3 2 1 0 1_4'], ['NO', '0_12 r_4'],
    ],
    bass: [0, 4, 0, 0, 4, 0, 3, 0, 4, 3, 4, 0, 0, 3, 4, 0],
    bassPat: [[0, 0, 3, 1], [2, 0, 3, 0.7], [8, 4, 4, 0.8], [12, 0, 4, 0.55]],
    drums: {
      darb: { main: 'D.D...T.D...T...', alt: 'D.D.k.T.D.k.T.kk', fill: 'D.DkTkTkD.TkTTDD' },
      riq: { main: '..J...J...J...J.' },
      daf: { main: 'F.......F.......' },
      clap: { main: '....c.......c...', oddOnly: true },
    },
  },
  tension: { // animal encounter — Nahawand pizzicato, playful-suspicious
    maqam: 'nahawand', tonic: 57, bpm: 96, steps: 16, beat: 4, level: 1.5, swapOdd: { P: 'Q' },
    oct: { N: 1, O: 0, Q: 1, P: 0, bass: -1 },
    phrases: [
      ['P', '0_1 r_1 0_1 r_1 2_1 r_1 r_2 1_1 r_1 1_1 r_1 3_1 r_3'],
      ['P', '2_1 r_1 1_1 r_1 0_1 r_1 -1_1 r_1 0_2 r_6'],
      ['P', '4_1 r_1 4_1 r_1 5_1 r_1 r_2 4_1 r_1 3_1 r_1 2_1 r_3'],
      ['P', '3_1 r_1 2_1 r_1 1_1 r_1 0_1 r_1 -3_2 r_6'],
      ['P', '0_1 r_1 0_1 r_1 2_1 r_1 3_1 r_1 4_1 r_1 5_1 r_1 6_1 r_1 7_2'],
      ['N', 'r_4 7_1 r_1 6_1 r_1 4_4 r_4'],
      ['P', '5_1 r_1 4_1 r_1 3_1 r_1 2_1 r_1 3_1 r_1 2_1 r_1 1_1 r_1 -1_2'],
      ['P', '0_1 r_3 -3_1 r_3 0_1 r_7'],
    ],
    bass: [0, 0, 3, 4, 0, 3, 4, 0],
    bassInst: 'pizz',
    bassPat: [[0, 0, 1, 1], [4, 0, 1, 0.45], [8, 4, 1, 0.8], [12, 0, 1, 0.45]],
    drums: {
      darb: { main: '....t.......t...', alt: '..k.t.....k.t...', fill: '....t...t.t.tkTk' },
    },
  },
  question: { // soft thinking bed
    maqam: 'bayati', tonic: 62, bpm: 72, steps: 16, beat: 4, level: 1.4, drone: true,
    oct: { N: 0, O: -1, Q: 0, P: 0, bass: -2 },
    phrases: [
      ['Q', '0_4 4_4 2_4 4_4'], ['Q', '1_4 4_4 3_4 4_4'],
      ['Q', '0_4 4_4 2_4 4_4'], ['Q', '-1_4 3_4 1_4 3_4'],
      ['Q', '0_4 4_4 2_4 5_4'], ['Q', '1_4 5_4 3_4 4_4'],
      ['Q', '2_4 4_4 3_4 1_4'], ['Q', '0_8 r_8'],
    ],
    bass: [0, 0, 0, -1, 0, 0, 0, 0],
    bassPat: [],
    drums: {},
  },
  // ── مرشّحات موسيقى الأطفال العُمانية ──
  kidA: { // «فرحة العيد» — عجم، إيقاع ٦/٨ خليجي/عُماني مرح، تصفيق وطبل
    maqam: 'ajam', tonic: 67, bpm: 118, steps: 12, beat: 3, level: 0.9,
    oct: { N: 0, O: -1, Q: 0, P: 0, bass: -2 },
    phrases: [
      ['Q', '0_3 2_3 4_3 4_3'], ['Q', '5 4_1 3_3 2_6'],
      ['Q', '1_3 3_3 5_3 5_3'], ['Q', '4 3_1 2_3 0_6'],
      ['NO', '4_3 4_3 5 6_1 7_3'], ['NO', '6 5_1 4_3 5_6'],
      ['NO', '4_3 3_3 2 1_1 2_3'], ['NO', '0_9 r_3'],
      ['QP', '7_3 7_3 6 5_1 4_3'], ['QP', '5 6_1 7_3 4_6'],
      ['QP', '4_3 5 4_1 3_3 2_3'], ['QP', '1 2_1 0_9'],
    ],
    bass: [0, 4, 3, 0, 0, 4, 3, 0, 3, 4, 3, 0],
    bassPat: [[0, 0, 3, 1], [6, 4, 3, 0.7]],
    drums: {
      darb: { main: 'D..T..D.TT..', alt: 'D..T.kD.TTk.', fill: 'D.TD.TD.TTTT' },
      clap: { main: '...C.....C..', alt: '...C..C..C..', fill: 'C.CC.CC.CCCC' },
      riq: { main: 'j.j.j.j.j.j.' },
    },
  },
  kidB: { // «رزحة الصغار» — راست، طبل ثقيل منتظم وتصفيق جماعي، نداء وجواب
    maqam: 'rast', tonic: 62, bpm: 108, steps: 16, beat: 4, level: 0.9,
    oct: { N: 0, O: -1, Q: 0, P: 0, bass: -2 },
    phrases: [
      ['O', '0_4 2_4 4_4 2_4'], ['NO', '0_4 2_4 4_8'],
      ['O', '4_4 5_4 4 3 2_4'], ['NO', '4 5 4 3 2_8'],
      ['O', '2_4 3_4 4 3 2_4'], ['NO', '1 2 1 0 -1_4 0_4'],
      ['O', '0_4 2_4 4_4 2_4'], ['NO', '1_4 2 1 0_8'],
      ['Q', '7_4 6 5 4_4 5_4'], ['NQ', '7_4 6 5 4_8'],
      ['Q', '4_4 5 4 3_4 2_4'], ['NQ', '1 2 3 2 0_8'],
    ],
    bass: [0, 0, 4, 4, 3, 3, 0, 0, 4, 4, 3, 0],
    bassPat: [[0, 0, 4, 1], [8, 0, 4, 0.8]],
    drums: {
      darb: { main: 'D...T...D...T...', alt: 'D...T...D.d.T...', fill: 'D.D.T.T.D.D.TTTT' },
      clap: { main: '....C.......C...', alt: '....C...c...C...', fill: 'C...C...C.C.CCCC' },
      daf: { main: 'F.......F.......' },
    },
  },
  kidC: { // «أنشودة الطريق» — عجم، قانون وبيتزيكاتو قفّاز، رق خفيف، مرح ونطّاط
    maqam: 'ajam', tonic: 65, bpm: 126, steps: 16, beat: 4, level: 0.88,
    oct: { N: 1, O: 0, Q: 1, P: 0, bass: -2 },
    phrases: [
      ['QP', '0 2 4 2 4_4 r_4'], ['QP', '5 4 3 2 1_4 r_4'],
      ['QP', '1 3 5 3 5_4 r_4'], ['QP', '4 3 2 1 0_4 r_4'],
      ['NQ', '4_2 4 5 6_4 5_6'], ['NQ', '4_2 3 2 3_10'],
      ['NQ', '4_2 4 5 6_4 7_6'], ['NQ', '6 5 4 2 4_8'],
      ['QP', '7 7 6 6 5 5 4_4'], ['QP', '3 3 2 2 1_4 r_4'],
      ['QP', '0 2 4 7 4 2 1_4'], ['QP', '0_12 r_4'],
    ],
    bass: [0, 4, 0, 4, 3, 4, 0, 4, 3, 0, 4, 0],
    bassPat: [[0, 0, 2, 1], [4, 4, 2, 0.6], [8, 0, 2, 0.8], [12, 4, 2, 0.6]],
    drums: {
      darb: { main: 'D.t.T.t.D.d.T.t.', fill: 'D.TkTkTkD.TkTkTT' },
      riq: { main: 'J.j.J.j.J.j.J.j.' },
      clap: { main: '....c.......c...', oddOnly: true },
    },
  },
  // ── نماذج خليجية/عُمانية: عود وتصفيق وطبول، بلا ناي ولا قانون ──
  khA: { tabl: true, // «إيقاع خليجي» — بياتي، ٦/٨ خليجي بالتصفيق، عود يغنّي اللحن
    mix: { clap: [2.4, 0.15], darb: [2.0, 0.06], daf: [1.6, 0.08], riq: [1.0, 0.1], O: [0.32, 0.2], P: [0.32, 0.15], bass: [0.45, 0.05] },
    maqam: 'bayati', tonic: 62, bpm: 98, steps: 12, beat: 3, level: 0.9,
    oct: { N: 0, O: 0, Q: 0, P: 0, bass: -2 }, swapOdd: { O: 'OP' },
    phrases: [
      ['O', '0_3 1 2_1 3_3 2_3'], ['O', '1 2_1 1_3 0_6*'],
      ['O', '2_3 3 4_1 5_3 4_3'], ['O', '3 4_1 3_3 2_6*'],
      ['O', '4_3 4 5_1 4_3 3_3'], ['O', '2 3_1 2_3 1_6'],
      ['O', '0_3 1 2_1 3 2_1 1_3'], ['O', '0_9* r_3'],
    ],
    bass: [0, 0, 3, 3, 4, 3, 0, 0],
    bassPat: [[0, 0, 3, 1], [6, 0, 3, 0.7]],
    drums: {
      darb: { main: 'D..t.tD..t..', alt: 'D..t.tD.tt..', fill: 'D.tD.tD.tttt' },
      clap: { main: '..C.C...C.C.', alt: '..C.C..cC.C.', fill: 'C.C.C.C.CCCC' },
      daf: { main: 'F.....f.....' },
    },
  },
  khB: { tabl: true, // «رزحة» — راست، طبل كاسر ورحماني متناوب، تصفيق جماعي قوي، عود نداء وجواب
    mix: { clap: [2.4, 0.15], darb: [2.0, 0.06], daf: [1.6, 0.08], riq: [1.0, 0.1], O: [0.32, 0.2], P: [0.32, 0.15], bass: [0.45, 0.05] },
    maqam: 'rast', tonic: 60, bpm: 92, steps: 16, beat: 4, level: 0.95, swapOdd: { O: 'O' },
    oct: { N: 0, O: 0, Q: 0, P: 0, bass: -2 },
    phrases: [
      ['O', '0_4 2_2 2_2 4_4 2_4'], ['O', '3_2 2_2 1_4 0_8*'],
      ['O', '4_4 4_2 5_2 4_4 3_4'], ['O', '2_2 3_2 2_4 1_8*'],
      ['O', '0_4 2_2 2_2 4_4 5_4'], ['O', '4_2 3_2 2_4 0_8*'],
    ],
    bass: [0, 4, 0, 3, 0, 0],
    bassPat: [[0, 0, 4, 1], [8, 0, 4, 0.85]],
    drums: {
      darb: { main: 'D...D...D...D...', alt: 'D...D.d.D...D.d.', fill: 'D.D.D.D.DDDDDDDD' },
      daf: { main: '..f...f...f...f.' },
      clap: { main: '....C...C...C...', alt: '..C.C...C.C.C...', fill: 'C.C.C.C.C.C.CCCC' },
    },
  },
  khC: { tabl: true, // «فرحة خليجية» — راست، عود ووتريات خفيفة، إيقاع سريع مرح للأطفال
    mix: { clap: [2.4, 0.15], darb: [2.0, 0.06], daf: [1.6, 0.08], riq: [1.0, 0.1], O: [0.32, 0.2], P: [0.32, 0.15], bass: [0.45, 0.05] },
    maqam: 'rast', tonic: 65, bpm: 116, steps: 12, beat: 3, level: 0.9,
    oct: { N: 0, O: 0, Q: 0, P: 1, bass: -2 },
    phrases: [
      ['OP', '0_3 2_3 4_3 4_3'], ['OP', '5 4_1 3_3 2_6'],
      ['OP', '2_3 3_3 4 3_1 2_3'], ['OP', '1 2_1 0_9*'],
      ['OP', '4_3 4_3 5 6_1 7_3'], ['OP', '6 5_1 4_3 5_6'],
      ['OP', '4_3 3_3 2 1_1 2_3'], ['OP', '0_9* r_3'],
    ],
    bass: [0, 4, 3, 0, 0, 4, 3, 0],
    bassPat: [[0, 0, 3, 1], [6, 4, 3, 0.7]],
    drums: {
      darb: { main: 'D..t.tD.tt..', fill: 'D.tD.tD.tttt' },
      clap: { main: '..C.C...C.C.', fill: 'C.C.C.C.CCCC' },
      riq: { main: 'j..j..j..j..' },
    },
  },
  victory: { // National Day celebration — Ajam, full maqsum, claps, zaghrouta trills
    maqam: 'ajam', tonic: 65, bpm: 120, steps: 16, beat: 4, level: 0.85, qDouble: [8, 16],
    oct: { N: 0, O: -1, Q: 1, P: 0, bass: -2 },
    phrases: [
      ['NO', '0 2 4 4 4_4 5 4'], ['NO', '3 3 3 2 4_8*'],
      ['NO', '1 1 1 2 3_4 2 1'], ['NO', '2 1 0_4 r_8'],
      ['NO', '0 2 4 4 4_4 5 6'], ['NO', '7_4 6 5 4_8*'],
      ['NO', '5 4 3 2 1 2 3 1'], ['NO', '0_8 ~7_8'],
      ['NO', '7 7 7 6 5_4 6_4'], ['NO', '7 6 5 4 5_8*'],
      ['NO', '4 4 4 3 2_4 3_4'], ['NO', '4 3 2 1 2_8*'],
      ['NO', '7 7 7 6 5_4 6_4'], ['NO', '7 8 9 8 7_8*'],
      ['NO', '5 6 7 4 5 3 2 1'], ['NO', '0_8 ~7_8'],
    ],
    bass: [0, 4, 3, 0, 0, 4, 3, 0, 4, 4, 3, 0, 4, 4, 3, 0],
    bassPat: [[0, 0, 3, 1], [3, 0, 1, 0.5], [6, 4, 2, 0.7], [8, 0, 3, 0.9], [12, 4, 4, 0.6]],
    drums: {
      darb: { main: 'D.T.kkT.D.kkT.k.', alt: 'D.TkkkT.D.TkT.Tk', fill: 'D.TkTkTkTkTkTTTT' },
      clap: { main: '....C.......C...', alt: '....C.....c.C...', fill: 'C.C.C.C.C.C.CCCC' },
      riq: { main: 'J.j.J.j.J.j.J.j.' },
      daf: { main: 'F.......F.......' },
    },
  },
  night: { // calm ending — Bayati on G, slow ney + oud arpeggios + drone
    maqam: 'bayati', tonic: 55, bpm: 66, steps: 16, beat: 4, level: 0.7, drone: true,
    oct: { N: 1, O: 0, Q: 1, P: 0, bass: -1 },
    arp: { inst: 'O', pat: [[0, 0, 4, 0.7], [4, 4, 4, 0.5], [8, 7, 4, 0.55], [12, 4, 4, 0.45]] },
    phrases: [
      ['N', '4_8 3_4 2_4'], ['N', '3_4 2 1 2_8'],
      ['N', '1_4 2_4 3_4 4_4'], ['N', '3_4 2_4 1_8'],
      ['N', '4_6 5 4_4 3_4'], ['N', '2_4 3 2 1_8'],
      ['N', '2_4 1_4 0_4 1_4'], ['N', '0_12 r_4'],
    ],
    bass: [0, 0, 3, 0, 0, 3, 0, 0],
    bassPat: [],
    drums: { daf: { main: 'f...............' } },
  },
};
export const themeNames = Object.keys(THEMES);

function parseBar(str, steps, where) {
  const out = []; let pos = 0;
  for (const tok of str.trim().split(/\s+/)) {
    const m = tok.match(/^(~?)(r|-?\d+)(?:_(\d+))?(\*?)$/);
    if (!m) throw new Error('bad token ' + tok + ' in ' + where);
    const dur = m[3] ? +m[3] : 2;
    if (m[2] !== 'r') out.push({ step: pos, dur, deg: +m[2], trill: !!m[1], trem: !!m[4] });
    pos += dur;
  }
  if (pos !== steps) throw new Error(`${where}: ${pos} steps (expected ${steps})`);
  return out;
}
function compileTheme(name) {
  const d = THEMES[name];
  if (d._c) return d._c;
  const bars = d.phrases.map(([who, s], i) => ({ who, notes: parseBar(s, d.steps, `${name} bar ${i + 1}`) }));
  for (const [ln, lane] of Object.entries(d.drums || {}))
    for (const [k, p] of Object.entries(lane))
      if (typeof p === 'string' && p.length !== d.steps) throw new Error(`${name} drum ${ln}.${k} len ${p.length}`);
  if (d.bass.length !== bars.length) throw new Error(`${name} bass roots length`);
  const stepDur = 60 / d.bpm / d.beat;
  d._c = { bars, stepDur, barDur: stepDur * d.steps, scale: MAQAM[d.maqam] };
  return d._c;
}
export function themeInfo() {
  const o = {};
  for (const n of themeNames) { const c = compileTheme(n); o[n] = { bars: c.bars.length, barDur: +c.barDur.toFixed(3), loopSec: +(c.barDur * c.bars.length).toFixed(2) }; }
  return o;
}

/* ------------------------------------------------------------------ engine */
class Engine {
  constructor(ctx, offline = false) {
    this.ctx = ctx; this.offline = offline;
    this.rand = mulberry32(20261118);
    this.ksCache = new Map();
    const sr = ctx.sampleRate;
    // shared noise (2 s) and crackle buffers
    this.noise = ctx.createBuffer(1, sr * 2, sr);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = this.rand() * 2 - 1;
    this.neyWave = ctx.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0, 0]), new Float32Array([0, 1, 0.32, 0.12, 0.06, 0.025]));

    // ---- master chain
    const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    this.g = g;
    this.masterIn = g(0.5);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 8; comp.ratio.value = 3; comp.attack.value = 0.012; comp.release.value = 0.25;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
    this.makeup = g(0.82);
    this.vol = g(0.8); this.muteG = g(1);
    this.masterIn.connect(comp); comp.connect(this.makeup); this.makeup.connect(lim); lim.connect(this.vol);
    this.vol.connect(this.muteG); this.muteG.connect(ctx.destination);

    // reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeIR(2.3);
    this.revOut = g(0.9);
    this.reverb.connect(this.revOut); this.revOut.connect(this.masterIn);

    // music buses (ducked)
    this.musicDry = g(1); this.musicWet = g(1);
    this.duckDry = g(1); this.duckWet = g(1);
    this.musicDry.connect(this.duckDry); this.duckDry.connect(this.masterIn);
    this.musicWet.connect(this.duckWet); this.duckWet.connect(this.reverb);

    // sfx buses
    this.sfxIn = g(1.45); this.sfxIn.connect(this.masterIn);
    this.sfxWet = g(1.45); this.sfxWet.connect(this.reverb);
    this.sfxBus = (lvl, send) => this.bus(lvl, send, this.sfxIn, this.sfxWet);
    this.sfxB = { dry: this.sfxBus(1, 0.08), mid: this.sfxBus(1, 0.22), wet: this.sfxBus(1, 0.45) };

    this.themes = []; this.current = null; this.timer = null;
    this.voices = []; this.lastStep = 0;
  }
  bus(level, send, dry, wet) {
    const b = this.g(level); b.connect(dry);
    if (send > 0 && wet) { const s = this.g(send); b.connect(s); s.connect(wet); }
    return b;
  }
  makeIR(sec) {
    const ctx = this.ctx, sr = ctx.sampleRate, len = Math.floor(sec * sr);
    const ir = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c); let lp = 0;
      const pre = Math.floor(0.012 * sr);
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / sr;
        const k = 0.55 - 0.45 * Math.min(1, t / sec); // darker tail
        lp += k * ((this.rand() * 2 - 1) - lp);
        d[i] = lp * Math.pow(1 - t / sec, 2) * Math.exp(-t * 2.2);
      }
      // a few early reflections
      for (const [ms, a] of [[17, 0.5], [29, 0.35], [41, 0.3], [57, 0.22]]) d[Math.floor((ms + c * 3) * sr / 1000)] += a * (c ? -1 : 1);
    }
    return ir;
  }

  /* ---------- Karplus-Strong baked strings */
  ks(type, freq) {
    const m = Math.round(12 * Math.log2(freq / 440) + 69);
    const key = type + m;
    let e = this.ksCache.get(key);
    if (e) return e;
    const P = STRING[type], sr = this.ctx.sampleRate, f = midiHz(m);
    const N = Math.max(4, Math.round(sr / f - 0.5));
    const len = Math.floor(P.len * sr);
    const out = new Float32Array(len), buf = new Float32Array(N);
    let lp = 0;
    for (let i = 0; i < N; i++) { lp += P.bright * ((this.rand() * 2 - 1) - lp); buf[i] = lp; }
    const pp = Math.max(1, Math.round(P.pos * N)), tmp = buf.slice();
    let mean = 0;
    for (let i = 0; i < N; i++) { buf[i] = tmp[i] - (i >= pp ? tmp[i - pp] : 0); mean += buf[i]; }
    mean /= N; for (let i = 0; i < N; i++) buf[i] -= mean;
    const t60 = P.t60 * (f < 150 ? 1.2 : 1);
    const decay = Math.pow(0.001, 1 / (f * t60));
    let idx = 0;
    for (let t = 0; t < len; t++) {
      const cur = buf[idx], nx = buf[idx + 1 === N ? 0 : idx + 1];
      out[t] = cur;
      buf[idx] = decay * 0.5 * (cur + nx);
      idx = idx + 1 === N ? 0 : idx + 1;
    }
    // plectrum / finger click
    const cl = Math.floor(0.004 * sr); let c = 0;
    for (let t = 0; t < cl; t++) { const n = this.rand() * 2 - 1; c = n - c * 0.2; out[t] += P.pick * c * (1 - t / cl); }
    for (const q of P.eq) biquad(out, sr, q[0], q[1], q[2], q[3] || 0);
    let pk = 0; for (let t = 0; t < len; t++) pk = Math.max(pk, Math.abs(out[t]));
    const nrm = 0.85 / (pk || 1), fade = Math.floor(0.03 * sr);
    for (let t = 0; t < len; t++) out[t] *= nrm * (t > len - fade ? (len - t) / fade : 1);
    const ab = this.ctx.createBuffer(1, len, sr); ab.copyToChannel(out, 0);
    e = { buf: ab, f0: sr / (N + 0.5) };
    this.ksCache.set(key, e);
    return e;
  }
  pluck(type, t, freq, vel, dur, dest, rel = 0.12, cents = 0) {
    const ctx = this.ctx, k = this.ks(type, freq);
    const s = ctx.createBufferSource(); s.buffer = k.buf;
    s.playbackRate.value = (freq / k.f0) * Math.pow(2, cents / 1200);
    const gn = ctx.createGain(); gn.gain.value = vel;
    if (dur != null) { gn.gain.setValueAtTime(vel, t + dur); gn.gain.setTargetAtTime(0, t + dur, rel); }
    s.connect(gn); gn.connect(dest);
    s.start(t); s.stop(Math.min(t + k.buf.duration / s.playbackRate.value, dur != null ? t + dur + rel * 6 : 1e9));
  }
  qanun(t, f, vel, dur, dest) { // double course, slightly detuned
    this.pluck('qanun', t, f, vel * 0.6, dur, dest, 0.25, -3);
    this.pluck('qanun', t + 0.004, f, vel * 0.5, dur, dest, 0.25, 4);
  }

  /* ---------- ney */
  ney(t, f, dur, vel, dest, prevF = 0, opts = {}) {
    const ctx = this.ctx, end = t + dur;
    const o = ctx.createOscillator(); o.setPeriodicWave(this.neyWave);
    if (prevF) { o.frequency.setValueAtTime(prevF, t); o.frequency.setTargetAtTime(f, t, 0.03); }
    else { o.frequency.setValueAtTime(f * 0.97, t); o.frequency.setTargetAtTime(f, t, 0.02); }
    const env = ctx.createGain(); env.gain.value = 0;
    const atk = prevF ? 0.03 : 0.07;
    env.gain.setValueAtTime(prevF ? vel * 0.5 : 0, t);
    env.gain.linearRampToValueAtTime(vel, t + atk);
    env.gain.setTargetAtTime(vel * 0.85, t + atk, 0.3);
    env.gain.setTargetAtTime(0, end - 0.03, 0.05);
    o.connect(env); env.connect(dest);
    // vibrato (delayed) or trill
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    if (opts.trill) {
      lfo.type = 'square'; lfo.frequency.value = opts.rate || 11;
      lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * (opts.depth || 0.06), t + 0.12);
      lfo.connect(lg); lg.connect(o.frequency);
    } else {
      lfo.frequency.value = 5.2;
      lg.gain.setValueAtTime(0, t);
      if (dur > 0.35) { lg.gain.setValueAtTime(0, t + 0.18); lg.gain.linearRampToValueAtTime(16, t + Math.min(dur, 0.7)); }
      lfo.connect(lg); lg.connect(o.detune);
    }
    // breath
    const n = ctx.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(6000, f * 2.2); bp.Q.value = 1.6;
    const bg = ctx.createGain(); bg.gain.value = 0;
    bg.gain.setValueAtTime(0, t); bg.gain.linearRampToValueAtTime(vel * 0.5, t + 0.03);
    bg.gain.setTargetAtTime(vel * 0.12, t + 0.04, 0.08); bg.gain.setTargetAtTime(0, end - 0.03, 0.05);
    n.connect(bp); bp.connect(bg); bg.connect(dest);
    const stop = end + 0.35;
    o.start(t); lfo.start(t); n.start(t, this.rand() * 1.5);
    o.stop(stop); lfo.stop(stop); n.stop(stop);
  }

  /* ---------- percussion */
  noiseHit(t, dest, { type = 'bandpass', f = 1000, Q = 1, vel = 1, tc = 0.05, len = 0.4, hp = 0 }) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource(); n.buffer = this.noise;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = Q;
    const gn = ctx.createGain(); gn.gain.setValueAtTime(vel, t); gn.gain.setTargetAtTime(0, t + 0.002, tc);
    n.connect(fl);
    if (hp) { const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; fl.connect(h); h.connect(gn); }
    else fl.connect(gn);
    gn.connect(dest);
    n.start(t, this.rand() * 1.5); n.stop(t + len);
    return gn;
  }
  tone(t, dest, { f0, f1 = f0, glide = 0.1, vel = 1, tc = 0.1, type = 'sine', len }) {
    const ctx = this.ctx, o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + glide);
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(vel, t + 0.003); gn.gain.setTargetAtTime(0, t + 0.004, tc);
    o.connect(gn); gn.connect(dest); o.start(t); o.stop(t + (len || tc * 7 + 0.01));
    return o;
  }
  doum(t, v, d) {
    if (this.tabl) { // طبل خليجي: جسم أعلى يُسمع حتى من سماعة الهاتف
      this.tone(t, d, { f0: 230, f1: 120, glide: 0.07, vel: v * 1.0, tc: 0.12 });
      this.noiseHit(t, d, { type: 'bandpass', f: 900, Q: 0.9, vel: v * 0.55, tc: 0.03, len: 0.15 });
    }
    this.tone(t, d, { f0: 155, f1: 72, glide: 0.09, vel: v * 0.95, tc: 0.13 });
    this.noiseHit(t, d, { type: 'lowpass', f: 380, Q: 0.7, vel: v * 0.35, tc: 0.02, len: 0.12 });
  }
  tek(t, v, d, soft = false) {
    this.noiseHit(t, d, { f: soft ? 2600 : 3300, Q: 1.3, vel: v * (soft ? 0.5 : 0.85), tc: soft ? 0.018 : 0.03, len: 0.2, hp: 900 });
    this.tone(t, d, { f0: soft ? 820 : 960, f1: soft ? 800 : 930, vel: v * 0.12, tc: 0.025, type: 'triangle' });
  }
  daf(t, v, d) {
    this.tone(t, d, { f0: 105, f1: 68, glide: 0.12, vel: v * 0.8, tc: 0.17 });
    this.noiseHit(t, d, { type: 'lowpass', f: 700, Q: 0.7, vel: v * 0.3, tc: 0.04, len: 0.2 });
    this.jingle(t + 0.004, v * 0.35, d);
  }
  jingle(t, v, d) {
    const ctx = this.ctx, n = ctx.createBufferSource(); n.buffer = this.noise;
    const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = 6500;
    const p = ctx.createBiquadFilter(); p.type = 'peaking'; p.frequency.value = 9500; p.Q.value = 2; p.gain.value = 8;
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0, t);
    [[0, 1], [0.011, 0.7], [0.024, 0.5]].forEach(([dt, a]) => {
      gn.gain.setValueAtTime(v * a, t + dt); gn.gain.setTargetAtTime(0, t + dt + 0.001, dt > 0.02 ? 0.045 : 0.008);
    });
    n.connect(h); h.connect(p); p.connect(gn); gn.connect(d); n.start(t, this.rand() * 1.5); n.stop(t + 0.35);
  }
  clap(t, v, d, crowd = true) {
    const layer = (t0, f, a) => {
      const ctx = this.ctx, n = ctx.createBufferSource(); n.buffer = this.noise;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 0.9;
      const gn = ctx.createGain(); gn.gain.setValueAtTime(0, t0);
      [0, 0.009, 0.018, 0.027].forEach((dt, i) => {
        gn.gain.setValueAtTime(a * (i === 3 ? 1 : 0.75), t0 + dt);
        gn.gain.setTargetAtTime(0, t0 + dt + 0.0008, i === 3 ? 0.045 : 0.004);
      });
      n.connect(bp); bp.connect(gn); gn.connect(d); n.start(t0, this.rand() * 1.5); n.stop(t0 + 0.35);
    };
    layer(t, 1150, v);
    if (crowd) { layer(t + 0.006 + this.rand() * 0.01, 1650, v * 0.6); layer(t + 0.012 + this.rand() * 0.012, 900, v * 0.45); }
  }
  bell(t, f, v, d) {
    [[1, 1, 0.9], [2.32, 0.45, 0.45], [4.25, 0.25, 0.22], [6.63, 0.12, 0.12], [1.004, 0.4, 1.1]].forEach(([r, a, dec]) => {
      if (f * r < 16000) this.tone(t, d, { f0: f * r, vel: v * a * 0.5, tc: dec / 3, len: dec * 2.5 });
    });
    this.noiseHit(t, d, { type: 'highpass', f: 5000, Q: 0.7, vel: v * 0.15, tc: 0.004, len: 0.05 });
  }

  /* ---------- scheduler */
  startTimer() {
    if (this.offline || this.timer) return;
    const tick = () => {
      const now = this.ctx.currentTime;
      for (const th of this.themes) th.scheduleUntil(now + 1.0);
      this.timer = setTimeout(tick, 25);
    };
    tick();
  }
}

/* ------------------------------------------------------------------ theme player */
class ThemePlayer {
  constructor(eng, name, t0, fadeIn) {
    this.e = eng; this.name = name; this.d = THEMES[name]; this.c = compileTheme(name);
    const ctx = eng.ctx, g = eng.g;
    this.fadeDry = g(0); this.fadeWet = g(0);
    this.fadeDry.connect(eng.musicDry); this.fadeWet.connect(eng.musicWet);
    this.pre = g(this.d.level); this.wetPre = g(this.d.level);
    this.pre.connect(this.fadeDry); this.wetPre.connect(this.fadeWet);
    const B = (l, s) => eng.bus(l, s, this.pre, this.wetPre);
    this.b = {
      N: B(0.34, 0.5), O: B(0.55, 0.22), Q: B(0.42, 0.32), P: B(0.6, 0.18), bass: B(0.62, 0.06),
      darb: B(0.62, 0.12), clap: B(0.32, 0.25), riq: B(0.26, 0.18), daf: B(0.55, 0.15), amb: B(0.5, 0.4),
    };
    if (this.d.mix) for (const [k, m] of Object.entries(this.d.mix)) { const nb = B(m[0], m[1]); this.b[k] = nb; }
    if (this.d.echo) { // echoing ney in the mountains
      const dl = ctx.createDelay(2); dl.delayTime.value = this.d.echo;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      const fb = g(0.38), eo = g(0.55);
      this.b.N.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(eo);
      eo.connect(this.pre); const es = g(0.6); eo.connect(es); es.connect(this.wetPre);
    }
    this.bar = 0; this.next = t0; this.active = true; this.lastNey = { end: -1, f: 0 };
    this.fade(1, t0, fadeIn);
    this.prewarm();
  }
  prewarm() {
    const { d, c, e } = this;
    for (const b of c.bars) for (const n of b.notes) for (const w of b.who) {
      const inst = w === 'O' ? 'oud' : w === 'Q' ? 'qanun' : w === 'P' ? 'pizz' : null;
      if (inst) e.ks(inst, degHz(c.scale, d.tonic, d.oct[w], n.deg));
    }
  }
  fade(to, t, dur) {
    for (const p of [this.fadeDry.gain, this.fadeWet.gain]) {
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(to, t + Math.max(0.02, dur));
    }
  }
  scheduleUntil(tEnd) {
    if (!this.active) return;
    const now = this.e.ctx.currentTime;
    while (this.next < now - 0.05 && !this.e.offline) { this.bar++; this.next += this.c.barDur; } // keep grid if we fell behind
    while (this.next < tEnd) { this.scheduleBar(this.bar, this.next); this.bar++; this.next += this.c.barDur; }
  }
  scheduleBar(abs, t0) {
    const { d, c, e, b } = this, nb = c.bars.length, bi = abs % nb, pass = Math.floor(abs / nb);
    const sd = c.stepDur, bar = c.bars[bi], R = e.rand;
    const hum = () => (R() - 0.5) * 0.008;
    // ---------- melody
    let who = bar.who;
    if (pass % 2 && d.swapOdd) for (const [a, z] of Object.entries(d.swapOdd)) who = who.replace(a, z);
    else if (pass % 2 && who === 'O') who = 'Q';
    for (const w of who) {
      for (let i = 0; i < bar.notes.length; i++) {
        const n = bar.notes[i];
        const t = t0 + n.step * sd + (w === 'N' ? 0 : hum()), dur = n.dur * sd;
        const f = degHz(c.scale, d.tonic, d.oct[w], n.deg);
        const acc = (n.step % d.beat === 0 ? 1 : 0.82) * (0.92 + R() * 0.12);
        if (w === 'N') {
          const leg = Math.abs(this.lastNey.end - t) < 0.02 ? this.lastNey.f : 0;
          if (n.trill) e.ney(t, f, dur, 0.85, b.N, 0, { trill: true, rate: 12, depth: 0.09 });
          else e.ney(t, f, dur, 0.75 * acc, b.N, leg);
          this.lastNey = { end: t + dur, f };
        } else if (w === 'P') {
          e.pluck('pizz', t, f, 0.9 * acc, Math.min(dur, 0.25), b.P, 0.05);
        } else if (w === 'O' || w === 'Q') {
          const play = (tt, v, dd) => w === 'O' ? e.pluck('oud', tt, f, v, dd, b.O, 0.1) : e.qanun(tt, f, v, dd, b.Q);
          const trem = n.trem || (n.dur >= 8 && w === 'Q');
          if (trem && n.dur >= 4) {
            const k = Math.floor(n.dur);
            for (let j = 0; j < k; j++) play(t + j * sd, (j ? 0.55 - 0.25 * j / k : 0.95) * acc, sd * 1.05);
          } else play(t, 0.9 * acc, dur);
        }
      }
    }
    // qanun octave doubling in festive sections
    if (d.qDouble && bi >= d.qDouble[0] && bi < d.qDouble[1] && pass >= 0)
      for (const n of bar.notes) e.qanun(t0 + n.step * sd + hum(), degHz(c.scale, d.tonic, d.oct.Q, n.deg), 0.5, n.dur * sd, b.Q);
    // ---------- bass / arp / drone
    const root = d.bass[bi];
    const binst = d.bassInst || 'bass';
    for (const [st, off, du, v] of d.bassPat) {
      const f = degHz(c.scale, d.tonic, d.oct.bass, root + off);
      e.pluck(binst, t0 + st * sd + hum(), f, v * 0.95, du * sd * (binst === 'pizz' ? 0.6 : 1), binst === 'pizz' ? b.P : b.bass, 0.08);
    }
    if (d.arp) for (const [st, off, du, v] of d.arp.pat) {
      const f = degHz(c.scale, d.tonic, d.oct[d.arp.inst], root + off);
      e.pluck('oud', t0 + st * sd + hum(), f, v * 0.7, du * sd * 1.3, b.O, 0.3);
    }
    if (d.drone && bi % 2 === 0) this.drone(t0, c.barDur * 2, degHz(c.scale, d.tonic, -1, root));
    if (d.waves && bi % 2 === 0) this.wave(t0, c.barDur * 2);
    // ---------- drums
    e.tabl = !!d.tabl;
    const fillBar = bi === nb - 1 || bi % 8 === 7;
    for (const [lane, P] of Object.entries(d.drums || {})) {
      if (P.oddOnly && pass % 2 === 0) continue;
      let pat = P.main;
      if (fillBar && P.fill) pat = P.fill;
      else if (P.alt && (bi % 2 === 1 || pass % 2 === 1)) pat = P.alt;
      for (let s = 0; s < pat.length; s++) {
        const ch = pat[s]; if (ch === '.') continue;
        const t = t0 + s * sd + hum() * 0.6, v = (0.9 + R() * 0.15);
        const out = b[lane];
        switch (ch) {
          case 'D': e.doum(t, v, out); break;
          case 'd': e.doum(t, v * 0.6, out); break;
          case 'T': e.tek(t, v, out); break;
          case 't': e.tek(t, v * 0.6, out); break;
          case 'k': e.tek(t, v * 0.45, out, true); break;
          case 'C': e.clap(t, v, out); break;
          case 'c': e.clap(t, v * 0.6, out); break;
          case 'J': e.jingle(t, v, out); break;
          case 'j': e.jingle(t, v * 0.55, out); break;
          case 'F': e.daf(t, v, out); break;
          case 'f': e.daf(t, v * 0.55, out); break;
        }
      }
    }
  }
  drone(t, len, f) {
    const ctx = this.e.ctx, out = this.b.amb;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.5;
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(0.1, t + 0.8); gn.gain.setValueAtTime(0.1, t + len - 0.2);
    gn.gain.linearRampToValueAtTime(0, t + len + 0.8);
    lp.connect(gn); gn.connect(out);
    for (const [r, dt] of [[1, -5], [1, 6], [1.5, 0], [2, 3]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * r; o.detune.value = dt;
      const og = ctx.createGain(); og.gain.value = r === 1 ? 0.5 : 0.22;
      o.connect(og); og.connect(lp); o.start(t); o.stop(t + len + 0.9);
    }
  }
  wave(t, len) {
    const ctx = this.e.ctx, e = this.e;
    const n = ctx.createBufferSource(); n.buffer = e.noise; n.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.4;
    lp.frequency.setValueAtTime(250, t); lp.frequency.exponentialRampToValueAtTime(1500, t + len * 0.4);
    lp.frequency.exponentialRampToValueAtTime(300, t + len);
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(0.16, t + len * 0.4); gn.gain.linearRampToValueAtTime(0.0, t + len + 0.3);
    const pan = ctx.createStereoPanner(); pan.pan.value = (e.rand() - 0.5) * 0.8;
    n.connect(lp); lp.connect(gn); gn.connect(pan); pan.connect(this.b.amb);
    n.start(t, e.rand() * 1.5); n.stop(t + len + 0.4);
  }
  stop(t, dur) {
    this.fade(0, t, dur);
    const kill = () => { this.active = false; };
    if (this.e.offline) return;
    setTimeout(kill, dur * 1000 + 50);
    setTimeout(() => { try { this.fadeDry.disconnect(); this.fadeWet.disconnect(); } catch (_) { } }, dur * 1000 + 6000);
  }
}

/* ------------------------------------------------------------------ SFX */
const SFX = {
  step(e, t, B) {
    return; // أُلغي صوت الخطوات (كان يُسمع كضرب الطبل)
    const R = e.rand, v = 1.0 + R() * 0.4, kind = R();
    if (kind < 0.5) { // sand
      e.noiseHit(t, B.dry, { type: 'bandpass', f: 1400 + R() * 900, Q: 0.8, vel: v * 0.45, tc: 0.025, len: 0.12 });
      e.noiseHit(t + 0.018, B.dry, { type: 'bandpass', f: 2200 + R() * 800, Q: 1, vel: v * 0.25, tc: 0.02, len: 0.1 });
    } else { // stone
      e.noiseHit(t, B.dry, { type: 'bandpass', f: 900 + R() * 500, Q: 1.5, vel: v * 0.5, tc: 0.015, len: 0.08 });
    }
    e.tone(t, B.dry, { f0: 110 + R() * 30, f1: 70, glide: 0.04, vel: v * 0.35, tc: 0.025 });
  },
  jump(e, t, B) {
    e.tone(t, B.mid, { f0: 260, f1: 640, glide: 0.16, vel: 0.5, tc: 0.08, type: 'triangle', len: 0.35 });
    e.noiseHit(t, B.mid, { f: 1800, Q: 1.2, vel: 0.2, tc: 0.07, len: 0.3 });
    e.pluck('oud', t + 0.02, 392, 0.35, 0.3, B.mid);
  },
  land(e, t, B) {
    e.noiseHit(t, B.dry, { type: 'bandpass', f: 1600, Q: 0.8, vel: 0.18, tc: 0.03, len: 0.12 });
  },
  coin(e, t, B) {
    e.bell(t, 1175, 0.55, B.mid);
    e.bell(t + 0.075, 1568, 0.75, B.mid);
  },
  star(e, t, B) {
    const sc = MAQAM.ajam; [0, 2, 4, 7, 9, 11, 14].forEach((dg, i) =>
      e.qanun(t + i * 0.045, degHz(sc, 72, 0, dg), 0.75, 0.6, B.wet));
    for (let i = 0; i < 6; i++) e.bell(t + 0.3 + i * 0.06 + e.rand() * 0.03, 2400 + e.rand() * 1600, 0.18, B.wet);
  },
  correct(e, t, B) {
    const sc = MAQAM.ajam;
    [0, 2, 4].forEach((dg, i) => e.pluck('oud', t + i * 0.07, degHz(sc, 55, 0, dg), 0.8, 0.12, B.mid));
    for (let j = 0; j < 5; j++) e.pluck('oud', t + 0.21 + j * 0.055, degHz(sc, 55, 0, 7), j ? 0.5 - j * 0.06 : 0.9, 0.06, B.mid);
    e.qanun(t + 0.21, degHz(sc, 67, 0, 7), 0.5, 0.6, B.mid);
    e.clap(t + 0.32, 0.7, B.mid); e.clap(t + 0.5, 0.8, B.mid);
  },
  wrong(e, t, B) {
    const sc = MAQAM.nahawand;
    e.pluck('pizz', t, degHz(sc, 57, 0, 4), 0.7, 0.2, B.mid);
    e.pluck('pizz', t + 0.17, degHz(sc, 57, 0, 2), 0.6, 0.2, B.mid);
    const o = e.tone(t + 0.34, B.mid, { f0: 300, f1: 150, glide: 0.45, vel: 0.28, tc: 0.18, type: 'sine', len: 0.8 });
    const l = e.ctx.createOscillator(), lg = e.ctx.createGain();
    l.frequency.value = 14; lg.gain.setValueAtTime(40, t + 0.34); lg.gain.setTargetAtTime(0, t + 0.4, 0.15);
    l.connect(lg); lg.connect(o.frequency); l.start(t + 0.34); l.stop(t + 1.2);
  },
  bump(e, t, B) {
    e.noiseHit(t, B.dry, { type: 'bandpass', f: 1200, Q: 0.7, vel: 0.25, tc: 0.04, len: 0.15 });
    const o = e.tone(t + 0.03, B.dry, { f0: 220, f1: 170, glide: 0.2, vel: 0.18, tc: 0.08, type: 'triangle' });
    const l = e.ctx.createOscillator(), lg = e.ctx.createGain(); l.frequency.value = 18; lg.gain.value = 25;
    l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + 0.6);
  },
  whoosh(e, t, B) {
    const ctx = e.ctx, n = ctx.createBufferSource(); n.buffer = e.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(350, t); bp.frequency.exponentialRampToValueAtTime(2600, t + 0.22); bp.frequency.exponentialRampToValueAtTime(600, t + 0.5);
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(1.0, t + 0.2); gn.gain.linearRampToValueAtTime(0, t + 0.5);
    const p = ctx.createStereoPanner(); p.pan.setValueAtTime(-0.7, t); p.pan.linearRampToValueAtTime(0.7, t + 0.5);
    n.connect(bp); bp.connect(gn); gn.connect(p); p.connect(B.mid); n.start(t, e.rand()); n.stop(t + 0.6);
  },
  gate(e, t, B) {
    const ctx = e.ctx, o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(95, t + 0.5);
    const j = ctx.createOscillator(), jg = ctx.createGain(); j.frequency.value = 23; jg.gain.value = 12; j.connect(jg); jg.connect(o.frequency);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 4;
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(0.25, t + 0.08); gn.gain.linearRampToValueAtTime(0, t + 0.55);
    o.connect(bp); bp.connect(gn); gn.connect(B.mid); o.start(t); j.start(t); o.stop(t + 0.6); j.stop(t + 0.6);
    const sc = MAQAM.rast; for (let i = 0; i < 9; i++) e.qanun(t + 0.2 + i * 0.035, degHz(sc, 60, 0, i), 0.55, 0.5, B.wet);
    e.bell(t + 0.55, 1568, 0.5, B.wet);
  },
  wolf(e, t, B) {
    const sc = MAQAM.nahawand, seq = [[0, 0], [0.18, 2], [0.36, 3], [0.54, 4], [0.9, 3], [1.08, -1], [1.26, 0]];
    seq.forEach(([dt, dg], i) => e.pluck('pizz', t + dt, degHz(sc, 57, 0, dg), i === 3 ? 1 : 0.7, 0.15, B.mid));
    e.tek(t + 0.54, 0.4, B.mid, true); e.pluck('bass', t + 1.26, degHz(sc, 45, 0, 0), 0.9, 0.4, B.mid);
  },
  fox(e, t, B) { laugh(e, t, B, [1320, 1250, 1175, 1110, 1050], 0.12, 0.12) },
  hyena(e, t, B) { laugh(e, t, B, [1500, 1700, 1450, 1650, 1400, 1600, 1350, 1250], 0.09, 0.2) },
  leopard(e, t, B) {
    const ctx = e.ctx, dur = 1.3;
    const am = ctx.createOscillator(); am.frequency.setValueAtTime(24, t); am.frequency.linearRampToValueAtTime(19, t + dur);
    const amg = ctx.createGain(); amg.gain.value = 0.5;
    const vca = ctx.createGain(); vca.gain.value = 0.5; am.connect(amg); amg.connect(vca.gain);
    const env = ctx.createGain(); env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.7, t + 0.25);
    env.gain.setValueAtTime(0.7, t + dur - 0.3); env.gain.linearRampToValueAtTime(0, t + dur);
    const n = ctx.createBufferSource(); n.buffer = e.noise; n.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    const s = ctx.createOscillator(); s.type = 'sawtooth'; s.frequency.setValueAtTime(58, t); s.frequency.linearRampToValueAtTime(75, t + 0.5); s.frequency.linearRampToValueAtTime(55, t + dur);
    const sl = ctx.createBiquadFilter(); sl.type = 'lowpass'; sl.frequency.value = 320; const sg = ctx.createGain(); sg.gain.value = 0.35;
    n.connect(lp); lp.connect(vca); s.connect(sl); sl.connect(sg); sg.connect(vca); vca.connect(env); env.connect(B.dry);
    [am, n, s].forEach((x) => { x.start(t); x.stop(t + dur + 0.05); });
    e.tone(t + dur - 0.05, B.mid, { f0: 330, f1: 470, glide: 0.18, vel: 0.12, tc: 0.08, type: 'triangle', len: 0.4 }); // cute "mrr?"
  },
  falcon(e, t, B) {
    [[0, 0.55, 1], [0.6, 0.4, 0.8]].forEach(([dt, d, a]) => {
      const ctx = e.ctx, t0 = t + dt, o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(2300, t0); o.frequency.linearRampToValueAtTime(3100, t0 + 0.06); o.frequency.exponentialRampToValueAtTime(1700, t0 + d);
      const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 32; lg.gain.value = 70; l.connect(lg); lg.connect(o.frequency);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4500;
      const gn = ctx.createGain(); gn.gain.setValueAtTime(0, t0); gn.gain.linearRampToValueAtTime(0.2 * a, t0 + 0.04); gn.gain.setTargetAtTime(0, t0 + d - 0.12, 0.05);
      o.connect(lp); lp.connect(gn); gn.connect(B.wet); o.start(t0); l.start(t0); o.stop(t0 + d + 0.3); l.stop(t0 + d + 0.3);
      e.noiseHit(t0, B.wet, { f: 3000, Q: 2, vel: 0.08 * a, tc: 0.1, len: d });
    });
  },
  drumroll(e, t, B) {
    let tt = 0, i = 0;
    while (tt < 1.5) { const r = tt / 1.5; e.tek(t + tt, 0.2 + 0.6 * r, B.mid, i % 2 === 1); tt += 0.1 - 0.05 * r; i++; }
    e.doum(t + 1.55, 1, B.mid); e.clap(t + 1.55, 0.9, B.mid); e.jingle(t + 1.55, 0.8, B.mid);
  },
  fireworks(e, t, B) {
    const ctx = e.ctx;
    // little rising whistle, then pop, then crackle
    e.tone(t, B.wet, { f0: 900, f1: 1900, glide: 0.35, vel: 0.06, tc: 0.15, type: 'sine', len: 0.4 });
    const tp = t + 0.38;
    e.tone(tp, B.mid, { f0: 120, f1: 45, glide: 0.15, vel: 0.9, tc: 0.12 });
    e.noiseHit(tp, B.wet, { type: 'lowpass', f: 2500, Q: 0.6, vel: 0.8, tc: 0.06, len: 0.5 });
    for (let i = 0; i < 38; i++) {
      const dt = 0.12 + Math.pow(e.rand(), 1.6) * 1.6;
      const p = ctx.createStereoPanner(); p.pan.value = e.rand() * 1.6 - 0.8; p.connect(B.wet);
      e.noiseHit(tp + dt, p, { type: 'highpass', f: 2500 + e.rand() * 3000, Q: 0.7, vel: 0.25 + e.rand() * 0.35, tc: 0.004, len: 0.04 });
    }
  },
  door(e, t, B) {
    [0, 0.22, 0.44].forEach((dt, i) => {
      const tk = t + dt, v = i === 2 ? 1 : 0.85;
      e.tone(tk, B.mid, { f0: 210, f1: 150, glide: 0.04, vel: v * 0.6, tc: 0.04 });
      e.noiseHit(tk, B.mid, { f: 900, Q: 1.2, vel: v * 0.5, tc: 0.012, len: 0.08 });
      e.noiseHit(tk, B.mid, { f: 260, Q: 6, vel: v * 0.9, tc: 0.05, len: 0.25 });
    });
  },
  ululation(e, t, B) { ululate(e, t, B.wet, 2.2) },
};
function laugh(e, t, B, freqs, sp, bend) {
  freqs.forEach((f, i) => {
    const ctx = e.ctx, t0 = t + i * sp, o = ctx.createOscillator(); o.setPeriodicWave(e.neyWave);
    o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * (1 - bend), t0 + sp * 0.9);
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0, t0); gn.gain.linearRampToValueAtTime(0.32, t0 + 0.015); gn.gain.setTargetAtTime(0, t0 + sp * 0.55, 0.02);
    o.connect(gn); gn.connect(B.mid); o.start(t0); o.stop(t0 + sp + 0.15);
    e.noiseHit(t0, B.mid, { f: f * 2, Q: 2, vel: 0.12, tc: 0.03, len: 0.1 });
  });
}
function ululate(e, t, dest, dur) {
  const ctx = e.ctx;
  [[1046, 7.6, 0, 0.32], [1110, 8.3, 0.14, 0.2]].forEach(([base, rate, off, a]) => {
    const t0 = t + off, d = dur - off;
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(base * 0.88, t0); o.frequency.linearRampToValueAtTime(base * 1.06, t0 + 0.3);
    o.frequency.setValueAtTime(base * 1.06, t0 + d - 0.45); o.frequency.linearRampToValueAtTime(base * 0.86, t0 + d);
    const l = ctx.createOscillator(); l.type = 'square'; l.frequency.setValueAtTime(rate, t0); l.frequency.linearRampToValueAtTime(rate * 1.12, t0 + d);
    const lg = ctx.createGain(); lg.gain.value = base * 0.11; l.connect(lg); lg.connect(o.frequency);
    const am = ctx.createGain(); am.gain.value = 0.75; const amg = ctx.createGain(); amg.gain.value = 0.25; l.connect(amg); amg.connect(am.gain);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
    const gn = ctx.createGain(); gn.gain.setValueAtTime(0, t0); gn.gain.linearRampToValueAtTime(a, t0 + 0.08);
    gn.gain.setValueAtTime(a, t0 + d - 0.25); gn.gain.linearRampToValueAtTime(0, t0 + d);
    o.connect(am); am.connect(lp); lp.connect(gn); gn.connect(dest);
    o.start(t0); l.start(t0); o.stop(t0 + d + 0.05); l.stop(t0 + d + 0.05);
  });
}
export const sfxNames = Object.keys(SFX);

/* ------------------------------------------------------------------ public API */
export function createAudio() {
  let eng = null, volume = 0.8, muted = false;
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  function ensure() {
    if (!eng) { eng = new Engine(new AC({ latencyHint: 'interactive' })); eng.vol.gain.value = volume; eng.muteG.gain.value = muted ? 0 : 1; }
    return eng;
  }
  const api = {
    get ctx() { return ensure().ctx; },
    unlock() {
      const e = ensure();
      if (e.ctx.state !== 'running') e.ctx.resume();
      const b = e.ctx.createBuffer(1, 1, e.ctx.sampleRate), s = e.ctx.createBufferSource(); // iOS kick
      s.buffer = b; s.connect(e.ctx.destination); s.start(0);
      return e.ctx.resume ? e.ctx.resume() : Promise.resolve();
    },
    playTheme(name, { fade = 1.5 } = {}) {
      if (!THEMES[name]) { console.warn('[music] unknown theme', name); return; }
      const e = ensure();
      if (e.current && e.current.name === name && e.current.active) return;
      const now = e.ctx.currentTime, t0 = now + 0.08;
      if (e.current) e.current.stop(now, fade);
      const p = new ThemePlayer(e, name, t0, fade);
      e.current = p; e.themes = e.themes.filter((x) => x.active); e.themes.push(p);
      setTimeout(() => { e.themes = e.themes.filter((x) => x.active); }, fade * 1000 + 200);
      e.startTimer();
    },
    stopTheme({ fade = 1.5 } = {}) {
      if (!eng || !eng.current) return;
      eng.current.stop(eng.ctx.currentTime, fade); eng.current = null;
    },
    get currentTheme() { return eng && eng.current ? eng.current.name : null; },
    duck(on) {
      if (!eng) return;
      const t = eng.ctx.currentTime;
      for (const p of [eng.duckDry.gain, eng.duckWet.gain]) {
        p.cancelScheduledValues(t); p.setValueAtTime(p.value, t);
        p.setTargetAtTime(on ? 0.25 : 1, t, on ? 0.08 : 0.35); // -12 dB
      }
    },
    setVolume(v) { volume = clamp(+v || 0, 0, 1); if (eng) eng.vol.gain.setTargetAtTime(volume, eng.ctx.currentTime, 0.05); },
    mute(m) { muted = !!m; if (eng) eng.muteG.gain.setTargetAtTime(muted ? 0 : 1, eng.ctx.currentTime, 0.03); },
    sfx(name, opts = {}) {
      const fn = SFX[name]; if (!fn) { console.warn('[music] unknown sfx', name); return; }
      const e = ensure(), now = e.ctx.currentTime;
      if (name === 'step') { if (now - e.lastStep < 0.07) return; e.lastStep = now; }
      e.voices = e.voices.filter((x) => x > now);
      if (e.voices.length >= 10) return; // polyphony cap
      e.voices.push(now + 0.6);
      fn(e, now + 0.01 + (opts.delay || 0), e.sfxB);
    },
  };
  return api;
}

/** Render a theme (or 'sfx:<name>') offline. Returns an AudioBuffer. */
export async function renderOffline(name, seconds = 20, sampleRate = 44100) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OAC(2, Math.ceil(seconds * sampleRate), sampleRate);
  const e = new Engine(ctx, true);
  if (name.startsWith('sfx:')) {
    SFX[name.slice(4)](e, 0.05, e.sfxB);
  } else {
    const p = new ThemePlayer(e, name, 0.05, 0.05);
    e.current = p; p.scheduleUntil(seconds);
  }
  return ctx.startRendering();
}

/** 16-bit PCM WAV from an AudioBuffer. */
export function encodeWAV(ab) {
  const ch = ab.numberOfChannels, sr = ab.sampleRate, n = ab.length;
  const buf = new ArrayBuffer(44 + n * ch * 2), v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * ch * 2, true);
  const data = []; for (let c = 0; c < ch; c++) data.push(ab.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = clamp(data[c][i], -1, 1); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return buf;
}
