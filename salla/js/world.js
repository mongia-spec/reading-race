// © 2026 الأستاذة منجية عادل (Mongia Adel) — جميع الحقوق محفوظة. لعبة «سلّة خير عُمان». إنستغرام @ostatha.mongia • يوتيوب @shtshout
// world.js — مشاهد «سلّة الخير: رحلة إلى بيت الجدّة» ثلاثية الأبعاد (إجرائية بالكامل)
// createWorld(THREE, scene, renderer, grade) → { length, stages, houseZ, update(dt, heroZ, camera), setStageMood(i) }
// المسار: على المحور +Z من 0 إلى length، مستوٍ تمامًا عند y=0 وخالٍ من أي عنصر ضمن |x| ≤ 3.5.
export function createWorld(THREE, scene, renderer, grade = 1) {
  grade = Math.max(1, Math.min(4, Math.round(+grade) || 1));
  const { Color, Matrix4, Vector3, Quaternion, Euler, Matrix3, BufferGeometry, BufferAttribute, Mesh } = THREE;
  const PI = Math.PI, TAU = PI * 2;
  const STAGE = 210, LENGTH = 1150, HOUSE_Z = 1140, CH = 40, Z0 = -80, ZEND = LENGTH + 90;
  const NCH = Math.ceil((ZEND - Z0) / CH), PW = 3.7, SEA = -0.45;

  const KEYS = [null,
    ['village', 'wadi', 'mountain', 'desert', 'oasis', 'house'],
    ['beach', 'fishing', 'souq', 'port', 'corniche', 'house'],
    ['rim', 'juniper', 'bridge', 'cave', 'terraces', 'house'],
    ['khareef', 'waterfall', 'forest', 'dunes', 'oasis', 'house']][grade];
  const NAMES = [null,
    ['القرية', 'الوادي والفلج', 'الطريق الجبلي', 'الكثبان الرملية', 'الواحة', 'بيت الجدّة'],
    ['الشاطئ', 'قرية الصيادين', 'السوق القديم', 'الميناء', 'الكورنيش', 'بيت الجدّة'],
    ['حافة الأخدود', 'درب العرعر', 'الجسر المعلّق', 'الكهف المضيء', 'القرية المعلّقة', 'بيت الجدّة'],
    ['تلال الخريف', 'الشلّال', 'الغابة الخضراء', 'رمال الشرقية', 'الواحة والحصن', 'بيت الجدّة']][grade];
  const stages = KEYS.map((key, i) => ({ key, nameAr: NAMES[i], z0: i * STAGE, z1: i < 5 ? (i + 1) * STAGE : LENGTH }));

  // ── أدوات عامة ──────────────────────────────────────────────
  let seed = 9871 + grade * 7919;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const R = (a, b) => a + (b - a) * rnd();
  const pick = a => a[(rnd() * a.length) | 0];
  const side = () => (rnd() < 0.5 ? -1 : 1);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const hash2 = (x, y) => { const h = Math.sin(x * 127.1 + y * 311.7 + grade * 17.3) * 43758.5453; return h - Math.floor(h); };
  const vnoise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y) => vnoise(x, y) * 0.5 + vnoise(x * 2.03 + 5.2, y * 2.03 + 1.3) * 0.3 + vnoise(x * 4.1 + 9.1, y * 4.1 + 3.7) * 0.2;
  const col = h => new Color(h);
  const J = (c, a = 0.07) => { const k = 1 + (rnd() - 0.5) * 2 * a; return new Color(c.r * k, c.g * k, c.b * k); };
  const mixC = (a, b, t) => new Color().copy(a).lerp(b, t);
  const PAL = {
    mud: col('#d9b98c'), mud2: col('#cfa676'), white: col('#efe6d6'), stone: col('#a89276'), wood: col('#6b4325'), wood2: col('#8a5a32'),
    dark: col('#2a1c12'), palmG: col('#3f7a2a'), palmG2: col('#7aa03a'), palmY: col('#b5a54a'), trunk: col('#7a5a3c'), trunk2: col('#5e4430'),
    leaf: col('#4b7d32'), leaf2: col('#6a9a3c'), olive: col('#76803e'), rock: col('#a98463'), rock2: col('#8a6c55'), pink: col('#e0408a'),
    red: col('#c8102e'), green: col('#00843d'), gold: col('#e2b04a'), brass: col('#c08a35'), clay: col('#b2643a'), cream: col('#f2e6cc'),
    teal: col('#2f7f86'), blue: col('#2c6aa0'), sand: col('#e2bd84'),
  };

  // ── أشكال أساسية مخزّنة ─────────────────────────────────────
  const prep = g => { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); g.computeVertexNormals(); return g; };
  const prepUV = g => { g = g.index ? g.toNonIndexed() : g; g.computeVertexNormals(); return g; };
  const G = {
    box: prep(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)),
    boxC: prep(new THREE.BoxGeometry(1, 1, 1)),
    ico: prep(new THREE.IcosahedronGeometry(1, 0)),
    ico1: prep(new THREE.IcosahedronGeometry(1, 1)),
    dod: prep(new THREE.DodecahedronGeometry(1, 0)),
    sph: prep(new THREE.SphereGeometry(1, 8, 6)),
    pyr: prep(new THREE.ConeGeometry(1, 1, 4, 1).rotateY(PI / 4).translate(0, 0.5, 0)),
    plane: prepUV(new THREE.PlaneGeometry(1, 1)),
    flag: prepUV(new THREE.PlaneGeometry(1, 1, 8, 4).translate(0.5, -0.5, 0)),
  };
  const cylCache = {};
  const cylG = (seg = 8, top = 1, open = false) => {
    const k = seg + '_' + top + '_' + open;
    return cylCache[k] || (cylCache[k] = prep(new THREE.CylinderGeometry(top, 1, 1, seg, 1, open).translate(0, 0.5, 0)));
  };
  const coneG = (seg = 6) => cylG(seg, 0.001);
  function customGeo(tris) { const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(tris), 3)); g.computeVertexNormals(); return g; }
  function quad(arr, a, b, c, d) { arr.push(...a, ...b, ...c, ...a, ...c, ...d); }
  function frondGeo(droop) {
    const n = 7, P = [];
    const pt = (i, s) => { const t = i / n, y = 0.3 * t - droop * t * t, w = 0.03 + 0.17 * Math.pow(Math.sin(PI * Math.min(1, t * 1.04)), 0.8); return s === 0 ? [t, y + 0.02, 0] : [t, y - 0.42 * w, s * w]; };
    for (let i = 0; i < n; i++) for (const s of [-1, 1]) quad(P, pt(i, 0), pt(i + 1, 0), pt(i + 1, s), pt(i, s));
    return customGeo(P);
  }
  G.frond = frondGeo(0.75); G.frond2 = frondGeo(1.05);
  G.hull = (() => {
    const st = 10, pts = [], P = [];
    for (let i = 0; i <= st; i++) {
      const t = i / st, w = 0.5 * Math.pow(Math.sin(PI * Math.min(1, 0.12 + t * 0.95)), 0.55), sh = 0.55 + 0.4 * Math.pow(t, 3), z = t - 0.5;
      pts.push([[-w, sh, z], [-w * 0.86, 0.16, z], [0, 0, z], [w * 0.86, 0.16, z], [w, sh, z]]);
    }
    for (let i = 0; i < st; i++) for (let j = 0; j < 4; j++) quad(P, pts[i][j], pts[i + 1][j], pts[i + 1][j + 1], pts[i][j + 1]);
    const s0 = pts[0]; P.push(...s0[0], ...s0[1], ...s0[4], ...s0[1], ...s0[3], ...s0[4], ...s0[1], ...s0[2], ...s0[3]);
    return customGeo(P);
  })();
  G.tri = customGeo([-0.5, 0, 0, 0.5, 0, 0, 0, -1, 0]);
  G.sail = customGeo([0, 0, 0, 1, 0.05, 0, 0.15, 1, 0, 1, 0.05, 0, 0.6, 0.75, 0.04, 0.15, 1, 0]);
  G.arch = (() => { // بوّابة بقوس مدبّب (مقطع U)
    const s = new THREE.Shape();
    s.moveTo(-5.7, 0); s.lineTo(-5.7, 8.3); s.lineTo(5.7, 8.3); s.lineTo(5.7, 0); s.lineTo(4.7, 0); s.lineTo(4.7, 5.6);
    s.quadraticCurveTo(4.5, 6.9, 0, 7.5); s.quadraticCurveTo(-4.5, 6.9, -4.7, 5.6); s.lineTo(-4.7, 0); s.lineTo(-5.7, 0);
    return prep(new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -0.5));
  })();

  // ── الخامات المرسومة (canvas) ──────────────────────────────
  const maxAniso = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4;
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d', { willReadFrequently: true })]; };
  const mkTex = (c, wrapS, wrapT) => {
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, maxAniso);
    t.wrapS = wrapS || THREE.ClampToEdgeWrapping; t.wrapT = wrapT || THREE.ClampToEdgeWrapping; return t;
  };
  const grain = (g, w, h, amt, x0 = 0, y0 = 0) => {
    const im = g.getImageData(x0, y0, w, h), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.85; }
    g.putImageData(im, x0, y0);
  };
  const wrapY = (H, y, f) => { f(y); if (y < 60) f(y + H); if (y > H - 60) f(y - H); };

  // أطلس المسار: 4 أعمدة × 512: تراب، بلاط حجري، رمل، صخر/حصى
  const pathTex = (() => {
    const W = 512, H = 1024, [c, g] = mkCanvas(W * 4, H);
    // 0 تراب مدكوك
    g.fillStyle = '#c9a272'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) { const x = R(0, W), y = R(0, H), r = R(30, 120); wrapY(H, y, yy => { const gr = g.createRadialGradient(x, yy, 0, x, yy, r); gr.addColorStop(0, `rgba(${rnd() < 0.5 ? '120,85,50' : '235,205,160'},0.18)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, yy - r, r * 2, r * 2); }); }
    for (let i = 0; i < 1800; i++) { const x = R(0, W), y = R(0, H), r = R(1.5, rnd() < 0.1 ? 9 : 4); wrapY(H, y, yy => { g.fillStyle = pick(['#9b7a55', '#e3c9a0', '#b08a60', '#7d6448', '#d8bf98']); g.beginPath(); g.ellipse(x, yy, r, r * R(0.6, 1), R(0, 3), 0, TAU); g.fill(); }); }
    for (let i = 0; i < 14; i++) { const x = R(120, 390), y = R(0, H); wrapY(H, y, yy => { g.fillStyle = 'rgba(110,80,50,0.18)'; g.beginPath(); g.ellipse(x, yy, 9, 18, R(-0.2, 0.2), 0, TAU); g.fill(); g.beginPath(); g.ellipse(x + 26, yy + 40, 9, 18, R(-0.2, 0.2), 0, TAU); g.fill(); }); }
    // 1 بلاط حجري غير منتظم
    g.fillStyle = '#7b6247'; g.fillRect(W, 0, W, H);
    { let y = 0; const rows = 22, rh = H / rows; for (let r = 0; r < rows; r++) { let x = W + 30; while (x < 2 * W - 30) { let w = Math.min(R(42, 88), 2 * W - 30 - x); if (2 * W - 30 - x - w < 30) w = 2 * W - 30 - x; const c0 = pick(['#d8c09a', '#ceb48c', '#e2cfaa', '#c4a67e', '#d6b98c', '#bfa27c']); g.fillStyle = c0; const j = () => R(-5, 5); g.beginPath(); g.moveTo(x + 4 + j(), y + 4 + j()); g.lineTo(x + w - 4 + j(), y + 4 + j()); g.lineTo(x + w - 4 + j(), y + rh - 4 + j()); g.lineTo(x + 4 + j(), y + rh - 4 + j()); g.closePath(); g.fill(); g.strokeStyle = 'rgba(255,240,215,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 6, y + rh - 8); g.lineTo(x + 6, y + 7); g.lineTo(x + w - 8, y + 7); g.stroke(); g.strokeStyle = 'rgba(70,50,30,0.3)'; g.beginPath(); g.moveTo(x + w - 6, y + 8); g.lineTo(x + w - 6, y + rh - 6); g.lineTo(x + 8, y + rh - 6); g.stroke(); x += w; } y += rh; } }
    for (const ex of [W, 2 * W - 30]) for (let y = 0; y < H; y += 64) { g.fillStyle = pick(['#a08566', '#b39878', '#94795c']); g.fillRect(ex + 2, y + 2, 26, 60); }
    // 2 رمل بتموّجات
    g.fillStyle = '#e2bc86'; g.fillRect(2 * W, 0, W, H);
    for (let k = 0; k < 64; k++) { const y0 = k * (H / 64); g.strokeStyle = k % 2 ? 'rgba(160,110,60,0.16)' : 'rgba(255,240,210,0.22)'; g.lineWidth = R(2, 5); g.beginPath(); for (let x = 0; x <= W; x += 8) { const y = y0 + Math.sin(x * 0.02 + k * 1.3) * 6 + Math.sin(x * 0.05 + k) * 2; x ? g.lineTo(2 * W + x, y) : g.moveTo(2 * W, y); } g.stroke(); }
    for (let i = 0; i < 500; i++) { const x = 2 * W + R(0, W), y = R(0, H); g.fillStyle = pick(['#c89a62', '#f4dcb0', '#b8875a']); g.fillRect(x, y, 2, 2); }
    // 3 صخر وحصى
    g.fillStyle = '#a28c74'; g.fillRect(3 * W, 0, W, H);
    for (let i = 0; i < 60; i++) { const x = 3 * W + R(10, W - 10), y = R(0, H), r = R(20, 60); wrapY(H, y, yy => { g.fillStyle = pick(['#b39c82', '#968068', '#bba68c']); g.beginPath(); for (let a = 0; a < 7; a++) { const rr = r * R(0.7, 1); g.lineTo(x + Math.cos(a / 7 * TAU) * rr, yy + Math.sin(a / 7 * TAU) * rr * 0.7); } g.fill(); }); }
    for (let i = 0; i < 2600; i++) { const x = 3 * W + R(0, W), y = R(0, H), r = R(1.5, 5); g.fillStyle = pick(['#7d6a58', '#c4b098', '#8f7a66', '#d8c6ae', '#665446']); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    // حواف معتمة ناعمة
    for (let k = 0; k < 4; k++) { const ox = k * W; for (const [a, b] of [[ox, ox + 46], [ox + W, ox + W - 46]]) { const gr = g.createLinearGradient(a, 0, b, 0); gr.addColorStop(0, 'rgba(60,40,20,0.32)'); gr.addColorStop(1, 'rgba(60,40,20,0)'); g.fillStyle = gr; g.fillRect(Math.min(a, b), 0, 46, H); } }
    grain(g, 4 * W, H, 26);
    return mkTex(c, THREE.ClampToEdgeWrapping, THREE.RepeatWrapping);
  })();

  // أطلس الزخارف: علم، سجاد، أبواب منقوشة، نوافذ، مظلات، خيام، وسائد
  const DEC = { W: 1024, H: 1024 };
  const rect = (x, y, w, h) => [x / DEC.W, 1 - (y + h) / DEC.H, w / DEC.W, h / DEC.H];
  const UV = { flag: rect(2, 2, 508, 252), carpet: rect(0, 256, 512, 256), door: rect(514, 2, 252, 508), door2: rect(770, 2, 252, 508), win: rect(514, 514, 252, 252), awning: rect(0, 512, 512, 256), tent: rect(770, 514, 252, 252), cushion: rect(0, 768, 512, 256), brass: rect(560, 820, 120, 120) };
  const decalTex = (() => {
    const [c, g] = mkCanvas(DEC.W, DEC.H);
    g.fillStyle = '#888'; g.fillRect(0, 0, DEC.W, DEC.H);
    // علم عُمان
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 512, 86); g.fillStyle = '#d0102c'; g.fillRect(0, 86, 512, 84); g.fillStyle = '#008a3e'; g.fillRect(0, 170, 512, 86);
    g.fillStyle = '#d0102c'; g.fillRect(0, 0, 150, 256);
    g.strokeStyle = '#fff'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(40, 30); g.lineTo(110, 95); g.moveTo(110, 30); g.lineTo(40, 95); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(75, 28); g.quadraticCurveTo(95, 70, 70, 100); g.lineTo(66, 92); g.quadraticCurveTo(82, 66, 68, 34); g.fill(); g.fillRect(64, 24, 22, 10);
    // سجاد (السدو)
    g.fillStyle = '#9e1b22'; g.fillRect(0, 256, 512, 256);
    const band = (y, h, c1, c2) => { g.fillStyle = c1; g.fillRect(0, y, 512, h); g.fillStyle = c2; for (let x = 0; x < 512; x += h) { g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + h / 2, y); g.lineTo(x + h, y + h); g.fill(); } };
    band(262, 20, '#1d1a2e', '#f2e2c0'); band(486, 20, '#1d1a2e', '#f2e2c0'); band(300, 26, '#e8a33a', '#9e1b22'); band(442, 26, '#e8a33a', '#9e1b22');
    for (let x = 30; x < 512; x += 90) { g.fillStyle = '#f2e2c0'; g.beginPath(); g.moveTo(x, 384); g.lineTo(x + 34, 344); g.lineTo(x + 68, 384); g.lineTo(x + 34, 424); g.fill(); g.fillStyle = '#1d4a6e'; g.beginPath(); g.moveTo(x + 14, 384); g.lineTo(x + 34, 360); g.lineTo(x + 54, 384); g.lineTo(x + 34, 408); g.fill(); }
    // باب عُماني منقوش
    const door = (x0, dbl) => {
      const w = 256, h = 512; g.fillStyle = '#6e4120'; g.fillRect(x0, 0, w, h);
      g.fillStyle = '#4a2a12'; g.fillRect(x0 + 10, 10, w - 20, h - 20);
      const leaf = (lx, lw) => {
        g.fillStyle = '#7d4b24'; g.fillRect(lx, 20, lw, h - 40);
        g.strokeStyle = '#a8703a'; g.lineWidth = 5; g.strokeRect(lx + 8, 28, lw - 16, h - 56);
        for (let k = 0; k < 2; k++) { const cy = 150 + k * 210, cx = lx + lw / 2, r = Math.min(lw * 0.36, 60); g.fillStyle = '#5a3416'; g.fillRect(lx + 16, cy - 85, lw - 32, 170); for (let q = 4; q > 0; q--) { g.strokeStyle = q % 2 ? '#b97f42' : '#3c210c'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, r * q / 4, 0, TAU); g.stroke(); } for (let a = 0; a < 8; a++) { g.strokeStyle = '#c48a4a'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a * PI / 4) * r, cy + Math.sin(a * PI / 4) * r); g.stroke(); } }
        g.fillStyle = '#e6b14a'; for (let y = 40; y < h - 30; y += 34) for (const xx of [lx + 14, lx + lw - 14]) { g.beginPath(); g.arc(xx, y, 4.5, 0, TAU); g.fill(); }
      };
      if (dbl) { leaf(x0 + 14, 112); leaf(x0 + 130, 112); g.fillStyle = '#d9a640'; for (const xx of [x0 + 112, x0 + 144]) { g.beginPath(); g.arc(xx, 265, 11, 0, TAU); g.lineWidth = 5; g.strokeStyle = '#d9a640'; g.stroke(); } }
      else leaf(x0 + 18, 220);
    };
    door(512, false); door(768, true);
    // نافذة خشبية بمشربية
    g.fillStyle = '#3c2614'; g.fillRect(512, 512, 256, 256); g.fillStyle = '#2f6f74'; g.fillRect(526, 526, 108, 228); g.fillRect(646, 526, 108, 228);
    g.strokeStyle = '#1d3f42'; g.lineWidth = 4; for (let k = 0; k < 14; k++) { g.beginPath(); g.moveTo(526, 526 + k * 18); g.lineTo(754, 526 + k * 18 + 60); g.stroke(); g.beginPath(); g.moveTo(754, 526 + k * 18); g.lineTo(526, 526 + k * 18 + 60); g.stroke(); }
    g.fillStyle = '#c69a52'; g.fillRect(560, 820, 120, 120); g.fillStyle = '#e8c070'; g.fillRect(570, 830, 50, 50);
    // مظلّة مخطّطة
    for (let x = 0; x < 512; x += 64) { g.fillStyle = (x / 64) % 3 === 0 ? '#c42a2a' : (x / 64) % 3 === 1 ? '#f3e7cc' : '#1f7a46'; g.fillRect(x, 512, 64, 230); }
    g.clearRect(0, 742, 512, 26); for (let x = 0; x < 512; x += 32) { g.fillStyle = (Math.floor(x / 64)) % 3 === 0 ? '#c42a2a' : Math.floor(x / 64) % 3 === 1 ? '#f3e7cc' : '#1f7a46'; g.beginPath(); g.arc(x + 16, 742, 16, 0, PI); g.fill(); }
    // خيمة بدوية
    for (let y = 514; y < 766; y += 28) { g.fillStyle = ((y - 514) / 28) % 3 === 0 ? '#2a1d18' : ((y - 514) / 28) % 3 === 1 ? '#8e2a20' : '#e9dcc0'; g.fillRect(770, y, 252, 28); }
    // وسائد
    g.fillStyle = '#b5232c'; g.fillRect(0, 768, 512, 256); for (let x = 0; x < 512; x += 64) for (let y = 768; y < 1024; y += 64) { g.fillStyle = '#f0b33a'; g.beginPath(); g.moveTo(x + 32, y + 8); g.lineTo(x + 56, y + 32); g.lineTo(x + 32, y + 56); g.lineTo(x + 8, y + 32); g.fill(); g.fillStyle = '#1e3d6b'; g.fillRect(x + 26, y + 26, 12, 12); }
    grain(g, DEC.W, DEC.H, 14);
    // ثقوب الحافة المتموجة للمظلة شفافة: نستخدم alphaTest
    const im = g.getImageData(0, 742, 512, 26); for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3] < 250) im.data[i + 3] = 0; g.putImageData(im, 0, 742);
    return mkTex(c);
  })();

  const dotTex = (() => { const [c, g] = mkCanvas(64, 64); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; })();
  const cloudTex = (() => {
    const [c, g] = mkCanvas(512, 256);
    for (let i = 0; i < 46; i++) { const x = R(70, 442), y = R(110, 175) - Math.sin((x - 70) / 372 * PI) * R(10, 55), r = R(26, 62); const gr = g.createRadialGradient(x, y - r * 0.3, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(244,240,236,0.55)'); gr.addColorStop(1, 'rgba(230,226,226,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    return new THREE.CanvasTexture(c);
  })();

  // ── المواد ─────────────────────────────────────────────────
  const U = { time: { value: 0 } };
  const MU = { sky: { value: col('#cfe0ea') }, sunCol: { value: col('#ffd9a8') }, sunDir: { value: new Vector3(0.55, 0.62, -0.36).normalize() }, fogCol: { value: col('#f0d0a0') } };
  const NOISE_GLSL = `
    float wHash(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    float wNoise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
      return mix(mix(mix(wHash(i),wHash(i+vec3(1,0,0)),f.x),mix(wHash(i+vec3(0,1,0)),wHash(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(wHash(i+vec3(0,0,1)),wHash(i+vec3(1,0,1)),f.x),mix(wHash(i+vec3(0,1,1)),wHash(i+vec3(1,1,1)),f.x),f.y),f.z); }`;
  function patch(mat, { wave = false, grainAmt = 0.22, gs = 1.2, strata = false } = {}) {
    mat.onBeforeCompile = sh => {
      sh.uniforms.uTime = U.time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float uTime; varying vec3 vWp;${wave ? '\nattribute vec3 wave;' : ''}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          ${wave ? `{ vec4 w0 = modelMatrix * vec4(transformed, 1.0); float ph = w0.x * 0.21 + w0.z * 0.13;
            transformed.x += wave.x * (sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.9 + ph * 1.7) * 0.22);
            transformed.z += wave.x * sin(uTime * 1.05 + ph * 0.8) * 0.4;
            transformed += objectNormal * wave.y * (sin(uTime * 7.0 - wave.y * 14.0 + ph) * 0.7 + sin(uTime * 11.0 - wave.y * 22.0) * 0.3);
            transformed.y += wave.z * sin(uTime * 1.25 + w0.z * 0.11 + w0.x * 0.05) * 0.16; }` : ''}`)
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;' + (strata ? '\nvWn = normalize(mat3(modelMatrix) * objectNormal);' : ''));
      if (strata) sh.vertexShader = sh.vertexShader.replace('varying vec3 vWp;', 'varying vec3 vWp; varying vec3 vWn;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWp;' + (strata ? 'varying vec3 vWn;' : '') + NOISE_GLSL)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float gN = wNoise(vWp * ${gs.toFixed(2)}) * 0.6 + wNoise(vWp * ${(gs * 3.7).toFixed(2)}) * 0.4;
          diffuseColor.rgb *= ${(1 - grainAmt * 0.5).toFixed(3)} + ${grainAmt.toFixed(3)} * gN;${strata ? `
          float stp = smoothstep(0.35, 0.8, 1.0 - abs(normalize(vWn).y));
          float bnd = sin(vWp.y * 0.9 + wNoise(vWp * vec3(0.05, 0.3, 0.05)) * 5.0) * 0.5 + 0.5;
          diffuseColor.rgb *= 1.0 - stp * (0.28 * smoothstep(0.55, 0.9, bnd) - 0.1 * smoothstep(0.3, 0.0, bnd) + 0.12 * (wNoise(vWp * vec3(0.6, 0.15, 0.6)) - 0.5));` : ''}`);
    };
    mat.customProgramCacheKey = () => 'wld' + (wave ? 1 : 0) + grainAmt + gs + strata;
    return mat;
  }
  const M = {
    terrain: patch(new THREE.MeshLambertMaterial({ vertexColors: true }), { grainAmt: 0.28, gs: 0.9, strata: true }),
    props: patch(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }), { wave: true, grainAmt: 0.2, gs: 1.6 }),
    far: patch(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }), { wave: true, grainAmt: 0.12, gs: 0.8 }),
    decal: patch(new THREE.MeshLambertMaterial({ vertexColors: true, map: decalTex, side: THREE.DoubleSide, alphaTest: 0.5 }), { wave: true, grainAmt: 0.06, gs: 2 }),
    path: patch(new THREE.MeshLambertMaterial({ vertexColors: true, map: pathTex }), { grainAmt: 0.1, gs: 0.5 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    halo: new THREE.PointsMaterial({ map: dotTex, size: 1.3, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  };
  function makeWater(deep, shallow, flow, waveAmt, opacity) {
    const uni = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uDeep: { value: col(deep) }, uShallow: { value: col(shallow) }, uFlow: { value: new THREE.Vector2(...flow) }, uWave: { value: waveAmt }, uOpacity: { value: opacity } }]);
    Object.assign(uni, { uTime: U.time, uSky: MU.sky, uSunCol: MU.sunCol, uSunDir: MU.sunDir });
    return new THREE.ShaderMaterial({
      uniforms: uni, fog: true, transparent: opacity < 1, depthWrite: opacity >= 1,
      vertexShader: `#include <common>
        #include <fog_pars_vertex>
        uniform float uTime, uWave; varying vec3 vW;
        void main(){ vec4 wp = modelMatrix * vec4(position, 1.0);
          wp.y += (sin(wp.x * 0.31 + uTime * 1.5) + sin(wp.z * 0.23 + wp.x * 0.11 + uTime * 1.1)) * 0.06 * uWave;
          vW = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `#include <common>
        #include <fog_pars_fragment>
        uniform float uTime, uOpacity, uWave; uniform vec2 uFlow; uniform vec3 uDeep, uShallow, uSky, uSunCol, uSunDir; varying vec3 vW;
        void main(){ vec2 p = vW.xz * 0.9 - uFlow * uTime;
          float a = sin(p.x * 1.7 + p.y * 0.9 + uTime * 1.3), b = sin(p.y * 2.3 - p.x * 0.6 + uTime * 1.7), c = sin((p.x + p.y) * 3.3 - uTime * 2.2), e = sin(p.x * 6.1 - p.y * 4.7 + uTime * 3.0);
          vec3 n = normalize(vec3(a * 0.13 + c * 0.07 + e * 0.03, 1.0, b * 0.13 + c * 0.05 - e * 0.03));
          vec3 V = normalize(cameraPosition - vW);
          float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
          vec3 colr = mix(uShallow, uDeep, clamp(0.5 + (a + b) * 0.18, 0.0, 1.0));
          colr = mix(colr, uSky * 1.05, clamp(fres * 0.85, 0.0, 0.8));
          vec3 H = normalize(normalize(uSunDir) + V); float sp = pow(max(dot(n, H), 0.0), 160.0);
          colr += uSunCol * sp * 2.2 + vec3(1.0) * smoothstep(0.86, 1.0, c * e) * 0.18;
          gl_FragColor = vec4(colr, uOpacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
  }
  const WATER = {
    stream: makeWater('#2f7d86', '#7cc6c0', [0, -1.2], 0, 0.86),
    pool: makeWater('#1f6878', '#6ab8b4', [0.15, 0.1], 0.3, 0.9),
    sea: makeWater('#14607e', '#3fa3b0', [0.2, 0.35], 1, 1),
  };

  // ── أداة دمج الهندسة ───────────────────────────────────────
  const _m = new Matrix4(), _q = new Quaternion(), _e = new Euler(), _p = new Vector3(), _s = new Vector3(), _v = new Vector3(), _n = new Vector3(), _nm = new Matrix3();
  const WHITE = col('#ffffff');
  class Builder {
    constructor(uv) { this.P = []; this.N = []; this.C = []; this.W = []; this.UV = uv ? [] : null; this.count = 0; }
    add(g, m, color, wave, uvr) {
      const pos = g.attributes.position.array, nor = g.attributes.normal.array, uv = g.attributes.uv && g.attributes.uv.array, n = pos.length / 3;
      _nm.getNormalMatrix(m);
      const cf = typeof color === 'function', wf = typeof wave === 'function';
      let c = cf ? null : (color || WHITE), w = wf ? null : (wave || null);
      const ax = m.elements[12], guard = Math.abs(ax) >= 3.6 ? Math.sign(ax) : 0; // حارس: لا شيء يدخل حيّز المسار
      for (let i = 0; i < n; i++) {
        const lx = pos[i * 3], ly = pos[i * 3 + 1], lz = pos[i * 3 + 2];
        _v.set(lx, ly, lz).applyMatrix4(m); if (guard && _v.y > 0.02 && _v.y < 4.6 && _v.x * guard < 3.6) _v.x = guard * 3.6; this.P.push(_v.x, _v.y, _v.z);
        _n.set(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]).applyMatrix3(_nm).normalize(); this.N.push(_n.x, _n.y, _n.z);
        if (cf) c = color(lx, ly, lz); this.C.push(c.r, c.g, c.b);
        if (wf) w = wave(lx, ly, lz); if (w) this.W.push(w[0], w[1], w[2]); else this.W.push(0, 0, 0);
        if (this.UV) { const u = uv ? uv[i * 2] : 0, vv = uv ? uv[i * 2 + 1] : 0; this.UV.push(uvr[0] + u * uvr[2], uvr[1] + vv * uvr[3]); }
      }
      this.count += n;
    }
    mesh(mat, cast, recv) {
      if (!this.count) return null;
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(new Float32Array(this.P), 3));
      g.setAttribute('normal', new BufferAttribute(new Float32Array(this.N), 3));
      g.setAttribute('color', new BufferAttribute(new Float32Array(this.C), 3));
      g.setAttribute('wave', new BufferAttribute(new Float32Array(this.W), 3));
      if (this.UV) g.setAttribute('uv', new BufferAttribute(new Float32Array(this.UV), 2));
      g.computeBoundingSphere();
      const me = new Mesh(g, mat); me.castShadow = !!cast; me.receiveShadow = !!recv; me.matrixAutoUpdate = false;
      this.P = this.N = this.C = this.W = this.UV = null; return me;
    }
  }
  const mat4 = (x, y, z, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0, parent = null) => {
    _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    if (parent) _m.premultiply(parent); return _m;
  };
  const frame = (x, y, z, ry) => new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(0, ry, 0)), new Vector3(1, 1, 1));
  const _up = new Vector3(0, 1, 0), _dir = new Vector3(), _qq = new Quaternion();
  // أسطوانة بين نقطتين
  function seg(b, ax, ay, az, bx, by, bz, r, c, segs = 6, top = 1, wave = null) {
    _dir.set(bx - ax, by - ay, bz - az); const len = _dir.length(); _dir.divideScalar(len || 1);
    _qq.setFromUnitVectors(_up, _dir); _m.compose(_p.set(ax, ay, az), _qq, _s.set(r, len, r));
    b.add(cylG(segs, top, true), _m, c, wave);
  }

  // ── المقاطع (chunks) ───────────────────────────────────────
  const chunks = [];
  for (let i = 0; i < NCH; i++) chunks.push({ z0: Z0 + i * CH, z1: Z0 + (i + 1) * CH, p: new Builder(), f: new Builder(), d: new Builder(true), g: new Builder(), w: new Builder(), halo: [], group: new THREE.Group() });
  const at = z => chunks[clamp(Math.floor((z - Z0) / CH), 0, NCH - 1)];
  const pb = (S, x) => (Math.abs(x) < 34 ? S.p : S.f);
  const reserved = [];
  const reserve = (x0, x1, z0, z1) => reserved.push([Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1)]);
  const free = (x, z, r = 0.5) => { if (Math.abs(x) < 4.5 + r * 0.5) return false; for (const q of reserved) if (x > q[0] - r && x < q[1] + r && z > q[2] - r && z < q[3] + r) return false; return true; };

  // ── معالم ثابتة لكل صف ────────────────────────────────────
  const FEAT = {
    falaj: grade === 1 ? [[36, 425], [860, 1045]] : grade === 4 ? [[850, 1045]] : grade === 3 ? [[860, 1045]] : [],
    wb: 330, rb0: 475, rb1: 565, c0: 680, c1: 792, zw: 318,
  };
  const falajAt = z => FEAT.falaj.some(([a, b]) => z >= a - 2 && z <= b + 2);

  // ── التضاريس: الارتفاع واللون لكل مرحلة ──────────────────
  const ridge = (x, z) => { const a = 1 - Math.abs(vnoise(x, z) * 2 - 1), b = 1 - Math.abs(vnoise(x * 2.1 + 3, z * 2.1) * 2 - 1); return a * a * 0.65 + b * b * 0.35; };
  const mtn = (x, z, d, a, Hh) => sm(a, a + 70, d) * Hh * (0.4 + 0.6 * fbm(x * 0.012 + 3, z * 0.012) + 0.35 * ridge(x * 0.035, z * 0.035));
  const rug = (x, z, d, a, Hh) => sm(a, a + 6, d) * Hh * ridge(x * 0.09, z * 0.09);
  const dune = (x, z, A) => { const ph = x * 0.065 + z * 0.042 + 3.2 * fbm(x * 0.008, z * 0.008); const r = 1 - Math.abs(Math.sin(ph)); return A * (Math.pow(r, 1.6) * 0.85 + 0.35 * fbm(x * 0.03, z * 0.03)); };
  const gorge = (z, a, b) => sm(a - 3, a + 2, z) * (1 - sm(b - 2, b + 3, z));
  const terr = (d, w, hstep) => { const u = d / w, f = Math.floor(u); return hstep * (f + sm(0.8, 1, u - f)); };
  const PR = {
    village: { h: (x, z, s, d) => 0.3 * fbm(x * 0.15, z * 0.15) * sm(1, 8, d) + sm(20, 60, d) * 3 * fbm(x * 0.04, z * 0.04) + mtn(x, z, d, 45, 70), path: 0, tint: '#ffffff', g: ['#d4ad7b', '#c29467'], green: '#7d8f3c', gAmt: 0.55, rock: ['#a9805c', '#8c6b52'], rockH: 9 },
    wadi: {
      h: (x, z, s, d) => { let h; if (s > 0) h = -2.4 * sm(4, 9, d) * (1 - sm(28, 38, d)) + sm(30, 75, d) * 60 * (0.55 + 0.6 * fbm(x * 0.02, z * 0.02)) + 0.4 * fbm(x * 0.2, z * 0.2) * sm(3, 8, d); else h = sm(2, 30, d) * 9 * fbm(x * 0.05, z * 0.05) + rug(x, z, d, 6, 6) + mtn(x, z, d, 25, 60); return h - 2.7 * Math.exp(-Math.pow((z - FEAT.wb) / 6, 2)) * sm(0, 2.5, d) * (1 - sm(30, 50, d)); },
      path: 0, tint: '#f4eee6', g: ['#c8ae88', '#b09878'], green: '#5f8a34', gAmt: 0.7, rock: ['#9d7d63', '#7f6552'], rockH: 6, low: '#8f9a74', lowH: -1.2,
    },
    mountain: { h: (x, z, s, d) => sm(0.5, 9, d) * (d * 0.5 + 5) * (0.6 + 0.7 * fbm(x * 0.05, z * 0.05)) + rug(x, z, d, 3, 7) + mtn(x, z, d, 20, 75), path: 3, tint: '#f2e4d4', g: ['#b49473', '#9c7e62'], green: '#7a7e44', gAmt: 0.15, rock: ['#9a7a64', '#6f5a4c'], rockH: 3, rockS: 0.45 },
    desert: { h: (x, z, s, d) => sm(1, 9, d) * dune(x, z, 3.5 + d * 0.15) + sm(80, 140, d) * 22, path: 2, tint: '#ffffff', g: ['#e8bc80', '#d9a066'], rock: ['#d39a5c', '#c08850'], rockH: 99, rockS: 9, dunes: true },
    oasis: { h: (x, z, s, d) => 0.3 * fbm(x * 0.15, z * 0.15) * sm(1, 6, d) + mtn(x, z, d, 60, 55), path: 0, tint: '#ffffff', g: ['#c9a476', '#b89366'], green: '#6a8a38', gAmt: 0.85, rock: ['#a07b5a', '#86684f'], rockH: 9 },
    house: { h: (x, z, s, d) => 0.2 * fbm(x * 0.15, z * 0.15) * sm(1, 6, d) + (grade === 2 && s < 0 ? -sm(10, 40, d) * 5 : mtn(x, z, d, 40, grade === 3 ? 90 : 55)), path: 1, tint: '#ffffff', g: grade === 2 ? ['#e6cfa0', '#d8bd8c'] : grade === 3 ? ['#a99a82', '#9a8a72'] : ['#cfa877', '#bf9767'], green: '#62903a', gAmt: grade === 2 ? 0.2 : 0.6, rock: ['#a07c5c', '#84664e'], rockH: 9, wet: grade === 2 },
    beach: { h: (x, z, s, d) => s < 0 ? -sm(8, 40, d) * 5 + 0.25 * fbm(x * 0.2, z * 0.2) * sm(1, 6, d) : 0.4 * fbm(x * 0.12, z * 0.12) * sm(2, 8, d) + sm(25, 60, d) * 5 * fbm(x * 0.04, z * 0.04) + mtn(x, z, d, 70, 55), path: 2, tint: '#fff8ee', g: ['#ead2a2', '#dcc08c'], green: '#8a9a50', gAmt: 0.25, rock: ['#9a7a62', '#7d6352'], rockH: 10, wet: true },
    fishing: { h: (x, z, s, d) => s < 0 ? -sm(10, 42, d) * 5 + 0.2 * fbm(x * 0.2, z * 0.2) * sm(1, 6, d) : 0.3 * fbm(x * 0.12, z * 0.12) * sm(2, 8, d) + mtn(x, z, d, 50, 60), path: 2, tint: '#f2e8da', g: ['#e2c896', '#d2b482'], green: '#8a9a50', gAmt: 0.2, rock: ['#9a7a62', '#7d6352'], rockH: 10, wet: true },
    souq: { h: (x, z, s, d) => sm(30, 140, d) * 30 * fbm(x * 0.02, z * 0.02), path: 1, tint: '#fff4e6', g: ['#d2b58c', '#c4a47c'], rock: ['#a08060', '#887060'], rockH: 12 },
    port: { h: (x, z, s, d) => s < 0 ? -4.5 * sm(1.6, 2.2, d) : 0.2 * fbm(x * 0.1, z * 0.1) * sm(2, 8, d) + mtn(x, z, d, 45, 65), path: 1, tint: '#ece6de', g: ['#c8b496', '#b8a284'], rock: ['#8d7562', '#6f5a4c'], rockH: 8 },
    corniche: { h: (x, z, s, d) => s < 0 ? -4 * sm(4.8, 5.4, d) : 0.25 * fbm(x * 0.1, z * 0.1) * sm(2, 8, d) + sm(26, 70, d) * 70 * (0.5 + 0.6 * fbm(x * 0.02, z * 0.02)), path: 1, tint: '#f6efe8', g: ['#b8b48a', '#a3a878'], green: '#5d9a3a', gAmt: 0.9, rock: ['#8a6e5c', '#6c5648'], rockH: 6 },
    rim: { h: (x, z, s, d) => s > 0 ? -150 * sm(2.5, 9, d) + sm(95, 130, d) * 175 * (0.6 + 0.5 * fbm(x * 0.03, z * 0.03)) + 6 * fbm(x * 0.06, z * 0.06) * sm(9, 30, d) : sm(1, 25, d) * Math.min(80, d * 1.3) * (0.55 + 0.6 * fbm(x * 0.04, z * 0.04)) + mtn(x, z, d, 40, 70), path: 3, tint: '#ebe5df', g: ['#a99682', '#968470'], green: '#6f7a46', gAmt: 0.2, rock: ['#ae8f74', '#6c5546'], rockH: 2, rockS: 0.45, canyon: true },
    juniper: { h: (x, z, s, d) => s > 0 ? -sm(3, 40, d) * 30 - sm(40, 60, d) * 110 + sm(100, 135, d) * 160 * (0.6 + 0.5 * fbm(x * 0.03, z * 0.03)) + 2 * fbm(x * 0.1, z * 0.1) * sm(2, 8, d) : sm(2, 40, d) * 26 * (0.5 + fbm(x * 0.05, z * 0.05)) + mtn(x, z, d, 35, 70), path: 3, tint: '#f0e8de', g: ['#a69078', '#937e68'], green: '#6c7a44', gAmt: 0.35, rock: ['#9c7a62', '#7a6050'], rockH: 14, rockS: 0.7, canyon: true },
    bridge: { h: (x, z, s, d) => { const base = s > 0 ? -150 * sm(2.5, 9, d) + sm(95, 130, d) * 175 * (0.6 + 0.5 * fbm(x * 0.03, z * 0.03)) : sm(1, 25, d) * Math.min(80, d * 1.3) * (0.55 + 0.6 * fbm(x * 0.04, z * 0.04)) + mtn(x, z, d, 40, 70); const jz = (vnoise(x * 0.07, 7.7) - 0.5) * 14 * sm(4, 14, d), gp = gorge(z + jz, FEAT.rb0, FEAT.rb1) * (s > 0 ? 1 : 1); return base * (1 - gp) + gp * (-150 + 8 * fbm(x * 0.05, z * 0.05)); }, path: 3, tint: '#ebe5df', g: ['#a99682', '#968470'], green: '#6f7a46', gAmt: 0.2, rock: ['#ae8f74', '#6c5546'], rockH: 2, rockS: 0.45, canyon: true },
    cave: { h: (x, z, s, d) => { const tin = sm(FEAT.c0 - 3, FEAT.c0 + 1, z) * (1 - sm(FEAT.c1 - 1, FEAT.c1 + 3, z)), st = 0.4 + 3.6 * tin; return sm(st, st + 4.6, d) * (30 + 25 * fbm(x * 0.04, z * 0.04)) * (0.35 + 0.65 * sm(FEAT.c0 - 70, FEAT.c0 - 5, z) * (1 - sm(FEAT.c1 + 5, FEAT.c1 + 70, z))) + mtn(x, z, d, 30, 60); }, path: 3, tint: '#e0d4c6', g: ['#9c8670', '#8a7660'], green: '#6f7a46', gAmt: 0.15, rock: ['#977560', '#735a4a'], rockH: 2, rockS: 0.4 },
    terraces: { h: (x, z, s, d) => s > 0 ? (d < 54 ? -terr(d, 6, 2.4) : -terr(54, 6, 2.4) - (d - 54) * 4) * (1 - sm(100, 130, d)) + sm(100, 130, d) * (40 + 60 * fbm(x * 0.03, z * 0.03)) : (d < 40 ? terr(d, 6, 2.0) : terr(40, 6, 2.0) + (d - 40) * 0.9 * (0.6 + 0.6 * fbm(x * 0.04, z * 0.04))), path: 1, tint: '#efe6d8', g: ['#8f8a5a', '#7f7a50'], green: '#5d8a34', gAmt: 0, rock: ['#a08a72', '#86705c'], rockH: 99, rockS: 0.55, crops: true },
    khareef: { h: (x, z, s, d) => sm(2, 30, d) * (5 + d * 0.2) * (0.45 + 0.8 * fbm(x * 0.025, z * 0.025)), path: 0, tint: '#d8d4b0', g: ['#5c8c3e', '#4a7c36'], green: '#7ea455', gAmt: 0.8, rock: ['#8a7a68', '#6e6458'], rockH: 99, rockS: 1.1, lush: true },
    waterfall: { h: (x, z, s, d) => { if (s < 0) { const pool = Math.exp(-Math.pow((z - FEAT.zw) / 13, 2)); return sm(12, 19, d) * 40 * (0.85 + 0.3 * fbm(x * 0.05, z * 0.05)) * (1 - 0.15 * pool) + sm(19, 60, d) * 25 * fbm(x * 0.03, z * 0.03) - 1.8 * pool * sm(1.5, 4, d) * (1 - sm(11, 13, d)); } return sm(2, 30, d) * (5 + d * 0.22) * (0.45 + 0.8 * fbm(x * 0.025, z * 0.025)); }, path: 0, tint: '#d8d4b0', g: ['#588a3c', '#467a34'], green: '#7ea455', gAmt: 0.7, rock: ['#7f7466', '#5f574e'], rockH: 99, rockS: 0.9, lush: true, low: '#5f7a5a', lowH: -0.6 },
    forest: { h: (x, z, s, d) => sm(2, 35, d) * (4 + d * 0.18) * (0.5 + 0.8 * fbm(x * 0.03, z * 0.03)), path: 0, tint: '#c8c8a0', g: ['#4a7a32', '#3c6a2c'], green: '#6a9446', gAmt: 0.6, rock: ['#7a6c5e', '#5e554c'], rockH: 99, rockS: 1.1, lush: true },
    dunes: { h: (x, z, s, d) => sm(1, 12, d) * dune(x, z, 4 + d * 0.17) + sm(80, 140, d) * 30, path: 2, tint: '#ffe6cc', g: ['#eda866', '#dc8e4e'], rock: ['#c87f45', '#b06e3c'], rockH: 99, rockS: 9, dunes: true },
  };
  for (const k in PR) { const p = PR[k]; p.cg = p.g.map(col); p.cgreen = p.green ? col(p.green) : null; p.crock = p.rock.map(col); p.ctint = col(p.tint); p.clow = p.low ? col(p.low) : null; }

  const BW = 24;
  function weights(z, bw = BW) {
    const out = [];
    for (let i = 0; i < 6; i++) {
      const lo = i === 0 ? -1e9 : stages[i].z0, hi = i === 5 ? 1e9 : stages[i].z1;
      const w = sm(lo - bw, lo + bw, z) * (1 - sm(hi - bw, hi + bw, z));
      if (w > 0.001) out.push([i, w]);
    }
    return out;
  }
  function Hraw(x, z) {
    const s = x < 0 ? -1 : 1, d = Math.max(0, Math.abs(x) - PW); let h = 0, tw = 0;
    for (const [i, w] of weights(z)) { h += w * PR[KEYS[i]].h(x, z, s, d); tw += w; }
    if (grade === 3 && z > FEAT.rb0 - 0.5 && z < FEAT.rb1 + 0.5) return h / tw;
    return (h / tw) * Math.min(1, d / 0.8);
  }
  const gy = (x, z) => Hraw(x, z);
  const _c1 = new Color(), _c2 = new Color(), _c3 = new Color();
  function tcol(p, x, z, h, d, slope, n, out) {
    out.copy(p.cg[0]).lerp(p.cg[1], n);
    if (p.cgreen) { const g = sm(0.5, 0.68, fbm(x * 0.05 + 7, z * 0.05)) * p.gAmt * (1 - sm(20, 60, d)) * (1 - sm(4, 14, h)); out.lerp(p.cgreen, g); }
    if (p.lush) out.lerp(_c3.set(0x9fb85a), sm(0.6, 0.8, fbm(x * 0.09, z * 0.09)) * 0.4);
    if (p.dunes) { const ph = x * 0.065 + z * 0.042 + 3.2 * fbm(x * 0.008, z * 0.008); out.multiplyScalar(0.8 + 0.34 * (0.5 + 0.5 * Math.cos(ph) * Math.sign(Math.sin(ph)) * (x < 0 ? -1 : 1))); }
    if (p.crops && slope < 0.8 && d > 1) { const row = Math.floor(d / 6); _c3.set(row % 3 === 0 ? 0x6f9a3a : row % 3 === 1 ? 0x8aa848 : 0x5a8a34); _c3.multiplyScalar(0.85 + 0.25 * (0.5 + 0.5 * Math.sin(z * 1.6 + row))); out.copy(_c3); }
    const rh = p.rockH, rs = p.rockS || 0.8;
    const rk = Math.max(sm(rs, rs + 0.5, slope), sm(rh, rh + 10, Math.abs(h)) * (p.canyon || h > 0 ? 1 : 0));
    if (rk > 0) { _c1.copy(p.crock[0]).lerp(p.crock[1], sm(-0.4, 0.4, Math.sin(h * 0.45 + n * 3))).multiplyScalar(0.72 + 0.4 * vnoise(x * 0.25 + h * 0.3, z * 0.25)); if (p.canyon && h < -60) _c1.lerp(_c3.set(0x6d7048), sm(-110, -145, h) * 0.6); out.lerp(_c1, rk); }
    if (p.clow && h < p.lowH + 0.6) out.lerp(p.clow, sm(p.lowH + 0.6, p.lowH - 0.6, h));
    if (p.wet && h < 0.15 && h > SEA - 1.5) out.multiplyScalar(0.78 + 0.22 * sm(SEA - 0.2, 0.15, h));
    if (d < 1.4) out.lerp(_c2.copy(out).multiplyScalar(0.8), (1 - d / 1.4) * 0.6);
    return out;
  }

  // ── شبكة التضاريس لكل مقطع ────────────────────────────────
  const DX = [0, 0.8, 1.6, 2.5, 3.5, 4.6, 5.8, 7, 8.5, 10, 11.5, 13, 14.5, 16, 17.5, 19, 20.5, 22, 23.5, 25, 26.5, 28, 30, 32, 34, 36, 38.5, 41, 44, 47, 51, 55, 60, 66, 73, 82, 93, 106, 122, 142];
  function buildTerrain(ch) {
    const rows = Math.round(CH / 2) + 1, cols = DX.length, pos = [], colr = [], idx = [];
    const tmp = new Color();
    for (const s of [-1, 1]) {
      const base = pos.length / 3, hs = [];
      for (let r = 0; r < rows; r++) { const z = ch.z0 + (r * CH) / (rows - 1); for (let c = 0; c < cols; c++) hs.push(Hraw(s * (PW + DX[c]), z)); }
      for (let r = 0; r < rows; r++) {
        const z = ch.z0 + (r * CH) / (rows - 1), ws = weights(z);
        for (let c = 0; c < cols; c++) {
          const d = DX[c], x = s * (PW + d), h = hs[r * cols + c];
          const hx = hs[r * cols + Math.min(cols - 1, c + 1)] - hs[r * cols + Math.max(0, c - 1)], dxx = DX[Math.min(cols - 1, c + 1)] - DX[Math.max(0, c - 1)];
          const hz = hs[Math.min(rows - 1, r + 1) * cols + c] - hs[Math.max(0, r - 1) * cols + c];
          const slope = Math.hypot(hx / dxx, hz / 4) * (Math.abs(hx / dxx) > Math.abs(hz / 4) ? Math.sign(hx) * s : 1);
          pos.push(x, h, z);
          const n = fbm(x * 0.08, z * 0.08); let rr = 0, gg = 0, bb = 0, tw = 0;
          for (const [i, w] of ws) { tcol(PR[KEYS[i]], x, z, h, d, Math.abs(slope), n, tmp); rr += tmp.r * w; gg += tmp.g * w; bb += tmp.b * w; tw += w; }
          colr.push(rr / tw, gg / tw, bb / tw);
        }
      }
      for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
        const a = base + r * cols + c, b = a + 1, cc = a + cols, dd = cc + 1;
        if (s > 0) idx.push(a, cc, b, b, cc, dd); else idx.push(a, b, cc, b, dd, cc);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); g.setIndex(idx);
    g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new Mesh(g, M.terrain); m.receiveShadow = true; m.matrixAutoUpdate = false; return m;
  }
  // شريط المسار المستوي (y = 0)
  function buildPath(ch) {
    const pos = [], uv = [], colr = [], idx = [];
    const add = (za, zb, k, tint) => {
      const n = Math.max(1, Math.ceil((zb - za) / 4)), u0 = (k + 0.004) / 4, u1 = (k + 0.996) / 4, base = pos.length / 3;
      for (let i = 0; i <= n; i++) { const z = za + ((zb - za) * i) / n; pos.push(-PW, 0, z, PW, 0, z); uv.push(u0, z / 14.8, u1, z / 14.8); colr.push(tint.r, tint.g, tint.b, tint.r, tint.g, tint.b); }
      for (let i = 0; i < n; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    };
    for (let i = 0; i < 6; i++) {
      const st = stages[i], lo = i === 0 ? -1e9 : st.z0, hi = i === 5 ? 1e9 : st.z1;
      let za = Math.max(ch.z0, lo), zb = Math.min(ch.z1, hi); if (zb <= za) continue;
      const p = PR[st.key];
      if (st.key === 'bridge') { // الجسر المعلّق يحلّ محلّ المسار
        if (za < FEAT.rb0) add(za, Math.min(zb, FEAT.rb0), p.path, p.ctint);
        if (zb > FEAT.rb1) add(Math.max(za, FEAT.rb1), zb, p.path, p.ctint);
        continue;
      }
      add(za, zb, p.path, p.ctint);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3)); g.setIndex(idx); g.computeBoundingSphere();
    const m = new Mesh(g, M.path); m.receiveShadow = true; m.matrixAutoUpdate = false; return m;
  }

  // ══════════════════ العناصر (props) ══════════════════
  const sway = (amp, h) => (lx, ly) => [amp * Math.pow(Math.max(0, ly) / h, 2), 0, 0];
  function palm(x, z, h = 7, o = {}) {
    const S = at(z), b = pb(S, x), y0 = (o.y ?? gy(x, z)) - 0.15;
    const lx = R(-0.13, 0.13) * h + (o.lean || 0), lz = R(-0.1, 0.1) * h, n = 7;
    const tc = J(PAL.trunk, 0.1), tc2 = J(PAL.trunk2, 0.1);
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, r = 0.25 - 0.08 * t0, a0 = t0 * h, a1 = t1 * h;
      seg(b, x + lx * t0 * t0, y0 + a0, z + lz * t0 * t0, x + lx * t1 * t1, y0 + a1, z + lz * t1 * t1, r, i % 2 ? tc : tc2, 6, 0.82, (u, v) => [0.16 * Math.pow(t0 + v * (t1 - t0), 2), 0, 0]);
    }
    const tx = x + lx, ty = y0 + h, tz = z + lz;
    b.add(G.ico, mat4(tx, ty, tz, 0.42, 0.5, 0.42), J(PAL.palmG, 0.1), [0.16, 0, 0]);
    const nf = Math.abs(x) > 34 ? 9 : 13, L = (o.frond || 3.3) * Math.pow(h / 7, 0.3), gA = J(PAL.palmG, 0.12), gB = J(PAL.palmG2, 0.12), gY = PAL.palmY;
    for (let i = 0; i < nf; i++) {
      const a = (i / nf) * TAU + R(-0.2, 0.2), up = i % 3 === 0 ? R(0.35, 0.7) : R(-0.15, 0.3), l = L * R(0.8, 1.1);
      b.add(i % 2 ? G.frond : G.frond2, mat4(tx, ty + 0.1, tz, l, l, l, a, 0, up), lx2 => (lx2 > 0.85 ? gY : lx2 > 0.4 ? gB : gA), lx2 => [0.16 + 0.3 * lx2, 0, 0]);
    }
    if (o.dates) for (let i = 0; i < 4; i++) { const a = i * 1.7 + R(0, 1); b.add(G.ico, mat4(tx + Math.cos(a) * 0.45, ty - 0.55, tz + Math.sin(a) * 0.45, 0.24, 0.42, 0.24, a), J(i % 2 ? col('#d9822b') : col('#b0521c'), 0.1), [0.16, 0, 0]); }
  }
  function bush(x, z, s = 1, o = {}) {
    const S = at(z), b = pb(S, x), y = (o.y ?? gy(x, z)) - 0.1, c = J(o.c || PAL.leaf, 0.12);
    const n = 2 + ((rnd() * 3) | 0);
    for (let i = 0; i < n; i++) b.add(G.ico, mat4(x + R(-0.6, 0.6) * s, y + R(0.35, 0.7) * s, z + R(-0.6, 0.6) * s, R(0.5, 0.85) * s, R(0.45, 0.7) * s, R(0.5, 0.85) * s, R(0, 3)), J(c, 0.1), [0.04 * s, 0, 0]);
    if (o.flowers) { const fc = o.fc || pick([PAL.pink, col('#f06aa8'), col('#c42a74'), col('#ffffff')]); for (let i = 0; i < 6 * s + 2; i++) b.add(G.ico, mat4(x + R(-0.9, 0.9) * s, y + R(0.5, 1.2) * s, z + R(-0.9, 0.9) * s, 0.16 * s, 0.14 * s, 0.16 * s, R(0, 3)), fc, [0.05 * s, 0, 0]); }
  }
  function rock(x, z, s = 1, c = null, o = {}) {
    const S = at(z), b = pb(S, x), y = (o.y ?? gy(x, z)) - 0.3 * s;
    b.add(G.dod, mat4(x, y + 0.4 * s, z, s * R(0.8, 1.3), s * R(0.5, 0.9), s * R(0.8, 1.2), R(0, 6), R(-0.3, 0.3), R(-0.3, 0.3)), J(c || PAL.rock, 0.1));
  }
  function grass(x, z, s = 1, c = null) {
    const S = at(z), b = pb(S, x), y = gy(x, z) - 0.05, gc = J(c || col('#8a9a48'), 0.15);
    for (let i = 0; i < 5; i++) b.add(coneG(4), mat4(x + R(-0.25, 0.25), y, z + R(-0.25, 0.25), 0.07 * s, R(0.5, 0.9) * s, 0.07 * s, R(0, 3), R(-0.4, 0.4), R(-0.4, 0.4)), gc, (lx, ly) => [0.1 * ly, 0, 0]);
  }
  function pot(b, F, x, y, z, s = 1) {
    const c = J(PAL.clay, 0.1);
    b.add(G.sph, mat4(x, y + 0.42 * s, z, 0.38 * s, 0.42 * s, 0.38 * s, 0, 0, 0, F), c);
    b.add(cylG(8, 1.2), mat4(x, y + 0.75 * s, z, 0.16 * s, 0.22 * s, 0.16 * s, 0, 0, 0, F), c);
  }
  function flagPole(x, z, h = 6, o = {}) {
    const S = at(z), y0 = o.y ?? gy(x, z), b = pb(S, x), sz = o.size || 1, ry = o.ry ?? (x < 0 ? -0.4 : PI + 0.4);
    b.add(cylG(6, 0.6), mat4(x, y0 - 0.2, z, 0.06, h + 0.2, 0.06), col('#e8e2d6'));
    b.add(G.sph, mat4(x, y0 + h + 0.05, z, 0.11, 0.11, 0.11), PAL.gold);
    S.d.add(G.flag, mat4(x, y0 + h - 0.08, z, 1.7 * sz, 0.95 * sz, 1, ry), WHITE, lx => [0, 0.12 * Math.pow(lx + 0.5, 1.4) * sz, 0], UV.flag);
  }
  function roofFlag(S, F, x, y, z, h = 2.5, ry = 0, sz = 1) {
    S.p.add(cylG(6, 0.6), mat4(x, y, z, 0.05, h, 0.05, 0, 0, 0, F), col('#e8e2d6'));
    S.d.add(G.flag, mat4(x, y + h - 0.05, z, 1.3 * sz, 0.72 * sz, 1, ry, 0, 0, F), WHITE, lx => [0, 0.1 * sz * Math.pow(lx + 0.5, 1.4), 0], UV.flag);
  }
  const FEST = [col('#ffffff'), PAL.red, PAL.green];
  function rope(S, b, ax, ay, az, bx, by, bz, sag, fn, step = 0.6, r = 0.025, c = PAL.dark) {
    const L = Math.hypot(bx - ax, bz - az, by - ay), n = Math.max(4, Math.round(L / 1.5));
    let px = ax, py = ay, pz = az;
    for (let i = 1; i <= n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + (by - ay) * t - sag * 4 * t * (1 - t); seg(b, px, py, pz, x, y, z, r, c, 4); px = x; py = y; pz = z; }
    if (fn) { const m = Math.floor(L / step); for (let i = 1; i < m; i++) { const t = i / m; fn(ax + (bx - ax) * t, ay + (by - ay) * t - sag * 4 * t * (1 - t), az + (bz - az) * t, i, Math.atan2(bx - ax, bz - az)); } }
  }
  function bunting(ax, ay, az, bx, by, bz, sag = 0.8) {
    const S = at((az + bz) / 2), b = pb(S, ax);
    rope(S, b, ax, ay, az, bx, by, bz, sag, (x, y, z, i, ang) => b.add(G.tri, mat4(x, y, z, 0.42, 0.55, 1, ang + PI / 2), FEST[i % 3], (lx, ly) => [0, -ly * 0.25, 0]), 0.55);
  }
  const BULB = [col('#ffd27a'), col('#ffb04a'), col('#fff0b0'), col('#ff7a5a'), col('#9dff9a')];
  function lights(ax, ay, az, bx, by, bz, sag = 0.7, halo = false) {
    const S = at((az + bz) / 2), b = pb(S, ax);
    rope(S, b, ax, ay, az, bx, by, bz, sag, (x, y, z, i) => { const c = BULB[i % BULB.length]; S.g.add(G.ico, mat4(x, y - 0.1, z, 0.09, 0.11, 0.09), new Color(c.r * 2.6, c.g * 2.6, c.b * 2.6)); if (halo && i % 2 === 0) S.halo.push(x, y - 0.1, z, c.r * 0.5, c.g * 0.42, c.b * 0.3); }, 0.7, 0.015);
  }
  function lantern(S, F, x, y, z, s = 1, hang = 0) {
    const b = S.p;
    if (hang) b.add(cylG(4), mat4(x, y + 0.55 * s, z, 0.015, hang, 0.015, 0, 0, 0, F), PAL.dark);
    b.add(G.pyr, mat4(x, y + 0.42 * s, z, 0.26 * s, 0.22 * s, 0.26 * s, 0, 0, 0, F), PAL.brass);
    b.add(G.box, mat4(x, y - 0.02 * s, z, 0.34 * s, 0.07 * s, 0.34 * s, 0, 0, 0, F), PAL.brass);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add(G.box, mat4(x + dx * 0.14 * s, y, z + dz * 0.14 * s, 0.03 * s, 0.44 * s, 0.03 * s, 0, 0, 0, F), PAL.brass);
    S.g.add(G.boxC, mat4(x, y + 0.2 * s, z, 0.24 * s, 0.34 * s, 0.24 * s, 0, 0, 0, F), new Color(3.2, 1.9, 0.7));
    _v.set(x, y + 0.2 * s, z); if (F) _v.applyMatrix4(F); S.halo.push(_v.x, _v.y, _v.z, 0.9, 0.55, 0.22);
  }
  // بيت عُماني طيني
  function house(x, z, ry, w, d, h, o = {}) {
    const S = at(z), y0 = (o.y ?? Math.min(gy(x, z), gy(x + 3, z + 3), gy(x - 3, z - 3))) - 0.05, F = frame(x, y0, z, ry), b = pb(S, x);
    const wc = J(o.c || (rnd() < 0.3 ? PAL.mud2 : PAL.mud), 0.06), wd = mixC(wc, PAL.dark, 0.18), wl = mixC(wc, WHITE, 0.25);
    reserve(x - Math.max(w, d) / 2 - 0.5, x + Math.max(w, d) / 2 + 0.5, z - Math.max(w, d) / 2 - 0.5, z + Math.max(w, d) / 2 + 0.5);
    b.add(G.box, mat4(0, -4, 0, w + 0.3, 4.35, d + 0.3, 0, 0, 0, F), wd);
    b.add(G.box, mat4(0, 0, 0, w, h, d, 0, 0, 0, F), wc);
    b.add(G.box, mat4(0, h - 0.62, 0, w + 0.12, 0.14, d + 0.12, 0, 0, 0, F), wl);
    const merl = (ww, dd, yy, F2) => {
      for (const [ax, az, len, rot] of [[0, dd / 2, ww, 0], [0, -dd / 2, ww, 0], [ww / 2, 0, dd, PI / 2], [-ww / 2, 0, dd, PI / 2]]) {
        const n = Math.max(2, Math.round(len / 0.8));
        for (let i = 0; i < n; i++) { const t = (i + 0.5) / n - 0.5; const px = ax + (rot ? 0 : t * len), pz = az + (rot ? t * len : 0); b.add(G.box, mat4(px, yy, pz, 0.36, 0.28, 0.36, 0, 0, 0, F2), wc); b.add(G.pyr, mat4(px, yy + 0.28, pz, 0.27, 0.32, 0.27, 0, 0, 0, F2), wc); }
      }
    };
    merl(w, d, h, F);
    const nb = Math.floor(w / 1.1);
    for (let i = 0; i < nb; i++) b.add(cylG(5), mat4(-w / 2 + 0.55 + i * 1.1, h - 0.95, d / 2 - 0.05, 0.08, 0.5, 0.08, 0, PI / 2, 0, F), PAL.wood);
    for (const sx of [-1, 1]) b.add(G.box, mat4(sx * (w / 2 - 0.4), h - 0.35, d / 2 + 0.3, 0.16, 0.12, 0.7, 0, 0, 0, F), PAL.wood2);
    if (o.door !== false) {
      const dw = o.big ? 2.6 : 1.35, dh = o.big ? 3.7 : 2.35;
      b.add(G.box, mat4(0, 0, d / 2, dw + 0.5, dh + 0.25, 0.16, 0, 0, 0, F), wl);
      b.add(G.pyr, mat4(0, dh + 0.2, d / 2, dw * 0.58, 0.7, 0.12, 0, 0, 0, F), wl);
      b.add(G.box, mat4(0, 0, d / 2 + 0.06, dw + 0.1, dh + 0.05, 0.08, 0, 0, 0, F), PAL.dark);
      S.d.add(G.plane, mat4(0, dh / 2, d / 2 + 0.11, dw, dh, 1, 0, 0, 0, F), WHITE, null, o.big ? UV.door2 : UV.door);
      b.add(G.box, mat4(0, -0.02, d / 2 + 0.25, dw + 1.2, 0.18, 0.7, 0, 0, 0, F), wd);
      if (o.lamps) for (const sx of [-1, 1]) lantern(S, F, sx * (dw / 2 + 0.55), dh * 0.72, d / 2 + 0.25, o.big ? 1.25 : 1);
    }
    const wins = w > 7 ? [-w * 0.32, w * 0.32] : [w * 0.3];
    const rows = h > 6 ? [1.4, 4.0] : [1.5];
    for (const wy of rows) for (const wx of wins) {
      if (o.door !== false && Math.abs(wx) < 1.4 && wy < 3) continue;
      b.add(G.box, mat4(wx, wy - 0.1, d / 2, 1.05, 1.45, 0.14, 0, 0, 0, F), wl);
      b.add(G.pyr, mat4(wx, wy + 1.33, d / 2, 0.6, 0.45, 0.1, 0, 0, 0, F), wl);
      S.d.add(G.plane, mat4(wx, wy + 0.6, d / 2 + 0.08, 0.8, 1.15, 1, 0, 0, 0, F), WHITE, null, UV.win);
    }
    if (o.upper) {
      const uw = w * 0.45, ud = d * 0.55, ux = -w / 2 + uw / 2 + 0.2, uz = -d / 2 + ud / 2 + 0.2, F2 = frame(0, h, 0, 0).premultiply(F);
      b.add(G.box, mat4(ux, 0, uz, uw, 2.6, ud, 0, 0, 0, F2), wc); merl(uw, ud, 2.6, frame(ux, 0, uz, 0).premultiply(F2));
      S.d.add(G.plane, mat4(ux + uw * 0.15, 1.3, uz + ud / 2 + 0.03, 0.7, 1.0, 1, 0, 0, 0, F2), WHITE, null, UV.win);
    }
    if (o.flag) roofFlag(S, F, w / 2 - 0.5, h, -d / 2 + 0.5, 2.8, ry > 0 ? 0.6 : -0.6);
    if (o.pots) { pot(b, F, -w / 2 + 0.8, 0, d / 2 + 0.7, R(0.8, 1.1)); if (rnd() < 0.6) pot(b, F, w / 2 - 0.8, 0, d / 2 + 0.6, R(0.7, 1)); }
    if (o.string) { const p1 = new Vector3(-w / 2, h + 0.2, d / 2 + 0.1).applyMatrix4(F), p2 = new Vector3(w / 2, h + 0.2, d / 2 + 0.1).applyMatrix4(F); lights(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, 0.6, true); }
    if (o.bunt) { const p1 = new Vector3(-w / 2, h - 0.2, d / 2 + 0.15).applyMatrix4(F), p2 = new Vector3(w / 2, h - 0.2, d / 2 + 0.15).applyMatrix4(F); bunting(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, 0.5); }
    return F;
  }
  function tower(S, b, F, x, z, r, h, c) {
    b.add(cylG(12, 0.92), mat4(x, -3, z, r, h + 3, r, 0, 0, 0, F), c);
    b.add(cylG(12), mat4(x, h - 0.2, z, r * 0.98, 0.3, r * 0.98, 0, 0, 0, F), mixC(c, WHITE, 0.2));
    const n = Math.round(r * 3.2);
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; b.add(G.box, mat4(x + Math.cos(a) * r * 0.86, h + 0.1, z + Math.sin(a) * r * 0.86, 0.45, 0.45, 0.45, -a, 0, 0, F), c); b.add(G.pyr, mat4(x + Math.cos(a) * r * 0.86, h + 0.55, z + Math.sin(a) * r * 0.86, 0.32, 0.4, 0.32, -a, 0, 0, F), c); }
    for (let k = 0; k < 4; k++) { const a = k * PI / 2 + 0.4; b.add(G.box, mat4(x + Math.cos(a) * r * 0.97, h * 0.55, z + Math.sin(a) * r * 0.97, 0.18, 0.9, 0.18, -a, 0, 0, F), PAL.dark); }
  }
  function fort(x, z, ry, sc = 1) {
    const S = at(z), y0 = Math.min(gy(x, z), gy(x - 10, z), gy(x + 10, z)) - 0.1, F = frame(x, y0, z, ry), b = pb(S, x), c = J(col('#d2ac7c'), 0.04);
    const W = 26 * sc, D = 22 * sc, Hh = 7 * sc;
    reserve(x - W * 0.75, x + W * 0.75, z - W * 0.75, z + W * 0.75);
    for (const [px, pz, sx, sz] of [[0, D / 2, W, 1.2], [0, -D / 2, W, 1.2], [W / 2, 0, 1.2, D], [-W / 2, 0, 1.2, D]]) {
      b.add(G.box, mat4(px, -3, pz, sx, Hh + 3, sz, 0, 0, 0, F), c);
      const n = Math.round(Math.max(sx, sz) / 0.9);
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n - 0.5; b.add(G.pyr, mat4(px + (sx > sz ? t * sx : 0), Hh, pz + (sz > sx ? t * sz : 0), 0.35, 0.55, 0.35, 0, 0, 0, F), c); }
    }
    tower(S, b, F, W / 2, D / 2, 4 * sc, Hh + 5 * sc, c); tower(S, b, F, -W / 2, -D / 2, 3.6 * sc, Hh + 4 * sc, c);
    b.add(G.box, mat4(-W / 2 + 3, -3, D / 2 - 3, 6 * sc, Hh + 7 * sc, 6 * sc, 0, 0, 0, F), mixC(c, WHITE, 0.08));
    b.add(G.box, mat4(0, 0, D / 2 + 0.2, 4.4 * sc, 5 * sc, 0.6, 0, 0, 0, F), mixC(c, WHITE, 0.15));
    S.d.add(G.plane, mat4(0, 1.8 * sc, D / 2 + 0.55, 2.6 * sc, 3.6 * sc, 1, 0, 0, 0, F), WHITE, null, UV.door2);
    roofFlag(S, F, W / 2, Hh + 5.6 * sc, D / 2, 4, 0.5); roofFlag(S, F, -W / 2 + 3, Hh + 7 * sc, D / 2 - 3, 3.5, 0.5);
    const p1 = new Vector3(W / 2, Hh + 5.5 * sc, D / 2).applyMatrix4(F), p2 = new Vector3(-W / 2 + 3, Hh + 7 * sc, D / 2 - 3).applyMatrix4(F);
    bunting(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, 1.4);
  }
  function watchtower(x, z, s = 1) {
    const S = at(z), y0 = gy(x, z) - 0.3, F = frame(x, y0, z, 0), b = pb(S, x);
    tower(S, b, F, 0, 0, 2.2 * s, 8 * s, J(col('#c9a274'), 0.05)); roofFlag(S, F, 0, 8.6 * s, 0, 3, 0.4);
  }
  function goat(x, z, ry, c) {
    const S = at(z), b = pb(S, x), y0 = gy(x, z), F = frame(x, y0, z, ry);
    c = c || pick([col('#f0ebe2'), col('#2a2420'), col('#7a5236'), col('#b88a5a')]); const c2 = rnd() < 0.5 ? c : pick([col('#f0ebe2'), col('#2a2420')]);
    b.add(G.boxC, mat4(0, 0.62, 0, 0.36, 0.38, 0.78, 0, 0, 0, F), c);
    for (const [lx, lz] of [[-0.12, -0.3], [0.12, -0.3], [-0.12, 0.3], [0.12, 0.3]]) b.add(G.box, mat4(lx, 0, lz, 0.08, 0.46, 0.08, 0, 0, 0, F), c2);
    b.add(G.boxC, mat4(0, 0.92, 0.46, 0.2, 0.26, 0.32, 0, -0.5, 0, F), c2);
    for (const sx of [-1, 1]) b.add(coneG(4), mat4(sx * 0.07, 1.05, 0.38, 0.03, 0.26, 0.03, 0, -0.7, sx * 0.3, F), col('#3a3026'));
    b.add(G.box, mat4(0, 0.72, -0.42, 0.06, 0.18, 0.06, 0, -0.6, 0, F), c);
  }
  function camel(x, z, ry, sit = false, o = {}) {
    const S = at(z), b = pb(S, x), y0 = gy(x, z), F = frame(x, y0, z, ry), c = J(col('#c99a62'), 0.1), cd = mixC(c, PAL.dark, 0.25);
    const by = sit ? 0.75 : 1.85;
    b.add(G.sph, mat4(0, by, 0, 0.62, 0.62, 1.15, 0, 0, 0, F), c);
    b.add(G.sph, mat4(0, by + 0.5, -0.05, 0.45, 0.55, 0.55, 0, 0, 0, F), c);
    if (o.saddle) { b.add(G.boxC, mat4(0, by + 0.62, 0.45, 0.95, 0.12, 0.55, 0, 0, 0, F), PAL.red); b.add(G.boxC, mat4(0, by + 0.5, 0.45, 1.0, 0.4, 0.1, 0, 0, 0, F), col('#1e3d6b')); }
    { const n0 = new Vector3(0, by + 0.1, 0.95).applyMatrix4(F), n1 = new Vector3(0, by + 1.0, 1.55).applyMatrix4(F); seg(b, n0.x, n0.y, n0.z, n1.x, n1.y, n1.z, 0.2, c, 6, 0.75); } // الرقبة
    const F2 = new Matrix4().copy(F);
    b.add(G.boxC, mat4(0, by + 1.05, 1.8, 0.26, 0.28, 0.58, 0, 0.15, 0, F2), c);
    for (const sx of [-1, 1]) b.add(G.box, mat4(sx * 0.1, by + 1.18, 1.6, 0.06, 0.12, 0.06, 0, 0, 0, F2), cd);
    if (sit) { for (const [lx, lz] of [[-0.5, 0.6], [0.5, 0.6], [-0.5, -0.6], [0.5, -0.6]]) b.add(G.boxC, mat4(lx, 0.18, lz, 0.22, 0.3, 0.9, 0, 0, 0, F), cd); }
    else for (const [lx, lz] of [[-0.3, 0.7], [0.3, 0.7], [-0.3, -0.75], [0.3, -0.75]]) { b.add(cylG(5, 0.8), mat4(lx, 0.95, lz, 0.13, 0.95, 0.13, 0, 0, 0, F), c); b.add(cylG(5, 0.9), mat4(lx, 0, lz, 0.1, 0.98, 0.1, 0, 0, 0, F), cd); }
    b.add(G.box, mat4(0, by - 0.4, -1.15, 0.08, 0.7, 0.08, 0, 0.25, 0, F), cd);
  }
  function cow(x, z, ry) {
    const S = at(z), b = pb(S, x), F = frame(x, gy(x, z), z, ry), c = pick([col('#6b4428'), col('#2b2420'), col('#a07048'), col('#efe6da')]), cd = mixC(c, PAL.dark, 0.3);
    b.add(G.boxC, mat4(0, 1.05, 0, 0.62, 0.62, 1.45, 0, 0, 0, F), c);
    for (const [lx, lz] of [[-0.22, 0.55], [0.22, 0.55], [-0.22, -0.55], [0.22, -0.55]]) b.add(G.box, mat4(lx, 0, lz, 0.13, 0.78, 0.13, 0, 0, 0, F), cd);
    b.add(G.boxC, mat4(0, 1.15, 0.9, 0.36, 0.4, 0.5, 0, 0.45, 0, F), c);
    for (const sx of [-1, 1]) b.add(coneG(4), mat4(sx * 0.16, 1.35, 0.85, 0.04, 0.25, 0.04, 0, 0, sx * -1.1, F), PAL.cream);
  }
  function juniper(x, z, s = 1) {
    const S = at(z), b = pb(S, x), y0 = gy(x, z) - 0.2, tc = J(col('#5e4a3a'), 0.1), lc = J(col('#3f5a36'), 0.12);
    const hx = x + R(-0.6, 0.6) * s, hy = y0 + 2.2 * s, hz = z + R(-0.6, 0.6) * s;
    seg(b, x, y0, z, hx, hy, hz, 0.22 * s, tc, 5, 0.7);
    for (let i = 0; i < 3; i++) seg(b, hx, hy - 0.4 * s, hz, hx + R(-1.4, 1.4) * s, hy + R(0.5, 1.4) * s, hz + R(-1.4, 1.4) * s, 0.1 * s, tc, 4, 0.6);
    for (let i = 0; i < 6; i++) b.add(G.ico, mat4(hx + R(-1.4, 1.4) * s, hy + R(0.3, 1.8) * s, hz + R(-1.4, 1.4) * s, R(0.8, 1.3) * s, R(0.5, 0.8) * s, R(0.8, 1.3) * s, R(0, 3)), J(lc, 0.1), [0.03, 0, 0]);
  }
  function acacia(x, z, s = 1, c = null) {
    const S = at(z), b = pb(S, x), y0 = gy(x, z) - 0.2, tc = J(col('#6a5038'), 0.1), lc = J(c || PAL.olive, 0.1);
    const ty = y0 + 2.6 * s;
    seg(b, x, y0, z, x, ty, z, 0.16 * s, tc, 5, 0.7);
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + R(0, 1); seg(b, x, ty - 0.3, z, x + Math.cos(a) * 1.3 * s, ty + 0.8 * s, z + Math.sin(a) * 1.3 * s, 0.08 * s, tc, 4, 0.6); }
    for (let i = 0; i < 4; i++) b.add(G.ico, mat4(x + R(-1.2, 1.2) * s, ty + R(0.7, 1.1) * s, z + R(-1.2, 1.2) * s, R(1.4, 2) * s, 0.5 * s, R(1.4, 2) * s, R(0, 3)), J(lc, 0.08), [0.05, 0, 0]);
  }
  function tree(x, z, s = 1, c = null, o = {}) {
    const S = at(z), b = pb(S, x), y0 = (o.y ?? gy(x, z)) - 0.2, tc = J(col('#5a4433'), 0.1), lc = J(c || PAL.leaf, 0.12), th = R(2.6, 3.6) * s;
    seg(b, x, y0, z, x, y0 + th, z, 0.24 * s, tc, 6, 0.65);
    const n = Math.abs(x) > 34 ? 3 : 5;
    for (let i = 0; i < n; i++) b.add(G.ico1, mat4(x + R(-1.2, 1.2) * s, y0 + th + R(0, 1.8) * s, z + R(-1.2, 1.2) * s, R(1.3, 1.9) * s, R(1.1, 1.6) * s, R(1.3, 1.9) * s, R(0, 3)), J(lc, 0.12), [0.05, 0, 0]);
  }
  function frankincense(x, z, s = 1) {
    const S = at(z), b = pb(S, x), y0 = gy(x, z) - 0.1, tc = J(col('#a89a86'), 0.1), lc = J(col('#7aa850'), 0.1);
    seg(b, x, y0, z, x, y0 + 1 * s, z, 0.2 * s, tc, 5, 0.8);
    for (let i = 0; i < 5; i++) { const a = i * 1.3 + R(0, 1), ex = x + Math.cos(a) * 1.4 * s, ez = z + Math.sin(a) * 1.4 * s, ey = y0 + R(2, 2.8) * s; seg(b, x, y0 + 0.9 * s, z, ex, ey, ez, 0.07 * s, tc, 4, 0.6); b.add(G.ico, mat4(ex, ey + 0.2, ez, 0.7 * s, 0.4 * s, 0.7 * s, a), lc, [0.05, 0, 0]); }
  }
  function boat(x, z, ry, len = 6, o = {}) {
    const S = at(z), b = pb(S, x), y0 = o.y ?? gy(x, z) + 0.05, F = frame(x, y0, z, ry);
    const hc = J(o.c || pick([col('#f2f0ea'), col('#2f7fa6'), col('#e8d8b0'), col('#c84a3a')]), 0.05), stripe = o.s || pick([PAL.red, PAL.blue, PAL.green, col('#f0c040')]);
    const wv = o.bob ? [0, 0, 1] : null;
    b.add(G.hull, mat4(0, 0, 0, len * 0.32, len * 0.2, len, 0, 0, o.tilt || 0, F), (lx, ly) => (ly > 0.42 ? stripe : hc), wv);
    for (let i = -1; i <= 1; i++) b.add(G.box, mat4(0, len * 0.08, i * len * 0.22, len * 0.28, 0.06, 0.25, 0, 0, o.tilt || 0, F), PAL.wood2, wv);
  }
  function dhow(x, z, ry, len = 16) {
    const S = at(z), b = pb(S, x), F = frame(x, SEA - 0.6, z, ry), wc = J(col('#8a5a32'), 0.08), wv = [0, 0, 1.2];
    b.add(G.hull, mat4(0, 0, 0, len * 0.27, len * 0.17, len, 0, 0, 0, F), (lx, ly) => (ly > 0.5 ? col('#e9dcc0') : wc), wv);
    b.add(G.box, mat4(0, len * 0.085, -len * 0.3, len * 0.22, len * 0.06, len * 0.25, 0, 0, 0, F), wc, wv);
    b.add(cylG(6, 0.6), mat4(0, len * 0.05, len * 0.05, 0.16, len * 0.75, 0.16, 0, -0.12, 0, F), PAL.wood, wv);
    b.add(G.sail, mat4(0, len * 0.2, len * 0.42, 1, len * 0.62, len * 0.72, -PI / 2, 0, -0.08, F), col('#efe4cc'), (lx) => [0, 0.08 * lx, 1.2]);
    S.d.add(G.flag, mat4(0, len * 0.8, len * 0.02, 1.4, 0.8, 1, PI / 2, 0, 0, F), WHITE, lx => [0, 0.1 * (lx + 0.5), 1.2], UV.flag);
    const p1 = new Vector3(0, len * 0.78, len * 0.05).applyMatrix4(F), p2 = new Vector3(0, len * 0.12, -len * 0.48).applyMatrix4(F);
    bunting(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, 0.3);
  }
  function hut(x, z, ry) { // عريش من سعف النخيل
    const S = at(z), b = pb(S, x), F = frame(x, gy(x, z), z, ry), c = J(col('#a88a5a'), 0.08);
    reserve(x - 3, x + 3, z - 3, z + 3);
    for (const [px, pz] of [[-1.6, -1.4], [1.6, -1.4], [-1.6, 1.4], [1.6, 1.4]]) b.add(cylG(5), mat4(px, 0, pz, 0.08, 2.6, 0.08, 0, 0, 0, F), PAL.wood);
    b.add(G.box, mat4(0, 2.5, 0, 3.8, 0.3, 3.4, 0, 0, 0, F), c);
    for (const sx of [-1, 1]) b.add(G.box, mat4(sx * 1.6, 0, 0, 0.12, 2.5, 3.2, 0, 0, 0, F), mixC(c, PAL.dark, 0.1));
    b.add(G.box, mat4(0, 0, -1.5, 3.2, 2.5, 0.12, 0, 0, 0, F), mixC(c, PAL.dark, 0.15));
  }
  function nets(x, z, ry) {
    const S = at(z), b = pb(S, x), F = frame(x, gy(x, z), z, ry);
    for (const px of [-2.2, 0, 2.2]) b.add(cylG(5), mat4(px, 0, 0, 0.06, 2.2, 0.06, 0, 0, 0, F), PAL.wood);
    b.add(G.box, mat4(0, 0.7, 0, 4.4, 1.4, 0.04, 0, 0, 0, F), col('#2f4a5a'), (lx, ly) => [0, 0.08 * Math.sin(lx * 3), 0]);
    b.add(G.box, mat4(0, 2.1, 0, 4.6, 0.05, 0.05, 0, 0, 0, F), PAL.wood);
    for (let i = 0; i < 6; i++) b.add(G.sph, mat4(R(-2, 2), R(1, 2), 0.05, 0.08, 0.08, 0.08, 0, 0, 0, F), col('#f07a2a'));
  }
  function stall(x, z, ry, o = {}) { // دكّان في السوق
    const S = at(z), b = pb(S, x), F = frame(x, 0, z, ry);
    b.add(G.box, mat4(0, 0, 0.4, 2.6, 0.8, 1.1, 0, 0, 0, F), PAL.wood2);
    const spice = [col('#e8b22a'), col('#c8361e'), col('#7a4a26'), col('#e86a1a'), col('#5a7a2a'), col('#3a2a1e'), col('#d8c8a0')];
    for (let i = 0; i < 4; i++) { const sx = -0.95 + i * 0.63, c = pick(spice); b.add(cylG(8, 0.9), mat4(sx, 0.8, 0.45, 0.26, 0.42, 0.26, 0, 0, 0, F), col('#c8ac7a')); b.add(G.sph, mat4(sx, 1.2, 0.45, 0.25, 0.14, 0.25, 0, 0, 0, F), c); }
    for (let i = 0; i < 3; i++) { const sx = -0.8 + i * 0.8; b.add(cylG(8, 0.85), mat4(sx, 0, 1.4, 0.32, 0.62, 0.32, 0, 0, 0, F), col('#b89a68')); b.add(G.sph, mat4(sx, 0.62, 1.4, 0.3, 0.16, 0.3, 0, 0, 0, F), pick(spice)); }
    S.d.add(G.plane, mat4(0, 2.9, 1.2, 3.0, 1.6, 1, 0, -1.0, 0, F), WHITE, (lx, ly) => [0, 0.03 * (0.5 - ly), 0], UV.awning);
    if (o.lamp) lantern(S, F, 0.9, 2.4, 1.5, 0.8, 0.4);
  }
  function arch(z, o = {}) { // قوس فوق المسار (ارتفاعه الداخلي ≥ 5.6 م)
    const S = at(z), b = S.p, c = J(o.c || PAL.mud, 0.04), F = frame(0, 0, z, 0);
    b.add(G.arch, mat4(0, 0, 0, 1, 1, o.depth || 1, 0, 0, 0, F), c);
    for (let i = 0; i < 12; i++) { const px = -5.3 + i * (10.6 / 11); b.add(G.pyr, mat4(px, 8.3, 0, 0.42, 0.55, 0.42, 0, 0, 0, F), c); }
    if (o.flag) { roofFlag(S, F, -5.2, 8.3, 0, 2.6, -0.5); roofFlag(S, F, 5.2, 8.3, 0, 2.6, PI + 0.5); }
    if (o.lamp) lantern(S, F, 0, 5.9, -0.3, 1.1, 0.6);
  }
  function bench(S, F, x, z, ry) {
    const b = S.p, F2 = frame(x, 0, z, ry).premultiply(F || new Matrix4());
    b.add(G.box, mat4(0, 0, 0, 2.6, 0.5, 0.9, 0, 0, 0, F2), PAL.wood);
    b.add(G.box, mat4(0, 0.5, -0.4, 2.6, 0.7, 0.12, 0, 0, 0, F2), PAL.wood2);
    S.d.add(G.box, mat4(0, 0.5, 0.02, 2.4, 0.14, 0.8, 0, 0, 0, F2), WHITE, null, UV.cushion);
    for (const sx of [-0.8, 0, 0.8]) S.d.add(G.boxC, mat4(sx, 0.95, -0.25, 0.6, 0.5, 0.2, 0, -0.2, 0, F2), WHITE, null, UV.cushion);
  }
  function dallah(S, F, x, y, z, s = 1) {
    const b = S.p;
    b.add(cylG(8, 0.7), mat4(x, y, z, 0.12 * s, 0.22 * s, 0.12 * s, 0, 0, 0, F), PAL.gold);
    b.add(cylG(8, 0.4), mat4(x, y + 0.22 * s, z, 0.09 * s, 0.14 * s, 0.09 * s, 0, 0, 0, F), PAL.gold);
    b.add(coneG(6), mat4(x, y + 0.36 * s, z, 0.06 * s, 0.08 * s, 0.06 * s, 0, 0, 0, F), PAL.gold);
    b.add(cylG(5, 0.5), mat4(x + 0.1 * s, y + 0.12 * s, z, 0.03 * s, 0.25 * s, 0.03 * s, 0, 0, -0.9, F), PAL.gold);
  }
  function mabkhara(S, F, x, y, z, s = 1) {
    const b = S.p;
    b.add(cylG(4, 0.7), mat4(x, y, z, 0.32 * s, 0.35 * s, 0.32 * s, PI / 4, 0, 0, F), col('#c8b6a0'));
    b.add(G.box, mat4(x, y + 0.35 * s, z, 0.42 * s, 0.32 * s, 0.42 * s, 0, 0, 0, F), col('#e0d0b8'));
    b.add(G.box, mat4(x, y + 0.36 * s, z + 0.215 * s, 0.24 * s, 0.24 * s, 0.01, 0, 0, 0, F), PAL.red);
    S.g.add(G.ico, mat4(x, y + 0.7 * s, z, 0.1 * s, 0.05 * s, 0.1 * s, 0, 0, 0, F), new Color(3, 1.2, 0.3));
  }
  function wallSeg(x, z0, z1, h = 1.3, c, crenel = true) { // سور طيني منخفض موازٍ للمسار
    const S = at((z0 + z1) / 2), b = pb(S, x), cc = J(c || PAL.mud2, 0.05), y = Math.min(gy(x, z0), gy(x, z1)) - 0.3;
    b.add(G.box, mat4(x, y, (z0 + z1) / 2, 0.55, h + 0.3, z1 - z0), cc);
    if (crenel) for (let z = z0 + 0.4; z < z1; z += 0.9) b.add(G.pyr, mat4(x, y + h + 0.3, z, 0.32, 0.4, 0.32), cc);
    else for (let z = z0 + 0.3; z < z1; z += 0.55) b.add(G.dod, mat4(x + R(-0.1, 0.1), y + h + 0.3, z, 0.32, 0.18, 0.3, R(0, 3)), J(cc, 0.12));
  }
  function lampPost(x, z) {
    const S = at(z), b = pb(S, x), y0 = gy(x, z);
    b.add(cylG(8, 0.7), mat4(x, y0, z, 0.14, 0.6, 0.14), col('#3a3a3a'));
    b.add(cylG(6, 0.7), mat4(x, y0 + 0.6, z, 0.07, 4.2, 0.07), col('#2e2e2e'));
    lantern(S, null, x, y0 + 4.9, z, 1.1);
    b.add(G.box, mat4(x + (x < 0 ? 0.4 : -0.4), y0 + 4.5, z, 0.8, 0.06, 0.06), col('#2e2e2e'));
  }
  function falaj(z0, z1) { // قناة الفلج على الجهة اليمنى (x من 4.9 إلى 6.3)
    for (let z = z0; z < z1; z += 6) {
      const S = at(z), b = S.p, ze = Math.min(z + 6, z1), zm = (z + ze) / 2, L = ze - z;
      const yb = Math.min(gy(5.6, z), gy(5.6, ze), 0) - 3.2;
      for (const xx of [4.95, 6.25]) b.add(G.box, mat4(xx, yb, zm, 0.32, 0.45 - yb, L + 0.02), J(col('#b39a7a'), 0.06));
      b.add(G.box, mat4(5.6, yb, zm, 1.0, 0.12 - yb, L + 0.02), col('#6e6a58'));
      S.w.add(G.plane, mat4(5.6, 0.3, zm, 1.0, L + 0.02, 1, 0, -PI / 2), WHITE);
    }
  }
  function waterPlane(S, x, y, z, sx, sz, round = true) { S.w.add(round ? G.disc : G.plane, mat4(x, y, z, sx, round ? 1 : sz, round ? sz : 1, 0, round ? 0 : -PI / 2), WHITE); }
  G.disc = prepUV(new THREE.CircleGeometry(1, 20).rotateX(-PI / 2));
  function tent(x, z, ry) {
    const S = at(z), F = frame(x, gy(x, z), z, ry);
    reserve(x - 4, x + 4, z - 4, z + 4);
    S.d.add(G.box, mat4(0, 0, 0, 6, 2.2, 4, 0, 0, 0, F), WHITE, null, UV.tent);
    S.d.add(G.pyr, mat4(0, 2.2, 0, 4.4, 0.9, 3.0, 0, 0, 0, F), WHITE, null, UV.tent);
    S.d.add(G.plane, mat4(0, 0.03, 3.2, 4, 2.4, 1, 0, -PI / 2, 0, F), WHITE, null, UV.carpet);
    S.p.add(G.box, mat4(0, 0, 2.05, 2.4, 1.8, 0.05, 0, 0, 0, F), PAL.dark);
  }

  // ── عناصر مشتركة متكررة ─────────────────────────────────────
  const nearX = (s, z) => (s > 0 && falajAt(z) ? R(7.2, 9.5) : R(5.4, 8));
  function scatter(z0, z1, step, fn) { for (let z = z0 + R(0, step); z < z1; z += step * R(0.6, 1.4)) fn(z); }
  function festive(z0, z1, every = 55, o = {}) {
    for (let z = z0 + 20; z < z1 - 10; z += every) {
      const y1 = 6.2 + (o.dy || 0);
      for (const s of [-1, 1]) { const px = s * (s > 0 && falajAt(z) ? 7.0 : 5.0), S = at(z), y0 = gy(px, z); pb(S, px).add(cylG(6, 0.7), mat4(px, y0 - 0.2, z, 0.08, y1 + 0.3 - y0, 0.08), PAL.wood); }
      const xa = -5, xb = falajAt(z) ? 7 : 5;
      if (o.lights) lights(xa, y1, z, xb, y1, z, 0.9, !!o.halo); else bunting(xa, y1, z, xb, y1, z, 1.0);
      if (o.both) bunting(xa, y1 - 0.2, z, xb, y1 - 0.2, z + 0.02, 1.4);
    }
    for (let z = z0 + 35; z < z1; z += every * 0.9) { const s = side(), x = s * (s > 0 && falajAt(z) ? R(7.5, 9) : R(5, 6.5)); if (free(x, z, 0.3)) flagPole(x, z, R(5.5, 7)); }
  }
  function nature(z0, z1, cfg) {
    if (cfg.palm) scatter(z0, z1, cfg.palm, z => { const s = side(), x = s * (nearX(s, z) + 1.2); if (free(x, z, 1)) palm(x, z, R(5.5, 8.5), { dates: rnd() < 0.5, lean: s * R(0.3, 0.9) }); });
    if (cfg.palmFar) scatter(z0, z1, cfg.palmFar, z => { const x = side() * R(12, cfg.farMax || 80); if (free(x, z, 2)) palm(x, z, R(6, 10), { dates: rnd() < 0.3 }); });
    if (cfg.bush) scatter(z0, z1, cfg.bush, z => { const s = side(), x = s * (nearX(s, z) + R(0, 6)); if (free(x, z, 0.8)) bush(x, z, R(0.7, 1.3), { flowers: rnd() < (cfg.flowers || 0), c: cfg.bushC }); });
    if (cfg.rock) scatter(z0, z1, cfg.rock, z => { const s = side(), x = s * R(cfg.rockMin || 5, cfg.rockMax || 30), sc = R(0.4, 1.2) * (cfg.rockS || 1) * (1 + (Math.abs(x) - 5) * 0.04); if (free(x, z, 0.5) && Math.abs(x) - sc * 1.3 > 4.4) rock(x, z, sc, cfg.rockC); });
    if (cfg.grass) scatter(z0, z1, cfg.grass, z => { const s = side(), x = s * R(4.6, 14); if (free(x, z, 0.2)) grass(x, z, R(0.8, 1.3), cfg.grassC); });
    if (cfg.tree) scatter(z0, z1, cfg.tree[1], z => { const s = side(), x = s * R(cfg.tree[2], cfg.tree[3]); if (free(x, z, 1.5)) cfg.tree[0](x, z, R(0.8, 1.3)); });
  }

  // ── البيت الأم في البداية، وبيت الجدّة في النهاية ──────────
  const houseCol = grade === 2 ? PAL.white : grade === 3 ? col('#b8a48a') : PAL.mud;
  function motherHouse() {
    house(-12, 9, PI / 2, 9, 7.5, 5.6, { c: houseCol, flag: true, lamps: true, pots: true, upper: true, bunt: true });
    bush(-7.2, 3, 1.1, { flowers: true }); bush(-7.4, 15.5, 1, { flowers: true });
    flagPole(-6.2, 21, 7, { size: 1.15 });
    if (grade !== 3) palm(-7, -2, 7.5, { dates: true });
    const S = at(9); pot(S.p, null, -7.6, gy(-7.6, 6.5), 6.5, 1.1);
  }
  const smokeSrc = [];
  function grandmaHouse() {
    const z = HOUSE_Z, S = at(z), c = J(houseCol, 0.02);
    const F = house(0, z + 8, PI, 24, 16, 9, { c, big: true, lamps: true, flag: true, upper: true, string: true, bunt: true, y: 0 });
    const b = S.p;
    tower(S, b, F, 11, 6.8, 3.3, 14, c); tower(S, b, F, -11, 6.8, 2.7, 12, c); roofFlag(S, F, 11, 14.6, 6.8, 4.5, 0.4, 1.7); roofFlag(S, F, -11, 12.6, 6.8, 3.6, -0.4, 1.3);
    { const p1 = new Vector3(11, 14.3, 6.8).applyMatrix4(F), p2 = new Vector3(-11, 12.3, 6.8).applyMatrix4(F); bunting(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, 2.2); lights(p1.x, p1.y - 0.4, p1.z, p2.x, p2.y - 0.4, p2.z, 2.6, true); }
    for (const sx of [-7, -3.6, 3.6, 7]) lantern(S, F, sx, 6.2, 8.35, 1.1, 0.5);
    // الساحة: أسوار جانبية وبوابة بقوس
    const zc0 = z - 46;
    for (const s of [-1, 1]) {
      const S2 = at(z - 20); S2.p.add(G.box, mat4(s * 12.5, -0.3, z - 23, 0.7, 3.2, 46), J(c, 0.03));
      for (let zz = zc0 + 0.5; zz < z; zz += 0.9) S2.p.add(G.pyr, mat4(s * 12.5, 2.9, zz, 0.42, 0.5, 0.42), c);
      for (let zz = zc0 + 6; zz < z - 4; zz += 9) lantern(S2, null, s * 12.0, 2.3, zz, 1);
      for (let zz = zc0 + 4; zz < z - 2; zz += 8) bush(s * R(9.8, 11.2), zz, R(0.9, 1.3), { flowers: true, y: 0 });
    }
    reserve(-13, 13, zc0 - 1, z + 20);
    arch(zc0, { c, flag: true, lamp: true, depth: 1.6 });
    for (let zz = zc0 + 8; zz < z - 2; zz += 7) lights(-12.2, 6.2, zz, 12.2, 6.2, zz + 3.5, 1.2, true);
    // الدكّة ومجلس الجدّ
    const S3 = at(z - 10);
    S3.d.add(G.plane, mat4(-8.2, 0.03, z - 10, 3.6, 5.5, 1, 0, -PI / 2), WHITE, null, UV.carpet);
    bench(S3, null, -9.6, z - 10, PI / 2);
    S3.p.add(cylG(10), mat4(-7.4, 0, z - 10.5, 0.55, 0.2, 0.55), PAL.brass);
    dallah(S3, null, -7.4, 0.2, z - 10.6, 1.2);
    for (let i = 0; i < 3; i++) S3.p.add(cylG(6, 1.3), mat4(-7.1 + i * 0.12, 0.2, z - 10.1, 0.04, 0.06, 0.04), col('#f4f0e6'));
    S3.p.add(G.sph, mat4(-7.7, 0.24, z - 10.2, 0.16, 0.08, 0.16), col('#5a2a14'));
    // مباخر اللبان ودخانها
    for (const sx of [-1, 1]) { const S4 = at(z - 2); S4.p.add(G.box, mat4(sx * 4.9, 0, z - 2, 0.8, 0.9, 0.8), mixC(c, WHITE, 0.2)); mabkhara(S4, null, sx * 4.9, 0.9, z - 2, 1.1); smokeSrc.push([sx * 4.9, 1.7, z - 2]); }
    // نخيل وأصص
    palm(9.3, z - 30, 8, { y: 0, dates: true }); palm(-9.6, z - 34, 7.2, { y: 0, dates: true }); palm(9.6, z - 14, 6.5, { y: 0 });
    for (const sx of [-1, 1]) for (const dz of [-1.2, -3.2]) pot(S.p, null, sx * 6.2, 0, z + dz, 1.15);
    for (let i = 0; i < 4; i++) bush(R(-11, 11) + (rnd() < 0.5 ? 0 : 0), z + 0.6, 0.8, { flowers: true, y: 0 });
    flagPole(-6, zc0 - 4, 8, { size: 1.3 }); flagPole(6, zc0 - 4, 8, { size: 1.3 });
  }

  // ══════════════════ تخطيط المراحل لكل صف ══════════════════
  const ST = i => stages[i];
  if (grade === 1) {
    motherHouse();
    // 1) القرية
    { const { z0, z1 } = ST(0);
      for (let z = 34; z < z1 - 15; z += R(20, 30)) { const s = side(), w = R(6.5, 9), d = R(6, 8); const x = s * (s > 0 && falajAt(z) ? 8.5 + d / 2 + R(0, 4) : 7 + d / 2 + R(0, 5)); house(x, z, s < 0 ? PI / 2 : -PI / 2, w, d, R(4.4, 6.6), { flag: rnd() < 0.35, upper: rnd() < 0.4, lamps: rnd() < 0.5, pots: true, bunt: rnd() < 0.3 }); }
      for (let z = z0 + 10; z < z1; z += R(18, 26)) { const s = side(); house(s * R(24, 44), z, s < 0 ? PI / 2 + R(-0.3, 0.3) : -PI / 2 + R(-0.3, 0.3), R(7, 11), R(6, 9), R(4.5, 7.5), { upper: rnd() < 0.5, flag: rnd() < 0.2 }); }
      watchtower(-30, 120, 1.1);
      nature(z0, z1, { palm: 6, palmFar: 2.2, bush: 6, flowers: 0.5, rock: 9, grass: 3 });
      wallSeg(-7.6, 60, 82); wallSeg(-7.6, 140, 168);
      festive(z0, z1, 48);
    }
    falaj(FEAT.falaj[0][0], FEAT.falaj[0][1]);
    // 2) الوادي والفلج
    { const { z0, z1 } = ST(1);
      scatter(z0, z1, 3, z => { const x = R(12, 34), y = gy(x, z); if (y < -1) rock(x, z, R(0.6, 2.2), col('#b8a890')); });
      scatter(z0, z1, 7, z => { const x = R(14, 30); if (gy(x, z) < -1.8) waterPlane(at(z), x, -1.95, z, R(3, 6), R(4, 8)); });
      scatter(z0, z1, 5, z => { const x = R(8, 26); if (free(x, z, 1)) bush(x, z, R(0.8, 1.4), { flowers: rnd() < 0.6, fc: col('#f06aa8') }); });
      nature(z0, z1, { palm: 9, palmFar: 4, farMax: 40, rock: 2.5, rockMin: 5, rockMax: 40, rockS: 1.3, grass: 3, tree: [acacia, 14, 8, 40] });
      // جسر حجري صغير فوق مجرى الوادي
      const zb = FEAT.wb, S = at(zb);
      for (const s of [-1, 1]) { S.p.add(G.box, mat4(s * 4.65, -3, zb, 0.5, 3.75, 9), J(col('#b39a7a'), 0.04)); for (let z = zb - 4.2; z <= zb + 4.2; z += 0.84) S.p.add(G.box, mat4(s * 4.65, 0.75, z, 0.42, 0.25, 0.6), col('#c8b090')); }
      S.p.add(G.box, mat4(0, -0.6, zb, 9.0, 0.6, 9), col('#a48c6c'));
      for (const zz of [zb - 4.6, zb + 4.6]) S.p.add(G.box, mat4(0, -3.4, zz, 9.6, 3.0, 0.8), col('#9c8466'));
      S.w.add(G.plane, mat4(0, -2.0, zb, 80, 7, 1, 0, -PI / 2), WHITE);
      for (let i = 0; i < 16; i++) rock(R(-35, 35), zb + R(-6, 6), R(0.5, 1.4), col('#b0a088'), { y: -2.1 });
      festive(z0, z0 + 60, 50);
    }
    // 3) الطريق الجبلي
    { const { z0, z1 } = ST(2);
      nature(z0, z1, { rock: 1.6, rockMin: 4.8, rockMax: 26, rockS: 1.6, bush: 9, bushC: PAL.olive, tree: [acacia, 22, 7, 24], grass: 4 });
      scatter(z0, z1, 12, z => { const s = side(), n = 2 + ((rnd() * 3) | 0); for (let i = 0; i < n; i++) { const x = s * R(5.5, 14), zz = z + R(-3, 3); if (free(x, zz, 0.3)) goat(x, zz, R(0, TAU)); } });
      watchtower(26, 520, 1); flagPole(-6, 470, 6); flagPole(6.5, 590, 6);
      for (let z = z0 + 30; z < z1; z += 28) { const s = side(); const x = s * 5.2; rock(x, z, 0.5); }
    }
    // 4) الكثبان ومراعي الإبل
    { const { z0, z1 } = ST(3);
      const pen = [[-10, 690], [11, 770]];
      for (const [px, pz] of pen) {
        const s = Math.sign(px); reserve(px - 8 * (s < 0 ? 1 : 0) - 1, px + 8 * (s > 0 ? 1 : 0) + 1, pz - 9, pz + 9);
        for (let i = 0; i <= 8; i++) { const zz = pz - 8 + i * 2; for (const xx of [px, px + s * 8]) at(zz).p.add(cylG(5), mat4(xx, gy(xx, zz) - 0.2, zz, 0.07, 1.5, 0.07), PAL.wood); }
        for (const xx of [px, px + s * 8]) for (const yy of [0.6, 1.2]) at(pz).p.add(G.box, mat4(xx, gy(xx, pz) + yy, pz, 0.06, 0.06, 16), PAL.wood2);
        at(pz).p.add(G.box, mat4(px + s * 4, gy(px + s * 4, pz), pz - 3, 3, 0.5, 0.8), PAL.wood);
        for (let i = 0; i < 3; i++) at(pz).p.add(G.box, mat4(px + s * R(2, 6), gy(px, pz), pz + R(-6, 6), 1, 0.6, 0.6, R(0, 3)), col('#d8c070'));
        for (let i = 0; i < 4; i++) camel(px + s * R(1.5, 6.5), pz + R(-6, 6), R(0, TAU), rnd() < 0.4, { saddle: rnd() < 0.4 });
      }
      tent(-22, 742, PI / 2 - 0.3); tent(24, 700, -PI / 2);
      scatter(z0, z1, 20, z => { const s = side(), x = s * R(14, 60); if (free(x, z, 2)) camel(x, z, R(0, TAU), rnd() < 0.3); });
      nature(z0, z1, { tree: [acacia, 16, 9, 60], grass: 4, grassC: col('#b0a050'), rock: 18, rockC: col('#c89a6a') });
      flagPole(-6, 650, 7); flagPole(6, 820, 7);
    }
    // 5) الواحة والحصن
    { const { z0, z1 } = ST(4);
      fort(34, 950, -PI / 2 + 0.2, 1);
      waterPlane(at(900), -20, 0.12, 900, 9, 6);
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; rock(-20 + Math.cos(a) * 9.5, 900 + Math.sin(a) * 6.5, R(0.6, 1)); }
      reserve(-30, -10, 892, 908);
      for (let z = z0 + 30; z < z1; z += R(25, 40)) { const s = -1; house(s * R(14, 26), z, PI / 2 + R(-0.2, 0.2), R(7, 10), R(6, 8), R(4.5, 6.5), { flag: rnd() < 0.4, upper: rnd() < 0.4, lamps: true, pots: true }); }
      nature(z0, z1, { palm: 4.5, palmFar: 1.4, farMax: 70, bush: 6, flowers: 0.4, grass: 2.5 });
      festive(z0, z1, 50);
    }
    falaj(FEAT.falaj[1][0], FEAT.falaj[1][1]);
    // بيت الجدّة
    { const { z0 } = ST(5); nature(z0, HOUSE_Z - 50, { palm: 6, palmFar: 2, bush: 7, flowers: 0.7 }); festive(z0, HOUSE_Z - 50, 40, { lights: true, halo: true }); }
  }
  if (grade === 2) {
    motherHouse();
    const shells = (z0, z1) => scatter(z0, z1, 1.6, z => { const x = -R(4.8, 14); if (gy(x, z) > SEA + 0.05 && free(x, z, 0.1)) { const S = at(z), y = gy(x, z); if (rnd() < 0.5) S.p.add(G.sph, mat4(x, y, z, 0.16, 0.08, 0.13, R(0, 3)), pick([col('#f6e6d8'), col('#f0c8b0'), col('#e8d8f0')])); else for (let k = 0; k < 5; k++) S.p.add(G.box, mat4(x, y, z, 0.07, 0.04, 0.28, k * TAU / 5, 0, 0), col('#e8784a')); } });
    // 1) الشاطئ
    { const { z0, z1 } = ST(0);
      shells(z0, z1);
      for (let z = z0 + 30; z < z1; z += R(28, 40)) { const x = -R(7, 10), S = at(z), y = gy(x, z); S.p.add(cylG(5), mat4(x, y - 0.3, z, 0.07, 2.8, 0.07), PAL.wood); S.p.add(coneG(10), mat4(x, y + 2.2, z, 1.6, 0.7, 1.6), col('#c8a868'), [0.02, 0, 0]); S.d.add(G.plane, mat4(x + 1.5, y + 0.05, z, 1.8, 0.8, 1, 0.4, -PI / 2), WHITE, null, UV.awning); }
      scatter(z0, z1, 7, z => { const x = -R(14, 22); if (gy(x, z) < 0) rock(x, z, R(0.8, 1.8), col('#6f5f52')); });
      nature(z0, z1, { palm: 7, palmFar: 4, farMax: 60, bush: 8, grass: 3, grassC: col('#9aa050') });
      festive(z0, z1, 60);
    }
    // 2) قرية الصيادين
    { const { z0, z1 } = ST(1);
      scatter(z0, z1, 9, z => { const x = -R(6.5, 12); if (free(x, z, 1.5)) { boat(x, z, R(-0.4, 0.4) + (rnd() < 0.5 ? 0 : PI), R(5, 7), { tilt: R(-0.12, 0.12) }); reserve(x - 1.5, x + 1.5, z - 3.5, z + 3.5); } });
      for (let z = z0 + 15; z < z1; z += R(30, 45)) { const x = -R(8, 11); if (free(x, z, 2)) nets(x, z, PI / 2 + R(-0.3, 0.3)); }
      for (let z = z0 + 10; z < z1; z += R(22, 32)) { const x = R(8, 12); hut(x, z, -PI / 2); }
      for (let z = z0 + 20; z < z1; z += R(20, 30)) house(R(18, 30), z, -PI / 2 + R(-0.2, 0.2), R(6, 9), R(6, 8), R(4.5, 6.5), { c: J(PAL.white, 0.04), flag: rnd() < 0.4, upper: rnd() < 0.4, lamps: true });
      scatter(z0, z1, 12, z => { const x = -R(18, 40); if (gy(x, z) < SEA - 0.3) boat(x, z, R(0, TAU), R(5, 7), { y: SEA - 0.15, bob: true }); });
      shells(z0, z1); nature(z0, z1, { palm: 8, palmFar: 5, farMax: 60, grass: 4 });
      festive(z0, z1, 50);
    }
    // 3) السوق القديم
    { const { z0, z1 } = ST(2);
      for (const s of [-1, 1]) {
        for (let z = z0 + 6; z < z1 - 4; z += 9) {
          const S = at(z), F = frame(s * 9.5, 0, z, s < 0 ? PI / 2 : -PI / 2);
          const c = J(rnd() < 0.5 ? PAL.mud : col('#e2cba2'), 0.05);
          S.p.add(G.box, mat4(0, 0, -2, 9.2, R(6, 8.5), 5.5, 0, 0, 0, F), c);
          S.p.add(G.box, mat4(0, 3.9, 2.5, 9.2, 0.35, 5.2, 0, 0, 0, F), mixC(c, WHITE, 0.15));
          for (const cx of [-4.4, 0, 4.4]) S.p.add(G.box, mat4(cx, 0, 4.6, 0.5, 3.9, 0.5, 0, 0, 0, F), mixC(c, WHITE, 0.1));
          for (let i = 0; i < 2; i++) S.p.add(G.pyr, mat4(-2.2 + i * 4.4, 3.2, 4.6, 1.9, 0.75, 0.3, 0, 0, 0, F), mixC(c, WHITE, 0.1));
          S.d.add(G.plane, mat4(R(-2, 2), 1.3, 0.76, 1.3, 2.3, 1, 0, 0, 0, F), WHITE, null, UV.door);
          lantern(S, F, 0, 3.0, 4.4, 0.9, 0.5);
          if (rnd() < 0.5) roofFlag(S, F, 3.5, 6, -2, 2.5, 0.3);
        }
        reserve(s * 4.6, s * 16, z0, z1);
      }
      for (let z = z0 + 10; z < z1 - 5; z += 6) for (const s of [-1, 1]) stall(s * 6.3, z + R(-1, 1), s < 0 ? PI / 2 : -PI / 2, { lamp: rnd() < 0.3 });
      for (let z = z0 + 18; z < z1 - 10; z += 32) arch(z, { lamp: true, flag: (z / 32 | 0) % 2 === 0 });
      for (let z = z0 + 30; z < z1 - 10; z += 32) lights(-4.8, 5.4, z, 4.8, 5.4, z + 6, 0.8, true);
      festive(z0 + 5, z1, 32, { dy: 0.4 });
    }
    // 4) الميناء والسفن الشراعية
    { const { z0, z1 } = ST(3);
      for (let z = z0 - 20; z < z1 + 10; z += 4) { const S = at(z); S.p.add(G.box, mat4(-5.75, -4.6, z + 2, 0.7, 4.6, 4.05), J(col('#a69378'), 0.05)); if (z % 12 === 0) { S.p.add(cylG(8, 0.8), mat4(-5.2, 0, z, 0.2, 0.55, 0.2), col('#3a3a3a')); } }
      for (let z = z0 + 15; z < z1; z += R(24, 34)) dhow(-R(16, 26), z, R(-0.25, 0.25) + (rnd() < 0.3 ? PI : 0), R(14, 19));
      scatter(z0, z1, 14, z => boat(-R(9, 13), z, R(-0.3, 0.3), R(5, 7), { y: SEA - 0.15, bob: true }));
      for (let z = z0 + 10; z < z1; z += R(22, 30)) house(R(13, 19), z, -PI / 2, R(9, 13), R(8, 10), R(6, 8), { c: J(col('#e8dcc4'), 0.05), flag: rnd() < 0.5, lamps: true, upper: rnd() < 0.3 });
      scatter(z0, z1, 4, z => { const x = R(5, 9); if (free(x, z, 0.6)) { const S = at(z), y = 0; if (rnd() < 0.5) S.p.add(G.box, mat4(x, y, z, R(0.8, 1.2), R(0.6, 1), R(0.8, 1.2), R(0, 1)), J(col('#9a6a3a'), 0.12)); else S.p.add(cylG(8), mat4(x, y, z, 0.35, 0.95, 0.35), pick([col('#2f6a8a'), col('#a0402a'), col('#3a6a3a')])); } });
      fort(40, 560, -PI / 2, 0.85); watchtower(-40, 610, 1.2);
      for (let z = z0 + 8; z < z1; z += 16) lampPost(5.2, z);
      festive(z0, z1, 55);
    }
    // 5) الكورنيش
    { const { z0, z1 } = ST(4);
      for (let z = z0 - 20; z < z1 + 30; z += 2) { const S = at(z); S.p.add(G.box, mat4(-8.6, -4.2, z + 1, 0.6, 5.1, 2.05), col('#d8d0c0')); S.p.add(cylG(6), mat4(-8.6, 0.9, z, 0.05, 0.9, 0.05), col('#f2f2f0')); S.p.add(G.box, mat4(-8.6, 1.75, z + 1, 0.1, 0.08, 2.05), col('#f2f2f0')); }
      for (let z = z0 + 6; z < z1; z += 16) { lampPost(-5.2, z); lampPost(5.2, z + 8); }
      for (let z = z0 + 12; z < z1; z += 16) palm(R(6.8, 8), z, R(6.5, 8.5));
      for (let z = z0 + 18; z < z1; z += 24) bench(at(z), null, 6.4, z, -PI / 2);
      { const S = at(930), F = frame(20, 0, 930, -PI / 2); reserve(14, 26, 924, 936); S.p.add(cylG(8, 0.8), mat4(0, 0, 0, 4, 1.2, 4, 0, 0, 0, F), col('#e8e0d0')); S.p.add(G.box, mat4(0, 1.2, 0, 3.6, 3.4, 3.6, PI / 4, 0, 0, F), col('#f0e8dc')); S.p.add(G.pyr, mat4(0, 4.6, 0, 3.4, 3.2, 3.4, 0, 0, 0, F), col('#e8dcc8')); S.p.add(G.sph, mat4(0, 8, 0, 0.7, 0.7, 0.7, 0, 0, 0, F), PAL.gold); for (let k = 0; k < 4; k++) S.p.add(G.box, mat4(Math.cos(k * PI / 2 + PI / 4) * 1.85, 2.9, Math.sin(k * PI / 2 + PI / 4) * 1.85, 0.9, 0.9, 0.06, -(k * PI / 2 + PI / 4) + PI / 2, 0, 0, F), PAL.red); }
      fort(36, 1000, -PI / 2, 0.8);
      for (let z = z0 + 40; z < z1; z += R(30, 40)) dhow(-R(25, 40), z, R(-0.3, 0.3), R(13, 17));
      nature(z0, z1, { bush: 5, flowers: 0.7, palmFar: 4, farMax: 30, grass: 2 });
      festive(z0, z1, 48, { lights: true });
    }
    { const { z0 } = ST(5); shells(z0, HOUSE_Z - 50); nature(z0, HOUSE_Z - 50, { palm: 6, palmFar: 3, farMax: 40, bush: 8, flowers: 0.7 }); scatter(z0, HOUSE_Z - 50, 18, z => boat(-R(8, 12), z, R(-0.3, 0.3), 6, { tilt: 0.1 })); festive(z0, HOUSE_Z - 50, 40, { lights: true, halo: true }); }
  }
  if (grade === 3) {
    motherHouse();
    const goats = (z0, z1, step) => scatter(z0, z1, step, z => { const s = -1, n = 2 + ((rnd() * 3) | 0); for (let i = 0; i < n; i++) { const x = s * R(5.5, 13), zz = z + R(-3, 3); if (free(x, zz, 0.3)) goat(x, zz, R(0, TAU)); } });
    const rimRocks = (z0, z1) => scatter(z0, z1, 8, z => { const x = R(4.8, 7.5); if (free(x, z, 0.5)) rock(x, z, R(0.4, 1.1), col('#9c8a76')); });
    { const { z0, z1 } = ST(0); rimRocks(z0, z1); goats(z0, z1, 25);
      nature(z0, z1, { rock: 3, rockMin: 5, rockMax: 30, rockS: 1.5, tree: [juniper, 16, 7.5, 30], grass: 4, bush: 12, bushC: col('#6a7448') });
      for (let z = z0 + 40; z < z1; z += 60) { flagPole(5.4, z, 6); for (let k = 0; k < 3; k++) rock(5.6 + k * 0.1, z + 2, 0.5 - k * 0.12, col('#b8a892'), { y: gy(5.6, z + 2) + k * 0.5 }); }
      house(-16, 120, PI / 2, 7, 6, 4.2, { c: col('#a8957c'), flag: true });
    }
    { const { z0, z1 } = ST(1); goats(z0, z1, 22);
      nature(z0, z1, { tree: [juniper, 4, 7.5, 28], rock: 3, rockMin: 5, rockMax: 30, rockS: 1.4, grass: 4, bush: 10, bushC: col('#6a7448') });
      scatter(z0, z1, 7, z => { const x = R(7.5, 14); if (free(x, z, 1)) juniper(x, z, R(0.8, 1.2)); });
      house(-14, 330, PI / 2, 6, 5, 3.6, { c: col('#9e8a72'), door: true }); festive(z0, z1, 70);
    }
    { const { z0, z1 } = ST(2); rimRocks(z0, FEAT.rb0 - 4); rimRocks(FEAT.rb1 + 4, z1);
      nature(z0, FEAT.rb0 - 6, { tree: [juniper, 8, 6, 26], rock: 4, rockS: 1.4 }); nature(FEAT.rb1 + 6, z1, { tree: [juniper, 8, 6, 26], rock: 4, rockS: 1.4 });
      const zb0 = FEAT.rb0, zb1 = FEAT.rb1;
      for (let z = zb0; z < zb1; z += 0.5) { const S = at(z); S.p.add(G.box, mat4(0, -0.16, z + 0.24, 7.9 + R(-0.15, 0.15), 0.16, 0.44), J(col('#8a6238'), 0.12)); }
      for (let z = zb0; z < zb1; z += 4) { const S = at(z); for (const sx of [-3.3, 3.3]) S.p.add(G.box, mat4(sx, -0.5, z + 2, 0.25, 0.34, 4.02), col('#5a3e24')); }
      for (let z = zb0; z <= zb1 + 0.1; z += 3) { const S = at(z); for (const sx of [-3.95, 3.95]) S.p.add(cylG(6), mat4(sx, -0.2, z, 0.09, 1.45, 0.09), PAL.wood); }
      for (const sx of [-3.95, 3.95]) { const S = at(zb0), S2 = at(zb1);
        for (const [zz, SS] of [[zb0 - 1, S], [zb1 + 1, S2]]) { SS.p.add(G.box, mat4(sx * 1.08, -0.3, zz, 0.6, 4.6, 0.6), col('#5a3e24')); SS.p.add(G.pyr, mat4(sx * 1.08, 4.3, zz, 0.5, 0.5, 0.5), PAL.wood2); flagPole(sx * 1.25, zz - (zz < 500 ? 1.4 : -1.4), 5.5, { y: 0 }); }
        for (const yy of [1.15, 0.6]) for (let z = zb0; z < zb1; z += 3) rope(at(z), at(z).p, sx, yy, z, sx, yy, z + 3, 0.12, null, 1, 0.03, col('#b89a6a'));
        rope(S, S.p, sx * 1.08, 4.1, zb0 - 1, sx * 1.08, 4.1, (zb0 + zb1) / 2, 2.6, null, 1, 0.06, col('#a88a5a'));
        rope(S2, S2.p, sx * 1.08, 4.1, (zb0 + zb1) / 2, sx * 1.08, 4.1, zb1 + 1, 2.6, null, 1, 0.06, col('#a88a5a'));
        const mid = (zb0 + zb1) / 2, cab = z => { const a = z < mid ? zb0 - 1 : mid, L = mid - zb0 + 1, t = (z - a) / L; return 4.1 - 2.6 * 4 * t * (1 - t); };
        for (let z = zb0 + 3; z < zb1; z += 3) seg(at(z).p, sx, 0, z, sx * 1.08, cab(z), z, 0.015, col('#b89a6a'), 3);
      }
      for (const zw0 of [zb0, zb1]) for (let x = -70; x < 70; x += R(4, 7)) { if (Math.abs(x) < 6) continue; const jz = (vnoise(x * 0.07, 7.7) - 0.5) * 14 * sm(4, 14, Math.abs(x) - PW), y = R(-120, -10); rock(x, zw0 - jz + (zw0 === zb0 ? R(-1, 2) : R(-2, 1)), R(2, 5), col('#8a6c58'), { y }); }
      lights(-3.95, 1.3, zb0 + 1, -3.95, 1.3, zb1 - 1, 1.2, false); lights(3.95, 1.3, zb0 + 1, 3.95, 1.3, zb1 - 1, 1.2, false);
      for (const zz of [zb0 - 0.6, zb1 + 0.6]) at(zz).p.add(G.box, mat4(0, -150, zz, 7.6, 149.9, 1.2), col('#8a6c58'));
      at((zb0 + zb1) / 2).p.add(G.box, mat4(0, -152, (zb0 + zb1) / 2, 10, 2, zb1 - zb0), col('#5e6a44'));
      scatter(zb0, zb1, 6, z => { const S = at(z); S.w.add(G.plane, mat4(R(-30, 30), -148.5, z, 6, 3, 1, R(0, 3), -PI / 2), WHITE); });
    }
    { const { z0, z1 } = ST(3); const c0 = FEAT.c0, c1 = FEAT.c1;
      nature(z0, c0 - 10, { rock: 3, rockS: 1.6, tree: [juniper, 10, 6, 20] }); nature(c1 + 10, z1, { rock: 3, rockS: 1.6, tree: [juniper, 10, 6, 20] });
      // نفق الكهف
      const prof = []; for (let i = 0; i <= 14; i++) { const t = i / 14, a = PI * t; prof.push([Math.cos(a) * 6.2, i === 0 || i === 14 ? -0.4 : 3.8 + Math.sin(a) * 4.2 - (i === 1 || i === 13 ? 1.4 : 0)]); }
      prof[1][0] = 6.4; prof[13][0] = -6.4;
      let prev = null;
      for (let z = c0; z <= c1; z += 2) {
        const ring = prof.map(([x, y], i) => { const n = (i === 0 || i === 14) ? 0 : (fbm(z * 0.3, i * 0.7) - 0.5) * 1.4; const k = 1 + n / 7; return [x * k, y * (y > 0 ? 1 + n * 0.05 : 1), z + (fbm(i, z) - 0.5) * 0.6]; });
        if (prev) { const S = at(z), P = []; for (let i = 0; i < 14; i++) quad(P, prev[i], ring[i], ring[i + 1], prev[i + 1]); const g = customGeo(P); S.p.add(g, new Matrix4(), (lx, ly, lz) => J(col(ly > 6.5 ? '#6a5240' : '#86684e'), 0.18).multiplyScalar(0.8 + 0.4 * vnoise(lx * 0.4 + ly * 0.5, lz * 0.3))); }
        prev = ring;
      }
      for (const zz of [c0, c1]) { const S = at(zz), dir = zz === c0 ? -1 : 1;
        const sh = new THREE.Shape(); sh.moveTo(-60, -2); sh.lineTo(60, -2); sh.lineTo(60, 60); sh.lineTo(-60, 60); sh.lineTo(-60, -2);
        const hole = new THREE.Path(); hole.moveTo(-6.2, -0.4); prof.forEach(([x, y]) => hole.lineTo(-x, y)); sh.holes.push(hole);
        const g = prep(new THREE.ShapeGeometry(sh, 8)); S.p.add(g, mat4(0, 0, zz + dir * 0.1), (lx, ly) => J(col(ly > 20 ? '#8a6c58' : '#7a604e'), 0.08));
        for (let i = 0; i < 26; i++) { const a = R(0.1, PI - 0.1), r = R(7.5, 16); rock(Math.cos(a) * r * 1.2, zz + dir * R(0.5, 3), R(1.8, 4.5), col('#8a6c58'), { y: Math.sin(a) * r * 0.9 }); }
        arch(zz + dir * 1.2, { c: col('#9a7c62'), flag: true, depth: 1.2 });
      }
      for (let z = c0 + 6; z < c1 - 2; z += 7) { const S = at(z); for (const sx of [-1, 1]) { S.p.add(G.box, mat4(sx * 5.75, 2.4, z, 0.5, 0.12, 0.3), PAL.wood); lantern(S, null, sx * 5.45, 2.55, z, 1.1); } }
      for (let z = c0 + 4; z < c1 - 4; z += 8) lights(-4.8, 6.4, z, 4.8, 6.4, z + 4, 0.7, true);
      for (let z = c0 + 4; z < c1; z += 5) for (const sx of [-1, 1]) if (rnd() < 0.6) rock(sx * R(5, 5.6), z, R(0.4, 0.9), col('#6e5644'), { y: 0 });
    }
    { const { z0, z1 } = ST(4);
      for (let z = z0 + 10; z < z1; z += R(12, 18)) { const s = side(), dd = (Math.floor(R(1, 6)) + 0.5) * 6, x = s * (PW + dd); const y = gy(x, z); if (Math.abs(x) > 8 && free(x, z, 2)) house(x, z, s < 0 ? PI / 2 : -PI / 2, R(5, 7), R(4.5, 5.5), R(3.5, 5), { c: J(col('#a99278'), 0.06), y, flag: rnd() < 0.3, upper: rnd() < 0.3, lamps: rnd() < 0.4 }); }
      scatter(z0, z1, 3, z => { const s = side(), dd = Math.floor(R(0, 7)) * 6 + R(1.5, 4.5), x = s * (PW + dd); if (free(x, z, 1)) { if (rnd() < 0.55) bush(x, z, R(0.6, 1), { flowers: true, fc: pick([PAL.pink, col('#ff8ab8'), col('#e84a7a')]) }); else tree(x, z, R(0.45, 0.65), col('#4f7f30')); } });
      for (let z = z0 + 20; z < z1 - 20; z += 10) { const S = at(z); for (let k = 1; k <= 8; k++) { const xr = PW + 6 * k - 0.6;
        if (k <= 8) { const yt = -2.4 * (k - 1) + 0.35, yb = -2.4 * k - 0.4; pb(S, xr).add(G.box, mat4(xr, yb, z + 5, 1.3, yt - yb, 10.05), J(col('#a08a70'), 0.06)); }
        if (k <= 6) { const yt = 2.0 * k + 0.3, yb = 2.0 * (k - 1) - 0.4; pb(S, xr).add(G.box, mat4(-xr, yb, z + 5, 1.3, yt - yb, 10.05), J(col('#a08a70'), 0.06)); } } }
      falaj(FEAT.falaj[0][0], FEAT.falaj[0][1]);
      festive(z0, z1, 45);
    }
    { const { z0 } = ST(5); nature(z0, HOUSE_Z - 50, { tree: [tree, 6, 8.5, 30], bush: 6, flowers: 0.8, rock: 6 }); festive(z0, HOUSE_Z - 50, 40, { lights: true, halo: true }); }
  }
  if (grade === 4) {
    motherHouse();
    { const { z0, z1 } = ST(0);
      nature(z0, z1, { tree: [frankincense, 8, 6, 50], grass: 1.5, grassC: col('#7aa848'), rock: 8, rockC: col('#8a8072'), bush: 6, bushC: col('#4e8a32'), flowers: 0.4 });
      scatter(z0, z1, 14, z => { const s = side(), x = s * R(10, 50); if (free(x, z, 2)) (rnd() < 0.6 ? cow : (xx, zz, r) => camel(xx, zz, r, rnd() < 0.3))(x, z, R(0, TAU)); });
      for (let z = z0 + 20; z < z1; z += 70) { wallSeg(-8, z, z + 25, 0.8, col('#8a8070'), false); }
      festive(z0, z1, 60);
    }
    { const { z0, z1 } = ST(1); const zw = FEAT.zw;
      waterPlane(at(zw), -11, -0.55, zw, 8.5, 12);
      for (let i = 0; i < 26; i++) { const a = i / 26 * TAU, x = -11 + Math.cos(a) * R(8.5, 10.5); if (x < -6) rock(x, zw + Math.sin(a) * R(12, 14), R(0.6, 1.6), col('#6f685e')); }
      for (let i = 0; i < 12; i++) rock(R(-17, -14), zw + R(-6, 6), R(1, 2.2), col('#5f5850'), { y: R(-1, 3) });
      reserve(-22, -4.5, zw - 14, zw + 14);
      nature(z0, z1, { tree: [tree, 4, 7.5, 40], bush: 3, bushC: col('#3f7a2a'), grass: 2, grassC: col('#6a9a3a'), rock: 6, rockC: col('#6f685e') });
      scatter(z0, z1, 6, z => { const x = -R(18, 26); tree(x, z, R(0.9, 1.4), col('#3a6e2a')); });
    }
    { const { z0, z1 } = ST(2);
      nature(z0, z1, { tree: [tree, 1.8, 7.2, 45], bush: 2.2, bushC: col('#3a7a2a'), grass: 1.5, grassC: col('#5a8a32') });
      scatter(z0, z1, 2.5, z => { const x = side() * R(5, 9); if (free(x, z, 0.5)) { const S = at(z), y = gy(x, z); for (let k = 0; k < 5; k++) S.p.add(G.frond2, mat4(x, y + 0.1, z, 0.9, 0.9, 0.9, k * 1.25 + R(0, 1), 0, 0.5), col('#3f8a2e'), lx => [0.1 * lx, 0, 0]); } });
      festive(z0, z1, 70);
    }
    { const { z0, z1 } = ST(3);
      scatter(z0, z1, 26, z => { const s = side(), x = s * R(9, 40); if (free(x, z, 3)) { const r = R(0, TAU); for (let k = 0; k < 3; k++) camel(x + Math.sin(r) * k * 3.2, z + Math.cos(r) * k * 3.2, r, false, { saddle: true }); } });
      tent(-20, 700, PI / 2 - 0.4); tent(22, 780, -PI / 2 + 0.3); tent(-26, 812, PI / 2);
      nature(z0, z1, { tree: [acacia, 18, 9, 60], grass: 5, grassC: col('#b0984a') });
      flagPole(-6, 650, 7); flagPole(6, 730, 7); flagPole(-6, 810, 7);
    }
    { const { z0, z1 } = ST(4);
      fort(32, 960, -PI / 2 + 0.15, 1.05);
      for (let z = z0 + 25; z < z1; z += R(28, 40)) house(-R(14, 24), z, PI / 2 + R(-0.2, 0.2), R(7, 10), R(6, 8), R(4.5, 6.5), { flag: rnd() < 0.4, upper: rnd() < 0.4, lamps: true, pots: true });
      nature(z0, z1, { palm: 4.5, palmFar: 1.6, farMax: 70, bush: 6, flowers: 0.4, grass: 2.5 });
      falaj(FEAT.falaj[0][0], FEAT.falaj[0][1]);
      festive(z0, z1, 50);
    }
    { const { z0 } = ST(5); nature(z0, HOUSE_Z - 50, { palm: 6, palmFar: 2, bush: 7, flowers: 0.7 }); festive(z0, HOUSE_Z - 50, 40, { lights: true, halo: true }); }
  }
  grandmaHouse();

  // ── تجميع المقاطع ──────────────────────────────────────────
  const world = new THREE.Group(); world.name = 'world'; scene.add(world);
  for (const ch of chunks) {
    const g = ch.group; g.matrixAutoUpdate = false;
    g.add(buildTerrain(ch)); g.add(buildPath(ch));
    for (const m of [ch.p.mesh(M.props, true, true), ch.f.mesh(M.far, false, true), ch.d.mesh(M.decal, true, true), ch.g.mesh(M.glow, false, false), ch.w.mesh(WATER.stream, false, false)]) if (m) g.add(m);
    if (ch.halo.length) { const hg = new BufferGeometry(), a = ch.halo, pos = [], cc = []; for (let i = 0; i < a.length; i += 6) { pos.push(a[i], a[i + 1], a[i + 2]); cc.push(a[i + 3], a[i + 4], a[i + 5]); } hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); const pts = new THREE.Points(hg, M.halo); pts.matrixAutoUpdate = false; g.add(pts); }
    ch.p = ch.f = ch.d = ch.g = ch.w = ch.halo = null;
    world.add(g);
  }

  // مسطّحات مائية كبيرة
  if (grade === 2) {
    const sea = new Mesh(new THREE.PlaneGeometry(2400, LENGTH + 900, 60, 120).rotateX(-PI / 2).translate(-1203.5, SEA, LENGTH / 2), WATER.sea); sea.matrixAutoUpdate = false; world.add(sea);
    // زبد الأمواج على خط الشاطئ
    const pos = [], uv = [], idx = [];
    for (let z = Z0, i = 0; z <= ZEND; z += 2, i++) {
      let lo = 0, hi = 70; for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (Hraw(-(PW + m), z) > SEA) lo = m; else hi = m; }
      const sx = -(PW + lo); pos.push(sx - 4.5, SEA + 0.04, z, sx + 0.6, SEA + 0.04, z); uv.push(0, z, 1, z);
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const fg = new BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); fg.setIndex(idx);
    const foam = new Mesh(fg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime: U.time },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){ float t = uTime * 0.35 + sin(vUv.y * 0.07) * 0.6; float f = fract(t);
          float front = 0.25 + 0.6 * f; float band = smoothstep(front - 0.18, front, vUv.x) * (1.0 - smoothstep(front, front + 0.05, vUv.x));
          float lace = 0.6 + 0.4 * sin(vUv.y * 3.1 + vUv.x * 20.0 + uTime) * sin(vUv.y * 1.7 - uTime * 0.7);
          float a = band * lace * (1.0 - f * 0.7) + smoothstep(0.75, 0.95, vUv.x) * (1.0 - smoothstep(0.95, 1.0, vUv.x)) * 0.25;
          gl_FragColor = vec4(vec3(1.0), a * 0.85); }` }));
    foam.frustumCulled = false; foam.renderOrder = 1; world.add(foam);
  }
  let fallMat = null;
  if (grade === 4) { // الشلّال وقوس قزح
    const zw = FEAT.zw, x0 = -PW - 13.2;
    fallMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime: U.time },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        float h(float x){ return fract(sin(x * 91.7) * 4375.5); }
        void main(){ float cx = floor(vUv.x * 40.0); float sp = 0.8 + h(cx) * 0.6; float s = fract(vUv.y * 3.0 + uTime * sp + h(cx + 3.0));
          float streak = 0.55 + 0.45 * smoothstep(0.2, 0.9, s); float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
          vec3 c = mix(vec3(0.55, 0.78, 0.82), vec3(1.0), streak); gl_FragColor = vec4(c, edge * (0.6 + 0.35 * streak)); }` });
    const fall = new Mesh(new THREE.PlaneGeometry(6, 40, 1, 8).translate(0, 20, 0), fallMat);
    fall.position.set(x0, -0.6, zw); fall.rotation.y = PI / 2; fall.rotation.x = -0.12; world.add(fall);
    const rb = new Mesh(new THREE.RingGeometry(46, 52, 48, 1, 0, PI), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec2 vP; void main(){ float r = (length(vP) - 46.0) / 6.0; vec3 c = 0.5 + 0.5 * cos(6.2831 * (r * 0.9 + vec3(0.0, 0.33, 0.67)));
        float a = sin(r * 3.14159) * 0.32 * smoothstep(0.0, 18.0, vP.y); gl_FragColor = vec4(c, a); }` }));
    rb.position.set(-40, -6, zw + 70); rb.rotation.y = 0.5; world.add(rb);
  }

  // ── السماء والأفق البعيد (لا نهائي البعد) ─────────────────
  const INF_VS = (z) => `varying vec3 vD; varying vec3 vC;
    attribute vec3 color;
    uniform float uRot;
    void main(){ vD = position; vC = color; vec3 p = position; float c = cos(uRot), s = sin(uRot); p.xz = mat2(c, -s, s, c) * p.xz;
      vec4 q = projectionMatrix * vec4(mat3(viewMatrix) * p, 1.0); q.z = q.w * ${z}; gl_Position = q; }`;
  const SKY = { top: { value: col('#4a8bd0') }, hor: MU.sky, glow: { value: col('#ffd2a0') } };
  const sky = new Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uTop: SKY.top, uHor: SKY.hor, uGlow: SKY.glow, uSunDir: MU.sunDir, uSunCol: MU.sunCol, uRot: { value: 0 }, uGround: MU.fogCol },
    vertexShader: INF_VS('0.99999').replace('attribute vec3 color;', 'attribute vec3 color_unused;').replace('vC = color;', 'vC = vec3(0.0);'),
    fragmentShader: `uniform vec3 uTop, uHor, uGlow, uSunDir, uSunCol, uGround; varying vec3 vD;
      void main(){ vec3 d = normalize(vD); float h = d.y;
        vec3 c = mix(uHor, uTop, pow(smoothstep(0.0, 0.55, h), 0.75));
        float ahead = max(d.z, 0.0); c = mix(c, uGlow, (1.0 - smoothstep(0.0, 0.22, h)) * ahead * 0.55);
        float s = max(dot(d, normalize(uSunDir)), 0.0); c += uSunCol * (pow(s, 6.0) * 0.25 + pow(s, 900.0) * 6.0);
        c = mix(c, uGround, smoothstep(0.0, -0.05, h));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
  // حلقات الجبال البعيدة
  const RING = [];
  function horizonRing(R0, elevMax, base, hazeBase, profile, seedOff) {
    const N = 360, pos = [], colr = [], idx = [], cb = col(base);
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TAU, dx = Math.sin(a), dz = Math.cos(a);
      const e = Math.max(0, profile(a)) * elevMax;
      const n = (fbm(i * 0.05 + seedOff, seedOff) * 0.65 + (1 - Math.abs(vnoise(i * 0.18 + seedOff, 3) * 2 - 1)) * 0.35);
      const top = Math.tan((e * (0.35 + 0.8 * n)) * PI / 180) * R0;
      pos.push(dx * R0, -0.06 * R0, dz * R0, dx * R0, top, dz * R0);
      const hz = hazeBase; colr.push(cb.r, cb.g, cb.b, cb.r * 1.08, cb.g * 1.08, cb.b * 1.08);
      if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); g.setIndex(idx);
    const m = new THREE.ShaderMaterial({ side: THREE.DoubleSide, depthWrite: false, fog: false, uniforms: { uHaze: MU.fogCol, uAmt: { value: hazeBase }, uRot: { value: 0 }, uSunCol: MU.sunCol, uSunDir: MU.sunDir },
      vertexShader: INF_VS('0.9999'),
      fragmentShader: `uniform vec3 uHaze, uSunCol, uSunDir; uniform float uAmt; varying vec3 vD; varying vec3 vC;
        void main(){ vec3 d = normalize(vD); float lit = 0.75 + 0.35 * max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0);
          vec3 c = vC * lit * mix(vec3(1.0), uSunCol, 0.25);
          float k = clamp(uAmt + (1.0 - smoothstep(-0.01, 0.06, d.y)) * 0.35, 0.0, 0.97);
          gl_FragColor = vec4(mix(c, uHaze, k), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` });
    const me = new Mesh(g, m); me.frustumCulled = false; me.renderOrder = -9 + RING.length * 0.1; scene.add(me); RING.push({ me, base: hazeBase }); return me;
  }
  {
    const seaSide = a => (grade === 2 ? sm(-0.2, 0.5, Math.sin(a)) : 1); // الجهة اليسرى (sin<0) بحر في الصف الثاني
    if (grade === 1) { horizonRing(880, 7, '#8f7a86', 0.6, a => 1, 11); horizonRing(840, 4.2, '#9a7258', 0.42, a => 0.6 + 0.4 * Math.abs(Math.sin(a * 2)), 37); }
    if (grade === 2) { horizonRing(880, 7, '#7d7f94', 0.6, seaSide, 11); horizonRing(840, 3.5, '#8f7462', 0.42, a => seaSide(a) * 0.9, 37); }
    if (grade === 3) { horizonRing(880, 13, '#80849a', 0.55, a => 1, 5); horizonRing(840, 7, '#8a6e5e', 0.38, a => 1, 23); }
    if (grade === 4) { horizonRing(880, 6, '#7f9088', 0.6, a => 1, 9); horizonRing(840, 3.4, '#5f7a52', 0.45, a => 0.7 + 0.3 * Math.cos(a * 3), 41); }
  }
  // سُحب
  const clouds = (() => {
    const N = grade === 4 ? 26 : 16, pos = [], uv = [], idx = [];
    for (let i = 0; i < N; i++) {
      const a = R(0, TAU), el = R(0.13, 0.42), r = 860, w = R(110, 220), h = w * 0.42;
      const cx = Math.sin(a) * Math.cos(el) * r, cy = Math.sin(el) * r, cz = Math.cos(a) * Math.cos(el) * r;
      const rx = Math.cos(a), rz = -Math.sin(a), k = pos.length / 3;
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { pos.push(cx + rx * (u - 0.5) * w, cy + (v - 0.5) * h, cz + rz * (u - 0.5) * w); uv.push(u, v); }
      idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    }
    const g = new BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, uniforms: { map: { value: cloudTex }, uRot: { value: 0 }, uTint: MU.sky, uSunCol: MU.sunCol, uOp: { value: 0.85 } },
      vertexShader: INF_VS('0.99995').replace('attribute vec3 color;', 'varying vec2 vUv;').replace('vC = color;', 'vC = vec3(0.0); vUv = uv;'),
      fragmentShader: `uniform sampler2D map; uniform vec3 uTint, uSunCol; uniform float uOp; varying vec2 vUv; varying vec3 vC;
        void main(){ vec4 t = texture2D(map, vUv); vec3 c = mix(uTint, vec3(1.0), 0.55) * mix(vec3(0.88), uSunCol, vUv.y * 0.35 + 0.1) * (0.82 + 0.25 * vUv.y);
          gl_FragColor = vec4(c, t.a * uOp);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }` });
    const me = new Mesh(g, m); me.frustumCulled = false; me.renderOrder = -8; scene.add(me); return me;
  })();

  // ── الإضاءة والضباب ─────────────────────────────────────────
  if (renderer && renderer.shadowMap) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
  const hemi = new THREE.HemisphereLight('#ffe9c9', '#8a6440', 1.1); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffd29a', 3.0);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 50, bottom: -50, near: 1, far: 260 });
  sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  scene.fog = new THREE.Fog('#f0cfa4', 60, 340);

  // ── الأمزجة لكل مرحلة ──────────────────────────────────────
  // [أعلى السماء، الأفق، الضباب، قريب، بعيد، سماء نصف كروية، أرض، شدة، لون الشمس، شدتها، لون الغبار، كثافته، توهج الأفق]
  const SUNSET = ['#5a70b8', '#ffbf86', '#f6bf8a', 60, 330, '#ffe0c0', '#8a5a3a', 1.05, '#ffb877', 3.0, '#f0c090', 0.3, '#ff9a5a'];
  const MOODS = [null, [
    ['#4a8bd0', '#f6d3a6', '#f0cfa4', 70, 360, '#fff0d8', '#9a7048', 1.15, '#ffd8a8', 3.0, '#e8c89a', 0.25, '#ffc890'],
    ['#3f86cf', '#ecdcb8', '#e8d8b6', 60, 330, '#f4f2e0', '#6f7a4a', 1.15, '#ffe0b0', 2.9, '#e0d4b0', 0.2, '#ffd8a0'],
    ['#3a78c0', '#e9cfaa', '#e6cba6', 60, 340, '#fbe9d4', '#7a5a44', 1.1, '#ffd6a0', 3.1, '#d9c0a0', 0.25, '#ffc890'],
    ['#4f86c6', '#fbcf94', '#f6c88e', 60, 330, '#ffe7c4', '#b07a40', 1.1, '#ffc98a', 3.3, '#f0c080', 0.75, '#ffb070'],
    ['#4687cc', '#f3d6a8', '#efd2a2', 65, 350, '#f6f4dc', '#6d7a40', 1.15, '#ffdcaa', 3.0, '#e6d0a0', 0.25, '#ffc890'], SUNSET],
  [
    ['#2f8ae0', '#d6ecf2', '#d8eaec', 70, 380, '#f2fbff', '#c8a878', 1.2, '#fff0d6', 3.0, '#ffffff', 0.15, '#ffe8c8'],
    ['#3189dc', '#e4ecea', '#e2e9e4', 65, 360, '#f4f8f2', '#b89a70', 1.2, '#ffecd0', 3.0, '#ffffff', 0.15, '#ffe0b8'],
    ['#4a80c6', '#f4d2a4', '#eccba0', 50, 300, '#ffe6c4', '#8a6040', 1.05, '#ffcf96', 3.0, '#e8c8a0', 0.3, '#ffc080'],
    ['#3486d6', '#dbe7ea', '#d9e4e4', 70, 380, '#f2f8fa', '#a08a70', 1.15, '#ffe6c6', 3.0, '#ffffff', 0.15, '#ffd8b0'],
    ['#5a7fc4', '#f8cfb0', '#f0ccb0', 70, 380, '#ffe8d6', '#8a7060', 1.1, '#ffc898', 3.0, '#f0d0b0', 0.2, '#ffa878'], SUNSET],
  [
    ['#2c72c8', '#dfe8ee', '#dbe4ea', 80, 420, '#f0f6ff', '#7a6450', 1.15, '#fff2dc', 3.1, '#e0dcd0', 0.15, '#ffe2c0'],
    ['#2f74c6', '#e2e8ea', '#dde4e6', 75, 400, '#f2f6f8', '#6f6448', 1.15, '#fff0d8', 3.0, '#e0dcd0', 0.15, '#ffe0c0'],
    ['#3474c4', '#e6e4e0', '#e0dedb', 80, 420, '#f6f2ec', '#7a6450', 1.15, '#ffeccc', 3.1, '#e0dcd0', 0.15, '#ffd8b0'],
    ['#2f6fbf', '#e6dccb', '#e0d6c4', 60, 360, '#f6efe4', '#6e5a48', 1.1, '#ffe6c0', 3.0, '#e0d0c0', 0.3, '#ffd0a0'],
    ['#3d7ac4', '#f2d6ae', '#ecd2ac', 70, 380, '#fff2dc', '#7a6a48', 1.15, '#ffdcaa', 3.0, '#f0dcc0', 0.2, '#ffc890'], SUNSET],
  [
    ['#a9bcc2', '#e0e6e3', '#dde4e1', 14, 150, '#eef4f2', '#4f6e3a', 1.45, '#fff6e8', 1.3, '#ffffff', 0.55, '#f0f0e8'],
    ['#9fb8c4', '#e2e9e6', '#dde6e3', 22, 190, '#eef4f2', '#4f6e3a', 1.4, '#fff4e4', 1.7, '#ffffff', 0.45, '#f0f0e8'],
    ['#8fb0c4', '#dfe8e0', '#d6e2d8', 24, 220, '#eef6ea', '#3f5f30', 1.35, '#fff2d8', 2.1, '#f8fff0', 0.3, '#f0f0e0'],
    ['#4a76b8', '#ffc07a', '#f6bd80', 60, 340, '#ffe2c0', '#b0703a', 1.1, '#ffb060', 3.3, '#f2b070', 0.7, '#ff9a50'],
    ['#4a84c8', '#f6d2a0', '#f0cfa0', 60, 340, '#fff0d8', '#7a7040', 1.15, '#ffd49a', 3.0, '#e8d0a0', 0.25, '#ffc080'], SUNSET]][grade];
  const CAVE = ['#2f6fbf', '#4a3422', '#3a2a1c', 10, 120, '#ffd4a0', '#5a3a22', 0.85, '#ffb070', 0.5, '#ffd8a0', 0.5, '#4a3422'];
  const toMood = a => ({ top: col(a[0]), hor: col(a[1]), fog: col(a[2]), near: a[3], far: a[4], hs: col(a[5]), hg: col(a[6]), hi: a[7], sc: col(a[8]), si: a[9], dc: col(a[10]), da: a[11], glow: col(a[12]) });
  const moods = MOODS.map(toMood), caveMood = toMood(CAVE);
  const cur = toMood(MOODS[0]), tgt = toMood(MOODS[0]);
  const blendMood = (out, a, b, t) => { for (const k in out) { if (out[k].isColor) out[k].copy(a[k]).lerp(b[k], t); else out[k] = a[k] + (b[k] - a[k]) * t; } };
  function moodAt(z, out) {
    const ws = weights(z, 30); let first = true, acc = 0;
    for (const [i, w] of ws) { if (first) { blendMood(out, moods[i], moods[i], 0); acc = w; first = false; } else { acc += w; blendMood(out, out, moods[i], w / acc); } }
    if (grade === 3) { const cf = sm(FEAT.c0 - 4, FEAT.c0 + 14, z) * (1 - sm(FEAT.c1 - 14, FEAT.c1 + 4, z)); if (cf > 0) blendMood(out, out, caveMood, cf); }
    return out;
  }

  // ── عناصر حيّة: طيور، غبار، دخان ───────────────────────────
  const birds = (() => {
    const g = new BufferGeometry(), P = [];
    P.push(0, 0, 0.25, -0.9, 0.12, -0.05, 0, 0, -0.15, 0, 0, 0.25, 0, 0, -0.15, 0.9, 0.12, -0.05, 0, 0, 0.35, -0.06, 0, -0.4, 0.06, 0, -0.4);
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals();
    const m = new THREE.MeshLambertMaterial({ color: grade === 2 ? '#f4f4f0' : '#3a3028', side: THREE.DoubleSide });
    m.onBeforeCompile = sh => { sh.uniforms.uTime = U.time; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat bph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.3; transformed.y += abs(position.x) * sin(uTime * 9.0 + bph) * 0.55;'); };
    const N = 18, im = new THREE.InstancedMesh(g, m, N); im.frustumCulled = false; scene.add(im);
    const data = Array.from({ length: N }, (_, i) => ({ f: (i / 6) | 0, r: R(6, 16), sp: R(0.25, 0.45) * (rnd() < 0.5 ? 1 : -1), ph: R(0, TAU), y: R(16, 30), s: R(0.8, 1.3) }));
    return { im, data };
  })();
  const dust = (() => {
    const N = 360, g = new BufferGeometry(), pos = new Float32Array(N * 3), off = [];
    for (let i = 0; i < N; i++) off.push([R(-26, 26), R(0.2, 9), R(-12, 90), R(0.3, 1.2), R(0, TAU)]);
    g.setAttribute('position', new BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ map: dotTex, size: 0.16, transparent: true, depthWrite: false, opacity: 0.4, color: '#ffe8c0' });
    const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p); return { p, off, pos, base: 0 };
  })();
  const smoke = (() => {
    if (!smokeSrc.length) return null;
    const N = 14 * smokeSrc.length, g = new BufferGeometry(), pos = new Float32Array(N * 3);
    g.setAttribute('position', new BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ map: dotTex, size: 1.1, transparent: true, depthWrite: false, opacity: 0.45, color: '#e8e2da' });
    const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p); return { p, pos, N };
  })();
  let mist = null;
  if (grade === 4) {
    const N = 90, pos = []; for (let i = 0; i < N; i++) { const z = R(-20, 640); pos.push(side() * R(6, 70), R(1, 7), z); }
    for (let i = 0; i < 14; i++) pos.push(R(-17, -6), R(0.5, 4), FEAT.zw + R(-6, 6));
    const g = new BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    mist = new THREE.Points(g, new THREE.PointsMaterial({ map: dotTex, size: 26, transparent: true, depthWrite: false, opacity: 0.22, color: '#ffffff' })); world.add(mist);
  }

  // ── التحديث لكل إطار ───────────────────────────────────────
  let time = 0, manualZ = null, first = true;
  const sunOff = new Vector3();
  function update(dt, heroZ, camera) {
    dt = Math.max(0, Math.min(dt || 0, 0.25)); time += dt; U.time.value = time;
    const zs = Array.isArray(heroZ) ? heroZ : [heroZ ?? 0];
    let zMin = Infinity, zMax = -Infinity, zSum = 0; for (const z of zs) { zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); zSum += z; }
    const zMid = zSum / zs.length;
    // المزاج
    moodAt(manualZ ?? zMid, tgt);
    blendMood(cur, cur, tgt, first ? 1 : 1 - Math.exp(-dt * 2.2)); first = false;
    scene.fog.color.copy(cur.fog); scene.fog.near = cur.near; scene.fog.far = cur.far;
    SKY.top.value.copy(cur.top); MU.sky.value.copy(cur.hor); SKY.glow.value.copy(cur.glow); MU.fogCol.value.copy(cur.fog); MU.sunCol.value.copy(cur.sc);
    hemi.color.copy(cur.hs); hemi.groundColor.copy(cur.hg); hemi.intensity = cur.hi; sun.color.copy(cur.sc); sun.intensity = cur.si;
    for (const r of RING) r.me.material.uniforms.uAmt.value = clamp(r.base + (1 - clamp((cur.far - 120) / 240, 0, 1)) * 0.5, 0, 0.97);
    clouds.material.uniforms.uRot.value = time * 0.004; clouds.material.uniforms.uOp.value = grade === 4 ? 0.95 : 0.8;
    // الشمس والظل يتبعان البطل
    const span = Math.min(110, zMax - zMin), half = clamp(span / 2 + 34, 34, 90);
    const sc = sun.shadow.camera; if (Math.abs(sc.top - half) > 0.5) { sc.top = half + 10; sc.bottom = -half - 10; sc.left = -38; sc.right = 38; sc.updateProjectionMatrix(); }
    const cz = (zMin + zMax) / 2 + 16;
    sun.target.position.set(0, 0, Math.round(cz * 2) / 2); sunOff.copy(MU.sunDir.value).multiplyScalar(130);
    sun.position.copy(sun.target.position).add(sunOff); sun.target.updateMatrixWorld();
    // رؤية المقاطع
    const ahead = cur.far + 40;
    for (const ch of chunks) ch.group.visible = ch.z1 > zMin - 45 && ch.z0 < zMax + ahead;
    // الطيور
    const bd = birds.data, m4 = _m, q = _q;
    for (let i = 0; i < bd.length; i++) {
      const b = bd[i], a = time * b.sp + b.ph, fx = ((b.f % 3) - 1) * 22, fz = zMid + 60 + b.f * 25;
      const x = fx + Math.cos(a) * b.r, z = fz + Math.sin(a) * b.r, y = b.y + Math.sin(time * 0.8 + i) * 1.5;
      _e.set(0, -a + (b.sp > 0 ? 0 : PI), Math.sin(time + i) * 0.15); q.setFromEuler(_e);
      m4.compose(_p.set(x, y, z), q, _s.set(b.s, b.s, b.s)); birds.im.setMatrixAt(i, m4);
    }
    birds.im.instanceMatrix.needsUpdate = true;
    // الغبار
    const D = dust, cx0 = camera ? camera.position.x : 0;
    D.p.material.color.copy(cur.dc); D.p.material.opacity = 0.15 + cur.da * 0.6; D.p.material.size = 0.1 + cur.da * 0.12;
    for (let i = 0; i < D.off.length; i++) {
      const o = D.off[i]; o[0] += dt * (0.8 + o[3]) * (grade === 4 && zMid < 630 ? -0.2 : 1); o[1] += Math.sin(time * o[3] + o[4]) * dt * 0.3; o[2] -= dt * o[3] * 0.4;
      if (o[0] > 26) o[0] -= 52; if (o[0] < -26) o[0] += 52;
      let z = zMid + o[2]; if (z < zMid - 12) { o[2] += 102; z += 102; }
      D.pos[i * 3] = cx0 + o[0]; D.pos[i * 3 + 1] = o[1]; D.pos[i * 3 + 2] = z;
    }
    D.p.geometry.attributes.position.needsUpdate = true;
    // دخان اللبان
    if (smoke) {
      const per = 14;
      for (let k = 0; k < smokeSrc.length; k++) for (let i = 0; i < per; i++) { const t = ((time * 0.35 + i / per) % 1), j = (k * per + i) * 3, s = smokeSrc[k]; smoke.pos[j] = s[0] + Math.sin(t * 6 + i) * 0.25 * t + t * 0.4; smoke.pos[j + 1] = s[1] + t * 3.2; smoke.pos[j + 2] = s[2] + Math.cos(t * 5 + i) * 0.2 * t; }
      smoke.p.geometry.attributes.position.needsUpdate = true; smoke.p.visible = zMax > HOUSE_Z - 250;
    }
  }
  update(0.016, 0, null);

  return {
    length: LENGTH, stages, houseZ: HOUSE_Z, lanes: [-2, 0, 2], pathHalfWidth: 3.5,
    features: { ...FEAT, falaj: FEAT.falaj },
    update,
    setStageMood(i) { manualZ = (i == null || i < 0 || !stages[i]) ? null : (stages[i].z0 + stages[i].z1) / 2; },
    groundHeight: (x, z) => (Math.abs(x) <= PW ? 0 : Hraw(x, z)), // ارتفاع التضاريس خارج المسار (لوضع عناصر اللعب على الجوانب)
    lights: { sun, hemi },
    dispose() { scene.remove(world, sky, clouds, hemi, sun, sun.target, birds.im, dust.p); if (smoke) scene.remove(smoke.p); RING.forEach(r => scene.remove(r.me)); },
  };
}
