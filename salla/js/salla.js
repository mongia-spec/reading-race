// «سلّة الخير: رحلة إلى بيت الجدّة» — لعبة ثلاثية الأبعاد للحلقة الأولى (الصفوف 1–4)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { BANK } from './bank.js';
import { createWorld } from './world.js';
import { createAudio } from './music.js';
import { HEROES, GRADES, COMMON, STORY, GATE_COLORS, WHO, THINK, THINK_COMMON, lineText, lineId, optionOrder, stripEmoji } from './story.js';

const $ = (s) => document.querySelector(s);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp, damp = THREE.MathUtils.damp;
let RUN = 0; const ABORT = { abort: true };
const sleep = (ms) => { const r0 = RUN; return new Promise((r, j) => setTimeout(() => (RUN === r0 ? r() : j(ABORT)), ms)); };
window.addEventListener('unhandledrejection', (e) => { if (e.reason === ABORT) e.preventDefault(); });
const rand = (a, b) => a + Math.random() * (b - a);
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } },
};

// ───────────── المُصيِّر والمشهد ─────────────
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2500);
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

let scene = null, world = null;
const audio = createAudio();
// على آيفون/آيباد: زر الصامت يكتم Web Audio؛ تشغيل مقطع صامت متكرر داخل لمسة المستخدم يجعل الجهاز يعامل اللعبة كوسائط فيُسمع الصوت
const _unlock0 = audio.unlock.bind(audio); let _keep = null;
audio.unlock = () => {
  try { if (!_keep) { _keep = new Audio('audio/silence.mp3'); _keep.loop = true; _keep.volume = 0.01; _keep.setAttribute('playsinline', ''); } _keep.play().catch(() => {}); } catch { /* */ }
  return _unlock0();
};
// بقرار الأستاذة منجية: اللعبة بلا موسيقى خلفية (تبقى المؤثرات والتصفيق والزغاريد)
audio.playTheme = () => {}; 
document.addEventListener('pointerdown', () => { try { if (audio.ctx.state !== 'running') audio.unlock(); } catch { /* */ } }, true);

// ───────────── تحميل المجسّمات ─────────────
const loader = new GLTFLoader();
// النماذج محفوظة JSON وبداخلها البيانات بصيغة base64؛ نعيد بناءها GLB في الذاكرة (لا fetch لروابط data:)
async function loadGLB(url) {
  try {
    const r = await fetch(url); if (!r.ok) return null;
    const j = await r.json(); const b = j.buffers && j.buffers[0];
    let bin = new Uint8Array(0);
    if (b && b.uri && b.uri.startsWith('data:')) {
      const s = atob(b.uri.slice(b.uri.indexOf(',') + 1)); bin = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) bin[i] = s.charCodeAt(i);
      delete b.uri;
    }
    let js = new TextEncoder().encode(JSON.stringify(j)); const jp = (4 - js.length % 4) % 4;
    const bp = (4 - bin.length % 4) % 4; const total = 12 + 8 + js.length + jp + 8 + bin.length + bp;
    const out = new ArrayBuffer(total); const dv = new DataView(out); const u8 = new Uint8Array(out);
    dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
    dv.setUint32(12, js.length + jp, true); dv.setUint32(16, 0x4E4F534A, true); u8.set(js, 20); for (let i = 0; i < jp; i++) u8[20 + js.length + i] = 0x20;
    let o = 20 + js.length + jp; dv.setUint32(o, bin.length + bp, true); dv.setUint32(o + 4, 0x004E4942, true); u8.set(bin, o + 8);
    return await new Promise((res) => loader.parse(out, '', res, () => res(null)));
  } catch (e) { console.warn('model', url, e); return null; }
}
const ASSETS = {}; const LIB = {};
const NPC_FILES = ['mother', 'grandma', 'grandpa', 'neighbor', 'wolf', 'fox', 'hyena', 'leopard', 'falcon', 'camel'];
const HEIGHTS = { salim: 1.32, shamsa: 1.32, mother: 1.68, grandma: 1.6, grandpa: 1.72, neighbor: 1.76, wolf: 1.55, fox: 1.4, hyena: 1.45, leopard: 1.5, falcon: 0.9, camel: 2.3, oryx: 1.35, hen: 0.55 };

function cleanClip(clip, keepHipsY) {
  clip = clip.clone();
  clip.tracks = clip.tracks.filter((t) => /quaternion$/.test(t.name) || (keepHipsY && /Hips\.position$/.test(t.name)));
  for (const t of clip.tracks) if (/Hips\.position$/.test(t.name)) { const v = t.values, x0 = v[0], z0 = v[2]; for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; } }
  return clip;
}
function prepModel(g, id) {
  g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; if (o.material) { o.material.envMapIntensity = 0.8; if (o.material.map) o.material.map.anisotropy = 4; } } });
  const bb = new THREE.Box3().setFromObject(g.scene);
  const h = bb.max.y - bb.min.y; const s = (HEIGHTS[id] || 1.5) / (h || 1);
  return { scene: g.scene, scale: s, minY: bb.min.y, clips: Object.fromEntries((g.animations || []).map((c) => [c.name, c])), skinned: !!g.scene.getObjectByProperty('type', 'SkinnedMesh') };
}

async function loadAll(onp) {
  const jobs = [
    ...['salim', 'shamsa'].map((id) => ['hero', id, `models/${id}.json`]),
    ...['carry', 'idle_push', 'wave_climb', 'dance_pickup', 'sit'].map((a) => ['anim', a, `models/anim/${a}.json`]),
    ...NPC_FILES.map((id) => ['npc', id, `models/npc/${id}.json`]),
  ];
  let done = 0;
  await Promise.all(jobs.map(async ([kind, id, url]) => {
    const g = await loadGLB(url); done++; onp(done / jobs.length, id);
    if (!g) return;
    if (kind === 'anim') { for (const c of g.animations) if (!LIB[c.name]) LIB[c.name] = c; if (id === 'razha' && g.animations[0]) LIB.Razha = g.animations[0]; return; }
    ASSETS[id] = prepModel(g, id);
  }));
}

// ───────────── الشخصيات ─────────────
class Actor {
  constructor(id, opts = {}) {
    this.id = id; this.root = new THREE.Group(); this.actions = {}; this.cur = null;
    const a = ASSETS[id];
    if (a) {
      this.model = a.skinned ? SkeletonUtils.clone(a.scene) : a.scene.clone(true);
      this.model.scale.setScalar(a.scale * (opts.scale || 1)); this.model.position.y = -a.minY * a.scale * (opts.scale || 1);
      this.root.add(this.model);
      if (a.skinned) {
        this.mixer = new THREE.AnimationMixer(this.model);
        const isHero = id === 'salim' || id === 'shamsa';
        const clips = {};
        for (const [k, c] of Object.entries(LIB)) clips[k] = cleanClip(c, isHero);
        for (const [k, c] of Object.entries(a.clips)) clips[k] = cleanClip(c, isHero);
        // وقفة الانتظار: نأخذ الذراعين والساقين من Idle_02 والجذع والرقبة والرأس مستقيمة من Wave (كانت Idle_02 تَطوي الجسم من الوسط)
        if (clips.Idle_02 && clips.Wave_One_Hand) {
          const w = clips.Wave_One_Hand; const fix = clips.Idle_02.clone();
          fix.tracks = fix.tracks.map((t) => {
            if (!/(Hips|Spine\d*|Neck|Head)\.quaternion$/.test(t.name)) return t;
            const wt = w.tracks.find((x) => x.name === t.name); if (!wt) return t;
            const v = Array.from(wt.values.slice(0, 4));
            return new THREE.QuaternionKeyframeTrack(t.name, [0, fix.duration], [...v, ...v]);
          });
          clips.Idle_02 = fix;
        }
        const names = new Set(); this.model.traverse((o) => names.add(o.name));
        for (const c of Object.values(clips)) c.tracks = c.tracks.filter((t) => names.has(t.name.split('.')[0]));
        for (const [k, c] of Object.entries(clips)) this.actions[k] = this.mixer.clipAction(c);
        for (const k of ['Jump_Run', 'Victory_Cheer']) if (this.actions[k]) { this.actions[k].setLoop(THREE.LoopOnce); this.actions[k].clampWhenFinished = true; }
      }
    } else {
      this.model = placeholder(id); this.root.add(this.model);
    }
    this.bob = 0;
  }
  play(name, fade = 0.25, ts = 1) {
    this.curName = name;
    const act = this.actions[name] || this.actions[ALIAS[name]] || this.actions.Walking; if (!act) return;
    act.timeScale = ts; if (this.cur === act) return;
    act.reset().setEffectiveWeight(1).fadeIn(fade).play(); if (this.cur) this.cur.fadeOut(fade); this.cur = act; this.curName = name;
  }
  update(dt) { if (this.mixer) this.mixer.update(dt); else { if (this.baseY === undefined) this.baseY = this.model.position.y; const mv = /walk|run/.test(this.curName || '') ; this.bob += dt * (mv ? 9 : 3); this.model.position.y = this.baseY + Math.abs(Math.sin(this.bob)) * (mv ? 0.12 : 0.04); this.model.rotation.z = mv ? Math.sin(this.bob) * 0.08 : 0; } }
  bone(re) { let b = null; this.model.traverse((o) => { if (!b && o.isBone && re.test(o.name)) b = o; }); return b; }
}
const ALIAS = { idle: 'Idle_02', carry: 'Carry_Water_Bucket_Walk', walk: 'Walking', run: 'Running', wave: 'Wave_One_Hand', dance: 'Joyful_Dance_with_Hand_Sway', cheer: 'Victory_Cheer', jump: 'Jump_Run', sit: 'Chair_Sit_Idle_M', razha: 'Razha' };

function placeholder(id) {
  // شكل مؤقت بسيط إن لم يتوفر ملف المجسّم
  const g = new THREE.Group(); const h = HEIGHTS[id] || 1.5;
  const col = { wolf: '#b8865a', fox: '#d9692b', hyena: '#a89a7a', leopard: '#d9b25a', mother: '#2e8b57', grandma: '#e87a2c', grandpa: '#f4f1ea', neighbor: '#f4f1ea', falcon: '#8a5a2b', camel: '#c99a5b', oryx: '#f1ece2', hen: '#b5652b' }[id] || '#ccc';
  const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(h * 0.18, h * 0.5, 6, 12), m); body.position.y = h * 0.45; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(h * 0.14, 16, 12), m); head.position.y = h * 0.88; head.castShadow = true; g.add(head);
  return g;
}

// ───────────── السلّة (تُمسك في يد البطل) ─────────────
function makeBasket() {
  const g = new THREE.Group();
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const x = cv.getContext('2d');
  x.fillStyle = '#b07a3a'; x.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 128; i += 8) for (let j = 0; j < 64; j += 8) { x.fillStyle = ((i + j) / 8) % 2 ? '#8a5a26' : '#d39a52'; x.fillRect(i, j, 8, 4); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 1);
  const wm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.16, 18, 1, true), wm); body.castShadow = true; g.add(body);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.12, 18), wm); bottom.rotation.x = -Math.PI / 2; bottom.position.y = -0.08; g.add(bottom);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 24, Math.PI), new THREE.MeshStandardMaterial({ color: '#7a4d1c' })); handle.position.y = 0.07; g.add(handle);
  // محتويات ظاهرة فوق حافة السلّة: خبز وتمر ودواء ومنديل
  const breadM = new THREE.MeshStandardMaterial({ color: '#d99a4e', roughness: 0.75 });
  for (const [x, z, r] of [[0.05, -0.03, 0.4], [-0.02, 0.05, -0.5]]) { const br = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.11, 6, 12), breadM); br.rotation.z = Math.PI / 2; br.rotation.y = r; br.position.set(x, 0.1, z); br.castShadow = true; g.add(br); }
  const dm = new THREE.MeshStandardMaterial({ color: '#5a2a0e', roughness: 0.3 });
  for (let i = 0; i < 9; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), dm); d.scale.set(1, 1.5, 1); d.position.set(-0.07 + Math.cos(i * 2.1) * 0.035, 0.105 + (i % 3) * 0.012, -0.05 + Math.sin(i * 2.1) * 0.035); g.add(d); }
  const med = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.04), new THREE.MeshStandardMaterial({ color: '#ffffff' })); med.position.set(0.07, 0.12, 0.05); med.rotation.y = 0.4; g.add(med);
  const cr1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.042), new THREE.MeshStandardMaterial({ color: '#d11' })); cr1.position.copy(med.position); cr1.position.y += 0.03; cr1.rotation.y = 0.4; g.add(cr1);
  const cr2 = cr1.clone(); cr2.rotation.y = 0.4 + Math.PI / 2; g.add(cr2);
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.01, 0.07), new THREE.MeshStandardMaterial({ color: '#c8102e', roughness: 0.7 })); cloth.position.set(0, 0.075, 0.11); cloth.rotation.x = 0.5; g.add(cloth);
  return g;
}

