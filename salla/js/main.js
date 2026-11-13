import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { QUESTIONS } from './questions.js';

// ───────────────────────── إعدادات عامة ─────────────────────────
const CFG = {
  relayCount: 4,          // عدد اللاعبين في كل فريق (تتابع)
  relaySeconds: 40,       // مدة كل لاعب بالثواني
  baseSpeed: 9, turboSpeed: 13, stumbleSpeed: 3.5,
  laneW: 1.8,
  streetX: [7, -7],       // الفريق 0 (يمين الشاشة) والفريق 1 (يسار الشاشة)
  gateEvery: 150, gateFirst: 110,
  chunkLen: 40, chunks: 9,
  heroHeight: 1.45,
};
const HEROES = [
  { id: 'salim', name: 'سالم' }, { id: 'mazin', name: 'مازن' },
  { id: 'maitha', name: 'ميثاء' }, { id: 'shamsa', name: 'شمسة' },
];
const ANIM_FILES = ['wave_climb', 'idle_push', 'dance_pickup', 'sit'];

const $ = (s) => document.querySelector(s);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;

// ───────────────────────── المُصيِّر والمشهد ─────────────────────────
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const FOG = new THREE.Color('#e9b78a');
scene.fog = new THREE.Fog(FOG, 70, 330);

const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(76), THREE.MathUtils.degToRad(155));
const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { sunDir: { value: sun.clone() } },
  vertexShader: 'varying vec3 vW; void main(){ vW = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
  fragmentShader: `uniform vec3 sunDir; varying vec3 vW;
    void main(){ float h = clamp(vW.y, -0.1, 1.0);
      vec3 top = vec3(0.24,0.45,0.72), mid = vec3(0.98,0.72,0.45), hor = vec3(1.0,0.83,0.58);
      vec3 c = mix(hor, mid, smoothstep(0.0, 0.12, h)); c = mix(c, top, smoothstep(0.12, 0.7, h));
      float s = max(dot(normalize(vW), normalize(sunDir)), 0.0);
      c += vec3(1.0,0.62,0.25) * pow(s, 8.0) * 0.55 + vec3(1.0,0.9,0.7) * pow(s, 400.0) * 3.0;
      gl_FragColor = vec4(c, 1.0); }`,
}));
scene.add(sky);

const hemi = new THREE.HemisphereLight('#ffe2b8', '#7a5232', 1.15);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight('#ffc98a', 3.2);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
const sc = sunLight.shadow.camera;
sc.left = -32; sc.right = 32; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 160;
sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.03;
scene.add(sunLight, sunLight.target);
const SUN_OFF = sun.clone().multiplyScalar(80);

const cams = [0, 1].map(() => new THREE.PerspectiveCamera(58, 1, 0.1, 1200));
const cineCam = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 2000);

addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); cineCam.aspect = innerWidth / innerHeight; cineCam.updateProjectionMatrix(); });

