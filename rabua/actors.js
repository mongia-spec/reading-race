// وحدة الشخصيات المأخوذة من لعبة «سلّة خير عُمان» للأستاذة منجية عادل
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
const loader = new GLTFLoader();
// النماذج محفوظة JSON وبداخلها البيانات بصيغة base64؛ نعيد بناءها GLB في الذاكرة (لا fetch لروابط data:)
const LOADFAIL = [];
async function loadGLB(url) {
  try {
    let r = null; for (let k = 0; k < 4; k++) { try { r = await fetch(url); if (r.ok) break; } catch (e) { r = null; } await new Promise((z) => setTimeout(z, 1500 * (k + 1))); }
    if (!r || !r.ok) { LOADFAIL.push(url); return null; }
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
const ASSETS = {}; const LIB = {}; const LIBSRC = {};
// وضعية الراحة لكل عظمة (محلية + عالمية للأب) — لإعادة توجيه الحركات بين هياكل مختلفة دون التواء
function restInfo(root) {
  root.updateMatrixWorld(true); const m = {};
  root.traverse((o) => { if (!o.isBone && !/^mixamorig/.test(o.name)) return; if (m[o.name]) return; const pw = new THREE.Quaternion(); if (o.parent) o.parent.getWorldQuaternion(pw); m[o.name] = { l: o.quaternion.clone(), pw }; });
  return m;
}
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
function retarget(clip, src, dst) {
  if (!src || !dst) return clip;
  for (const t of clip.tracks) {
    if (!/quaternion$/.test(t.name)) continue;
    const b = t.name.slice(0, t.name.lastIndexOf('.')); const S0 = src[b], D0 = dst[b]; if (!S0 || !D0) continue;
    const C = S0.pw.clone().invert().multiply(D0.pw); const Ci = C.clone().invert(); const RsI = S0.l.clone().invert();
    const v = t.values;
    for (let i = 0; i < v.length; i += 4) {
      _q1.fromArray(v, i); _q2.copy(Ci).multiply(_q1).multiply(RsI).multiply(C).multiply(D0.l); _q2.normalize().toArray(v, i);
    }
  }
  return clip;
}
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

export async function loadAll(onp=()=>{}) {
  const jobs = [
    ...['salim', 'shamsa'].map((id) => ['hero', id, `models/${id}.json`]),
    ...['idle_push', 'wave_climb', 'dance_pickup'].map((a) => ['anim', a, `models/anim/${a}.json`]),
    ...['camel','falcon','grandpa'].map((id) => ['npc', id, `models/npc/${id}.json`]),
  ];
  let done = 0;
  await Promise.all(jobs.map(async ([kind, id, url]) => {
    const g = await loadGLB(url); done++; onp(done / jobs.length, id);
    if (!g) return;
    if (kind === 'anim') { const ri = restInfo(g.scene); for (const c of g.animations) if (!LIB[c.name]) { LIB[c.name] = c; LIBSRC[c.name] = ri; } return; }
    ASSETS[id] = prepModel(g, id);
  }));
  return ASSETS;
}
// ───────────── الشخصيات ─────────────
export class Actor {
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
        const ri = restInfo(this.model); for (const [k, c] of Object.entries(LIB)) clips[k] = retarget(cleanClip(c, isHero), LIBSRC[k], ri);
        // ثوب الجدّة مربوط بالساقين: نُثبّت الساقين في حركات الوقوف والتلويح حتى لا يطير الثوب
        if (id === 'grandma') for (const [k, c] of Object.entries(clips)) c.tracks = c.tracks.filter((t) => !/position$/.test(t.name)).map((t) => { if (/(Neck|Head)\.quaternion$/.test(t.name)) return t; const r = ri[t.name.slice(0, -11)]; if (!r) return t; const v = r.l.toArray(); return new THREE.QuaternionKeyframeTrack(t.name, [0, c.duration], [...v, ...v]); });
        for (const [k, c] of Object.entries(a.clips)) clips[k] = cleanClip(c, isHero);
        // مشي البطل بالسلّة: مشي البطل الأصلي المستقيم، مع ذراع يمنى ثابتة تحمل السلّة (حركة حمل الدلو كانت تُحني الجسم حتى تلامس السلّة الأرض)
        if (isHero && clips.Walking && clips.Carry_Water_Bucket_Walk) {
          const cw = clips.Carry_Water_Bucket_Walk, wk = clips.Walking.clone();
          wk.tracks = wk.tracks.map((t) => {
            if (!/Right(Shoulder|Arm|ForeArm|Hand)/.test(t.name) || !/quaternion$/.test(t.name)) return t;
            const ct = cw.tracks.find((x) => x.name === t.name); if (!ct) return t;
            const v = Array.from(ct.values.slice(0, 4)); return new THREE.QuaternionKeyframeTrack(t.name, [0, wk.duration], [...v, ...v]);
          });
          wk.name = 'Carry_Water_Bucket_Walk'; clips.Carry_Water_Bucket_Walk = wk;
        }
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
        // جري الضبع الأصلي منكمش ومنحنٍ: نستعمل الجري البشري بعد تكييفه مع هيكله
        if (id === 'hyena' && LIB.Running) clips.Running = retarget(cleanClip(LIB.Running, false), LIBSRC.Running, ri);
        if (id === 'grandma' && clips.Idle_02) { clips.Walking = clips.Idle_02.clone(); clips.Running = clips.Idle_02.clone(); }
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

export { ASSETS };