// ───────────── نص عربي على لوحة ─────────────
function textPanel(text, { w = 2.2, h = 1.0, bg = '#0b5c63', fg = '#fff', border = '#f4c35a', size = 120 } = {}) {
  const cw = 1024, ch = Math.round(1024 * h / w);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const x = cv.getContext('2d');
  const r = 60; x.fillStyle = bg; x.strokeStyle = border; x.lineWidth = 26;
  x.beginPath(); x.roundRect(14, 14, cw - 28, ch - 28, r); x.fill(); x.stroke();
  const grad = x.createLinearGradient(0, 0, 0, ch); grad.addColorStop(0, 'rgba(255,255,255,.22)'); grad.addColorStop(0.5, 'rgba(255,255,255,0)'); x.fillStyle = grad; x.beginPath(); x.roundRect(14, 14, cw - 28, ch - 28, r); x.fill();
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl';
  let fs = size, lines;
  const wrap = (fsz) => { x.font = `700 ${fsz}px Dubai, Tahoma, sans-serif`; const words = text.split(' '); const out = []; let cur = '';
    for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (x.measureText(t).width > cw - 110 && cur) { out.push(cur); cur = wd; } else cur = t; } if (cur) out.push(cur); return out; };
  for (; fs > 40; fs -= 6) { lines = wrap(fs); if (lines.length * fs * 1.15 < ch - 80 && lines.every((l) => x.measureText(l).width < cw - 100)) break; }
  x.shadowColor = 'rgba(0,0,0,.45)'; x.shadowBlur = 8; x.shadowOffsetY = 4;
  lines.forEach((l, i) => x.fillText(l, cw / 2, ch / 2 + (i - (lines.length - 1) / 2) * fs * 1.15));
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
  return m;
}

// ───────────── البوابات (خيارات الإجابة) ─────────────
const gateGroup = new THREE.Group();
function makeGate(text, color, width) {
  const g = new THREE.Group();
  const cm = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1, emissive: color, emissiveIntensity: 0.18 });
  const wm = new THREE.MeshStandardMaterial({ color: '#f3e6cc', roughness: 0.85 });
  const ph = 3.1, pw = 0.26;
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, pw), wm); p.position.set(s * width / 2, ph / 2, 0); p.castShadow = true; g.add(p);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 4), cm); cap.position.set(s * width / 2, ph + 0.95, 0); cap.rotation.y = Math.PI / 4; g.add(cap);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(width / 2, 0.13, 8, 28, Math.PI), cm); arch.position.y = ph; g.add(arch);
  const panel = textPanel(text, { w: width * 0.98, h: 1.15, bg: color, border: '#fff6d6' }); panel.position.set(0, ph - 0.62, 0); panel.rotation.y = Math.PI; g.add(panel);
  const back = panel.clone(); back.rotation.y = 0; back.position.z = 0.01; g.add(back);
  const ring = new THREE.Mesh(new THREE.RingGeometry(width * 0.3, width * 0.46, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, toneMapped: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
  const glow = new THREE.PointLight(color, 0, 6); glow.position.set(0, 2, -0.6); g.add(glow);
  // مساحة لمس غير مرئية تغطي فتحة البوابة كلها (لمس منتصف القوس يكفي لاختيارها)
  const hit = new THREE.Mesh(new THREE.PlaneGeometry(width, ph + width / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false, side: THREE.DoubleSide }));
  hit.position.set(0, (ph + width / 2) / 2, 0); hit.renderOrder = -2; g.add(hit);
  g.userData = { cm, ring, glow, panel, hit };
  return g;
}

// ───────────── العقبات والتمر ─────────────
const OB_MAT = {
  rock: new THREE.MeshStandardMaterial({ color: '#9c7b5a', roughness: 0.95, flatShading: true }),
  wood: new THREE.MeshStandardMaterial({ color: '#7a4d22', roughness: 0.9 }),
  rope: new THREE.MeshStandardMaterial({ color: '#d8c08a', roughness: 0.9 }),
  date: new THREE.MeshStandardMaterial({ color: '#6b2f10', roughness: 0.3, metalness: 0.05 }),
  gold: new THREE.MeshBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0.6, toneMapped: false }),
  water: new THREE.MeshStandardMaterial({ color: '#3fa7c4', roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.8 }),
};
function makeObstacle(type, grade) {
  const g = new THREE.Group(); let w = 1.2, h = 0.8;
  if (type === 'rock') {
    const tint = ['#9c7b5a', '#8f7d6c', '#7d6a5c', '#b08a5f'][grade - 1];
    const m = OB_MAT.rock.clone(); m.color.set(tint);
    for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.32, 0.5), 0), m); r.position.set((i - 1) * 0.45, 0.3, rand(-0.2, 0.2)); r.rotation.set(rand(0, 3), rand(0, 3), 0); r.castShadow = true; g.add(r); }
    w = 1.6; h = 0.85;
  } else if (type === 'log') {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.6, 10), OB_MAT.wood); l.rotation.z = Math.PI / 2; l.position.y = 0.22; l.castShadow = true; g.add(l);
    w = 2.6; h = 0.45; g.userData.jump = true;
  } else if (type === 'crate') {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), OB_MAT.wood); c.position.y = 0.4; c.castShadow = true; g.add(c);
    const c2 = c.clone(); c2.scale.setScalar(0.7); c2.position.set(0.15, 1.08, 0); c2.rotation.y = 0.5; g.add(c2);
    w = 1.0; h = 1.3;
  } else if (type === 'rope') {
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 8), OB_MAT.wood); p.position.set(s * 1.4, 0.35, 0); g.add(p); }
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.8, 6), OB_MAT.rope); r.rotation.z = Math.PI / 2; r.position.y = 0.45; g.add(r);
    w = 2.8; h = 0.5; g.userData.jump = true;
  } else if (type === 'puddle') {
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), OB_MAT.water); p.rotation.x = -Math.PI / 2; p.position.y = 0.02; p.scale.set(1.3, 1, 1); g.add(p);
    w = 2.2; h = 0.15; g.userData.jump = true; g.userData.soft = true;
  }
  g.userData.w = w; g.userData.h = h; g.userData.type = type;
  return g;
}
function makeDate() {
  const g = new THREE.Group();
  const d = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), OB_MAT.date); d.scale.set(1, 1.55, 1); d.castShadow = true; g.add(d);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.02, 6, 24), OB_MAT.gold); g.add(ring);
  return g;
}

// ───────────── الصوت: الراوي ─────────────
let VO = {};
const voCache = new Map();
async function loadVO() { try { const r = await fetch('audio/vo/manifest.json'); if (r.ok) VO = await r.json(); } catch { VO = {}; } }
// الأصوات تُشغَّل عبر Web Audio (نفس سياق الموسيقى المفتوح بلمسة البدء) لتعمل على الهواتف وآيباد
let voSrc = null;
function stopVO() { if (voSrc) { try { voSrc.onended = null; voSrc.stop(); } catch { /* */ } voSrc = null; } }
async function voBuffer(file) {
  if (voCache.has(file)) return voCache.get(file);
  const pr = fetch('audio/vo/' + file).then((r) => r.arrayBuffer()).then((ab) => new Promise((res, rej) => audio.ctx.decodeAudioData(ab, res, rej)));
  voCache.set(file, pr); return pr;
}
const sub = $('#sub');
let skipLine = null;
function say(id, text, who, actorKey) {
  const r0 = RUN;
  stopVO();
  if (S) S.talker = actorKey || null;
  const file = VO[id];
  const hasVoice = !!file && !muted;
  // لا كتابة على الشاشة حين يوجد صوت (الطلاب الصغار يسمعون)؛ تظهر الكتابة فقط إن لم يُسجَّل الصوت بعد
  if (!hasVoice) { sub.innerHTML = (who ? `<span class="who">${who}: </span>` : '') + text; sub.classList.add('show'); }
  audio.duck(true);
  return new Promise((resolve) => {
    let done = false; const fin = () => { if (done) return; done = true; skipLine = null; stopVO(); sub.classList.remove('show'); audio.duck(false); setTimeout(resolve, 180); };
    skipLine = fin;
    if (hasVoice) {
      const ctx0 = audio.ctx; if (ctx0.state !== 'running') ctx0.resume().catch(() => {});
      const viaTag = () => { const a = new Audio('audio/vo/' + file); a.setAttribute('playsinline', ''); a.onended = fin; a.onerror = () => setTimeout(fin, readMs(text)); voSrc = { stop: () => a.pause(), set onended(v) { a.onended = v; } }; a.play().catch(() => setTimeout(fin, readMs(text))); };
      if (ctx0.state !== 'running') { setTimeout(() => { if (done) return; if (audio.ctx.state === 'running') playBuf(); else viaTag(); }, 250); }
      else playBuf();
      function playBuf() { voBuffer(file).then((buf) => {
        if (done) return; const ctx = audio.ctx; const src = ctx.createBufferSource(); src.buffer = buf;
        const g = ctx.createGain(); g.gain.value = 1.15; src.connect(g); g.connect(ctx.destination);
        src.onended = fin; voSrc = src; src.start(); window.__voN = (window.__voN || 0) + 1;
      }).catch(() => { if (!done) viaTag(); }); }
      setTimeout(fin, 30000);
    } else setTimeout(fin, readMs(text));
  }).then(() => { if (S) S.talker = null; if (RUN !== r0) throw ABORT; });
}
const readMs = (t) => clamp(t.length * 75, 1600, 9000);

// ───────────── حالة اللعبة ─────────────
let S = null; // حالة الجولة
let muted = false, paused = false;
const input = { left: false, right: false, jumpQ: false, goToggle: 0, stop: false };
const ui = { title: $('#title'), setup: $('#setup'), result: $('#result'), board: $('#board'), unlock: $('#unlock') };
function showScreen(id) { document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === id)); }
function hud(on) { $('#hud').classList.toggle('on', on); $('#pad').classList.toggle('on', on); $('#topBtns').classList.toggle('on', on); }
function toast(t, color = '#ffdf8c', ms = 1300) { const e = $('#toast'); e.textContent = t; e.style.color = color; e.classList.add('show'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('show'), ms); }
function stageBanner(t) { const e = $('#stageName'); e.textContent = t; e.classList.add('show'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('show'), 2600); }
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function L(scope, key, line) { return { id: lineId(scope, key, line, S.sex), text: lineText(line, S.sex, S.name), who: who(line.who) }; }
function who(w) { if (w === 'hero') return S.name; if (w === 'animal') return GRADES[S.grade].animalAr; if (w === 'nar') return ''; return WHO[w] || ''; }
async function sayL(scope, key, line) { const l = L(scope, key, line); let id = l.id; if (line.who === 'hero' && !id.endsWith('_' + S.sex) && VO[id + '_' + S.sex]) id += '_' + S.sex; await say(id, l.text, l.who, line.who); }

// ───────────── بناء الجولة ─────────────
function pickQuestions(grade, n) {
  const b = BANK[grade]; const curr = shuffle(b.curr.map((q, i) => ({ ...q, id: `q${grade}_c${i}` }))); const oman = shuffle(b.oman.map((q, i) => ({ ...q, id: `q${grade}_o${i}` })));
  const nEnc = (n - 1) / 2; const list = [];
  for (let e = 0; e < nEnc; e++) { list.push(curr.pop()); list.push(e % 2 === 0 ? curr.pop() : oman.pop()); }
  list.push(oman.pop()); // سؤال العيد الوطني عند الباب
  return list.filter(Boolean);
}