// ───────────────────────── خامات مرسومة إجرائيًا ─────────────────────────
function noiseCanvas(w, h, base, spread, extra) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = base; g.fillRect(0, 0, w, h);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * spread; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.8; }
  g.putImageData(img, 0, 0);
  if (extra) extra(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4; return t;
}
const TEX = {
  plaster: noiseCanvas(256, 256, '#d8b37f', 34, (g, w, h) => {
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(120,80,40,${Math.random() * 0.12})`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 40, 6 + Math.random() * 20, 0, 0, 7); g.fill(); }
  }),
  plaster2: noiseCanvas(256, 256, '#e6cfa6', 26),
  sand: noiseCanvas(512, 512, '#d6ac72', 40, (g, w, h) => {
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(90,60,30,${Math.random() * 0.15})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  }),
  stone: noiseCanvas(256, 256, '#b98f61', 30, (g, w, h) => {
    g.strokeStyle = 'rgba(80,50,25,.35)'; g.lineWidth = 2;
    for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / 32) % 2 ? 0 : 32; x < w; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); } }
  }),
  wood: noiseCanvas(128, 128, '#6b4423', 30, (g, w, h) => {
    for (let y = 0; y < h; y += 6) { g.fillStyle = `rgba(30,15,5,${0.15 + Math.random() * 0.2})`; g.fillRect(0, y, w, 2); }
  }),
};
TEX.sand.repeat.set(4, 20);

const MAT = {
  plaster: new THREE.MeshStandardMaterial({ map: TEX.plaster, roughness: 0.95 }),
  plaster2: new THREE.MeshStandardMaterial({ map: TEX.plaster2, roughness: 0.95 }),
  stone: new THREE.MeshStandardMaterial({ map: TEX.stone, roughness: 0.9 }),
  wood: new THREE.MeshStandardMaterial({ map: TEX.wood, roughness: 0.8 }),
  dark: new THREE.MeshStandardMaterial({ color: '#2a1a0e', roughness: 1 }),
  sand: new THREE.MeshStandardMaterial({ map: TEX.sand, roughness: 1 }),
  clay: new THREE.MeshStandardMaterial({ color: '#b5622f', roughness: 0.7 }),
  clay2: new THREE.MeshStandardMaterial({ color: '#8c4a24', roughness: 0.7 }),
  gold: new THREE.MeshStandardMaterial({ color: '#ffcf4a', metalness: 1, roughness: 0.25, emissive: '#7a4f00', emissiveIntensity: 0.6 }),
  red: new THREE.MeshStandardMaterial({ color: '#c8102e', roughness: 0.8, side: THREE.DoubleSide }),
  green: new THREE.MeshStandardMaterial({ color: '#00843d', roughness: 0.8, side: THREE.DoubleSide }),
  white: new THREE.MeshStandardMaterial({ color: '#f4efe6', roughness: 0.8, side: THREE.DoubleSide }),
  palm: new THREE.MeshStandardMaterial({ color: '#3f6b2a', roughness: 0.9, side: THREE.DoubleSide }),
  trunk: new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 1 }),
  lamp: new THREE.MeshStandardMaterial({ color: '#ffd27a', emissive: '#ffb347', emissiveIntensity: 2.2 }),
};

// ───────────────────────── قطع البيئة ─────────────────────────
function box(w, h, d, mat, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }

function makeBuilding(w, h, d, side) {
  // side = +1 الواجهة تطل على -X ، -1 تطل على +X
  const g = new THREE.Group();
  const mat = Math.random() < 0.5 ? MAT.plaster : MAT.plaster2;
  const body = box(w, h, d, mat, 0, h / 2, 0); g.add(body);
  // شرفات القلعة (Crenellations)
  for (let z = -d / 2 + 0.4; z < d / 2; z += 1.1) g.add(box(0.5, 0.6, 0.5, mat, -side * (w / 2 - 0.25), h + 0.3, z));
  // باب خشبي مقوّس ونوافذ
  const face = -side * (w / 2 + 0.01);
  const doorZ = (Math.random() - 0.5) * (d - 3);
  const door = box(0.12, 2.4, 1.4, MAT.wood, face, 1.2, doorZ); g.add(door);
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.13, 16, 1, false, 0, Math.PI), MAT.wood);
  arch.rotation.set(0, 0, Math.PI / 2); arch.rotation.y = Math.PI / 2; arch.position.set(face, 2.4, doorZ); g.add(arch);
  for (let i = 0; i < 2; i++) {
    const wz = (i ? 1 : -1) * (d / 4) + (Math.random() - 0.5);
    if (Math.abs(wz - doorZ) < 1.6) continue;
    g.add(box(0.1, 1.1, 0.8, MAT.dark, face, h * 0.62, wz));
    g.add(box(0.16, 0.12, 1.0, MAT.wood, face, h * 0.62 + 0.6, wz));
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function makeAwning(len, side) {
  const g = new THREE.Group();
  const stripes = [MAT.red, MAT.white, MAT.green];
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.8, len / 6), stripes[i % 3]);
    p.rotation.x = -Math.PI / 2; p.rotation.y = side * 0.32;
    p.position.set(0, 0, -len / 2 + len / 12 + (i * len) / 6); g.add(p);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function makePot(scale = 1, mat = MAT.clay) {
  const pts = [[0, 0], [0.18, 0.02], [0.28, 0.2], [0.3, 0.38], [0.22, 0.58], [0.12, 0.66], [0.13, 0.75], [0.16, 0.8]].map(([x, y]) => new THREE.Vector2(x, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 18), mat);
  m.scale.setScalar(scale); m.castShadow = true; return m;
}

function makeStall(side) {
  const g = new THREE.Group();
  g.add(box(1.4, 0.8, 3, MAT.wood, 0, 0.4, 0));
  for (let i = 0; i < 5; i++) { const p = makePot(0.55 + Math.random() * 0.3, Math.random() < 0.5 ? MAT.clay : MAT.clay2); p.position.set((Math.random() - 0.5) * 0.8, 0.8, -1.2 + i * 0.6); g.add(p); }
  const aw = makeAwning(3.2, side); aw.position.set(side * 0.2, 2.5, 0); g.add(aw);
  for (const z of [-1.5, 1.5]) for (const x of [-0.65, 0.65]) g.add(box(0.08, 2.5, 0.08, MAT.wood, x, 1.25, z));
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function makePalm(h = 7) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, h, 8), MAT.trunk); trunk.position.y = h / 2; trunk.castShadow = true; g.add(trunk);
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 3.2, 1, 6), MAT.palm);
    const pos = leaf.geometry.attributes.position;
    for (let k = 0; k < pos.count; k++) { const y = pos.getY(k); pos.setZ(k, -Math.pow((y + 1.6) / 3.2, 2) * 1.4); }
    leaf.geometry.computeVertexNormals();
    leaf.position.set(0, h, 0); leaf.rotation.set(-0.9, (i / 9) * Math.PI * 2, 0, 'YXZ');
    leaf.geometry.translate(0, 1.6, 0); leaf.castShadow = true; g.add(leaf);
  }
  return g;
}

const flagTex = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#c8102e'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#fff'; g.fillRect(80, 0, 176, 43); g.fillStyle = '#00843d'; g.fillRect(80, 85, 176, 43);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const flags = [];
function makeFlag() {
  const g = new THREE.Group();
  g.add(box(0.06, 4, 0.06, MAT.wood, 0, 2, 0));
  const geo = new THREE.PlaneGeometry(1.6, 0.8, 12, 4); geo.translate(0.8, 0, 0);
  const f = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8 }));
  f.position.y = 3.55; f.castShadow = true; g.add(f);
  f.userData.base = geo.attributes.position.array.slice(); flags.push(f);
  return g;
}
function waveFlags(t) {
  for (const f of flags) {
    if (!f.visible) continue;
    const p = f.geometry.attributes.position, b = f.userData.base;
    for (let i = 0; i < p.count; i++) { const x = b[i * 3]; p.array[i * 3 + 2] = Math.sin(x * 4 - t * 6 + f.id) * 0.12 * x; }
    p.needsUpdate = true;
  }
}

function makeLantern() {
  const g = new THREE.Group();
  g.add(box(0.05, 0.6, 0.05, MAT.dark, 0, 0.3, 0));
  const l = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), MAT.lamp); l.scale.y = 1.4; g.add(l);
  return g;
}

// قطعة شارع طولها 40م لشارع واحد (المباني على الجانبين يشاركها الشارع المجاور في المنتصف)
function makeChunk(variant) {
  const g = new THREE.Group();
  const L = CFG.chunkLen;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, L), MAT.sand); ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, L / 2); ground.receiveShadow = true; g.add(ground);
  // حجارة الطريق
  const road = new THREE.Mesh(new THREE.PlaneGeometry(6.4, L), MAT.stone); road.rotation.x = -Math.PI / 2; road.position.set(0, 0.01, L / 2); road.receiveShadow = true; g.add(road);
  for (const side of [1, -1]) {
    let z = 0;
    while (z < L) {
      const w = 6 + Math.random() * 3, d = Math.min(5 + Math.random() * 5, L - z), h = 4.5 + Math.random() * 4;
      if (d < 2) break;
      const b = makeBuilding(w, h, d, side); b.position.set(side * (3.6 + w / 2 + 1.4), 0, z + d / 2); g.add(b);
      z += d + (Math.random() < 0.3 ? 2.5 : 0.1);
    }
    for (let i = 0; i < 2; i++) { const s = makeStall(side); s.position.set(side * 4.1, 0, 6 + i * 20 + Math.random() * 8); g.add(s); }
    const lan = makeLantern(); lan.position.set(side * 4.6, 3.2, 14 + Math.random() * 10); g.add(lan);
    if (Math.random() < 0.6) { const fl = makeFlag(); fl.position.set(side * 3.9, 0, 30 + Math.random() * 6); fl.rotation.y = side > 0 ? Math.PI : 0; g.add(fl); }
  }
  if (variant % 3 === 0) { // قوس مزيّن فوق الشارع
    const a = new THREE.Group();
    a.add(box(0.8, 6, 0.8, MAT.plaster2, -4, 3, 0), box(0.8, 6, 0.8, MAT.plaster2, 4, 3, 0), box(8.8, 1, 0.8, MAT.plaster2, 0, 6.2, 0));
    for (let x = -4; x <= 4; x += 0.9) a.add(box(0.4, 0.5, 0.8, MAT.plaster2, x, 6.95, 0));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.25, 8, 24, Math.PI), MAT.plaster2); ring.position.y = 4.8; a.add(ring);
    a.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    a.position.z = 20; g.add(a);
  }
  if (Math.random() < 0.7) { const p = makePalm(6 + Math.random() * 3); p.position.set((Math.random() < 0.5 ? 1 : -1) * 14, 0, Math.random() * L); g.add(p); }
  return g;
}

// خلفية بعيدة: جبال وقلعة تتحرك مع المتسابقين
const horizon = new THREE.Group();
{
  const ridge = (dist, h, col, seed) => {
    const sh = new THREE.Shape(); const W = 1400; sh.moveTo(-W / 2, -20);
    let r = seed; const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
    for (let x = -W / 2; x <= W / 2; x += 18) sh.lineTo(x, h * (0.45 + 0.55 * Math.abs(Math.sin(x * 0.006 + seed)) ) * (0.8 + rnd() * 0.25));
    sh.lineTo(W / 2, -20);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshBasicMaterial({ color: col, fog: false, side: THREE.DoubleSide }));
    m.position.set(0, 0, dist); m.rotation.y = Math.PI; horizon.add(m);
  };
  ridge(640, 150, '#e8b18a', 3); ridge(580, 115, '#d49673', 7); ridge(520, 80, '#bf7f5e', 11);
  const fMat = new THREE.MeshBasicMaterial({ color: '#a8714f', fog: false });
  const fort = new THREE.Group();
  fort.add(box(70, 22, 30, fMat, 0, 11, 0));
  for (const x of [-38, 38]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 38, 20), fMat); t.position.set(x, 19, 0); fort.add(t); }
  const t2 = new THREE.Mesh(new THREE.CylinderGeometry(14, 16, 48, 24), fMat); t2.position.set(0, 24, -6); fort.add(t2);
  for (let a = 0; a < 20; a++) { const c = box(2.5, 3, 2.5, fMat, Math.cos(a / 20 * 6.283) * 14, 49.5, -6 + Math.sin(a / 20 * 6.283) * 14); fort.add(c); }
  fort.position.set(0, 0, 430); horizon.add(fort);
  const bigFlag = makeFlag(); bigFlag.scale.setScalar(6); bigFlag.position.set(0, 50, 424); horizon.add(bigFlag);
  bigFlag.traverse((o) => { if (o.material && o.material.map === flagTex) o.material = new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide, fog: false }); });
}
scene.add(horizon);

// شارعان + صف المباني الفاصل
const streets = [0, 1].map((t) => {
  const grp = new THREE.Group(); grp.position.x = CFG.streetX[t]; scene.add(grp);
  const chunks = [];
  for (let i = 0; i < CFG.chunks; i++) { const c = makeChunk(i + t); c.position.z = (i - 1) * CFG.chunkLen; grp.add(c); chunks.push(c); }
  return { grp, chunks };
});
function recycleChunks(t, z) {
  for (const c of streets[t].chunks) if (c.position.z + CFG.chunkLen < z - 20) c.position.z += CFG.chunks * CFG.chunkLen;
}

// ───────────────────────── الأجسام في المسار ─────────────────────────
const TEMPL = {
  jar() { const p = makePot(0.7, MAT.clay); const g = new THREE.Group(); g.add(p); return g; },
  khanjar() {
    const g = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.06, 6, 16, Math.PI * 0.9), MAT.gold); blade.rotation.z = Math.PI * 1.05; g.add(blade);
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.4, 8), MAT.gold); hilt.position.set(0.32, 0.3, 0); g.add(hilt);
    const glow = new THREE.PointLight('#ffcf4a', 4, 4); glow.position.y = 0.2; g.add(glow);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  },
  obstacle() {
    const g = new THREE.Group(); const k = Math.random();
    if (k < 0.4) { // عربة خشبية
      g.add(box(1.4, 0.5, 1.0, MAT.wood, 0, 0.55, 0));
      for (const x of [-0.75, 0.75]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 14), MAT.wood); w.rotation.z = Math.PI / 2; w.position.set(x, 0.35, 0); g.add(w); }
      for (let i = 0; i < 3; i++) { const p = makePot(0.5); p.position.set(-0.4 + i * 0.4, 0.8, 0); g.add(p); }
    } else if (k < 0.75) { // سلال وأكياس
      for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.7, 10), MAT.wood); s.position.set(-0.45 + i * 0.45, 0.35, 0); g.add(s); }
      const sack = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), MAT.plaster2); sack.scale.y = 0.7; sack.position.set(0, 0.9, 0); g.add(sack);
    } else { // جرار كبيرة
      for (let i = 0; i < 2; i++) { const p = makePot(1.15, i ? MAT.clay2 : MAT.clay); p.position.x = -0.35 + i * 0.7; g.add(p); }
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  },
};

function answerPanel(text, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 200; const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 512, 200);
  g.strokeStyle = '#ffcf4a'; g.lineWidth = 14; g.strokeRect(7, 7, 498, 186);
  g.fillStyle = '#fff'; g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let fs = 74; g.font = `900 ${fs}px Segoe UI, Tahoma, Arial`;
  while (g.measureText(text).width > 470 && fs > 30) { fs -= 4; g.font = `900 ${fs}px Segoe UI, Tahoma, Arial`; }
  g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 8; g.fillText(text, 256, 104);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.66), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide, fog: false }));
}
function makeGate(answers) {
  const g = new THREE.Group();
  g.add(box(0.7, 4.8, 0.7, MAT.plaster2, -3.2, 2.4, 0), box(0.7, 4.8, 0.7, MAT.plaster2, 3.2, 2.4, 0), box(7.2, 0.6, 0.7, MAT.plaster2, 0, 4.9, 0));
  for (let x = -3.4; x <= 3.4; x += 0.85) g.add(box(0.36, 0.45, 0.7, MAT.plaster2, x, 5.4, 0));
  const colors = ['#8a1022', '#7a5a12', '#0b5e33'];
  answers.forEach((a, i) => {
    const lane = i - 1; // -1 يسار الشاشة ... لكن الإحداثي x معكوس
    const p = answerPanel(a, colors[i]); p.position.set(-lane * CFG.laneW, 3.7, -0.4); p.rotation.y = Math.PI; g.add(p);
    const rope = box(0.03, 0.6, 0.03, MAT.dark, -lane * CFG.laneW, 4.35, -0.4); g.add(rope);
  });
  g.traverse((o) => { if (o.isMesh && !o.material.map?.isCanvasTexture) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ───────────────────────── تحميل الأبطال والحركات ─────────────────────────
const loader = new GLTFLoader();
const heroAssets = {}; const libClips = {};
function loadGLB(url, onp) { return new Promise((res, rej) => loader.load(url, res, onp, rej)); }

function cleanClip(clip) {
  // نقل الحركة بين الأبطال بأمان: نحتفظ بدوران العظام وموضع الورك فقط
  clip.tracks = clip.tracks.filter((tr) => /quaternion$/.test(tr.name) || /Hips\.position$/.test(tr.name));
  // إبقاء الحركة في مكانها: إزالة الانزلاق الأفقي لعظمة الورك
  for (const tr of clip.tracks) {
    if (/Hips\.position$/.test(tr.name)) {
      const v = tr.values, x0 = v[0], z0 = v[2];
      for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
    }
  }
  return clip;
}

async function loadAll() {
  const files = [...HEROES.map((h) => `models/${h.id}.glb`), ...ANIM_FILES.map((a) => `models/anim/${a}.glb`)];
  let done = 0; const bar = $('#loadbar');
  const tick = () => { done++; bar.style.width = `${(done / files.length) * 100}%`; };
  await Promise.all(HEROES.map(async (h) => {
    const g = await loadGLB(`models/${h.id}.glb`); tick();
    g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; if (o.material) o.material.envMapIntensity = 1; } });
    const bb = new THREE.Box3().setFromObject(g.scene); const s = CFG.heroHeight / (bb.max.y - bb.min.y);
    heroAssets[h.id] = { scene: g.scene, scale: s, clips: Object.fromEntries(g.animations.map((c) => [c.name, cleanClip(c)])) };
  }));
  for (const a of ANIM_FILES) {
    const g = await loadGLB(`models/anim/${a}.glb`); tick();
    for (const c of g.animations) if (!libClips[c.name]) libClips[c.name] = cleanClip(c);
  }
}

class Hero {
  constructor(id) {
    const a = heroAssets[id];
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(a.scene); this.model.scale.setScalar(a.scale);
    this.root.add(this.model); scene.add(this.root);
    this.mixer = new THREE.AnimationMixer(this.model);
    const clips = { ...libClips, ...a.clips };
    this.actions = {};
    for (const [k, c] of Object.entries(clips)) this.actions[k] = this.mixer.clipAction(c);
    this.cur = null;
    for (const k of ['Jump_Run', 'Victory_Cheer']) if (this.actions[k]) { this.actions[k].setLoop(THREE.LoopOnce); this.actions[k].clampWhenFinished = true; }
  }
  play(name, fade = 0.25, ts = 1) {
    const act = this.actions[name] || this.actions.Running; if (!act) return;
    act.timeScale = ts;
    if (this.cur === act) return;
    act.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.cur) this.cur.fadeOut(fade);
    this.cur = act; this.curName = name;
  }
  dispose() { scene.remove(this.root); }
}

// ───────────────────────── الصوت (مولَّد بلا ملفات) ─────────────────────────
let actx;
function beep(freqs, dur = 0.12, type = 'sine', vol = 0.18) {
  try {
    actx = actx || new AudioContext();
    let t = actx.currentTime;
    for (const f of freqs) {
      const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur); t += dur * 0.7;
    }
  } catch (e) { /* لا صوت */ }
}
const SFX = {
  coin: () => beep([988, 1319], 0.1, 'triangle'),
  gold: () => beep([784, 988, 1175, 1568], 0.11, 'triangle', 0.22),
  good: () => beep([523, 659, 784, 1047], 0.14, 'triangle', 0.25),
  bad: () => beep([220, 165], 0.22, 'sawtooth', 0.12),
  hit: () => beep([140, 90], 0.2, 'square', 0.12),
  tick: () => beep([660], 0.15, 'square', 0.12),
  go: () => beep([523, 784, 1047], 0.2, 'triangle', 0.25),
  fanfare: () => beep([523, 659, 784, 1047, 784, 1047, 1319], 0.22, 'triangle', 0.25),
};

// ───────────────────────── الألعاب النارية والغبار ─────────────────────────
const fireworks = [];
function burst(pos) {
  const n = 160, geo = new THREE.BufferGeometry(), p = new Float32Array(n * 3), v = [];
  const col = [new THREE.Color('#ff3355'), new THREE.Color('#ffffff'), new THREE.Color('#22cc66'), new THREE.Color('#ffd34a')][Math.floor(Math.random() * 4)];
  for (let i = 0; i < n; i++) { p.set([pos.x, pos.y, pos.z], i * 3); v.push(new THREE.Vector3().randomDirection().multiplyScalar(6 + Math.random() * 6)); }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.Points(geo, new THREE.PointsMaterial({ color: col, size: 0.35, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  scene.add(m); fireworks.push({ m, v, life: 2.2 }); beep([180 + Math.random() * 60], 0.3, 'sawtooth', 0.06);
}
function updateFireworks(dt) {
  for (let i = fireworks.length - 1; i >= 0; i--) {
    const f = fireworks[i]; f.life -= dt;
    const p = f.m.geometry.attributes.position;
    for (let k = 0; k < f.v.length; k++) { f.v[k].y -= 6 * dt; f.v[k].multiplyScalar(0.985); p.array[k * 3] += f.v[k].x * dt; p.array[k * 3 + 1] += f.v[k].y * dt; p.array[k * 3 + 2] += f.v[k].z * dt; }
    p.needsUpdate = true; f.m.material.opacity = Math.max(0, f.life / 2.2);
    if (f.life <= 0) { scene.remove(f.m); f.m.geometry.dispose(); fireworks.splice(i, 1); }
  }
}
const dust = (() => {
  const n = 400, geo = new THREE.BufferGeometry(); const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) p.set([(Math.random() - 0.5) * 40, Math.random() * 8, Math.random() * 120], i * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffe0b0', size: 0.06, transparent: true, opacity: 0.55, depthWrite: false }));
  scene.add(m); return m;
})();

// ───────────────────────── منطق اللعبة ─────────────────────────
function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function shuffle(arr, r = Math.random) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

let G = null; // حالة المباراة
const sel = [0, 2];

function buildCourse(seed) {
  const r = rng(seed); const items = [];
  const qs = shuffle(QUESTIONS[4], r);
  let qi = 0;
  const gates = [];
  for (let d = CFG.gateFirst; d < 4000; d += CFG.gateEvery) {
    const q = qs[qi++ % qs.length];
    const order = shuffle([0, 1, 2], r);
    gates.push({ d, q: q.q, answers: order.map((k) => q.a[k]), correct: order.indexOf(0) });
  }
  const nearGate = (d) => gates.some((g) => Math.abs(g.d - d) < 16);
  let d = 34;
  while (d < 4000) {
    if (!nearGate(d)) {
      const k = r(), lane = Math.floor(r() * 3) - 1;
      if (k < 0.42) items.push({ d, lane, type: 'obstacle' });
      else if (k < 0.9) for (let i = 0; i < 4; i++) items.push({ d: d + i * 2.6, lane, type: 'jar' });
      else items.push({ d, lane, type: 'khanjar' });
      if (k < 0.42 && r() < 0.35) items.push({ d: d + 0.1, lane: lane === 0 ? 1 : 0, type: 'obstacle' });
    }
    d += 13 + r() * 9;
  }
  return { items, gates };
}

function newMatch() {
  if (G) for (const p of G.players) p.hero.dispose();
  const course = buildCourse(Math.floor(Math.random() * 1e6) + 7);
  G = {
    state: 'intro', t: 0, relay: 0, relayLeft: CFG.relaySeconds, timeScale: 1, course,
    players: [0, 1].map((t) => {
      const hero = new Hero(HEROES[sel[t]].id);
      hero.root.position.set(CFG.streetX[t], 0, 0);
      return {
        t, hero, z: 0, x: 0, lane: 0, y: 0, vy: 0, speed: 0, score: 0, turbo: 0, stumble: 0,
        spawned: new Map(), gateIdx: 0, gateObjs: new Map(), shake: 0,
        camPos: new THREE.Vector3(CFG.streetX[t], 3, -5), camLook: new THREE.Vector3(CFG.streetX[t], 1.2, 6),
        name: $(`#tname${t}`).value || `الفريق ${t + 1}`,
      };
    }),
  };
  for (const s of streets) s.chunks.forEach((c, i) => (c.position.z = (i - 1) * CFG.chunkLen));
  G.players.forEach((p) => { p.hero.play('Idle_02', 0); $(`#hud${p.t} .name`).textContent = p.name; updateHud(p); });
  startIntro();
}

