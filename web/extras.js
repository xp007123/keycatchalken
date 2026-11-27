// Little surprises: typing milestones (fireworks, a crown at ten thousand keys, a daily tally),
// a bug for the cat to swat, and the odd shower of rain that soaks it until it shakes itself dry. This file owns the props and particles and decides when things happen;
// behavior.js asks it each frame how the cat should react (`K.extras.update`).
'use strict';
(() => {
  const { V, clamp, smooth, mix, scene } = K;
  const MIN = 60000;

  // Sticker props are sprites drawn on a canvas, in the same flat style with a dark outline.
  const tex = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.lineCap = g.lineJoin = 'round';
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  };
  const sprite = (map, order, depthTest = false) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest, depthWrite: false, transparent: true }));
    s.renderOrder = order;
    s.visible = false;
    scene.add(s);
    return s;
  };
  const INK = '#2a2a2a';

  const crownTex = tex(256, 208, g => {
    g.beginPath();
    g.moveTo(30, 150); g.lineTo(20, 60); g.lineTo(80, 106); g.lineTo(128, 30); g.lineTo(176, 106); g.lineTo(236, 60); g.lineTo(226, 150);
    g.closePath();
    g.fillStyle = '#f7c948'; g.fill();
    g.lineWidth = 10; g.strokeStyle = INK; g.stroke();
    g.beginPath(); g.rect(30, 150, 196, 34);
    g.fillStyle = '#eaa52b'; g.fill(); g.stroke();
    for (const [x, y, r, c] of [[128, 30, 13, '#e2483d'], [20, 60, 11, '#5fa8e8'], [236, 60, 11, '#5fa8e8'], [128, 167, 9, '#e2483d'], [78, 167, 7, '#fffbe8'], [178, 167, 7, '#fffbe8']]) {
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = c; g.fill(); g.lineWidth = 6; g.stroke();
    }
  });
  const bugTex = tex(96, 96, g => {
    g.lineWidth = 5; g.strokeStyle = INK;
    for (const [x, rot] of [[30, -0.5], [66, 0.5]]) {
      g.beginPath(); g.ellipse(x, 38, 19, 12, rot, 0, Math.PI * 2);
      g.fillStyle = 'rgba(214,236,250,0.92)'; g.fill(); g.stroke();
    }
    g.beginPath(); g.ellipse(48, 56, 13, 18, 0, 0, Math.PI * 2); g.fillStyle = '#3a3a3a'; g.fill(); g.stroke();
    g.fillStyle = '#fbfaf3';
    for (const x of [42, 54]) { g.beginPath(); g.arc(x, 49, 3.6, 0, Math.PI * 2); g.fill(); }
  });
  const streakTex = tex(32, 96, g => {
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(21, 10); g.lineTo(11, 86); g.stroke();
    g.strokeStyle = '#6fb1ea'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(21, 10); g.lineTo(11, 86); g.stroke();
  });
  const dropTex = tex(64, 64, g => {
    g.beginPath(); g.moveTo(32, 6); g.bezierCurveTo(54, 30, 52, 56, 32, 56); g.bezierCurveTo(12, 56, 10, 30, 32, 6); g.closePath();
    g.fillStyle = '#7fbdf0'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#fbfaf3'; g.stroke();
  });
  const sparkTex = tex(64, 64, g => {
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, r = i % 2 ? 9 : 29; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
    g.closePath(); g.fillStyle = '#ffffff'; g.fill();
  });

  // Particles: fireworks sparks, water flying off a shaking cat, drips.
  const parts = [];
  function particle(map, at, vel, { life = 1, size = 0.08, gravity = 0, color = null, delay = 0, order = 46 } = {}) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, transparent: true }));
    if (color) s.material.color.set(color);
    s.renderOrder = order;
    s.visible = false;
    s.position.copy(at);
    scene.add(s);
    parts.push({ s, p: at.clone(), v: vel.clone(), life, size, gravity, born: clock + delay });
  }
  let clock = 0;

  // Fireworks: a few bursts of coloured sparks around the cat, one after another.
  const PALETTE = ['#ff6b81', '#ffc94d', '#6fd08c', '#6fb1ea', '#c58cf0', '#ff9f5a'];
  function fireworks(bursts = 3) {
    for (let b = 0; b < bursts; b++) {
      const at = V(-0.75 + Math.random() * 1.6, 1.15 + Math.random() * 0.75, 0.55 + Math.random() * 0.3);
      const color = PALETTE[Math.floor(Math.random() * PALETTE.length)], n = 12;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + Math.random() * 0.3, sp = 0.55 + Math.random() * 0.45;
        particle(sparkTex, at, V(Math.cos(a) * sp, Math.sin(a) * sp + 0.25, 0), { life: 1.1, size: 0.15, gravity: -1.1, color, delay: b * 0.38 });
      }
    }
  }

  // Typing tally. Only the count is kept, per day, never which keys.
  const KEY_STORE = 'gangan.keys';
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  let tally = { date: today(), n: 0 }, dirty = false, lastSave = 0, crownAt = -100;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY_STORE) || 'null');
    if (saved && saved.date === tally.date && saved.n > 0) tally = saved;
  } catch (e) { /* no storage: the count just starts over */ }
  const MILESTONES = [
    { n: 1000, line: '叮！今天第 1000 下，热身完毕喵', bursts: 2 },
    { n: 3000, line: '3000 下啦，键盘开始冒烟了', bursts: 2 },
    { n: 5000, line: '5000 下！今天的杆杆火力全开', bursts: 3 },
    { n: 10000, line: '一万下！本猫为你加冕喵', bursts: 6, crown: true },
    { n: 15000, line: '一万五！你是打字界的传说', bursts: 3 },
    { n: 20000, line: '两万下…手指还好吗？歇歇吧', bursts: 4 },
    { n: 30000, line: '三万下！今天真的可以收工了', bursts: 5 },
  ];
  const CROWN_AT = 10000;
  const grouped = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  function key() {
    if (tally.date !== today()) tally = { date: today(), n: 0 };
    tally.n++;
    dirty = true;
    if (!TUNING.milestoneOn) return;
    const m = MILESTONES.find(x => x.n === tally.n);
    if (!m) return;
    K.talk.say(m.line);
    fireworks(m.bursts);
    if (m.crown) crownAt = clock;
  }

  const crown = sprite(crownTex, 45);
  const bug = sprite(bugTex, 47);

  // A ball of yarn that rolls in along the top of the keyboard for the cat to bat about. It is a
  // real sphere wrapped in strands, so as it rolls the strands turn and its loose end drags along
  // behind it: that reads as round and rolling even in the flat 2D style.
  const YARN_COLORS = ['#e0574a', '#f0a63a', '#6fa8dc', '#8fbf6a', '#c98ad8'];
  const yarnTex = tex(256, 128, g => {
    // White with darker strands, multiplied by the yarn colour: wraps running every which way.
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#a8a8a8'; g.lineWidth = 5;
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      const ph = i * 0.9, amp = 22 + 14 * Math.sin(i * 2.1), off = 14 + i * 12;
      for (let x = 0; x <= 256; x += 8) g.lineTo(x, off + amp * Math.sin(x / 256 * Math.PI * 2 * (1 + (i % 3)) + ph));
      g.stroke();
    }
    g.strokeStyle = '#c4c4c4'; g.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      for (let y = 0; y <= 128; y += 6) g.lineTo(20 + i * 42 + 18 * Math.sin(y / 128 * Math.PI * 3 + i), y);
      g.stroke();
    }
  });
  const YR = 0.12;
  const yarnMat = K.propMat(YARN_COLORS[0], yarnTex);
  const yarnBall = new THREE.Group();
  const yarnCore = new THREE.Mesh(new THREE.SphereGeometry(YR, 36, 24), yarnMat);
  const yarnShell = (color, grow, order) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(YR + grow, 28, 18), K.back(color));
    m.renderOrder = order;
    return m;
  };
  yarnCore.renderOrder = 8;
  yarnBall.add(yarnShell('#f6f3e8', 0.022, 6), yarnShell('#2a2a2a', 0.009, 7), yarnCore);
  yarnBall.visible = false;
  scene.add(yarnBall);
  // The loose end: a thin strand trailing along the keys where the ball has just been.
  const before = new Set(scene.children);
  const yarnTail = K.limb(scene, { segments: 22, radial: 6, fill: yarnMat, outline: K.back('#2a2a2a'), edge: 0.006, order: 7 });
  // Everything the limb added (strand, outline, end caps), to show and hide together.
  const tailParts = scene.children.filter(o => !before.has(o));
  for (const m of tailParts) m.visible = false;
  const trail = [];
  // The game: where the ball is, which paw hits it when. x runs along the keyboard (screen left
  // to right); the cat's paws rest at about x = -0.36 (left) and 0.36 (right).
  // 'both' is the pounce: both paws come down on the ball and pin it there for \`hold\` seconds.
  const YARN = {
    dur: 9,
    enter: { from: 1.6, to: 0.3, t: 1.3 },
    hits: [
      { t: 2.0, paw: 'R', to: -0.3 }, { t: 2.75, paw: 'L', to: 0.3 }, { t: 3.45, paw: 'R', to: -0.06 },
      { t: 4.25, paw: 'both', to: -0.06, hold: 0.8 },
      { t: 5.6, paw: 'L', to: 0.3 }, { t: 6.4, paw: 'R', to: 1.9, away: true },
    ],
  };
  let yarnY = 0.3, yarnZ = 0.8;
  // Ball x at \`age\` seconds into the game.
  function yarnX(age) {
    const e = YARN.enter;
    if (age < e.t) return mix(e.from, e.to, 1 - (1 - age / e.t) ** 2);
    let x = e.to;
    for (const h of YARN.hits) {
      if (age < h.t) return x;
      const span = h.away ? 1.1 : h.paw === 'both' ? 0.15 : 0.5, u = Math.min(1, (age - h.t) / span);
      const nx = mix(x, h.to, h.away ? u * u * 0.4 + u * 0.6 : 1 - (1 - u) ** 2.4);
      if (u < 1) return nx;
      x = h.to;
    }
    return x;
  }

  // Rain: a pool of streaks falling in front of the scene.
  const drops = Array.from({ length: 44 }, () => ({ s: sprite(streakTex, 44), on: false, x: 0, y: 0, z: 0, v: 0 }));
  // The shower being played, if any: { t0, said: {} }.
  let rain = null, nextRain = 0;
  const pose = { lookUp: 0, wet: 0, raining: 0 };
  function startRain() {
    rain = { t0: clock, said: {} };
    K.stage.started('rain');
  }
  // Says each line of the little story once, when its moment comes.
  function cue(name, at, age, run) {
    if (age >= at && !rain.said[name]) { rain.said[name] = true; run(); }
  }

  const head = V(0, 0, 0), tmp = V(0, 0, 0);
  const noteTex = tex(64, 64, g => {
    // A quaver: white fill (tinted per note) with an ink outline.
    const draw = () => {
      g.beginPath(); g.ellipse(22, 46, 11, 8, -0.4, 0, Math.PI * 2);
      g.moveTo(31, 44); g.lineTo(31, 10); g.quadraticCurveTo(44, 16, 48, 28);
    };
    g.lineWidth = 11; g.strokeStyle = '#2a2a2a'; draw(); g.stroke();
    g.lineWidth = 5; g.strokeStyle = '#ffffff'; draw(); g.stroke();
    g.beginPath(); g.ellipse(22, 46, 9, 6, -0.4, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill();
  });
  const NOTE_COLORS = ['#ff8fa3', '#ffd166', '#8fd3ff', '#b8f2a6', '#d6b4ff'];
  K.extras = {
    key,
    keysToday: () => (tally.date === today() ? tally.n : 0),
    summary: () => `今天敲了 ${grouped(K.extras.keysToday())} 下，辛苦啦`,
    fireworks,
    // Where the bug is at `u` (0..1 through the swat), in world space; false once it is gone.
    // It flies in from the upper right, loops in front of the cat, and drops within reach.
    bugAt(u, caught, out) {
      const C = V(0.8, 1.5, 0.7), P = V(0.5, 0.95, 0.8);
      if (u < 0.12) return out.lerpVectors(V(1.7, 1.75, 0.6), C.add(V(0.22, 0, 0)), smooth(0, 0.12, u)), true;
      if (u < 0.68) {
        const th = (u - 0.12) / 0.56 * Math.PI * 2 * 1.75;
        return out.set(C.x + 0.22 * Math.cos(th), C.y + 0.15 * Math.sin(th * 2) + 0.03 * Math.sin(th * 7), C.z + 0.05 * Math.sin(th)), true;
      }
      const th = Math.PI * 2 * 1.75;
      const from = V(C.x + 0.22 * Math.cos(th), C.y + 0.15 * Math.sin(th * 2), C.z);
      if (u < 0.76) return out.lerpVectors(from, P, smooth(0.68, 0.76, u)), true;
      if (caught) return false;
      // Missed: it zips away up and off to the right.
      if (u < 0.95) return out.lerpVectors(P, V(1.8, 1.9, 0.6), smooth(0.76, 0.95, u) ** 0.7), true;
      return false;
    },
    catchPoint: out => out.set(0.5, 0.95, 0.8),
    // The yarn game. \`yarnStart\` picks a colour and finds the height of the keys; \`yarnBall\`
    // places the ball for \`age\` seconds in and returns it (or null once it has rolled away).
    yarnDur: YARN.dur,
    yarnStart() {
      const c = YARN_COLORS[Math.floor(Math.random() * YARN_COLORS.length)];
      yarnMat.uniforms.uColor.value.set(c);
      const k = K.keyboard.resolve('KeyG');
      if (k) { const top = K.keyboard.keyTop(k, V()); yarnY = top.y + YR + 0.005; yarnZ = top.z - 0.08; }
      trail.length = 0;
    },
    yarnBall(age, out) {
      const x = yarnX(age);
      const on = age >= 0 && age < YARN.dur && x < 1.75;
      yarnBall.visible = on;
      for (const m of tailParts) m.visible = on;
      if (!on) { trail.length = 0; return null; }
      // A little hop as each swat lands.
      let hop = 0;
      for (const h of YARN.hits) {
        const d = age - h.t;
        if (h.paw === 'both') { if (d > 0 && d < h.hold) hop = -0.035 * Math.sin(Math.min(1, d / 0.12) * Math.PI / 2); }
        else if (d > 0 && d < 0.32) hop = Math.sin(d / 0.32 * Math.PI) * 0.09;
      }
      yarnBall.position.set(x, yarnY + hop, yarnZ);
      // Rolling without slipping along x, plus a slow wobble about the other axes.
      yarnCore.rotation.set(0.3 * Math.sin(age * 1.3), 0.6 * age, -(x - YARN.enter.from) / YR);
      // The loose end: the last stretch of the path the ball took, lying on the keys.
      const last = trail[trail.length - 1];
      if (!last || Math.abs(last.x - x) > 0.012) trail.push(V(x, yarnY - YR + 0.012, yarnZ + 0.03));
      while (trail.length > 16) trail.shift();
      if (trail.length >= 2) {
        const a = trail[trail.length - 1], b = trail[0], dir = Math.sign(a.x - b.x) || 1;
        yarnTail.update((t, o) => {
          // From under the ball, back along the path, with a lazy wave.
          const len = Math.min(0.42, Math.abs(a.x - b.x) + 0.12);
          return o.set(a.x - dir * t * len, a.y + 0.004 * Math.sin(t * 9), a.z + 0.05 * Math.sin(t * 5 + age * 2) * t);
        }, () => 0.011);
      } else {
        yarnTail.update((t, o) => o.set(x + 0.05 + t * 0.2, yarnY - YR + 0.012, yarnZ + 0.03), () => 0.011);
      }
      return out.copy(yarnBall.position);
    },
    // Where a paw should be at \`age\` (null: no swat to make just now). The paw comes up beside
    // the ball, on its own side, and pats it towards the other paw.
    yarnPaw(name, age, out) {
      const side = name === 'R' ? 1 : -1;
      for (const h of YARN.hits) {
        const both = h.paw === 'both';
        if (h.paw !== name && !both) continue;
        const d = age - h.t, bx = yarnX(h.t);
        if (d < -0.5 || d > (both ? h.hold : 0.24)) continue;
        // Wind up: the paw rises high above and to the side of the ball...
        if (d < -0.08) return { target: out.set(bx + side * (both ? 0.14 : 0.2), yarnY + (both ? 0.36 : 0.3), yarnZ - 0.04), hz: 8 };
        // ...then comes down hard: a swat from the side, or both paws on top for a pounce.
        if (both) return { target: out.set(bx + side * 0.07, yarnY + YR * 0.6, yarnZ), hz: 16 };
        return { target: out.set(bx + side * 0.02, yarnY, yarnZ), hz: 16 };
      }
      return null;
    },
    // How the cat should move for the game at \`age\`: \`crouch\` (low and wiggling before the
    // first swat and before the pounce), \`lean\` (the ball's x, to lean after it), and \`swat\` (a
    // jolt at each hit).
    yarnBody(age) {
      let crouch = smooth(0.4, 1.2, age) * (1 - smooth(1.85, 2.05, age));
      const p = YARN.hits.find(h => h.paw === 'both');
      crouch = Math.max(crouch, smooth(p.t - 0.7, p.t - 0.35, age) * (1 - smooth(p.t + p.hold, p.t + p.hold + 0.3, age)));
      let swat = 0;
      for (const h of YARN.hits) { const d = age - h.t; if (d > 0 && d < 0.25) swat = Math.max(swat, 1 - d / 0.25); }
      return { crouch, lean: clamp(yarnX(age), -0.4, 0.6), swat };
    },
    // Hearts once the ball has rolled away, for a good game.
    yarnHearts(age, t) { return age > YARN.hits[YARN.hits.length - 1].t + 0.9; },
    yarnPounced(age) { const p = YARN.hits.find(h => h.paw === 'both'); return age > p.t && age < p.t + p.hold; },
    // Music notes drifting up from the headphones.
    note(at, side) {
      particle(noteTex, at, V(side * (0.18 + Math.random() * 0.12), 0.32 + Math.random() * 0.12, 0), { life: 1.6, size: 0.2, color: NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)] });
    },
    showBug(pos, t) {
      bug.visible = !!pos;
      if (!pos) return;
      bug.position.copy(pos);
      // Wings blur: the sticker squashes sideways very fast.
      bug.scale.set(0.18 * (0.8 + 0.2 * Math.sin(t * 70)), 0.18, 1);
    },
    // Water flying off as the cat shakes itself dry.
    splash(at) {
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * Math.PI * 2, sp = 0.7 + Math.random() * 0.6;
        particle(dropTex, tmp.copy(at).add(V(Math.cos(a) * 0.4, -0.1 + Math.sin(a) * 0.35, 0.1)),
          V(Math.cos(a) * sp, 0.5 + Math.sin(a) * sp * 0.7, 0.1), { life: 0.8, size: 0.075, gravity: -2.4, delay: Math.random() * 0.25 });
      }
    },
    rainNow() { startRain(); },
    raining: () => !!rain,
    reset() {
      rain = null; nextRain = 0;
      Object.assign(pose, { lookUp: 0, wet: 0, raining: 0 });
      for (const d of drops) { d.on = false; d.s.visible = false; }
      for (const q of parts) scene.remove(q.s);
      parts.length = 0;
      bug.visible = false;
      yarnBall.visible = false;
      for (const m of tailParts) m.visible = false;
      trail.length = 0;
    },
    // Every frame. `calm`: nothing else going on (awake, not eating, not cross), so a shower may
    // start. Returns how the cat should look: looking up at the first drops, and how wet it is.
    update(t, dt, calm) {
      clock = t;
      const ms = Date.now();
      K.cat.headPivot.updateMatrixWorld();
      head.set(0, 0, 0).applyMatrix4(K.cat.headPivot.matrixWorld);

      // Save the tally now and then, and tell the host (for the menu).
      if (dirty && ms - lastSave > 5000) {
        dirty = false; lastSave = ms;
        try { localStorage.setItem(KEY_STORE, JSON.stringify(tally)); } catch (e) { /* ignore */ }
        window.webkit?.messageHandlers?.cat?.postMessage({ stats: { keys: tally.n } });
      }

      // The crown: worn for the rest of the day once the tally passes ten thousand.
      const crowned = TUNING.milestoneOn && K.extras.keysToday() >= CROWN_AT;
      crown.visible = crowned;
      if (crowned) {
        const a = t - crownAt, pop = a < 0.5 ? 0.3 + 0.7 * smooth(0, 0.35, a) + 0.25 * Math.sin(smooth(0, 0.5, a) * Math.PI) : 1;
        const roll = K.cat.headPivot.rotation.z + K.cat.head.rotation.z;
        crown.position.set(-Math.sin(roll) * 0.98, 0.98 + (a < 0.5 ? (1 - smooth(0, 0.35, a)) * 0.5 : 0), 0.05).applyMatrix4(K.cat.headPivot.matrixWorld);
        crown.scale.set(0.4 * pop, 0.325 * pop, 1);
        crown.material.rotation = roll;
      }

      // Showers come round every so often while things are quiet.
      if (!rain && TUNING.rainEvery > 0) {
        if (!nextRain) nextRain = ms + TUNING.rainEvery / K.stage.rate() * MIN * (0.6 + 0.8 * Math.random());
        if (ms > nextRain) {
          // The director may say not now (another scene, too soon, enough rain for today).
          if (calm && K.stage.canStart('rain')) { nextRain = 0; startRain(); } else nextRain = ms + MIN;
        }
      }
      let intensity = 0, lookUp = 0, wet = pose.wet;
      if (rain) {
        const age = t - rain.t0;
        intensity = smooth(0, 1.4, age) * (1 - smooth(8.2, 10, age));
        lookUp = smooth(0.2, 0.7, age) * (1 - smooth(1.4, 2.0, age));
        // Soaked: the fur darkens until the rain stops, then a good shake dries it.
        wet = age < 9.4 ? Math.max(wet, smooth(1.2, 4.2, age)) : wet * Math.exp(-dt * 2.2);
        cue('soaked', 2.4, age, () => K.talk.say('呜…没带伞，淋湿了啦'));
        cue('shake', 9.4, age, () => { window.cat.act('shake'); K.extras.splash(head.clone().add(V(0, 0.45, 0.2))); });
        cue('dry', 11, age, () => K.talk.say('甩干！又是一只蓬松的猫'));
        // Drips from the chin while it sits there soaked.
        if (age > 3 && age < 9.3 && Math.random() < dt * 2.2) {
          particle(dropTex, head.clone().add(V(-0.35 + Math.random() * 0.7, 0.12, 0.42)), V(0, -0.1, 0), { life: 0.7, size: 0.06, gravity: -2.2 });
        }
        if (age > 12.5) { rain = null; wet = 0; }
      } else wet = wet < 0.01 ? 0 : wet * Math.exp(-dt * 3);
      Object.assign(pose, { lookUp, wet, raining: intensity });

      // Rain: streaks fall on a slant.
      const want = Math.round(drops.length * intensity);
      drops.forEach((d, i) => {
        if (!d.on) {
          if (i < want && Math.random() < dt * 9) {
            Object.assign(d, { on: true, x: -1.4 + Math.random() * 3.2, y: 2.25 + Math.random() * 0.5, z: 0.35 + Math.random() * 0.95, v: 3.1 + Math.random() * 1.1 });
          } else { d.s.visible = false; return; }
        }
        d.y -= d.v * dt;
        d.x -= 0.13 * d.v * dt;
        if (d.y < 0.04) { d.on = false; d.s.visible = false; return; }
        d.s.visible = true;
        d.s.position.set(d.x, d.y, d.z);
        d.s.scale.set(0.045, 0.135, 1);
      });

      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i], age = t - q.born;
        if (age < 0) { q.s.visible = false; continue; }
        if (age > q.life) { scene.remove(q.s); parts.splice(i, 1); continue; }
        q.v.y += q.gravity * dt;
        q.p.addScaledVector(q.v, dt);
        q.s.visible = true;
        q.s.position.copy(q.p);
        const u = age / q.life, sz = q.size * (0.5 + 0.5 * smooth(0, 0.15, u)) * (1 - 0.4 * u);
        q.s.scale.set(sz, sz, 1);
        q.s.material.opacity = 1 - smooth(0.6, 1, u);
      }
      return pose;
    },
    // Something is on screen that needs full frame rate.
    busy: () => !!rain || parts.length > 0 || pose.wet > 0.01,
  };
})();