async function startRun(grade, sex, cls, groups) {
  RUN++; stopVO(); clearOverlays(); paused = false; if ($('#bPause')) $('#bPause').textContent = '⏸';
  showScreen(null); hud(true);
  const G = GRADES[grade];
  if (scene) disposeScene();
  scene = new THREE.Scene();
  world = createWorld(THREE, scene, renderer, grade);
  scene.add(gateGroup);
  S = {
    grade, sex, name: HEROES[sex].name, cls, groups, G,
    stars: 0, dates: 0, time: 0, timing: false, mode: 'cine', z: 2, x: 0, tx: 0, y: 0, vy: 0, speed: 0, walk: 0, stumble: 0, stumbles: 0, shield: 0,
    qs: pickQuestions(grade, G.nQ), qi: 0, turn: 0, obstacles: [], dates3d: [], stageIdx: -1, encDone: 0, actors: [], busy: false,
  };
  S.nEnc = (G.nQ - 1) / 2;
  S.encZ = Array.from({ length: S.nEnc }, (_, i) => 110 + i * (world.houseZ - 240) / Math.max(1, S.nEnc - 1));
  // محطات التفكير: أبعد ما يمكن عن اللقاءات وعن بعضها
  S.thinkZ = []; S.thinkDone = 0;
  for (let k = 0; k < (THINK[grade] || []).length; k++) {
    let best = 0, bd = -1;
    for (let zz = 175; zz <= world.houseZ - 70; zz += 5) {
      const d = Math.min(...S.encZ.map((e) => (zz > e ? (zz - e) * 0.8 : (e - zz) * 1.6)), ...S.thinkZ.map((t) => Math.abs(zz - t)));
      if (d > bd) { bd = d; best = zz; }
    }
    S.thinkZ.push(best);
  }
  S.thinkZ.sort((a, b) => a - b);
  $('#hMax').textContent = G.nQ; updHud();

  // البطل مع السلّة
  const hero = new Actor(HEROES[sex].id); scene.add(hero.root); S.hero = hero;
  const basket = makeBasket(); S.basket = basket;
  const hand = hero.bone(/RightHand$/);
  // السلّة تتبع اليد لكنها تبقى قائمة دائمًا (لا تنقلب مع دوران العظم)
  S.hand = hand; basket.scale.setScalar(1.15); scene.add(basket);
  if (!hand) { basket.position.set(-0.3, 0.75, 0.15); hero.root.add(basket); }
  hero.play('idle');

  // الحيوان الماكر والصقر والعائلة
  S.animal = spawnActor(G.animal, 0, -50); S.animal.root.visible = false;
  S.falcon = spawnActor('falcon', 0, -50); S.falcon.root.visible = false;
  S.mother = spawnActor('mother', 1.6, 4.2); S.mother.root.rotation.y = Math.PI * 0.85; S.mother.play('idle');
  S.grandma = spawnActor('grandma', 0.8, world.houseZ + 1.5); S.grandma.root.visible = false;
  S.grandpa = spawnActor('grandpa', 5.5, world.houseZ - 2); S.grandpa.root.visible = false;
  // حيوانات عُمانية في الطريق للزينة
  const deco = { 1: ['camel', 'hen', 'oryx'], 2: ['hen', 'camel'], 3: ['oryx', 'hen'], 4: ['camel', 'oryx'] }[grade];
  for (let i = 0; i < 6; i++) { const id = deco[i % deco.length]; if (!ASSETS[id]) continue; const side = i % 2 ? 1 : -1; const a = spawnActor(id, side * rand(5.5, 9), rand(60, world.length - 60)); a.root.rotation.y = rand(0, Math.PI * 2); a.deco = true; if (id === 'camel' && a.mixer) { const dir = Math.random() < 0.5 ? 0 : Math.PI; a.root.rotation.y = dir; a.wander = dir ? -0.9 : 0.9; a.play('walk'); } }

  buildCourse();
  audio.playTheme('title');
  camera.position.set(4, 2.2, 9); camera.lookAt(0, 1.2, 3);
  await introScene();
  S.mode = 'run'; S.timing = true; audio.playTheme(G.theme);
}

function spawnActor(id, x, z) { const a = new Actor(id); a.root.position.set(x, 0, z); scene.add(a.root); S.actors.push(a); return a; }

function buildCourse() {
  const G = S.G; const types = { 1: ['rock', 'log', 'puddle'], 2: ['crate', 'rope', 'puddle', 'rock'], 3: ['rock', 'log', 'rope'], 4: ['rock', 'log', 'crate', 'rope'] }[S.grade];
  for (let z = 30; z < world.houseZ - 25; z += G.obstacleGap * rand(0.8, 1.25)) {
    if (S.encZ.some((ez) => z > ez - 18 && z < ez + 62) || S.thinkZ.some((tz) => z > tz - 15 && z < tz + 30)) continue;
    const t = types[Math.floor(Math.random() * types.length)]; const o = makeObstacle(t, S.grade);
    const lane = o.userData.w > 2 ? rand(-0.6, 0.6) : [-2, 0, 2][Math.floor(Math.random() * 3)];
    o.position.set(lane, 0, z); scene.add(o); S.obstacles.push(o);
    // تمر قبل العقبة وبعدها
    for (let k = 0; k < 4; k++) { const d = makeDate(); const lx = [-2, 0, 2][(Math.floor(z) + k) % 3]; d.position.set(lx === lane && o.userData.w < 2 ? -lx || 2 : lx, 0.9, z + 6 + k * 2.2); scene.add(d); S.dates3d.push(d); }
  }
}

function disposeScene() {
  scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  gateGroup.clear();
}

// ───────────── المشاهد ─────────────
// ───────────── المشهد الافتتاحي: أمام بيت عُماني في القرية (الصورة السينمائية التي ولّدناها) ─────────────
let villageTex = null;
function buildIntroSet() {
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight('#dfe9ff', '#c08a55', 1.25));
  const sun = new THREE.DirectionalLight('#ffe0b0', 2.4); sun.position.set(5, 8, 6); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 30 }); sc.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.38 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; sc.add(ground);
  if (!villageTex) { villageTex = new THREE.TextureLoader().load('img/village_intro.jpg'); villageTex.colorSpace = THREE.SRGBColorSpace; villageTex.anisotropy = 4; }
  const back = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: villageTex, toneMapped: false, depthWrite: false }));
  back.renderOrder = -1; sc.add(back);
  return { sc, back };
}
const INTRO_CAM = { pos: new THREE.Vector3(0, 1.1, 5.4), look: new THREE.Vector3(0, 1.0, 1.8) };
function introFrame() {
  // مسافة تضمن ظهور الأم والطفل معًا دائمًا (حتى على شاشة الهاتف الطولية)
  const th = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
  const dist = Math.max(3.6, 1.45 / th);
  INTRO_CAM.pos.set(0.03, 0.9, 1.85 + dist); INTRO_CAM.look.set(0.03, 1.35, 1.8);
}
function fitBackdrop(set) {
  // الصورة تملأ الشاشة بنسبتها الأصلية، ومكان وقوف الشخصيات يقع على تراب الطريق في الصورة
  camera.position.copy(INTRO_CAM.pos); camera.lookAt(INTRO_CAM.look); camera.updateMatrixWorld(true);
  const d = 26, z = INTRO_CAM.pos.z - d; const hs = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); const ws = hs * camera.aspect;
  const pitch = Math.atan2(INTRO_CAM.look.y - INTRO_CAM.pos.y, INTRO_CAM.pos.z - INTRO_CAM.look.z);
  const ySb = INTRO_CAM.pos.y + d * Math.tan(pitch) - hs / 2;
  const feet = new THREE.Vector3(0, 0, 1.8).project(camera); const f = (feet.y + 1) / 2; // نسبة ارتفاع القدمين من أسفل الشاشة
  const ar = 1672 / 941, vFeet = clamp(f * 0.9, 0.08, 0.23);
  let h = Math.max(hs, ws / ar, f * hs / vFeet);
  // نريد: أسفل الصورة + vFeet*h = أسفل الشاشة + f*hs، وأعلى الصورة لا يقل عن أعلى الشاشة
  if (h * (1 - vFeet) < hs * (1 - f)) h = hs * (1 - f) / (1 - vFeet);
  const yBottom = ySb + f * hs - vFeet * h;
  set.back.scale.set(h * ar, h, 1); set.back.position.set(0, yBottom + h / 2, z);
}
async function introScene() {
  const st = STORY[S.grade];
  introFrame(); const set = buildIntroSet(); S.introSet = set; fitBackdrop(set);
  const H = S.hero, M = S.mother;
  set.sc.add(H.root); set.sc.add(M.root); if (S.basket.parent) set.sc.add(S.basket);
  S.x = S.tx = -0.55; S.z = 1.9; H.root.position.set(-0.55, 0, 1.9); H.root.lookAt(0.6, 0, 2.9);
  M.root.position.set(0.6, 0, 1.75); M.root.lookAt(-0.55, 0, 2.9);
  camPos.copy(INTRO_CAM.pos); camLook.copy(INTRO_CAM.look);
  S.camT = { pos: INTRO_CAM.pos.clone(), look: INTRO_CAM.look.clone() };
  await sleep(500);
  for (let i = 0; i < st.intro.length; i++) {
    const ln = st.intro[i];
    // الاثنان في الكادر دائمًا: من يتكلم تقترب منه الكاميرا قليلًا، والآخر ينظر إليه ويصغي
    const P = INTRO_CAM.pos, Lk = INTRO_CAM.look;
    if (ln.who === 'mom') { M.play('wave'); S.camT = { pos: new THREE.Vector3(P.x + 0.18, P.y + 0.05, P.z - 0.35), look: new THREE.Vector3(Lk.x + 0.12, Lk.y + 0.05, Lk.z) }; }
    else if (ln.who === 'hero') { H.play('wave'); S.camT = { pos: new THREE.Vector3(P.x - 0.18, P.y - 0.03, P.z - 0.35), look: new THREE.Vector3(Lk.x - 0.12, Lk.y - 0.05, Lk.z) }; }
    else S.camT = { pos: P.clone(), look: Lk.clone() };
    await sayL(`s${S.grade}`, `intro${i}`, ln);
    M.play('idle'); H.play('idle');
  }
  // البطل يودّع ويخرج إلى الطريق
  H.play('carry'); H.root.rotation.y = Math.PI * 0.75; await sleep(900);
  // العودة إلى عالم الرحلة
  scene.add(H.root); scene.add(M.root); if (S.basket.parent) scene.add(S.basket);
  S.x = S.tx = 0; S.z = 3; H.root.position.set(0, 0, 3); H.root.rotation.y = 0; M.root.position.set(3.4, 0, 8.5); M.root.lookAt(0, 0, 3); M.play('wave'); S.momBye = 8.5 + 2; // الأم على جانب الطريق أمامنا تودّع، ثم تختفي بعد أن نتجاوزها
  S.introSet = null; H.play('idle');
  S.camT = null;
  await sayL('c', 'howto', COMMON.howto);
  M.play('idle');
}