function updateHud(p) {
  $(`#hud${p.t} .score`).textContent = p.score;
  $(`#hud${p.t} .runner`).textContent = `${HEROES[sel[p.t]].name} • العدّاء ${G.relay + 1} من ${CFG.relayCount}`;
}
function fx(t, text, color) {
  const el = $(`#hud${t} .fx`); el.textContent = text; el.style.color = color;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
function caption(html, ms) {
  const c = $('#caption'); c.innerHTML = html; c.classList.add('on');
  if (ms) setTimeout(() => c.classList.remove('on'), ms);
}
function bigText(txt) { const b = $('#big'); b.textContent = txt; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
function showScreen(id) { document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === id)); }

// ── المشهد السينمائي الافتتاحي
let cinePath = null;
function startIntro() {
  showScreen(null);
  document.body.classList.add('cine'); document.body.classList.remove('split');
  G.state = 'intro'; G.t = 0;
  cinePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-40, 70, 300), new THREE.Vector3(-10, 45, 170), new THREE.Vector3(0, 30, 70),
    new THREE.Vector3(0, 16, 12), new THREE.Vector3(0, 11, -12),
  ]);
  caption('الطابق الأول • السوق القديم<small>بطولة العيد الوطني المجيد</small>', 5200);
  setTimeout(() => caption(`${G.players[0].name}  ⚔  ${G.players[1].name}`, 3000), 5600);
  G.players.forEach((p) => p.hero.play('Wave_One_Hand', 0.4));
}