// ظلّ نصف زاوية الرؤية الأفقية للكاميرا
const hTan = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
// إبعاد إضافي للكاميرا على الشاشات الطولية (0 على الشاشات العريضة)
const portraitPull = (k) => camera.aspect < 1 ? (1 - camera.aspect) * k * 2 : 0;
async function encounter(i) {
  S.mode = 'cine'; S.timing = false; S.speed = 0; S.hero.play('idle');
  const z = S.z; const A = S.animal; A.root.visible = true;
  A.root.position.set(6, 0, z + 8); A.play('run'); audio.playTheme('tension'); audio.sfx(S.G.animal);
  // يقف في منتصف الطريق مقابل البطل تمامًا، وجهه في وجهه، ويتحدّاه
  const az = z + 3.4;
  S.walkTo = { a: A, x: 0, z: az, speed: 5 };
  S.camT = { pos: new THREE.Vector3(3.6, 2.0, z + 1.2), look: new THREE.Vector3(0, 1.1, z + 2.6) };
  for (let w = 0; w < 30 && S.walkTo; w++) await sleep(100);
  S.walkTo = null; A.root.position.set(0, 0, az);
  A.play('idle'); S.faceHero = A; S.hero.root.lookAt(0, 0, az);
  const st = STORY[S.grade];
  // لقطة من فوق كتف البطل: نرى وجه الحيوان وهو ينظر إلى البطل
  const camAnimal = () => ({ pos: new THREE.Vector3(S.x - 0.75, 1.62, z - 1.9 - portraitPull(1.6)), look: new THREE.Vector3(0, 1.2, az), cut: true });
  // لقطة من فوق كتف الحيوان: نرى وجه البطل وهو يردّ عليه
  const camHero = () => ({ pos: new THREE.Vector3(1.7, 1.75, az + 3.4 + portraitPull(1.6)), look: new THREE.Vector3(S.x, 0.95, z), cut: true });
  // لقطة جانبية تجمعهما وجهًا لوجه
  // المسافة تُحسب من عرض الكادر الأفقي حتى يظهر الاثنان معًا حتى على الهاتف الطولي
  const camTwo = () => { const hx = (S.x + 0) / 2, half = Math.abs(az - z) / 2 + 0.9; const d = Math.max(3.3, half / hTan());
    return { pos: new THREE.Vector3(hx + d, 1.45 + Math.max(0, d - 3.3) * 0.08, (z + az) / 2), look: new THREE.Vector3(hx, 1.0, (z + az) / 2), cut: true }; };
  if (i === 0) { S.camT = camTwo(); await sayL('c', 'whoIs', COMMON.whoIs); }
  const lines = st.enc[i] || st.enc[st.enc.length - 1];
  for (let k = 0; k < lines.length; k++) {
    const ln = lines[k];
    if (ln.who === 'hero') S.camT = camHero(); else S.camT = k === lines.length - 1 && k > 0 ? camTwo() : camAnimal();
    if (ln.who === 'animal') A.play('wave');
    await sayL(`s${S.grade}`, `enc${i}_${k}`, ln); A.play('idle');
  }
  // الحيوان يبقى واقفًا قريبًا عند البوابات، وعينه على البطل طول الوقت
  // ينتظر حتى يصل فعلًا إلى جانب الطريق (لا يبقى واقفًا في منتصفه أمام البوابات)
  A.play('walk'); S.walkTo = { a: A, x: 3.7, z: z + 11, speed: 4.5 };
  for (let w = 0; w < 30 && S.walkTo; w++) await sleep(100);
  S.walkTo = null; A.root.position.set(3.7, 0, z + 11); A.play('idle');
  for (let q = 0; q < 2; q++) await askQuestion();
  // الحيوان ينهزم ويهرب
  A.root.position.x = clamp(A.root.position.x, -2.5, 3.7);
  S.camT = { pos: new THREE.Vector3(S.x - 0.8, 1.7, S.z - 2.2), look: new THREE.Vector3(A.root.position.x, 1.2, A.root.position.z) };
  await sayL(`s${S.grade}`, 'lose', st.lose); S.faceHero = null;
  A.play('run'); S.walkTo = { a: A, x: 0.4, z: S.z + 40, speed: 8, hide: true }; // يهرب على الطريق مبتعدًا أمام أعين الطلاب
  audio.sfx('whoosh');
  await sleep(900);
  S.camT = null; S.mode = 'run'; S.timing = true; audio.playTheme(S.G.theme);
}


// ───────────── محطات التفكير (مفترق الطرق والعقبات) ─────────────
const PM = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
function propPalm() { const g = new THREE.Group(); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 3.2, 7), PM('#8a5a2b')); t.position.y = 1.6; g.add(t);
  for (let k = 0; k < 7; k++) { const l = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.9, 4), PM('#2f8a3a')); l.position.set(Math.cos(k * 0.9) * 0.6, 3.1, Math.sin(k * 0.9) * 0.6); l.rotation.z = Math.PI / 2.4 * (Math.cos(k * 0.9) > 0 ? -1 : 1); l.rotation.y = -k * 0.9; g.add(l); } return g; }
function propWater(w, d, col = '#3b8fd9') { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: col, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85 })); m.rotation.x = -Math.PI / 2; m.position.y = 0.04; m.userData.flow = true; return m; }
function makeProp(kind) {
  const g = new THREE.Group();
  const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  switch (kind) {
    case 'palms': for (const [x, z] of [[-1.2, 0], [1.2, 0.6], [0, 2.2]]) { const p = propPalm(); p.position.set(x, 0, z); g.add(p); } { const f = propWater(0.7, 5); f.position.set(0.3, 0.05, 1); g.add(f); } break;
    case 'dunes': case 'heatdunes': for (const [x, z, r] of [[-1, 0.5, 1.3], [1.1, 1.6, 1.6], [0, 3, 1.9]]) { const d = add(new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), PM('#e2b977')), x, 0, z); d.scale.y = 0.45; } break;
    case 'rocks': case 'bigrock': for (const [x, z, r] of kind === 'bigrock' ? [[0, 0.6, 1.25]] : [[-0.9, 0.4, 0.7], [0.9, 1.1, 0.9], [0, 2.4, 1.1]]) add(new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), PM('#8b7d6b')), x, r * 0.7, z); break;
    case 'bridge': { add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 4.2), PM('#9a6b3f')), 0, 0.55, -3.3); for (const sx of [-0.8, 0.8]) add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 4.2), PM('#6d4526')), sx, 0.85, -3.3); } break;
    case 'splash': { const w = propWater(2.2, 3, '#2f7fd0'); w.position.z = 0.8; g.add(w); for (let k = 0; k < 6; k++) add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), PM('#e8f6ff')), rand(-0.9, 0.9), 0.12, rand(0, 1.8)); } break;
    case 'house': { add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 1.8), PM('#e9d8b4')), 0, 0.9, 1.5); add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.05), PM('#7a4b25')), 0, 0.5, 0.58); } break;
    case 'lighthouse': { add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 4.6, 14), PM('#f5f5f0')), 0, 2.3, 1.6); for (const y of [1.2, 2.8]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.45, 14), PM('#c8102e')), 0, y, 1.6); add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffe680', toneMapped: false })), 0, 4.9, 1.6); } break;
    case 'fishstall': { add(new THREE.Mesh(new THREE.BoxGeometry(2, 0.9, 1), PM('#a87445')), 0, 0.45, 1.2); add(new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 1.4), PM('#2f6fe0')), 0, 1.9, 1.2); for (let k = 0; k < 5; k++) { const f = add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), PM('#b9c4cc', { metalness: 0.5 })), -0.7 + k * 0.35, 0.98, 1.1); f.scale.x = 2; } } break;
    case 'boat': { const b = add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 2.6), PM('#c98a4b')), 0, 0.3, 1.3); b.rotation.y = 0.2; add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), PM('#6d4526')), 0, 1.6, 1.3); const sl = add(new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.8, 3), PM('#ffffff')), 0.25, 1.8, 1.3); sl.scale.z = 0.08; } break;
    case 'sunrise': { const sun = add(new THREE.Mesh(new THREE.SphereGeometry(1.5, 24, 16), new THREE.MeshBasicMaterial({ color: '#ffcf4a', toneMapped: false })), 0, 3.6, 9); sun.castShadow = false; /* بلا PointLight: إضافة ضوء تُعيد ترجمة كل المواد (تقطيع على الأجهزة اللوحية) */ } break;
    case 'westsign': { add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), PM('#6d4526')), 0, 1.1, 1); const a = add(new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 3), PM('#e2702c')), 0, 2.1, 1); a.rotation.z = Math.PI / 2; } break;
    case 'cave': { const c = add(new THREE.Mesh(new THREE.SphereGeometry(1.9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), PM('#6e6458')), 0, 0, 2.2); c.scale.z = 0.7; add(new THREE.Mesh(new THREE.CircleGeometry(0.85, 20, 0, Math.PI), new THREE.MeshBasicMaterial({ color: '#111' })), 0, 0.01, 0.9).rotation.y = Math.PI; } break;
    case 'stairs': for (let k = 0; k < 5; k++) add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2 + k * 0.2, 0.6), PM('#a99b86')), 0, (0.2 + k * 0.2) / 2, 0.4 + k * 0.6); { const s2 = add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16), PM('#1f9d4c')), 0.9, 1.4, 0.4); s2.rotation.x = Math.PI / 2; add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), PM('#6d4526')), 0.9, 0.7, 0.42); } break;
    case 'mosque': { add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 2), PM('#f4efe4')), 0, 0.8, 2); add(new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), PM('#2a9d8f')), 0, 1.6, 2); add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 3.4, 10), PM('#f4efe4')), 1.3, 1.7, 2.6); add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.45), PM('#dfe6ea')), -0.9, 0.5, 0.6); } break;
    case 'puddle': { const w = propWater(1.8, 1.5, '#7d6a3c'); w.position.z = 0.8; g.add(w); } break;
    case 'greenhill': for (const [x, z, r] of [[-1, 1, 1.6], [1.2, 2.2, 2.1]]) { const h = add(new THREE.Mesh(new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), PM('#3fae4a')), x, 0, z); h.scale.y = 0.6; } break;
    case 'stone': add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.25, 0), PM('#8b7d6b')), 0, 0.2, 0.8); break;
    // مجسّمات المشكلة في وسط الطريق
    case 'wadi': { const w = propWater(9, 4.6); g.add(w); for (let k = 0; k < 14; k++) add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), PM('#e8f6ff')), rand(-4, 4), 0.1, rand(-2, 2)).userData.bob = rand(0, 6); } break;
    case 'sea': { const w = propWater(9, 3.4, '#1f78c8'); g.add(w); } break;
    case 'sheep': for (let k = 0; k < 7; k++) { const sh = new THREE.Group(); const b = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), PM('#f3f0e8')); b.scale.set(1, 0.8, 1.35); b.position.y = 0.55; sh.add(b); const h = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), PM('#3a3028')); h.position.set(0, 0.62, 0.48); sh.add(h); for (const [lx, lz] of [[-0.18, -0.25], [0.18, -0.25], [-0.18, 0.25], [0.18, 0.25]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 5), PM('#3a3028')); l.position.set(lx, 0.2, lz); sh.add(l); } sh.position.set(-2.4 + k * 0.8, 0, rand(-0.5, 0.6)); sh.rotation.y = rand(-0.8, 0.8); sh.userData.bob = rand(0, 6); g.add(sh); } break;
    case 'wallet': { add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.35), PM('#5a3b22')), 0.3, 0.06, 0); const n = add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 0.2), PM('#4caf6b')), 0.3, 0.13, 0.05); n.rotation.y = 0.3; } break;
    case 'brokenbridge': { const w = propWater(9, 3.4, '#5c8f6a'); g.add(w); for (const z0 of [-1.1, 1.1]) add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.16, 1.2), PM('#9a6b3f')), 0, 0.5, z0); const b = add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.16, 0.9), PM('#7a5230')), 0.6, 0.15, 0); b.rotation.z = 0.6; } break;
    case 'heat': { add(new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 14), new THREE.MeshBasicMaterial({ color: '#ffb02e', toneMapped: false })), 3.5, 9, 14); const q = add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.5, 10), PM('#7a5a3a')), 0.4, 0.25, 0); q.rotation.z = Math.PI / 2; } break;
    case 'storm': { const n = 260; const geo = new THREE.BufferGeometry(); const p = new Float32Array(n * 3); for (let k = 0; k < n; k++) p.set([rand(-8, 8), rand(0, 5), rand(-2, 10)], k * 3); geo.setAttribute('position', new THREE.BufferAttribute(p, 3)); const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#d9b77a', size: 0.22, transparent: true, opacity: 0.8 })); pts.userData.storm = true; g.add(pts); } break;
    default: break;
  }
  return g;
}
function animProps(dt, t) {
  if (!S || !S.stProps) return;
  for (const g of S.stProps) g.traverse((o) => {
    if (o.userData.flow && o.material.map === null) o.material.emissive && o.material.emissive.setHSL(0.58, 0.6, 0.05 + 0.04 * Math.sin(t * 3));
    if (o.userData.bob !== undefined) o.position.y = Math.abs(Math.sin(t * 3 + o.userData.bob)) * 0.06;
    if (o.userData.storm) { const a = o.geometry.attributes.position; for (let k = 0; k < a.count; k++) { let x = a.array[k * 3] - dt * 6; if (x < -8) x = 8; a.array[k * 3] = x; } a.needsUpdate = true; }
  });
}
function countdown(sec) {
  let el = $('#thinkClock'); if (!el) { el = document.createElement('div'); el.id = 'thinkClock'; el.style.cssText = 'position:fixed;top:18%;left:50%;transform:translateX(-50%);z-index:30;font:700 clamp(56px,11vw,120px)/1 Dubai,Tahoma,sans-serif;color:#fff;background:#0b5c63e6;border:6px solid #f4c35a;border-radius:50%;width:1.9em;height:1.9em;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 40px #0008;pointer-events:none'; document.body.appendChild(el); }
  el.style.display = 'flex';
  return new Promise(async (res, rej) => {
    // العدّ يتوقف مع الإيقاف المؤقت، وإعادة البدء/الخروج تُلغيه (ولا يُكمل المشهد القديم على الجولة الجديدة)
    try { for (let k = sec; k > 0; k--) { while (paused) await sleep(200); el.innerHTML = `<span>${k}</span>`; el.firstChild.animate([{ transform: 'scale(1.5)', opacity: 0.4 }, { transform: 'scale(1)', opacity: 1 }], 300); audio.sfx('coin'); await sleep(1000); }
      el.innerHTML = '🧠'; await sleep(500); }
    catch (e) { el.style.display = 'none'; rej(e); return; }
    el.style.display = 'none'; res();
  });
}
function clearStation() {
  if (S.stProps) for (const g of S.stProps) { scene.remove(g); g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
  if (S.stActors) for (const a of S.stActors) { a.root.visible = false; scene.remove(a.root); const i = S.actors.indexOf(a); if (i >= 0) S.actors.splice(i, 1); }
  S.stProps = []; S.stActors = [];
}
async function station(i) {
  const T = THINK[S.grade][i]; const sc = `t${S.grade}`; const id = (k) => `${i}_${k}`;
  S.mode = 'cine'; S.timing = false; S.speed = 0; S.walk = 0; S.hero.play('idle');
  S.tx = 0; const z = S.z; const gz = z + 15; S.stProps = []; S.stActors = [];
  const n = T.o.length, spacing = 2.45;
  const ord = shuffle([...Array(n).keys()]); // مواضع الخيارات مخلوطة في كل مرّة
  // مجسّم المشكلة
  if (T.prop) { const pr = makeProp(T.prop); pr.position.set(0, 0, z + 9.5); scene.add(pr); S.stProps.push(pr); }
  if (T.prop === 'camel' && ASSETS.camel) { const c = spawnActor('camel', -1.6, z + 9); c.root.rotation.y = 0.9; S.stActors.push(c); }
  // مسارات متفرّعة للمفترق
  if (T.kind === 'fork') { const fm = PM('#c9a173'); ord.forEach((k, j) => { const x = (j - (n - 1) / 2) * spacing * -1; const strip = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 16), fm); strip.rotation.x = -Math.PI / 2; strip.rotation.z = Math.atan2(x, 16) * 1.3; strip.position.set(x * 2.2, 0.03, gz + 7); strip.receiveShadow = true; const gr = new THREE.Group(); gr.add(strip); scene.add(gr); S.stProps.push(gr); }); }
  // البوابات ومجسّماتها
  gateGroup.clear(); S.gates = [];
  ord.forEach((k, j) => {
    const x = (j - (n - 1) / 2) * spacing * -1; const o = T.o[k]; const col = GATE_COLORS[j];
    const g = makeGate(`${o.i} ${o.t}`, col.hex, spacing - 0.25); g.position.set(x, 0, gz); g.scale.setScalar(0.01); gateGroup.add(g);
    S.gates.push({ g, x, k, correct: k === 0, alive: true, i: j });
    if (['shepherd', 'fisher', 'guard'].includes(o.prop) && ASSETS.neighbor) { const a = spawnActor('neighbor', x * 1.15 + (x >= 0 ? 0.9 : -0.9), gz + 1.6); a.root.lookAt(S.x, 0, z); a.play('idle'); S.stActors.push(a); }
    else if (o.prop && o.prop !== 'none') { const pr = makeProp(o.prop); pr.position.set(x * (T.kind === 'fork' ? 1.9 : 1.15), 0, gz + (T.kind === 'fork' ? 6 : 2.2)); scene.add(pr); S.stProps.push(pr); }
  });
  S.gateZ = gz; S.station = T; S.stScope = sc; S.stIdx = i; S.tries = 0;
  // المشكلة
  S.camT = { pos: new THREE.Vector3(0, 2.7, z + 1.5), look: new THREE.Vector3(0, 1.3, z + 13) };
  audio.sfx('gate');
  for (let t = 0; t <= 1; t += 0.08) { S.gates.forEach((o) => o.g.scale.setScalar(THREE.MathUtils.smoothstep(t, 0, 1))); await sleep(16); }
  S.gates.forEach((o) => o.g.scale.setScalar(1));
  await sayL(sc, id('p'), T.p);
  // الخيارات: كل لوحة تلمع وهي تُقرأ
  for (const o of S.gates) { glow(o, 1); await sayL(sc, id(`o${o.k}`), T.o[o.k].s); glow(o, 0); }
  // الجمهور يتناقش
  await sayL('tc', 'think', THINK_COMMON.think);
  await countdown(10);
  const turn = (S.turn % S.groups) + 1; S.turn++;
  if (S.groups > 1) await sayL('c', `turn${turn}`, COMMON[`turn${turn}`]);
  await sayL('tc', 'choose', THINK_COMMON.choose);
  S.mode = 'question'; S.timing = true; S.camT = null; S.awaitGate = true; S.walk = 0;
  return new Promise((res) => { S.gateDone = res; }).then(() => { clearStation(); S.station = null; S.mode = 'run'; S.timing = true; });
}
async function stationPass(o) {
  S.awaitGate = false; S.speed = 0; S.walk = 0;
  const T = S.station, sc = S.stScope, id = (k) => `${S.stIdx}_${k}`;
  if (o.correct) {
    const bonus = S.tries === 0 ? 3 : 1; S.dates += bonus; updHud();
    audio.sfx('correct'); confetti(o.g.position.clone().add(new THREE.Vector3(0, 2.5, 0)), GATE_COLORS[o.i].hex);
    toast(`🧠 تفكير ذكي! +${bonus} 🌴`, '#ffdf8c', 1800); S.hero.play('cheer', 0.15);
    S.mode = 'cine'; S.camT = { pos: new THREE.Vector3(S.x + 1.8, 1.9, S.z - 3.2), look: new THREE.Vector3(S.x, 1.2, S.z + 4) };
    await sayL(sc, id('ok'), T.ok);
    for (let t = 1; t >= 0; t -= 0.1) { S.gates.forEach((x) => x.g.scale.setScalar(Math.max(0.01, t))); await sleep(16); }
    gateGroup.clear(); S.gates = []; S.hero.play('idle'); S.camT = null;
    const done = S.gateDone; S.gateDone = null; done && done();
  } else {
    S.tries++; o.alive = false; audio.sfx('wrong');
    const g = o.g; for (let t = 0; t < 1; t += 0.06) { g.rotation.x = t * 1.4; g.position.y = -t * 0.5; g.scale.setScalar(1 - t * 0.6); await sleep(16); } g.visible = false;
    S.hero.play('idle');
    // لماذا هذا الخيار خطأ؟ (تعليل يبني التفكير الناقد)
    const nl = T.o[o.k].n; if (nl) await sayL(sc, id(`n${o.k}`), nl);
    S.z = S.gateZ - 7; S.x = S.tx = 0; S.hero.root.position.set(0, 0, S.z);
    if (S.gates.filter((x) => x.alive).length <= 1) { const c = S.gates.find((x) => x.correct); glow(c, 1); await sayL('c', 'showRight', COMMON.showRight); }
    else await sayL('tc', 'again', THINK_COMMON.again);
    S.awaitGate = true;
  }
}

async function askQuestion(final = false) {
  const q = S.qs[S.qi++]; if (!q) return;
  const n = q.o.length; const ord = optionOrder(q.q, n);
  S.mode = 'question'; S.timing = true; S.speed = 0; S.hero.play('idle');
  // الحيوان يبقى واقفًا عند البوابات قبالة البطل في كل سؤال
  if (!final && S.faceHero && S.animal.root.visible) { S.animal.root.position.set(3.7, 0, S.z + 11); S.animal.play('idle'); }
  if (final) { S.z = world.houseZ - 19; S.x = 0; S.tx = 0; S.hero.root.position.set(0, 0, S.z); }
  const gz = final ? world.houseZ - 5.5 : S.z + 15; const spacing = n === 2 ? 3.3 : n === 3 ? 2.45 : 1.95;
  gateGroup.clear(); S.gates = [];
  ord.forEach((k, i) => {
    const x = (i - (n - 1) / 2) * spacing * -1; // البوابة الأولى (الحمراء) على يمين الشاشة
    const col = GATE_COLORS[i]; const g = makeGate(stripEmoji(q.o[k]) || q.o[k], col.hex, spacing - 0.25);
    g.position.set(x, 0, gz); g.scale.setScalar(0.01); gateGroup.add(g);
    S.gates.push({ g, x, k, correct: k === 0, alive: true, i });
  });
  S.gateZ = gz; S.q = q; S.tries = 0;
  audio.sfx('gate'); audio.playTheme('question');
  for (let t = 0; t <= 1; t += 0.08) { S.gates.forEach((o) => o.g.scale.setScalar(THREE.MathUtils.smoothstep(t, 0, 1))); await sleep(16); }
  S.gates.forEach((o) => o.g.scale.setScalar(1));
  // دور المجموعة
  const turn = (S.turn % S.groups) + 1; S.turn++;
  const qb = $('#qbar'); qb.innerHTML = (S.groups > 1 ? `<span class="turn">دورُ المجموعة ${turn}</span>` : '') + q.q; qb.classList.add('show');
  { const cp = new THREE.Vector3(0, 3.6, S.z - 4.5 - portraitPull(2)); S.camT = { pos: cp, look: qLook(cp, new THREE.Vector3(0, 1.8, gz)), qfit: true }; }
  if (S.groups > 1) await sayL('c', `turn${turn}`, COMMON[`turn${turn}`]);
  await readQuestion();
  S.camT = null;
  await sayL('c', 'goGate', COMMON.goGate);
  S.awaitGate = true; S.walk = 0;
  return new Promise((res) => { S.gateDone = res; });
}

async function readQuestion() {
  const q = S.q; const ord = optionOrder(q.q, q.o.length);
  const file = VO[q.id];
  if (file) { S.gates.forEach((o) => glow(o, 0.6)); await say(q.id, stripEmoji(q.q), ''); S.gates.forEach((o) => glow(o, 0)); return; }
  await say(q.id + '_t', stripEmoji(q.q), '');
  for (const o of S.gates) { if (!o.alive) continue; glow(o, 1); await say('', `البوابةُ ${GATE_COLORS[o.i].ar}: ${stripEmoji(q.o[o.k])}`, ''); glow(o, 0); }
}
function glow(o, v) { o.g.userData.glow.intensity = v * 18; o.g.userData.cm.emissiveIntensity = 0.18 + v * 0.8; }