function startCountdown() {
  G.state = 'count'; G.t = 0;
  document.body.classList.remove('cine'); document.body.classList.add('split');
  G.players.forEach((p) => p.hero.play('Idle_02', 0.4));
  let n = 3; bigText(n); SFX.tick();
  const iv = setInterval(() => {
    n--;
    if (n > 0) { bigText(n); SFX.tick(); }
    else { clearInterval(iv); bigText('انطلق!'); SFX.go(); G.state = 'run'; G.players.forEach((p) => p.hero.play('Running', 0.3)); }
  }, 1000);
}

function handover() {
  G.state = 'handover';
  G.players.forEach((p) => { p.hero.play('Idle_02', 0.3); });
  showScreen('handover');
  $('#hotext').textContent = `العدّاء ${G.relay + 1} يستلم الآن — استعدّوا!`;
  let n = 4; $('#hon').textContent = n; SFX.tick();
  const iv = setInterval(() => {
    n--; $('#hon').textContent = n || 'انطلق!';
    if (n > 0) SFX.tick();
    else { clearInterval(iv); SFX.go(); setTimeout(() => { showScreen(null); G.state = 'run'; G.players.forEach((p) => { updateHud(p); p.hero.play('Running', 0.3); }); }, 400); }
  }, 1000);
}