async function passGate(o) {
  if (S.station) return stationPass(o);
  S.awaitGate = false; S.speed = 0; S.walk = 0;
  if (o.correct) {
    const got = S.tries === 0 ? 1 : S.tries === 1 ? 0.5 : 0; S.stars += got; updHud();
    audio.sfx('correct'); if (got) audio.sfx('star');
    confetti(o.g.position.clone().add(new THREE.Vector3(0, 2.5, 0)), GATE_COLORS[o.i].hex);
    toast(got === 1 ? '⭐ +1' : got ? '⭐ +½' : '👏', '#ffdf8c');
    S.hero.play('cheer', 0.15);
    $('#qbar').classList.remove('show');
    const r = ['right1', 'right2', 'right3'][Math.floor(Math.random() * 3)];
    await sayL('c', r, COMMON[r]);
    for (let t = 1; t >= 0; t -= 0.1) { S.gates.forEach((x) => x.g.scale.setScalar(Math.max(0.01, t))); await sleep(16); }
    gateGroup.clear(); S.gates = [];
    S.hero.play('idle'); audio.playTheme(S.finalQ ? 'victory' : 'tension');
    const done = S.gateDone; S.gateDone = null; done && done();
  } else {
    S.tries++; o.alive = false; audio.sfx('wrong');
    // البوابة الخاطئة تسقط
    const g = o.g; for (let t = 0; t < 1; t += 0.06) { g.rotation.x = t * 1.4; g.position.y = -t * 0.5; g.scale.setScalar(1 - t * 0.6); await sleep(16); } g.visible = false;
    S.z = S.gateZ - 7; S.x = S.tx = 0; S.hero.root.position.set(0, 0, S.z); S.hero.play('idle');
    if (S.animal.root.visible) { S.animal.play('wave'); const ap = S.animal.root.position; const cb = S.camT; S.camT = { pos: new THREE.Vector3(S.x - 0.7, 1.6, S.z - 2.0), look: new THREE.Vector3(ap.x, 1.2, ap.z) }; await sayL(`s${S.grade}`, 'laugh', STORY[S.grade].laugh); S.camT = cb; S.animal.play('idle'); }
    if (S.tries >= 2 || S.gates.filter((x) => x.alive).length <= 1) {
      await helperArrive(true);
      const c = S.gates.find((x) => x.correct); glow(c, 1); c.hint = true;
      await sayL('c', 'showRight', COMMON.showRight);
    } else {
      await sayL('c', 'wrong1', COMMON.wrong1);
    }
    S.awaitGate = true;
  }
}

async function helperArrive(forGate) {
  const F = S.falcon; F.root.visible = true; audio.sfx('falcon');
  F.root.position.set(-8, 6, S.z + 4); F.fly = { t: 0, target: forGate ? S.gates.find((x) => x.correct) : null };
  if (!forGate) { await sayL('c', 'helper', COMMON.helper); S.shield = 14; }
}

function confetti(pos, color) {
  const n = 70; const geo = new THREE.BufferGeometry(); const p = new Float32Array(n * 3); const v = [];
  for (let i = 0; i < n; i++) { p.set([pos.x, pos.y, pos.z], i * 3); v.push(new THREE.Vector3(rand(-4, 4), rand(2, 7), rand(-4, 4))); }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const cols = new Float32Array(n * 3); const pal = [color, '#ffffff', '#c8102e', '#12813f', '#ffd76a'].map((c) => new THREE.Color(c));
  for (let i = 0; i < n; i++) { const c = pal[i % pal.length]; cols.set([c.r, c.g, c.b], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.18, vertexColors: true, toneMapped: false, transparent: true }));
  scene.add(pts); FX.push({ pts, v, life: 2.2 });
}
const FX = [];
function updFX(dt) {
  for (let i = FX.length - 1; i >= 0; i--) {
    const f = FX[i]; f.life -= dt; const a = f.pts.geometry.attributes.position;
    for (let k = 0; k < f.v.length; k++) { f.v[k].y -= 9 * dt; a.array[k * 3] += f.v[k].x * dt; a.array[k * 3 + 1] += f.v[k].y * dt; a.array[k * 3 + 2] += f.v[k].z * dt; }
    a.needsUpdate = true; f.pts.material.opacity = clamp(f.life, 0, 1);
    if (f.life <= 0) { scene.remove(f.pts); f.pts.geometry.dispose(); FX.splice(i, 1); }
  }
}
function fireworks(center, n = 6) { for (let i = 0; i < n; i++) setTimeout(() => { if (!scene) return; confetti(center.clone().add(new THREE.Vector3(rand(-6, 6), rand(6, 11), rand(-3, 6))), ['#c8102e', '#12813f', '#ffffff', '#ffd76a'][i % 4]); audio.sfx('fireworks'); }, i * 450); }

async function doorScene() {
  S.mode = 'cine'; S.timing = false; S.speed = 0; S.hero.play('idle');
  const hz = world.houseZ; const st = STORY[S.grade];
  S.z = hz - 7; S.x = 0; S.hero.root.position.set(0, 0, S.z);
  await sayL('c', 'almost', COMMON.almost);
  const A = S.animal; A.root.visible = true; A.root.position.set(0.3, 0, hz - 0.8); A.root.rotation.y = 0; A.play('idle');
  S.camT = { pos: new THREE.Vector3(3.4, 2.0, hz - 9.5), look: new THREE.Vector3(0, 1.3, hz - 1) };
  audio.playTheme('tension'); audio.sfx('door');
  for (let k = 0; k < st.door.length; k++) {
    const ln = st.door[k];
    if (ln.who === 'animal') { S.faceCam = A; A.play('wave'); } else S.faceCam = null;
    await sayL(`s${S.grade}`, `door${k}`, ln); A.play('idle');
  }
  S.faceCam = null;
  S.hero.play('wave');
  S.camT = { pos: new THREE.Vector3(1.4, 1.5, S.z - 2.6), look: new THREE.Vector3(0, 1.1, S.z) };
  await sayL('c', 'callGrandpa', COMMON.callGrandpa);
  // الجدّ يأتي
  const P = S.grandpa; P.root.visible = true; P.root.position.set(7, 0, hz - 3.5); P.play('walk');
  S.walkTo = { a: P, x: 1.8, z: hz - 3.2, speed: 2.2 };
  S.camT = { pos: new THREE.Vector3(-3.5, 2.2, hz - 9), look: new THREE.Vector3(1.8, 1.3, hz - 2.5) };
  await sleep(2200); P.play('idle'); P.root.lookAt(A.root.position.x, 0, A.root.position.z);
  await sayL(`s${S.grade}`, 'grandpa', st.grandpa);
  A.play('run'); audio.sfx(S.G.animal); S.walkTo = { a: A, x: 1.2, z: hz - 45, speed: 8, hide: true };
  await sayL(`s${S.grade}`, 'flee', st.flee);
  P.root.lookAt(0, 0, S.z);
  await sayL('c', 'grandpaFinal', COMMON.grandpaFinal);
  S.finalQ = true;
  await askQuestion(true);
  S.mode = 'cine'; S.timing = false;
  // الباب يُفتح والجدّة تخرج
  audio.playTheme('victory'); audio.sfx('ululation');
  const M = S.grandma; M.root.visible = true; M.root.position.set(0, 0, hz + 0.6); M.play('walk'); S.walkTo = { a: M, x: -0.9, z: hz - 2.6, speed: 1.6 };
  S.camT = { pos: new THREE.Vector3(0.3, 2.0, hz - 10.5), look: new THREE.Vector3(0, 1.3, hz - 2) };
  await sleep(2000); M.play('idle'); M.root.lookAt(0, 0, S.z);
  await sayL('c', 'grandma', COMMON.grandma);
  // احتفال
  S.mother.root.position.set(2.8, 0, hz - 4.5); S.mother.root.visible = true; S.mother.root.lookAt(0, 0, S.z);
  [S.hero, M, P, S.mother].forEach((a, i) => a.play(i === 0 ? 'dance' : (a.actions.Razha ? 'razha' : 'dance')));
  fireworks(new THREE.Vector3(0, 0, hz)); confetti(new THREE.Vector3(0, 3, S.z + 1), '#ffd76a');
  S.camT = { pos: new THREE.Vector3(0, 3.4, hz - 14), look: new THREE.Vector3(0, 1.4, hz - 3), orbit: true };
  await sayL('c', 'outro', COMMON.outro);
  await sleep(1500);
  endRun();
}

// ───────────── النتيجة ولوحة البطولة ─────────────
function boardData() { return store.get('salla_board_v1', {}); }
function unlocked() { return store.get('salla_unlock_v1', [1]); }
function endRun() {
  S.mode = 'end'; hud(false);
  const b = boardData(); (b[S.grade] ||= []).push({ cls: S.cls, stars: S.stars, max: S.G.nQ, time: Math.round(S.time), dates: S.dates, ts: Date.now() }); store.set('salla_board_v1', b);
  const full = Math.floor(S.stars), half = S.stars % 1 ? '✨' : '';
  $('#resultBox').innerHTML = `<h2>🎉 أحسنتم يا ${S.cls}!</h2>
    <div class="stars">${'⭐'.repeat(full)}${half}</div>
    <div style="font-size:clamp(22px,2.4vw,34px)">النجوم: <b style="color:var(--gold2)">${S.stars}</b> من ${S.G.nQ} • الزمن: <b style="color:var(--gold2)">${fmt(S.time)}</b> • التمر: ${S.dates}</div>
    <div class="small" style="margin:8px 0">الترتيب في البطولة: النجوم أولًا، والزمن عند التعادل فقط</div>
    <div class="row" style="margin-top:12px"><button class="btn" id="rBoard">🏆 لوحة البطولة</button><button class="btn ghost" id="rHome">القائمة</button></div>`;
  showScreen('result');
  $('#rBoard').onclick = () => openBoard(S.grade); $('#rHome').onclick = toTitle;
}
function openBoard(grade = 1) {
  const b = boardData();
  const tabs = [1, 2, 3, 4].map((g) => `<button class="chip ${g === grade ? 'sel' : ''}" data-g="${g}">${GRADES[g].title}</button>`).join('');
  const rows = (b[grade] || []).slice().sort((p, q) => q.stars - p.stars || p.time - q.time);
  const nextCode = GRADES[grade + 1]?.code;
  $('#boardBox').innerHTML = `<h2>🏆 لوحة البطولة</h2><div class="cls">${tabs}</div>
    ${rows.length ? `<table class="lb"><tr><th>الترتيب</th><th>الصف</th><th>النجوم</th><th>الزمن</th></tr>${rows.map((r, i) => `<tr class="${i === 0 ? 'win' : ''}"><td>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td><td>${r.cls}</td><td>${r.stars} / ${r.max}</td><td>${fmt(r.time)}</td></tr>`).join('')}</table>` : '<p class="small" style="margin:20px">لم يلعب أي صف بعد</p>'}
    ${rows.length && nextCode ? `<div id="winBox"><button class="btn" id="showCode">🔑 أعلنوا الفائز واعرضوا رمز ${GRADES[grade + 1].title}</button></div>` : ''}
    <div class="row" style="margin-top:14px"><button class="btn ghost" id="bClear">مسح نتائج هذا الصف</button><button class="btn ghost" id="bHome">القائمة</button></div>`;
  showScreen('board');
  $('#boardBox').querySelectorAll('[data-g]').forEach((e) => (e.onclick = () => openBoard(+e.dataset.g)));
  $('#bHome').onclick = toTitle;
  $('#bClear').onclick = () => { if (confirmClear()) { delete b[grade]; store.set('salla_board_v1', b); openBoard(grade); } };
  const sc = $('#showCode'); if (sc) sc.onclick = () => { audio.sfx('drumroll'); setTimeout(() => { audio.sfx('ululation'); $('#winBox').innerHTML = `<div style="font-size:clamp(22px,2.4vw,32px)">🥇 الفائز: <b style="color:var(--gold2)">${rows[0].cls}</b></div><div class="small">رمز فتح ${GRADES[grade + 1].title}:</div><div class="code">${nextCode}</div>`; }, 1200); };
}
let clearArmed = 0; function confirmClear() { if (Date.now() - clearArmed < 3000) return true; clearArmed = Date.now(); toastScreen('اضغطوا مرة أخرى للتأكيد'); return false; }
function toastScreen(t) { const e = document.createElement('div'); e.className = 'small'; e.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);z-index:50;background:#000a;padding:8px 18px;border-radius:12px'; e.textContent = t; document.body.appendChild(e); setTimeout(() => e.remove(), 2500); }