function finish() {
  G.state = 'slowmo'; G.t = 0; G.timeScale = 0.25; SFX.fanfare();
  const [a, b] = G.players;
  G.winner = a.score === b.score ? -1 : a.score > b.score ? 0 : 1;
  bigText('النهاية!');
  setTimeout(() => {
    G.state = 'victory'; G.t = 0; G.timeScale = 1;
    document.body.classList.remove('split'); document.body.classList.add('cine');
    const w = G.winner === -1 ? G.players : [G.players[G.winner]];
    w.forEach((p) => p.hero.play('Victory_Cheer', 0.3));
    setTimeout(() => w.forEach((p) => p.hero.play('Joyful_Dance_with_Hand_Sway', 0.5)), 2600);
    G.players.forEach((p) => { if (!w.includes(p)) p.hero.play('Idle_02', 0.4); });
    $('#rwin').textContent = G.winner === -1 ? 'تعادل رائع!' : `الفائز: ${G.players[G.winner].name}`;
    $('#rsub').textContent = G.winner === -1 ? 'الفريقان يصعدان معًا إلى الطابق الثاني' : 'يصعد إلى الطابق الثاني ويواجه الصف الخامس';
    $('#rscores').innerHTML = G.players.map((p) => `<span>${p.name}: ${p.score}</span>`).join('');
    setTimeout(() => showScreen('result'), 3200);
  }, 2200);
}

// ── الإدخال: لوحة المفاتيح ويد التحكم
const KEYS = [{ left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp' }, { left: 'KeyA', right: 'KeyD', jump: 'KeyW' }];
const pressed = new Set();
addEventListener('keydown', (e) => {
  if (e.repeat) return; pressed.add(e.code);
  if (G?.state === 'run') KEYS.forEach((k, t) => {
    const p = G.players[t];
    if (e.code === k.left) p.lane = Math.max(-1, p.lane - 1);
    if (e.code === k.right) p.lane = Math.min(1, p.lane + 1);
    if (e.code === k.jump) jump(p);
  });
  if (e.code === 'Enter' && $('#title').classList.contains('on')) toSetup();
});
addEventListener('keyup', (e) => pressed.delete(e.code));
const padPrev = [{}, {}];
function pollPads() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  pads.slice(0, 2).forEach((pad, t) => {
    if (!G || G.state !== 'run') return;
    const p = G.players[t], prev = padPrev[t];
    const ax = pad.axes[0] || 0;
    const left = ax < -0.5 || pad.buttons[14]?.pressed, right = ax > 0.5 || pad.buttons[15]?.pressed, jmp = pad.buttons[0]?.pressed || pad.buttons[12]?.pressed;
    if (left && !prev.left) p.lane = Math.max(-1, p.lane - 1);
    if (right && !prev.right) p.lane = Math.min(1, p.lane + 1);
    if (jmp && !prev.jmp) jump(p);
    Object.assign(prev, { left, right, jmp });
  });
}
function jump(p) {
  if (p.y > 0.01) return;
  p.vy = 7.2; p.hero.play('Jump_Run', 0.1, 1.25);
  setTimeout(() => { if (G.state === 'run' && p.y < 0.2) p.hero.play('Running', 0.25); }, 650);
}

// ── محاكاة لاعب
const tmp = new THREE.Vector3();
function simPlayer(p, dt) {
  const target = p.stumble > 0 ? CFG.stumbleSpeed : p.turbo > 0 ? CFG.turboSpeed : CFG.baseSpeed;
  p.speed = lerp(p.speed, target, 1 - Math.exp(-dt * 3));
  p.z += p.speed * dt;
  p.x = lerp(p.x, -p.lane * CFG.laneW, 1 - Math.exp(-dt * 12));
  p.vy -= 22 * dt; p.y = Math.max(0, p.y + p.vy * dt); if (p.y === 0) p.vy = 0;
  p.turbo = Math.max(0, p.turbo - dt); p.stumble = Math.max(0, p.stumble - dt); p.shake = Math.max(0, p.shake - dt);
  const r = p.hero.root; r.position.set(CFG.streetX[p.t] + p.x, p.y, p.z);
  r.rotation.y = (p.x - (-p.lane * CFG.laneW)) * -0.25;
  if (p.hero.curName === 'Running') p.hero.cur.timeScale = p.speed / CFG.baseSpeed;

  // إنشاء/إزالة العناصر القريبة
  const items = G.course.items;
  for (let i = 0; i < items.length; i++) {
    const it = items[i]; const rel = it.d - p.z;
    if (rel > 150) break;
    if (rel < -8) { const o = p.spawned.get(i); if (o) { scene.remove(o); p.spawned.delete(i); } continue; }
    let o = p.spawned.get(i);
    if (!o && !it.taken?.[p.t]) { o = TEMPL[it.type](); o.position.set(CFG.streetX[p.t] - it.lane * CFG.laneW, it.type === 'obstacle' ? 0 : 0.6, it.d); scene.add(o); p.spawned.set(i, o); }
    if (!o) continue;
    if (it.type !== 'obstacle') { o.rotation.y += dt * 2.5; o.position.y = 0.6 + Math.sin(performance.now() / 300 + i) * 0.12; }
    if (Math.abs(rel) < 0.7 && it.lane === p.lane) {
      it.taken = it.taken || {};
      if (it.type === 'obstacle' && p.y < 0.75 && !it.taken[p.t]) { it.taken[p.t] = 1; p.stumble = 1.1; p.shake = 0.4; SFX.hit(); fx(p.t, 'تعثّر!', '#ff8080'); }
      else if (it.type === 'jar' && !it.taken[p.t]) { it.taken[p.t] = 1; p.score += 10; SFX.coin(); scene.remove(o); p.spawned.delete(i); }
      else if (it.type === 'khanjar' && !it.taken[p.t]) { it.taken[p.t] = 1; p.score += 25; p.turbo = 4; SFX.gold(); fx(p.t, 'الخنجر الذهبي! سرعة!', '#ffd34a'); scene.remove(o); p.spawned.delete(i); }
      updateHud(p);
    }
  }
  // البوابات والأسئلة
  const gates = G.course.gates;
  for (let gi = p.gateIdx; gi < gates.length; gi++) {
    const g = gates[gi]; const rel = g.d - p.z;
    if (rel > 160) break;
    if (!p.gateObjs.has(gi)) { const o = makeGate(g.answers); o.position.set(CFG.streetX[p.t], 0, g.d); scene.add(o); p.gateObjs.set(gi, o); }
    const qel = $(`#hud${p.t} .q`);
    if (rel < 60 && rel > 0) { qel.textContent = g.q; qel.classList.add('on'); }
    if (rel <= 0 && gi === p.gateIdx) {
      p.gateIdx++; qel.classList.remove('on');
      const chosen = p.lane + 1;
      if (chosen === g.correct) { p.score += 50; SFX.good(); fx(p.t, 'إجابة صحيحة! +50', '#7dff9a'); p.turbo = Math.max(p.turbo, 1.5); }
      else { SFX.bad(); p.stumble = 1.2; fx(p.t, `الصحيح: ${g.answers[g.correct]}`, '#ffb070'); }
      updateHud(p);
    }
  }
  for (const [gi, o] of p.gateObjs) if (gates[gi].d < p.z - 10) { scene.remove(o); p.gateObjs.delete(gi); }
  recycleChunks(p.t, p.z);
}

function chaseCam(p, cam, dt, aspect) {
  const r = p.hero.root.position;
  const want = tmp.set(r.x * 0.6 + CFG.streetX[p.t] * 0.4, 2.4 + p.y * 0.4, r.z - 5.2);
  p.camPos.lerp(want, 1 - Math.exp(-dt * 5));
  p.camLook.lerp(new THREE.Vector3(r.x * 0.8 + CFG.streetX[p.t] * 0.2, 1.3, r.z + 7), 1 - Math.exp(-dt * 6));
  cam.position.copy(p.camPos);
  if (p.shake > 0) cam.position.add(new THREE.Vector3((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25, 0));
  cam.lookAt(p.camLook);
  cam.fov = lerp(cam.fov, p.turbo > 0 ? 70 : 58, 1 - Math.exp(-dt * 3));
  cam.aspect = aspect; cam.updateProjectionMatrix();
}

// ───────────────────────── الحلقة الرئيسية ─────────────────────────
const clock = new THREE.Clock();
let titleT = 0;
function frame() {
  requestAnimationFrame(frame);
  const rawDt = Math.min(clock.getDelta(), 0.05);
  const dt = rawDt * (G ? G.timeScale : 1);
  const now = performance.now() / 1000;
  waveFlags(now); updateFireworks(rawDt); pollPads();

  const W = innerWidth, H = innerHeight;
  if (!G || G.state === 'title') {
    titleT += rawDt;
    cineCam.position.set(Math.sin(titleT * 0.05) * 30, 22 + Math.sin(titleT * 0.1) * 4, -30 + titleT * 2 % 300);
    cineCam.lookAt(0, 4, cineCam.position.z + 60);
    focusSun(cineCam.position.z + 30);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H); renderer.render(scene, cineCam);
    return;
  }
  G.t += dt;
  G.players.forEach((p) => p.hero.mixer.update(dt));

  if (G.state === 'intro') {
    const u = Math.min(G.t / 9, 1), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    cineCam.position.copy(cinePath.getPoint(e));
    cineCam.lookAt(0, 0.8 + (1 - e) * 10, 4 + (1 - e) * 140);
    focusSun(10);
    renderSingle();
    if (u >= 1) startCountdown();
    return;
  }
  if (G.state === 'run') {
    G.relayLeft -= dt;
    $('#timer').textContent = Math.ceil(Math.max(0, G.relayLeft));
    if (G.relayLeft <= 0) {
      G.relay++;
      if (G.relay >= CFG.relayCount) { finish(); }
      else { G.relayLeft = CFG.relaySeconds; handover(); }
    } else G.players.forEach((p) => simPlayer(p, dt));
  } else if (G.state === 'slowmo') {
    G.players.forEach((p) => simPlayer(p, dt));
  }
  if (G.state === 'victory') {
    const w = G.winner === -1 ? G.players[Math.floor(G.t / 5) % 2] : G.players[G.winner];
    const c = w.hero.root.position;
    const ang = G.t * 0.35 + Math.PI, rad = 3.4;
    cineCam.position.set(c.x + Math.sin(ang) * rad, 1.6 + Math.sin(G.t * 0.5) * 0.3, c.z + Math.cos(ang) * rad);
    cineCam.lookAt(c.x, 1.0, c.z);
    if (Math.random() < rawDt * 1.6) burst(new THREE.Vector3(c.x + (Math.random() - 0.5) * 20, 12 + Math.random() * 8, c.z + 15 + Math.random() * 15));
    focusSun(c.z);
    renderSingle();
    return;
  }
  // عرض مقسوم
  const midZ = (G.players[0].z + G.players[1].z) / 2;
  focusSun(midZ);
  horizon.position.z = midZ; dust.position.z = midZ - 20;
  renderer.setScissorTest(true);
  const half = W / 2;
  G.players.forEach((p, i) => {
    const x = i === 0 ? half : 0; // الفريق الأول على يمين الشاشة
    chaseCam(p, cams[i], rawDt, half / H);
    renderer.setViewport(x, 0, half, H); renderer.setScissor(x, 0, half, H);
    renderer.render(scene, cams[i]);
  });
  renderer.setScissorTest(false);
}
function renderSingle() {
  renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
  cineCam.aspect = innerWidth / innerHeight; cineCam.updateProjectionMatrix();
  horizon.position.z = cineCam.position.z - 30;
  renderer.render(scene, cineCam);
}
function focusSun(z) {
  sunLight.target.position.set(0, 0, z + 10);
  sunLight.position.copy(sunLight.target.position).add(SUN_OFF);
}

// ───────────────────────── الشاشات ─────────────────────────
function buildSetup() {
  document.querySelectorAll('.team').forEach((el) => {
    const t = +el.dataset.t; const box = el.querySelector('.heroes'); box.innerHTML = '';
    HEROES.forEach((h, i) => {
      const d = document.createElement('div'); d.className = 'hero' + (sel[t] === i ? ' sel' : '');
      d.innerHTML = `<img src="img/${h.id}.jpg" alt=""><span>${h.name}</span>`;
      d.onclick = () => { sel[t] = i; buildSetup(); }; box.appendChild(d);
    });
  });
}
function toSetup() { showScreen('setup'); buildSetup(); }
$('#toSetup').onclick = toSetup;
$('#go').onclick = () => { try { actx = actx || new AudioContext(); actx.resume(); } catch (e) {} newMatch(); };
$('#again').onclick = () => { showScreen('setup'); buildSetup(); document.body.classList.remove('cine'); fireworks.forEach((f) => scene.remove(f.m)); fireworks.length = 0; };

frame();
loadAll().then(() => {
  showScreen('title');
  window.__ready = true;
}).catch((e) => { $('#loadtxt').textContent = 'تعذّر تحميل الملفات: شغّلي اللعبة من ملف «تشغيل اللعبة»'; console.error(e); });

window.__dbg = { get G() { return G; }, newMatch, sel, startCountdown, finish };