// ───────────── القوائم ─────────────
function clearOverlays() { $('#qbar').classList.remove('show'); sub.classList.remove('show'); const c = $('#thinkClock'); if (c) c.style.display = 'none'; }
function toTitle() {
  RUN++;
  hud(false); stopVO(); clearOverlays(); S = null; showScreen('title'); audio.playTheme('title');
  const un = unlocked();
  $('#grades').innerHTML = [1, 2, 3, 4].map((g) => `<div class="gcard ${un.includes(g) ? '' : 'locked'}" data-g="${g}"><div class="g">${GRADES[g].title}</div><div class="a">${GRADES[g].emoji}</div><div class="r">${GRADES[g].route}<br>${GRADES[g].nQ} أسئلة</div></div>`).join('');
  $('#grades').querySelectorAll('.gcard').forEach((c) => (c.onclick = () => { audio.unlock(); const g = +c.dataset.g; if (!unlocked().includes(g)) { audio.sfx('wrong'); openUnlock(); return; } openSetup(g); }));
  if (!scene) titleBackdrop();
}
let setupSel = { sex: 'b', sec: 'أ', groups: 4 };
function openSetup(g) {
  setupSel.grade = g; $('#setupTitle').textContent = `${GRADES[g].title} • ${GRADES[g].route}`;
  $('#heroes').innerHTML = ['b', 'g'].map((s) => `<div class="hcard ${setupSel.sex === s ? 'sel' : ''}" data-s="${s}"><img src="${HEROES[s].img}" alt=""><div>${HEROES[s].name}</div></div>`).join('');
  $('#heroes').querySelectorAll('.hcard').forEach((e) => (e.onclick = () => { setupSel.sex = e.dataset.s; openSetup(g); }));
  $('#sections').innerHTML = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'].map((s) => `<button class="chip ${setupSel.sec === s ? 'sel' : ''}" data-s="${s}">${g}${s}</button>`).join('');
  $('#sections').querySelectorAll('.chip').forEach((e) => (e.onclick = () => { setupSel.sec = e.dataset.s; openSetup(g); }));
  $('#groups').innerHTML = [1, 2, 3, 4].map((n) => `<button class="chip ${setupSel.groups === n ? 'sel' : ''}" data-n="${n}">${n}</button>`).join('');
  $('#groups').querySelectorAll('.chip').forEach((e) => (e.onclick = () => { setupSel.groups = +e.dataset.n; openSetup(g); }));
  showScreen('setup');
}
$('#btnStart').onclick = () => { audio.unlock(); startRun(setupSel.grade, setupSel.sex, `${setupSel.grade}${setupSel.sec}`, setupSel.groups); };
$('#btnBack').onclick = toTitle;
$('#btnBoard').onclick = () => { audio.unlock(); openBoard(1); };
$('#btnUnlock').onclick = () => { audio.unlock(); openUnlock(); };
let codeBuf = '';
function openUnlock() {
  codeBuf = ''; $('#codeShow').textContent = ''; $('#codeMsg').textContent = '';
  $('#keypad').innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, '✔'].map((k) => `<button data-k="${k}">${k}</button>`).join('');
  $('#keypad').querySelectorAll('button').forEach((b) => (b.onclick = () => {
    const k = b.dataset.k; audio.sfx('step');
    if (k === '⌫') codeBuf = codeBuf.slice(0, -1); else if (k === '✔') return tryCode(); else if (codeBuf.length < 4) codeBuf += k;
    $('#codeShow').textContent = codeBuf.replace(/./g, '●');
    if (codeBuf.length === 4) tryCode();
  }));
  showScreen('unlock');
}
function tryCode() {
  const g = [2, 3, 4].find((x) => GRADES[x].code === codeBuf);
  if (g) { const un = unlocked(); if (!un.includes(g)) un.push(g); store.set('salla_unlock_v1', un); audio.sfx('star'); $('#codeMsg').textContent = `🎉 فُتح ${GRADES[g].title}!`; setTimeout(toTitle, 1500); }
  else { audio.sfx('wrong'); $('#codeMsg').textContent = 'الرمز غير صحيح'; codeBuf = ''; $('#codeShow').textContent = ''; }
}
$('#unlockBack').onclick = toTitle;
$('#bMute').onclick = () => { muted = !muted; audio.mute(muted); if (muted) stopVO(); $('#bMute').textContent = muted ? '🔇' : '🔊'; };
$('#bPause').onclick = () => { paused = !paused; $('#bPause').textContent = paused ? '▶' : '⏸'; try { paused ? audio.ctx.suspend() : audio.ctx.resume(); } catch { /* */ } };
$('#bRestart').onclick = () => { if (!S) return; if (Date.now() - (window._rsA || 0) > 6000) { window._rsA = Date.now(); toast('اضغطوا ⟲ مرة أخرى للبدء من جديد', '#fff', 4000); return; } const o = S; startRun(o.grade, o.sex, o.cls, o.groups); };
$('#bExit').onclick = () => { if (!S) return; if (Date.now() - (window._hmA || 0) > 6000) { window._hmA = Date.now(); toast('اضغطوا 🏠 مرة أخرى للخروج إلى القائمة', '#fff', 4000); return; } toTitle(); };
$('#bRepeat').onclick = () => { if (S && S.awaitGate && S.q && !S.station) { S.awaitGate = false; readQuestion().then(() => { S.awaitGate = true; }); } };

// خلفية متحركة لشاشة العنوان
function titleBackdrop() {
  scene = new THREE.Scene(); world = createWorld(THREE, scene, renderer, 1);
  S = null; titleCam = 0;
}
let titleCam = 0;

// ───────────── التحكم: أزرار ولوحة مفاتيح ولمس البوابات ─────────────
function holdBtn(el, on, off) {
  const d = (e) => { e.preventDefault(); el.classList.add('down'); on(); }; const u = (e) => { e.preventDefault(); el.classList.remove('down'); off && off(); };
  el.addEventListener('pointerdown', d); el.addEventListener('pointerup', u); el.addEventListener('pointerleave', u); el.addEventListener('pointercancel', u);
}
holdBtn($('#bL'), () => { input.left = true; nudge(1); }, () => (input.left = false));
holdBtn($('#bR'), () => { input.right = true; nudge(-1); }, () => (input.right = false));
holdBtn($('#bJump'), () => (input.jumpQ = true));
holdBtn($('#bGo'), () => goPress());
holdBtn($('#bStop'), () => stopPress());
function nudge(dir) { if (!S) return; S.tx = clamp(S.tx + dir * 1.25, -3.1, 3.1); }
function goPress() { if (!S) return; audio.unlock(); if (S.walk === 0) S.walk = 1; else if (S.walk === 1) S.walk = 2; else S.walk = 1; }
function stopPress() { if (S) S.walk = 0; }
addEventListener('keydown', (e) => {
  if (e.repeat) return; const k = e.code;
  if (k === 'ArrowLeft' || k === 'KeyA') { input.left = true; nudge(1); }
  if (k === 'ArrowRight' || k === 'KeyD') { input.right = true; nudge(-1); }
  if (k === 'ArrowUp' || k === 'KeyW') goPress();
  if (k === 'ArrowDown' || k === 'KeyS') stopPress();
  if (k === 'Space') { e.preventDefault(); input.jumpQ = true; }
  if (k === 'Enter' && skipLine) skipLine();
});
addEventListener('keyup', (e) => { const k = e.code; if (k === 'ArrowLeft' || k === 'KeyA') input.left = false; if (k === 'ArrowRight' || k === 'KeyD') input.right = false; });
// لمس البوابة على السبورة التفاعلية: البطل يمشي إليها
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
canvas.addEventListener('pointerdown', (e) => {
  if (!S || !S.awaitGate || !S.gates) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(S.gates.filter((o) => o.alive).map((o) => o.g), true);
  if (hits.length) { let o = hits[0].object; while (o && !S.gates.find((x) => x.g === o)) o = o.parent; const gt = S.gates.find((x) => x.g === o); if (gt) { S.tx = gt.x; S.walk = 1; audio.sfx('step'); } }
});

// ───────────── المحاكاة ─────────────
function simHero(dt) {
  const H = S.hero; const G = S.G;
  if (input.left) S.tx = clamp(S.tx + 4.2 * dt, -3.1, 3.1);
  if (input.right) S.tx = clamp(S.tx - 4.2 * dt, -3.1, 3.1);
  const free = S.mode === 'run' || (S.mode === 'question' && S.awaitGate);
  let target = 0;
  if (free) target = S.walk === 2 ? 7.2 * G.speed : S.walk === 1 ? 4.4 * G.speed : 0;
  if (S.mode === 'question') target = Math.min(target, 3.6);
  if (S.stumble > 0) { S.stumble -= dt; target = 0; }
  S.speed = damp(S.speed, target, 6, dt);
  if (free) { S.x = damp(S.x, S.tx, 7, dt); S.z += S.speed * dt; }
  // القفز
  if (input.jumpQ && S.y <= 0.001 && free && S.stumble <= 0) { S.vy = 6.6; audio.sfx('jump'); H.play('jump', 0.1, 1.3); }
  input.jumpQ = false;
  if (S.y > 0 || S.vy > 0) { S.vy -= 19 * dt; S.y += S.vy * dt; if (S.y <= 0) { S.y = 0; S.vy = 0; audio.sfx('land'); } }
  H.root.position.set(S.x, S.y, S.z);
  const lean = (S.tx - S.x) * 0.25;
  if (S.mode === 'cine' && S.faceHero && S.faceHero.root.visible && !S.walkTo) { const ap = S.faceHero.root.position; H.root.rotation.y = damp(H.root.rotation.y, Math.atan2(ap.x - S.x, ap.z - S.z), 8, dt); } // البطل ينظر في عين الحيوان أثناء الحوار
  else if (S.mode !== 'cine' || !S.introSet) H.root.rotation.y = damp(H.root.rotation.y, clamp(lean, -0.5, 0.5), 8, dt);
  // الحركة المناسبة
  if (S.mode === 'run' || S.mode === 'question') {
    if (S.y > 0.05) { /* في الهواء */ } else if (S.stumble > 0) H.play('idle', 0.1);
    else if (S.speed > 5.5) H.play('run', 0.25, S.speed / 7.2);
    else if (S.speed > 0.4) H.play('carry', 0.25, Math.max(0.75, S.speed / 4.0));
    else H.play('idle', 0.3);
  }
  // خطوات
  S.stepT = (S.stepT || 0) + S.speed * dt; if (S.stepT > 1.15 && S.y === 0) { S.stepT = 0; audio.sfx('step'); }
  // التمر
  for (const d of S.dates3d) { if (!d.visible) continue; d.rotation.y += dt * 2.4; if (Math.abs(d.position.z - S.z) < 0.7 && Math.abs(d.position.x - S.x) < 0.75 && S.y < 1.3) { d.visible = false; S.dates++; audio.sfx('coin'); updHud(); } }
  // العقبات
  if (S.mode === 'run' && S.stumble <= 0) for (const o of S.obstacles) {
    if (!o.visible) continue; const u = o.userData;
    if (S.shield > 0 && o.position.z - S.z < 12 && o.position.z > S.z) { o.visible = false; confetti(o.position.clone().add(new THREE.Vector3(0, 0.8, 0)), '#ffd76a'); audio.sfx('star'); continue; }
    if (Math.abs(o.position.z - S.z) < 0.55 && Math.abs(o.position.x - S.x) < u.w / 2 + 0.3 && S.y < u.h) { stumble(o); break; }
  }
  if (S.shield > 0) S.shield -= dt;
}
async function stumble(o) {
  S.stumble = 0.9; S.speed = 0; S.z -= 1.4; S.stumbles++; audio.sfx(o.userData.soft ? 'whoosh' : 'bump');
  S.basketWobble = 1; toast(o.userData.jump ? '⤴ اقفز!' : '↔ ابتعد!', '#ffb3b3', 1100);
  if (S.stumbles % S.G.helperAfter === 0 && !S.helperBusy) { S.helperBusy = true; await helperArrive(false); S.helperBusy = false; }
}
function updHud() { if (!S) return; $('#hStars').textContent = S.stars; $('#hDates').textContent = S.dates; $('#hTime').textContent = fmt(S.time); }

function simWorldEvents() {
  // المراحل
  const si = world.stages.findIndex((s) => S.z >= s.z0 && S.z < s.z1);
  if (si >= 0 && si !== S.stageIdx) { S.stageIdx = si; stageBanner(world.stages[si].nameAr); world.setStageMood && world.setStageMood(si); }
  if (S.momBye && S.mode === 'run' && S.z > S.momBye) { S.mother.root.visible = false; S.momBye = 0; }
  // اللقاءات
  if (S.mode === 'run' && S.encDone < S.nEnc && S.z >= S.encZ[S.encDone]) { const i = S.encDone++; encounter(i); }
  // محطات التفكير
  if (S.mode === 'run' && S.thinkDone < S.thinkZ.length && S.z >= S.thinkZ[S.thinkDone]) { const i = S.thinkDone++; station(i); }
  // الوصول
  if (S.mode === 'run' && S.encDone >= S.nEnc && S.z >= world.houseZ - 7) doorScene();
  // البوابات
  if (S.mode === 'question' && S.awaitGate && S.z >= S.gateZ - 0.3) {
    const alive = S.gates.filter((o) => o.alive); let best = alive[0], bd = 1e9;
    for (const o of alive) { const d = Math.abs(o.x - S.x); if (d < bd) { bd = d; best = o; } }
    passGate(best);
  }
  const p = clamp(S.z / world.houseZ, 0, 1); $('#progFill').style.width = `${p * 100}%`; $('#progHero').style.left = `${p * 100}%`;
}


// إيماءة الرأس أثناء الكلام دون تراكم: إن لم يُعِد الخالطُ ضبطَ العظمة نرجعها لوضعها الأصلي قبل الإضافة
const _nq = new THREE.Quaternion(), _ne = new THREE.Euler();
function headNod(A, x, z, reset) {
  const h = A._head; if (!h || h === -1) return;
  if (A._hq && h.quaternion.equals(A._hq)) h.quaternion.copy(A._hb);
  if (reset) { A._hq = null; return; }
  if (!A._hb) A._hb = new THREE.Quaternion();
  A._hb.copy(h.quaternion);
  h.quaternion.multiply(_nq.setFromEuler(_ne.set(x, 0, z)));
  if (!A._hq) A._hq = new THREE.Quaternion(); A._hq.copy(h.quaternion);
}
const _hv = new THREE.Vector3();
function simActors(dt) {
  if (S.hero) {
    S.hero.update(dt);
    if (S.hand && S.basket.parent && S.basket.parent.isScene) { S.hero.root.updateMatrixWorld(true); S.hand.getWorldPosition(_hv); S.basket.position.set(_hv.x, _hv.y - 0.16, _hv.z); S.basket.rotation.y = S.hero.root.rotation.y; S.basket.visible = S.hero.root.visible; }
  }
  for (const a of S.actors) { a.update(dt); if (a.wander) a.root.position.z += a.wander * dt; }
  if (S.faceCam && S.faceCam.root.visible) S.faceCam.root.lookAt(camera.position.x, 0, camera.position.z);
  else if (S.faceHero && S.faceHero.root.visible && !S.walkTo) { const hp = S.hero.root.position; S.faceHero.root.lookAt(hp.x, 0, hp.z); }
  if (S.talker) { const map = { hero: S.hero, mom: S.mother, animal: S.animal, grandpa: S.grandpa, grandma: S.grandma, falcon: S.falcon }; const A = map[S.talker];
    if (A && A.root.visible) { if (!A._head) A._head = A.bone(/Head$/) || -1; S._tt = (S._tt || 0) + dt; const k = Math.abs(Math.sin(S._tt * 11)) * 0.09 + Math.sin(S._tt * 3.1) * 0.04;
      if (A._head !== -1) headNod(A, k * 0.6, Math.sin(S._tt * 2.3) * 0.03); else A.model.rotation.x = k * 0.5; } }
  for (const A of [S.hero, S.mother, S.animal, S.grandpa, S.grandma, S.falcon]) if (A && A._hq && (!S.talker || ({ hero: S.hero, mom: S.mother, animal: S.animal, grandpa: S.grandpa, grandma: S.grandma, falcon: S.falcon })[S.talker] !== A)) { headNod(A, 0, 0, true); }
  for (const A of [S.hero, S.mother, S.animal, S.grandpa, S.grandma, S.falcon]) if (A && A._head === -1 && A.model && (!S.talker || ({ hero: S.hero, mom: S.mother, animal: S.animal, grandpa: S.grandpa, grandma: S.grandma, falcon: S.falcon })[S.talker] !== A)) A.model.rotation.x = 0;
  const w = S.walkTo;
  if (w) {
    const r = w.a.root; const dx = w.x - r.position.x, dz = w.z - r.position.z; const d = Math.hypot(dx, dz);
    if (d < 0.15) { if (w.hide) r.visible = false; S.walkTo = null; }
    else { const st = Math.min(d, w.speed * dt); r.position.x += dx / d * st; r.position.z += dz / d * st; r.rotation.y = Math.atan2(dx, dz); }
  }
  // الصقر
  const F = S.falcon; if (F.root.visible && F.fly) {
    F.fly.t += dt; const t = F.fly.t; const tgt = F.fly.target;
    if (tgt) { const p = new THREE.Vector3(tgt.x, 3.9, S.gateZ); F.root.position.lerp(p, 1 - Math.exp(-2.5 * dt)); F.root.rotation.y = Math.PI; if (!tgt.alive || !S.gates?.includes(tgt)) F.fly.target = null; }
    else { F.root.position.set(S.x + Math.sin(t * 1.3) * 2.2, 3.6 + Math.sin(t * 2.6) * 0.3, S.z + 5 + Math.cos(t * 1.3) * 1.5); F.root.rotation.y = Math.cos(t * 1.3) > 0 ? Math.PI / 2 : -Math.PI / 2; if (S.shield <= 0 && t > 4) F.root.visible = false; }
  }
  // تأرجح السلّة عند التعثّر
  if (S.basketWobble > 0) { S.basketWobble -= dt * 1.5; S.basket.rotation.z = Math.sin(S.basketWobble * 20) * 0.4 * S.basketWobble; }
}

const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
// يرفع نظر الكاميرا (فتنزل البوابات في الصورة) حتى تبقى لوحات البوابات تحت شريط السؤال
const _qv = new THREE.Vector3();
function qLook(pos, look) {
  const qb = $('#qbar'); if (!S || !S.gates || !S.gates.length || !qb.classList.contains('show')) return look;
  const f = clamp((qb.offsetTop + qb.offsetHeight + 12) / innerHeight, 0, 0.6); // أسفل الشريط (نسبة من أعلى الشاشة)
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dz = look.z - pos.z;
  // إن لم يكفِ رفع النظر نُرجع الكاميرا إلى الخلف قليلًا (فيتّسع الكادر للبطل والبوابات معًا تحت الشريط)
  for (let k = 0; k < 12; k++) {
    const a = Math.atan2(3.25 - pos.y, S.gateZ - pos.z); // أعلى لوحة البوابة
    const need = a - Math.atan((1 - 2 * f) * t);
    // لا نرفع النظر أكثر مما يُبقي قدمي البطل فوق أزرار التحكم
    const feet = Math.atan2(-pos.y, Math.max(1, S.z - pos.z)); const maxP = feet + Math.atan(0.6 * t);
    const p0 = Math.atan2(look.y - pos.y, dz);
    if (need <= maxP || k === 11) { const pitch = Math.min(Math.max(p0, need), Math.max(p0, maxP)); return pitch === p0 ? look : _qv.set(look.x, pos.y + Math.tan(pitch) * dz, look.z).clone(); }
    pos.z -= 0.6;
  }
  return look;
}
function simCamera(dt) {
  if (S.camT && S.camT.cut) { S.camT.cut = false; camPos.copy(S.camT.pos); camLook.copy(S.camT.look); }
  if (S.camT) {
    if (S.camT.qfit) S.camT.look = qLook(S.camT.pos, S.camT.look);
    let p = S.camT.pos;
    if (S.camT.orbit) { const t = performance.now() / 4000; p = new THREE.Vector3(Math.sin(t) * 9, 3.4, world.houseZ - 4 - Math.cos(t) * 9); }
    camPos.lerp(p, 1 - Math.exp(-2.2 * dt)); camLook.lerp(S.camT.look, 1 - Math.exp(-3 * dt));
  } else {
    // كاميرا أقرب ومائلة قليلًا لتظهر البطلة مجسّمة (ثلاثية الأبعاد) لا من الخلف تمامًا
    const q = S.mode === 'question';
    // على الشاشات الطولية: الكاميرا خلف البطل مباشرة وأبعد قليلًا حتى يبقى في وسط الكادر
    const narrow = camera.aspect < 1;
    const back = (q ? 6.2 : 4.0) + portraitPull(q ? 2 : 1.6), up = q ? 3.4 : 2.15 + (narrow ? 0.35 : 0), side = q ? 0 : 1.1 * clamp(camera.aspect - 0.6, 0, 1);
    const p = new THREE.Vector3(S.x * 0.6 + side, up + S.y * 0.3, S.z - back); let l = new THREE.Vector3(S.x * 0.8, q ? 1.3 : 1.05, S.z + (q ? 7 : 5));
    if (q && S.awaitGate) l = qLook(p, l);
    camPos.lerp(p, 1 - Math.exp(-4 * dt)); camLook.lerp(l, 1 - Math.exp(-5 * dt));
  }
  camera.position.copy(camPos); camera.lookAt(camLook);
}

// ───────────── الحلقة الرئيسة ─────────────
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  let dt = Math.min(clock.getDelta(), 0.05) * (window.__TS || 1); if (paused) dt = 0;
  if (S && scene) {
    if (S.mode !== 'end') { simHero(dt); simActors(dt); simWorldEvents(); simCamera(dt); updFX(dt); animProps(dt, performance.now() / 1000); }
    $('#pad').style.opacity = (S.mode === 'run' || S.awaitGate) ? 1 : 0.25;
    if (S.timing) { S.time += dt; if ((S._ht = (S._ht || 0) + dt) > 0.25) { S._ht = 0; updHud(); } }
    world.update(dt, S.z, camera);
  } else if (scene && world) {
    titleCam += dt * 3; const z = 10 + (titleCam % (world.length - 60));
    camera.position.set(Math.sin(titleCam * 0.05) * 2, 3.2, z); camera.lookAt(0, 1.6, z + 12);
    world.update(dt, z, camera);
  }
  if (S && S.introSet) renderer.render(S.introSet.sc, camera); else if (scene) renderer.render(scene, camera);
}

// ───────────── البدء ─────────────
(async function boot() {
  const bar = $('#loadbar');
  try { await document.fonts.load('700 40px Dubai'); } catch { /* */ }
  await Promise.all([loadAll((p, id) => { bar.style.width = `${p * 100}%`; $('#loadtxt').textContent = id; }), loadVO()]);
  $('#loading').style.display = 'none';
  toTitle(); frame();
  // أول لمسة تفتح الصوت
  addEventListener('pointerdown', () => audio.unlock(), { once: true });
})();

// أدوات الاختبار
window.__game = { get S() { return S; }, startRun, skip: () => skipLine && skipLine(), camera, get scene() { return scene; }, renderer };

// تشخيص (يظهر فقط مع ‎#dbg في الرابط)
if (location.hash === '#dbg') { const d = document.createElement('div'); d.style.cssText = 'position:fixed;top:4px;left:40%;z-index:99;background:#000c;color:#0f0;font:12px monospace;padding:4px'; document.body.appendChild(d);
  setInterval(() => { let st = '-'; try { st = audio.ctx.state; } catch (e) { st = 'ERR ' + e.message; } d.textContent = `ctx:${st} vo:${window.__voN || 0} theme:${audio.currentTheme} muted:${muted} VO:${Object.keys(VO).length}`; }, 500); }
