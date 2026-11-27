// Input → animation state → render. The native app calls `window.cat.*`.
'use strict';
(() => {
  const { V, mix, clamp, approach, smooth } = K;
  const { camera, scene, renderer, keyboard, mouseProp, cat } = K;
  // In dev the clock can be frozen and stepped (`cat.freeze()` / `cat.step(s)`) to film motion frame by frame.
  let frozen = null;
  const now = () => frozen ?? performance.now() / 1000;

  const { Spring } = K;
  const opts = { privacy: false, sleepAfter: 60 };
  const S = {
    lastInput: now(), lastKey: -100, lastMouse: -100, mouseDown: false,
    cursor: null, cursorSeen: -100, petting: false, petUntil: 0, petX: 0,
    sleep: 0, asleep: false, wakeAt: -100, nextBlink: now() + 3, nextZ: 0,
    rub: 0, busyUntil: now() + 2, lastPaw: 'R', hit: 'none',
    // How worked up the cat is (fast typing, quick mouse moves): wider pupils, livelier tail.
    excite: 0, strokes: [], tailPhase: 0,
    // An idle fidget: { kind, t0, dur, side }. `lastActive` is the last key, click or pat:
    // moving the pointer alone neither cancels a fidget nor keeps new ones from starting.
    // `yawned` marks the yawn before dozing off.
    act: null, nextAct: now() + 4, lastActive: now(), yawned: false,
    // Irritation, 0..1, from key mashing, very fast typing, petting for too long or being woken
    // up. Past a threshold the cat is `cross`: it thumps its tail on the desk until it calms.
    annoy: 0, cross: false, crossSince: 0, thumpPhase: 0, thumpLift: 0, lastSlam: 0, petStart: -1,
    // Fast pointer movement makes the cat curious instead, like a cat watching a laser dot: eyes
    // wide, round pupils, ears up and forward, head cocked, tail tip twitching. `moves` holds
    // recent [time, distance] samples for the pointer speed; `curiousUntil` keeps it watching a
    // while after the pointer stops.
    moves: [], mouseSpeed: 0, curiousUntil: -100,
    // Hunger: `full` is 0..100, last brought up to date at wall-clock `fullAt` (ms). `meal` is the
    // bowl being eaten from: { kind, left 0..1, t0, refuse, doneAt }.
    full: 80, fullAt: Date.now(), hungerRestored: false, hungerReported: -100,
    meal: null, lastNom: 0, lickT0: -100, happyUntil: -100,
  };
  const effects = [];
  // Pose springs. Gaze is quickest, then the head, then the body, like a real cat whose eyes
  // lock on first and whose body catches up last; damping under 1 gives a touch of follow-through.
  const P = {
    shift: new Spring(0, 1.8, 0.72),     // sideways bend of the chest towards the busy paw
    hunch: new Spring(0, 1.6, 0.8),      // leaning forward over the board
    squash: new Spring(0, 2.2, 0.55),    // loafing down, plus the little dip on each key strike
    yaw: new Spring(0, 2.6, 0.7),
    pitch: new Spring(-0.28, 2.4, 0.68),
    roll: new Spring(0, 2.2, 0.6),
    gazeX: new Spring(0, 7, 0.9),
    gazeY: new Spring(0, 7, 0.9),
    ears: new Spring(0, 5, 0.35),
    cross: new Spring(0, 1.6, 0.9),
    curious: new Spring(0, 3.5, 0.75),   // quick to light up, a slight overshoot reads as a start
    desk: new Spring(0, 9, 0.35),        // the desk hop when the tail slams down
    eat: new Spring(0, 2, 0.8),          // head down over the bowl
    bowl: new Spring(0, 4, 0.45),        // the bowl popping in, with a little overshoot
    pat: new Spring(0, 4.5, 0.28),       // a tap on the head: squashed, then a jelly bounce back
    starve: new Spring(0, 0.8, 0.9),     // the slumped, drooping look of a very hungry cat
  };
  // Paw 'L' is on screen left (the cat's right) and also works the mouse.
  const paws = {
    L: { side: -1, pos: V(-0.36, 0.26, 0.68), from: V(), key: null, t0: -100, dur: 0.08, down: false },
    R: { side: 1, pos: V(0.36, 0.26, 0.68), from: V(), key: null, t0: -100, dur: 0.08, down: false },
  };
  for (const p of Object.values(paws)) { p.spring = new Spring(p.pos, 3.2, 0.78); p.last = p.pos.clone(); }
  // The tail presses the space bar: it swings over in `dur`, the key goes down when the tip lands
  // (`landAt`), and the tail hovers there a while in case more spaces follow before curling back.
  const tailTap = { key: null, t0: -100, dur: 0.18, from: 0, down: false, landAt: -100, reach: 0, hover: 0.12, tip: V() };
  const popups = [], zs = [];
  const tmp = V(0, 0, 0), tmp2 = V(0, 0, 0), bugV = V(0, 0, 0), yarnV = V(0, 0, 0);

  // Adds irritation; it only starts to fade a couple of seconds after the last poke. Switched off
  // in the settings, nothing irritates the cat (the 试试 button still forces it).
  function poke(amount, t, force = false) {
    if (!TUNING.annoyOn && !force) return;
    S.annoy = clamp(S.annoy + amount, 0, 1);
    S.lastPoke = t;
  }

  // Idle fidgets and how long each lasts. The long ones use the paws (`PAW_ACTS`), so they only
  // start while the paw is off the mouse.
  // 'beg' and 'meow' come up when the cat is hungry; 'rumble' (holding its tummy as it growls) and
  // 'flop' (flopping down, chin on the desk, looking up at you) when it is starving.
  const ACTS = { tilt: 1.8, ear: 0.4, slowBlink: 1.4, look: 2.2, tail: 1, yawn: 2.6, knead: 4.8, shake: 1.3,
    beg: 3.2, meow: 1.6, rumble: 2.4, flop: 4.5, bug: 5, music: 9, yarn: 9 };
  // Fidgets that hold the cat's whole attention: keys don't break them off. The bug and the yarn
  // also take both paws off the keys; the music only takes the head, so typing carries on.
  const KEEP_ACTS = new Set(['bug', 'yarn', 'music']);
  const PAW_ACTS = new Set(['knead']);
  const SMALL_ACTS = ['tilt', 'tilt', 'ear', 'slowBlink', 'look', 'tail'];
  // Picks a fidget by the weights in the 调节 window; `pawFree` false leaves out the paw ones.
  function pickAct(pawFree) {
    const w = { yawn: TUNING.wYawn, knead: pawFree ? TUNING.wKnead : 0,
      shake: TUNING.wShake, small: TUNING.wSmall, bug: TUNING.wBug, music: TUNING.wMusic, yarn: pawFree ? TUNING.wYarn : 0 };
    // Hungry, it mostly asks for food; very hungry, its tummy rumbles too. Well fed, it kneads more.
    if (hungry() && S.full < STARVING) {
      for (const k in w) w[k] *= 0.15;
      Object.assign(w, { beg: 3, meow: 3, rumble: 4, flop: 3 });
    } else if (hungry()) {
      for (const k in w) w[k] *= 0.5;
      Object.assign(w, { beg: 5, meow: 2 });
    } else if (TUNING.hungerOn && S.full > 80) w.knead *= 1.5;
    // State: a starving cat doesn't play; late at night it is sleepy rather than playful; just
    // petted or fed, it is content and kneads.
    const h = new Date().getHours(), t = now();
    if (hungry() && S.full < STARVING) w.yarn = w.music = w.bug = 0;
    if (h >= 22 || h < 6) { w.yawn *= 2; w.knead *= 1.3; w.yarn *= 0.4; w.bug *= 0.4; w.music *= 0.4; }
    if (t - (S.lastPetAt || -1e9) < 90 || t - (S.lastFedAt || -1e9) < 90) w.knead *= 2;
    // Big scenes only when the director says so (one at a time, a rest between, a daily cap).
    for (const k of Object.keys(w)) if (K.stage.isBig(k) && !K.stage.canStart(k)) w[k] = 0;
    let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
    for (const [kind, weight] of Object.entries(w)) {
      if (weight <= 0) continue;
      if ((r -= weight) < 0) return kind === 'small' ? SMALL_ACTS[Math.floor(Math.random() * SMALL_ACTS.length)] : kind;
    }
    return null;
  }
  // Hunger. `S.full` drops with wall-clock time, also while the app is closed (the host saves
  // `{ full, at }` and hands it back in `options`), and a little with every key.
  const HUNGRY = 30, STARVING = 10;
  // How much each food fills the cat (in %) and how long it takes to eat (s).
  const FOODS = { fish: { amount: 15, eat: 2.2 }, kibble: { amount: 40, eat: 3.6 }, can: { amount: 60, eat: 3.6, hearts: 3 },
    milk: { amount: 20, eat: 3 } };
  const hungry = () => TUNING.hungerOn && S.full < HUNGRY;
  function digest() {
    const ms = Date.now();
    if (TUNING.hungerOn) S.full = clamp(S.full - (ms - S.fullAt) / 3.6e6 * (100 - HUNGRY) / TUNING.hungerHours, 0, 100);
    S.fullAt = ms;
  }
  function reportHunger(t) {
    S.hungerReported = t;
    window.webkit?.messageHandlers?.cat?.postMessage({ hunger: { full: Math.round(S.full * 10) / 10, at: S.fullAt } });
  }
  // A bowl appears; the cat eats from it whenever nothing else is going on. Too full, it turns its
  // nose up at it.
  function feed(kind) {
    if (!(kind in FOODS)) return false;
    const t = now();
    digest();
    // Food is a nice way to be woken: no grumpiness.
    if (S.asleep || S.sleep > 0.3) S.wakeAt = t;
    S.asleep = false;
    S.lastInput = t;
    S.act = null;
    S.meal = { kind, left: 1, t0: t, refuse: TUNING.hungerOn && S.full >= 95, doneAt: null };
    K.foodProp.setKind(kind);
    K.foodProp.setLeft(1);
    P.bowl.set(0);
    S.busyUntil = Math.max(S.busyUntil, t + 2);
    return true;
  }
  // Sticker effects that pop up and float: the fish thought bubble, hearts, "吧唧", "咕~".
  // `delay` (s) holds it back, for a few hearts one after another.
  function popFx(tex, from, size, life, vel, aspect = 1, delay = 0) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.renderOrder = 43;
    sprite.position.copy(from);
    sprite.visible = delay <= 0;
    scene.add(sprite);
    effects.push({ kind: 'pop', sprite, t0: now() + delay, life, size, from: from.clone(), vel, aspect });
  }
  function nom() {
    const at = K.foodProp.target(V()).add(V(0.08 + 0.1 * Math.random(), 0.12, 0.1));
    popFx(K.labelTexture('吧唧', 'z').tex, at, 0.2, 0.8, V(0.05, 0.25, 0), 2);
  }
  function afterMeal(t, meal) {
    S.lastFedAt = t;
    S.lickT0 = t + 0.3;
    S.happyUntil = t + 2;
    const n = FOODS[meal.kind].hearts || 1;
    const head = cat.head.getWorldPosition(V());
    for (let i = 0; i < n; i++) {
      popFx(K.fxTexture('heart'), head.clone().add(V(0.35 + 0.15 * i, 0.45 + 0.05 * i, 0.1)), 0.2, 1.4, V(0.06, 0.3, 0), 1, 0.25 * i);
    }
    reportHunger(t);
    K.talk.event('fed');
  }

  function startAct(kind, t) {
    // `caught`: whether the swat at a bug lands (it mostly does).
    S.act = { kind, t0: t, dur: ACTS[kind], side: Math.random() < 0.5 ? -1 : 1, puffed: false, caught: Math.random() < 0.75 };
    // Rest a while (`idleGap` on average, give or take 40%) after the fidget ends.
    S.nextAct = t + S.act.dur + TUNING.idleGap / K.stage.rate() * (0.6 + 0.8 * Math.random()) * (hungry() && S.full < STARVING ? 0.5 : 1);
    K.stage.started(kind);
    S.busyUntil = Math.max(S.busyUntil, t + S.act.dur + 0.8);
  }

  // A key, click or pat stops whatever fidget is going on, since the paws are needed. Moving the
  // pointer (`fromPointer`) lets it play out; the eyes follow the pointer meanwhile.
  function wake(t, fromPointer = false) {
    K.talk.activity();
    const wasAsleep = S.asleep || S.sleep > 0.3;
    if (wasAsleep) { S.wakeAt = t; poke(TUNING.wakeAnnoy / 100, t); K.talk.event('woken'); }
    S.asleep = false;
    S.yawned = false;
    S.lastInput = t;
    // Springs need a couple of seconds at full frame rate to settle after any input.
    S.busyUntil = Math.max(S.busyUntil, t + 3);
    if (fromPointer) return;
    S.lastActive = t;
    // The click on a 试试 button can reach the cat just after the fidget it asked for.
    // A bug has the cat's whole attention: nothing breaks that off.
    if (!(S.act && (KEEP_ACTS.has(S.act.kind) || (S.act.forced && t - S.act.t0 < 0.4)))) S.act = null;
    S.nextAct = t + 4 + Math.random() * 4;
  }

  function mousing(t) { return S.mouseDown || t - S.lastMouse < 1.4; }

  function key(code, down) {
    const t = now();
    const k = keyboard.resolve(code);
    if (!k) return;
    if (!down) {
      if (tailTap.key === k) { tailTap.down = false; return; }
      k.down = false;
      for (const p of Object.values(paws)) if (p.key === k) p.down = false;
      return;
    }
    wake(t);
    if (S.act && (S.act.kind === 'bug' || S.act.kind === 'yarn')) {
      // Too busy with the bug or the ball to type: the key goes down on its own and still counts.
      if (!k.down) { K.talk.key(); K.extras.key(); }
      k.down = true;
      return;
    }
    if (k.down || (tailTap.key === k && tailTap.down)) return;
    // Easter egg: space goes to the tail, unless the tail is busy thumping in a huff.
    if (k.code === 'Space' && !S.cross) {
      tailTap.from = tailTap.reach;
      tailTap.dur = mix(0.18, 0.07, tailTap.reach);
      tailTap.key = k;
      tailTap.t0 = t;
      tailTap.down = true;
      // Not a paw key: the paws stay where they are rather than curling up to type.
      S.strokes.push(t);
      if (S.strokes.filter(s => t - s < 0.15).length >= TUNING.mashKeys) poke(0.3, t);
      return;
    }
    let side = keyboard.leftHand(code) ? 'R' : 'L';
    if (mousing(t)) side = 'R';
    const paw = paws[side];
    paw.from.copy(paw.pos);
    paw.key = k;
    paw.t0 = t;
    paw.dur = clamp(paw.pos.distanceTo(keyboard.keyTop(k, tmp)) * 0.09, 0.05, 0.1);
    K.talk.key();
    K.extras.key();
    // Typing burns a little energy; a very hungry cat's paws are a touch slower.
    if (TUNING.hungerOn) {
      S.full = Math.max(0, S.full - TUNING.typeCost / 1000);
      if (S.full < STARVING) paw.dur *= 1.35;
    }
    paw.down = true;
    k.down = true;
    S.lastKey = t;
    S.lastPaw = side;
    S.strokes.push(t);
    // Mashing the keyboard (four or more keys inside 150 ms) is upsetting.
    if (S.strokes.filter(s => t - s < 0.15).length >= TUNING.mashKeys) poke(0.3, t);
    // Each strike jolts the body a little: a dip into the shoulders and a small nod.
    P.squash.kick(0.35);
    P.pitch.kick(0.9);
    // Modifier taps (caps lock / fn) send no key-up; let them spring back.
    if (code === 'CapsLock') setTimeout(() => key(code, false), 120);
    // F keys have no caps of their own and press the digit below; the label still names the F key.
    if (!opts.privacy) popup(k, t, paw.side, /^F\d+$/.test(code) ? code : k.label);
  }

  const fxSprite = (kind, order) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: K.fxTexture(kind), depthTest: false, transparent: true }));
    sprite.renderOrder = order;
    return sprite;
  };
  const angerMark = fxSprite('anger', 45);
  angerMark.visible = false;
  scene.add(angerMark);

  // The tail lands: a burst and puffs of dust where it hits, the desk jumps, the body flinches.
  function slam(t) {
    S.lastSlam = t;
    const tip = cat.tailTip(V());
    tip.y = 0.08;
    const add = (kind, size, life, vel, order) => {
      const sprite = fxSprite(kind, order);
      sprite.position.copy(tip);
      scene.add(sprite);
      effects.push({ kind, sprite, t0: t, life, size, from: tip.clone(), vel });
    };
    add('bang', 0.36, 0.24, V(0, 0.15, 0), 42);
    for (const s of [-1, 0, 1]) add('dust', 0.13 + 0.04 * Math.random(), 0.5, V(s * 0.5 + 0.1, 0.3 + 0.15 * Math.random(), 0.1), 41);
    P.desk.kick(0.35);
    P.squash.kick(0.25);
  }

  // Shaking off: a few tufts of fur fly out from the sides of the body and head.
  function shakePuffs(t) {
    const head = cat.head.getWorldPosition(V());
    for (const [s, y, base] of [[-1, 0.15, head], [1, 0.1, head], [-1, -0.55, head], [1, -0.6, head], [1, -0.25, head]]) {
      const from = base.clone().add(V(s * (0.55 + 0.1 * Math.random()), y, 0.1));
      const sprite = fxSprite('dust', 41);
      sprite.position.copy(from);
      scene.add(sprite);
      effects.push({ kind: 'dust', sprite, t0: t, life: 0.6, size: 0.13 + 0.05 * Math.random(), from, vel: V(s * (0.5 + 0.3 * Math.random()), 0.15 + 0.2 * Math.random(), 0.1) });
    }
  }

  // The label floats beside the striking arm, on its outer side, like the reference.
  function popup(k, t, side, label = k.label) {
    for (let i = popups.length - 1; i >= 0; i--) if (popups[i].key === k) { scene.remove(popups[i].sprite); popups.splice(i, 1); }
    const { tex, aspect } = K.labelTexture(label);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.renderOrder = 40;
    keyboard.keyTop(k, sprite.position).add(V(side * 0.3, 0.2, -0.1));
    sprite.userData.base = sprite.position.clone();
    sprite.userData.aspect = aspect;
    scene.add(sprite);
    popups.push({ key: k, sprite, t0: t, upAt: null });
  }

  // The tail's reach is scripted like a paw strike so the tip lands on time; the key goes down and
  // its label pops up only when the tip touches it.
  function updateTailTap(t, dt) {
    const k = tailTap.key;
    if (!k) { tailTap.reach += (0 - tailTap.reach) * approach(10, dt); return; }
    const age = t - tailTap.t0, swinging = age < tailTap.dur;
    if (swinging) tailTap.reach = mix(tailTap.from, 1, smooth(0, 1, age / tailTap.dur));
    else if (tailTap.landAt < tailTap.t0) {
      tailTap.landAt = t;
      // A tail pat is lighter than a paw strike: a small dip and nod.
      P.squash.kick(0.15);
      P.pitch.kick(0.4);
      if (!opts.privacy) popup(k, t, 1);
    }
    const pressing = !swinging && (tailTap.down || t - tailTap.landAt < 0.09);
    k.down = pressing;
    // Up in an arc while swinging over, down onto the cap, then a little bounce back up.
    let hover = 0.12;
    if (swinging) hover = 0.12 + Math.sin(age / tailTap.dur * Math.PI) * 0.1 * (1 - tailTap.from);
    else if (pressing) hover = 0;
    tailTap.hover += (hover - tailTap.hover) * approach(swinging ? 60 : pressing ? 70 : 18, dt);
    // Done hovering: let the reach ease off and the tail curl back to its usual place.
    if (!pressing && !swinging && t - tailTap.landAt > 0.8) { tailTap.key = null; return; }
    S.busyUntil = Math.max(S.busyUntil, t + 1);
  }

  // A strike is scripted (it has to land on time); every other paw move goes through the paw's
  // spring so it eases out, carries momentum from the strike, and settles with a small bob.
  function updatePaw(name, paw, t, dt) {
    const k = paw.key;
    const strikeAge = t - paw.t0;
    if (k && (paw.down || strikeAge < paw.dur + 0.06)) {
      const top = keyboard.keyTop(k, tmp2);
      const hover = tmp.copy(top).add(V(0, 0.12, 0));
      const press = top.clone().add(V(0, 0.07, 0));
      if (strikeAge < paw.dur) {
        // Lift first, then come down onto the key: the arc peaks early.
        const u = smooth(0, 1, strikeAge / paw.dur);
        paw.pos.lerpVectors(paw.from, hover, u);
        paw.pos.y += Math.sin(Math.sqrt(u) * Math.PI) * clamp(paw.from.distanceTo(hover) * 0.3, 0.04, 0.2);
      } else if (paw.down) {
        paw.pos.lerpVectors(hover, press, clamp((strikeAge - paw.dur) / 0.035, 0, 1));
      } else {
        paw.pos.lerp(hover, approach(30, dt));
      }
      paw.spring.x.copy(paw.pos);
      if (dt > 0) paw.spring.v.subVectors(paw.pos, paw.last).divideScalar(dt).multiplyScalar(0.5);
      paw.last.copy(paw.pos);
      return;
    }
    let target, hz = 3.2, damping = 0.78;
    const act = S.act, pawAct = act && PAW_ACTS.has(act.kind);
    const actAt = act ? (t - act.t0) / act.dur : 0;
    const yarnAge = act && act.kind === 'yarn' ? t - act.t0 : -1;
    const swat = yarnAge >= 0 ? K.extras.yarnPaw(name, yarnAge, tmp) : null;
    if (yarnAge >= 0 && yarnAge < 7.3) {
      // Batting the ball of yarn: each paw comes up beside it in turn and pats it across; in
      // between, both hover just off the keys, ready.
      if (swat) { target = swat.target; hz = swat.hz; damping = 0.7; }
      else {
        const arm = cat.arms[paw.side < 0 ? 0 : 1];
        cat.attach(arm.shoulderLocal, arm.shoulder);
        // Up and ready, a little forward, bobbing with excitement.
        target = tmp.set(arm.shoulder.x + paw.side * 0.04, 0.38 + 0.03 * Math.sin(t * 11 + paw.side), 0.74);
        hz = 6;
      }
    } else if (act && act.kind === 'bug' && actAt < 0.9) {
      // Both paws come off the keys. The right one is held up, ready, while the cat watches the
      // bug, then shoots out to where it comes down; the left one tucks in against the chest.
      if (name === 'R' && actAt > 0.7 && actAt < 0.86) {
        target = K.extras.catchPoint(tmp);
        hz = 11;
        damping = 0.65;
      } else {
        const ready = smooth(0.08, 0.25, actAt);
        const arm = cat.arms[paw.side < 0 ? 0 : 1];
        cat.attach(arm.shoulderLocal, arm.shoulder);
        const rest = tmp2.set(arm.shoulder.x + paw.side * 0.02, 0.26, 0.68);
        const up = name === 'R' ? V(0.5, 0.92 + 0.03 * Math.sin(t * 9), 0.6) : cat.attach(V(-0.3, 0.55, 0.5), V());
        target = tmp.lerpVectors(rest, up, ready);
        hz = 4.5;
      }
    } else if (act && act.kind === 'rumble' && name === 'R') {
      const u = (t - act.t0) / act.dur, env = smooth(0, 0.2, u) * (1 - smooth(0.8, 1, u));
      const arm = cat.arms[1];
      cat.attach(arm.shoulderLocal, arm.shoulder);
      const rest = tmp2.set(arm.shoulder.x + 0.02, 0.26, 0.68);
      target = tmp.lerpVectors(rest, cat.attach(V(0.12, 0.42, 0.56), V()), env);
      hz = 4;
    } else if (pawAct) {
      // Fidgets that use the paws win over the mouse: the pointer may keep moving meanwhile.
      const u = (t - act.t0) / act.dur, env = smooth(0, 0.15, u) * (1 - smooth(0.85, 1, u));
      const arm = cat.arms[paw.side < 0 ? 0 : 1];
      cat.attach(arm.shoulderLocal, arm.shoulder);
      const rest = tmp.set(arm.shoulder.x + paw.side * 0.02, 0.26, 0.68);
      // Kneading: the paws take turns, each lifting and pulling back a little, then pressing
      // forward and down onto the edge of the board.
      const ph = (t - act.t0) * 1.7 * Math.PI * 2 + (paw.side < 0 ? 0 : Math.PI);
      const lift = Math.max(0, Math.sin(ph));
      target = rest.add(V(paw.side * -0.03 * env, 0.2 * lift * env, -0.09 * lift * env));
      hz = 7;
      damping = 0.85;
    } else if (name === 'L' && mousing(t)) {
      // Holding the mouse the paw sticks to it, so this spring is stiff.
      target = mouseProp.top(tmp);
      hz = t - S.lastMouse < 0.05 || S.mouseDown ? 9 : 6;
      damping = 0.9;
    } else if (k && t - paw.t0 < 0.45) {
      // Hovers over the key it just hit, ready for the next one.
      target = keyboard.keyTop(k, tmp).add(V(0, 0.13, 0));
      hz = 5;
    } else if (t - S.lastKey < 1.2) {
      // While typing, the free paw curls up against the side of the belly.
      target = cat.attach(tmp2.set(paw.side * 0.55, 0.6, 0.44), tmp);
      hz = 3.6;
    } else {
      // At rest both paws hang straight down onto the far edge of the keyboard.
      const arm = cat.arms[paw.side < 0 ? 0 : 1];
      cat.attach(arm.shoulderLocal, arm.shoulder);
      target = tmp.set(arm.shoulder.x + paw.side * 0.02, 0.26, 0.68);
      hz = 2.4;
    }
    paw.spring.hz = hz;
    paw.spring.damping = damping;
    paw.pos.copy(paw.spring.step(target, dt));
    paw.last.copy(paw.pos);
  }

  // Screen position (canvas CSS pixels) of a world point.
  function screen(p, out) {
    tmp.copy(p).project(camera);
    return out.set((tmp.x + 1) / 2 * window.innerWidth, (1 - tmp.y) / 2 * window.innerHeight, 0);
  }

  function update(t, dt) {
    const idle = t - S.lastInput;
    if (!S.asleep && !S.petting && !S.meal && idle > opts.sleepAfter) S.asleep = true;
    S.sleep += ((S.asleep ? 1 : 0) - S.sleep) * approach(S.asleep ? 1.2 : 6, dt);
    if (S.petting) S.petUntil = t + 0.25;
    const pet = t < S.petUntil;

    keyboard.update(dt);
    mouseProp.update(dt, S.mouseDown);
    updatePaw('L', paws.L, t, dt);
    updatePaw('R', paws.R, t, dt);
    updateTailTap(t, dt);

    // Excitement: how busy the last two seconds were.
    while (S.strokes.length && t - S.strokes[0] > 2) S.strokes.shift();
    const busyness = clamp(S.strokes.length / 8, 0, 1);
    S.excite = Math.max(S.excite * Math.exp(-dt / 1.5), busyness, mousing(t) ? 0.6 : 0);

    // Irritation builds from sustained very fast typing and petting that goes on too long, and
    // fades once things are quiet again. Thresholds come from the 调节 window.
    const rate = S.strokes.length / 2;
    if (rate > TUNING.typeRate) poke((rate - TUNING.typeRate) * 0.05 * dt, t);
    if (S.petting && S.petStart >= 0 && t - S.petStart > TUNING.petLimit) poke(0.3 * dt, t);
    if (t - (S.lastPoke || 0) > 2) S.annoy = Math.max(0, S.annoy - TUNING.calmRate / 100 * dt);
    const crossAt = TUNING.crossAt / 100;
    if (!S.cross && S.annoy >= crossAt) { S.cross = true; S.crossSince = t; S.thumpPhase = 0; S.act = null; }
    if (S.cross && S.annoy < crossAt * 0.42 && t - S.crossSince > 3) S.cross = false;
    if (S.asleep) S.cross = false;

    // Pointer speed over the last 0.2 s, in screen points per second. Fast enough, the cat
    // gets curious and keeps watching for a moment after the pointer stops.
    while (S.moves.length && t - S.moves[0][0] > 0.2) S.moves.shift();
    S.mouseSpeed = S.moves.reduce((sum, m) => sum + m[1], 0) / 0.2;
    if (TUNING.curiousOn && !S.asleep && S.mouseSpeed > TUNING.curiousSpeed) S.curiousUntil = t + TUNING.curiousHold;
    const curiousNow = t < S.curiousUntil && !S.asleep;
    P.curious.step(curiousNow ? 1 : 0, dt);
    // Something fascinating beats a grudge: curiosity eases the cross face while it lasts.
    const curious = clamp(P.curious.x, 0, 1);
    P.cross.step(S.cross && !curiousNow ? 1 : 0, dt);
    const cross = clamp(P.cross.x, 0, 1);
    if (S.cross || curiousNow) S.busyUntil = Math.max(S.busyUntil, t + 1);

    const quietFor = t - S.lastActive;

    // Hunger and meals. The cat eats while nothing else is going on: typing or petting pauses it,
    // and the bowl waits. When the bowl is empty it licks its lips, looks happy and the bowl goes.
    digest();
    if (t - S.hungerReported > 15) reportHunger(t);
    if (hungry() && !S.wasHungry) K.talk.event('hungry');
    S.wasHungry = hungry();
    const meal = S.meal;
    let eating = false, mealLook = 0, refusing = 0;
    if (meal) {
      const age = t - meal.t0;
      if (meal.refuse) {
        // Sniffs at it, then turns its head away with its eyes shut.
        mealLook = smooth(0.2, 0.6, age) * (1 - smooth(1, 1.4, age));
        refusing = smooth(1, 1.4, age) * (1 - smooth(2.8, 3.4, age));
        if (age > 3 && meal.doneAt === null) meal.doneAt = t;
      } else if (meal.doneAt === null) {
        mealLook = 1;
        eating = age > 0.7 && quietFor > 0.6 && !pet && !S.cross;
        if (eating) {
          const food = FOODS[meal.kind], bite = Math.min(meal.left, dt / food.eat);
          meal.left -= bite;
          if (TUNING.hungerOn) S.full = Math.min(100, S.full + food.amount * bite);
          if (t - S.lastNom > 0.8) { S.lastNom = t; nom(); }
          if (meal.left <= 0.001) { meal.left = 0; meal.doneAt = t; afterMeal(t, meal); }
        }
      }
      const gone = meal.doneAt !== null && t - meal.doneAt > 0.5;
      P.bowl.step(gone ? 0 : 1, dt);
      K.foodProp.setShown(clamp(P.bowl.x, 0, 1.3));
      K.foodProp.setLeft(meal.left);
      if (gone && P.bowl.x < 0.02) { K.foodProp.setShown(0); S.meal = null; }
      S.busyUntil = Math.max(S.busyUntil, t + 0.5);
    }
    P.eat.step(eating ? 1 : 0, dt);
    const eat = clamp(P.eat.x, 0, 1);
    // Lip licks (after a meal, or begging): two quick licks, to one side and then the other.
    const lickU = (t - S.lickT0) / 1.2;
    cat.setLick(lickU > 0 && lickU < 1 ? Math.sin(lickU * Math.PI * 2) ** 2 : 0, lickU < 0.5 ? 1 : -1);
    const happy = t < S.happyUntil ? smooth(0, 0.3, 2 - (S.happyUntil - t)) * smooth(0, 0.4, S.happyUntil - t) : 0;
    // Hungry: ears droop a little; very hungry, the eyelids too.
    const hunger = hungry() ? (S.full < STARVING ? 1 : 0.6) : 0;

    // Idle fidgets, when nothing else is going on. Only keys, clicks and pats count as "going on":
    // a pause in typing is enough, and the pointer may still be moving. Fidgets that need the
    // paws wait until the paw is off the mouse.
    if (S.act && t > S.act.t0 + S.act.dur) S.act = null;
    if (S.act && S.meal && !S.act.forced) S.act = null;
    if (S.act && (S.cross || curiousNow) && !KEEP_ACTS.has(S.act.kind)) S.act = null;
    // About to doze off: a yawn first.
    if (TUNING.idleOn && TUNING.sleepYawn && !S.asleep && !S.yawned && !pet && !S.meal && opts.sleepAfter > 6 && idle > opts.sleepAfter - 3.2
      && (!S.act || S.act.kind !== 'knead')) {
      S.yawned = true;
      startAct('yawn', t);
    }
    if (!TUNING.idleOn && S.act && !S.act.forced) S.act = null;
    if (TUNING.idleOn && !S.act && !S.meal && t > S.nextAct && quietFor > TUNING.idleQuiet && !S.asleep && !pet && !S.cross && !curiousNow) {
      const kind = pickAct(!mousing(t));
      if (kind) startAct(kind, t);
      else S.nextAct = t + 1;
    }
    const act = S.act, actU = act ? (t - act.t0) / act.dur : 0;
    K.stage.sync(act && K.stage.isBig(act.kind) ? act.kind : K.extras.raining() ? 'rain' : null);
    // Smooth in, hold, smooth out over the fidget's duration.
    const actEnv = act ? smooth(0, 0.25, actU) * (1 - smooth(0.7, 1, actU)) : 0;
    // How much of each of the bigger fidgets is showing right now, 0..1.
    const actIs = kind => act && act.kind === kind;
    const knead = actIs('knead') ? smooth(0, 0.12, actU) * (1 - smooth(0.85, 1, actU)) : 0;
    // Yawn: the mouth opens slowly, holds wide, snaps shut.
    const yawnOpen = actIs('yawn') ? smooth(0.1, 0.45, actU) * (1 - smooth(0.72, 0.88, actU)) : 0;
    const yawn = actIs('yawn') ? smooth(0, 0.3, actU) * (1 - smooth(0.8, 1, actU)) : 0;
    // Shake: a quick side-to-side shiver of the whole cat, fastest in the middle.
    const shakeEnv = actIs('shake') ? Math.sin(clamp(actU, 0, 1) * Math.PI) : 0;
    const shiver = actIs('shake') ? Math.sin((t - act.t0) * 40) * shakeEnv : 0;
    if (actIs('shake') && !act.puffed && actU > 0.35) { act.puffed = true; shakePuffs(t); }
    const starving = hungry() && S.full < STARVING;
    const headAt = () => cat.head.getWorldPosition(V());
    // Begging: big eyes on you, a thought bubble (a fish, or just its bones when starving), a lick.
    const beg = actIs('beg') ? smooth(0, 0.15, actU) * (1 - smooth(0.85, 1, actU)) : 0;
    if (actIs('beg') && !act.puffed) {
      act.puffed = true;
      S.lickT0 = t + 1.4;
      popFx(K.fxTexture(starving ? 'boneBubble' : 'fishBubble'), headAt().add(V(0.62, 0.5, 0.1)), 0.46, 2.6, V(0, 0.04, 0));
    }
    // Meowing at you: head up, mouth open, "喵~" (a plaintive "喵呜~" when starving).
    const meow = actIs('meow') ? smooth(0.1, 0.3, actU) * (1 - smooth(0.6, 0.85, actU)) : 0;
    if (actIs('meow') && !act.puffed && actU > 0.15) {
      act.puffed = true;
      popFx(K.labelTexture(starving ? '喵呜~' : '喵~', 'z').tex, headAt().add(V(0.5, 0.3, 0.2)), 0.24, 1.3, V(0.1, 0.12, 0),
        starving ? 3 : 2);
    }
    // Tummy rumble: a paw on the tummy, a look down at it, the belly shudders, "咕噜噜~".
    const rumble = actIs('rumble') ? smooth(0, 0.2, actU) * (1 - smooth(0.8, 1, actU)) : 0;
    const rumbleShake = rumble * Math.max(0, Math.sin((t - (act ? act.t0 : 0)) * 5)) * Math.sin(t * 45);
    if (actIs('rumble') && !act.puffed && actU > 0.25) {
      act.puffed = true;
      popFx(K.labelTexture('咕噜噜~', 'z').tex, cat.body.getWorldPosition(V()).add(V(0.62, 0.55, 0.45)), 0.26, 1.6,
        V(0.1, 0.1, 0), 3);
    }
    // Flopping down: the chest sinks, chin down towards the desk, big sad eyes looking up at you.
    const flop = actIs('flop') ? smooth(0, 0.25, actU) * (1 - smooth(0.8, 1, actU)) : 0;
    if (actIs('flop') && !act.puffed && actU > 0.3) {
      act.puffed = true;
      popFx(K.fxTexture('boneBubble'), headAt().add(V(0.55, 0.35, 0.1)), 0.42, 2.4, V(0, 0.04, 0));
    }
    // Starving, all the time: slumped low, head hanging, ears out flat, tail limp, heavy lids.
    P.starve.step(starving ? 1 : 0, dt);
    const starve = clamp(P.starve.x, 0, 1);

    // Surprises (extras.js): the odd shower of rain, and a bug to watch and swat.
    const fun = K.extras.update(t, dt, !S.asleep && !S.meal && !S.cross && !pet);
    K.setWet(fun.wet);
    let bugPos = null;
    if (actIs('bug')) {
      if (K.extras.bugAt(actU, act.caught, bugV)) bugPos = bugV;
      if (!act.puffed && actU > 0.76) {
        act.puffed = true;
        if (act.caught) {
          // Got it: a little burst where the paw lands, then a pleased lick of the lips.
          const hit = fxSprite('bang', 42);
          K.extras.catchPoint(hit.position);
          scene.add(hit);
          effects.push({ kind: 'bang', sprite: hit, t0: t, life: 0.24, size: 0.3, from: hit.position.clone(), vel: V(0, 0.1, 0) });
          P.squash.kick(0.2);
          S.lickT0 = t + 0.5;
          S.happyUntil = t + 1.7;
        }
      }
    }
    K.extras.showBug(bugPos, t);
    // The yarn game.
    let yarnPos = null;
    if (actIs('yarn')) {
      if (!act.puffed) { act.puffed = true; K.extras.yarnStart(); }
      yarnPos = K.extras.yarnBall(t - act.t0, yarnV);
      if (!act.hearts && K.extras.yarnHearts(t - act.t0)) {
        act.hearts = true;
        S.happyUntil = t + 1.8;
        const h = cat.head.getWorldPosition(V());
        for (let i = 0; i < 2; i++) popFx(K.fxTexture('heart'), h.clone().add(V(0.35 + 0.15 * i, 0.45 + 0.05 * i, 0.1)), 0.2, 1.4, V(0.06, 0.3, 0), 1, 0.25 * i);
      }
    } else K.extras.yarnBall(-1, yarnV);
    if (pet && S.petting && !S.cross && t > (S.nextPetHeart || 0)) {
      S.nextPetHeart = t + 1.4;
      popFx(K.fxTexture('heart'), cat.head.getWorldPosition(V()).add(V(0.4 * (Math.random() - 0.5), 0.6, 0.15)), 0.16, 1.2, V(0, 0.3, 0));
    }
    const yarnWatch = actIs('yarn') ? smooth(0, 0.08, actU) * (1 - smooth(0.82, 0.9, actU)) : 0;
    // Listening to music: on go the headphones (the ones worn all the time, or a random colour),
    // a nod to the beat, notes floating up; off they come at the end.
    const music = actIs('music') ? smooth(0, 0.06, actU) * (1 - smooth(0.92, 1, actU)) : 0;
    if (actIs('music') && !act.puffed) {
      act.puffed = true;
      act.preset = cat.phonePresets[Math.floor(Math.random() * cat.phonePresets.length)];
      K.talk.event('music');
    }
    const always = cat.look.headphones && cat.look.headphones !== 'none';
    const phonesOn = always ? 1 : music;
    cat.setHeadphones(always ? cat.look.headphones : act && act.preset, phonesOn);
    const beat = actIs('music') ? (t - act.t0) * 1.7 : 0;
    if (music > 0.6 && t > (S.nextNote || 0)) {
      S.nextNote = t + 0.55 + Math.random() * 0.35;
      cat.headPivot.updateMatrixWorld();
      const side = Math.random() < 0.5 ? -1 : 1;
      K.extras.note(V(side * 0.62, 0.42, 0.1).applyMatrix4(cat.headPivot.matrixWorld), side);
    }
    const bugWatch = actIs('bug') ? smooth(0.03, 0.12, actU) * (1 - smooth(0.78, 0.9, actU)) : 0;
    if (K.extras.busy()) S.busyUntil = Math.max(S.busyUntil, t + 0.5);

    // Body: the haunches stay planted; the spine bends towards whatever the busy paw reaches for.
    const striking = Object.values(paws).find(p => p.key && (p.down || t - p.t0 < 0.3));
    let shift = 0, hunch = 0, squash = 0;
    if (mousing(t) && !knead) {
      // Reaching left for the mouse: chest over to the left, a little forward. The arm does most
      // of the reaching; leaning further would tip the collar and bib off the chest.
      shift = (paws.L.pos.x - cat.home.x + 0.3) * 0.45;
      hunch = 0.1;
      squash = 0.07;
    } else if (striking) {
      const arm = cat.arms[striking.side < 0 ? 0 : 1];
      shift = (keyboard.keyTop(striking.key, tmp2).x - cat.home.x - arm.shoulderLocal.x) * 0.32;
      hunch = 0.16;
    }
    // A burst of typing settles the cat into a rounder, lower loaf over the keys.
    if (t - S.lastKey < 1.2) { hunch = Math.max(hunch, 0.12 + 0.06 * busyness); squash = Math.max(squash, 0.09 + 0.04 * busyness); }
    hunch += 0.1 * S.sleep;
    squash += 0.08 * S.sleep;
    // Curious: leans in a little towards what it is watching, chest up rather than loafed.
    hunch += 0.06 * curious;
    squash -= 0.04 * curious;
    // Patting with the tail, the hips shift a touch towards it.
    shift += 0.06 * smooth(0, 1, tailTap.reach);
    // Kneading sinks a little with each press; a yawn draws the cat up tall.
    if (knead) {
      const ph = (t - act.t0) * 1.7 * Math.PI * 2;
      hunch += 0.04 * knead;
      squash += knead * (0.05 + 0.02 * Math.abs(Math.cos(ph)));
      shift += 0.025 * knead * Math.sin(ph);
    }
    squash -= 0.05 * yawn;
    // Eating, the chest leans over to the bowl on the right and dips down to it.
    shift = mix(shift, 0.16, eat);
    hunch += 0.14 * eat;
    squash += 0.04 * eat + 0.1 * starve + 0.18 * flop + 0.025 * rumbleShake + 0.05 * fun.wet;
    // Playing with the yarn: crouched low and wiggling before it pounces, the chest leaning after
    // the ball wherever it rolls, a jolt with each swat.
    if (actIs('yarn')) {
      const yb = K.extras.yarnBody(t - act.t0);
      shift += 0.22 * yb.lean * yarnWatch + 0.05 * yb.crouch * Math.sin(t * 17);
      hunch += 0.22 * yb.crouch + 0.1 * yarnWatch;
      squash += 0.09 * yb.crouch - 0.04 * yb.swat;
      if (yb.swat > 0.9 && !act.jolted) { act.jolted = true; P.squash.kick(0.3); P.pitch.kick(0.6); }
      if (yb.swat < 0.5) act.jolted = false;
    }
    // Getting ready to pounce on a bug: a low crouch and the hunter's wiggle, faster as it comes.
    const pounce = actIs('bug') ? smooth(0.3, 0.6, actU) * (1 - smooth(0.74, 0.8, actU)) : 0;
    hunch += 0.12 * pounce;
    squash += 0.06 * pounce;
    shift += 0.035 * pounce * Math.sin(t * 16);
    hunch += 0.08 * starve + 0.26 * flop + 0.06 * rumble;
    P.shift.step(shift, dt);
    P.hunch.step(hunch, dt);
    P.squash.step(squash, dt);
    const breathe = Math.sin(t * mix(2.1, 1.1, S.sleep)) * mix(0.012, 0.02, S.sleep);
    cat.bend.x = P.shift.x;
    cat.bend.z = P.hunch.x;
    cat.bend.squash = P.squash.x;
    cat.body.position.x = cat.home.x;
    // A slight sideways lean of the whole body sells the weight shift; most of it is in the
    // spine. No twist about the vertical: the round body would not show it, but the bib, collar
    // and stripes would slide round to the side.
    cat.body.rotation.set(0.05 * S.sleep + 0.04 * flop, 0, -P.shift.x * 0.06 + shiver * 0.07 + 0.012 * rumbleShake);
    cat.body.scale.set(1 + breathe * 0.4, 1 + breathe, 1 + breathe * 0.4);
    cat.bendBody();
    cat.placeHead();

    // Gaze target: the key being pressed, else the pointer; the eyes get there first.
    const headScreen = screen(cat.head.getWorldPosition(tmp2), V());
    let focus = null;
    const typing = Object.values(paws).find(p => p.key && p.down);
    if (typing && t - S.lastKey < 0.6) focus = screen(keyboard.keyTop(typing.key, tmp2), V());
    else if (tailTap.key && t - tailTap.t0 < 0.6) focus = screen(tailTap.tip, V());
    else if (S.meal && (mealLook > 0.3 || eat > 0.3)) focus = screen(K.foodProp.target(tmp2), V());
    // Begging, it looks straight out at you.
    else if (beg > 0.3 || meow > 0.3) focus = V(headScreen.x, headScreen.y + 30, 0);
    else if (flop > 0.3) focus = V(headScreen.x, headScreen.y - 160, 0);
    else if (bugPos) focus = screen(bugPos, V());
    else if (yarnPos) focus = screen(yarnPos, V());
    // First drops: it looks up at the sky.
    else if (fun.lookUp > 0.3) focus = V(headScreen.x + 20, headScreen.y - 220, 0);
    else if (rumble > 0.3) focus = V(headScreen.x + 30, headScreen.y + 220, 0);
    else if (S.cursor) focus = V(S.cursor.x, S.cursor.y, 0);
    let lx = 0, ly = 0;
    if (focus) {
      lx = clamp((focus.x - headScreen.x) / 260, -1, 1);
      ly = clamp((focus.y - headScreen.y) / 220, -1, 1);
    }
    if (act && act.kind === 'look') { lx = mix(lx, act.side * 0.8, actEnv); ly = mix(ly, -0.3, actEnv); }
    if (pet || S.sleep > 0.5) { lx *= 0.2; ly *= 0.2; }
    P.gazeX.step(lx, dt);
    P.gazeY.step(ly, dt);

    const shake = t - S.wakeAt < 0.6 ? Math.sin((t - S.wakeAt) * 34) * 0.22 * (1 - (t - S.wakeAt) / 0.6) : 0;
    S.rub += ((pet ? 1 : 0) - S.rub) * approach(8, dt);
    const rubWave = Math.sin(t * 7.5) * 0.09 * S.rub;
    const petSide = clamp(S.petX, -1, 1);
    // The head follows the gaze, a beat behind. At rest the face tips up towards the viewer, who
    // looks down on the desk; reaching, the cat ducks its head to watch the paw.
    // Cross, it turns its face away from the pointer in a huff and lowers its head a little.
    const huff = cross * (lx >= 0 ? -1 : 1) * 0.32;
    // Curious, it turns its whole face to follow the pointer, not just its eyes.
    const follow = mix(0.3, 0.5, curious);
    P.yaw.step(mix(mix(lx * follow, huff, cross), -0.45, refusing) + 0.1 * eat + petSide * 0.18 * S.rub, dt);
    P.pitch.step(ly * mix(0.12, 0.22, curious) * (1 - cross) - 0.28 + 0.5 * P.hunch.x + (mousing(t) ? 0.06 : 0) + 0.5 * S.sleep + 0.08 * cross
      - 0.3 * yawn + 0.05 * knead + 0.1 * eat + (eat > 0.5 ? 0.035 * Math.sin(t * 12.5) : 0) - 0.12 * refusing - 0.08 * happy - 0.06 * beg + 0.06 * hunger
      + 0.14 * starve - 0.22 * meow + 0.3 * flop + 0.28 * rumble + 0.12 * yarnWatch
      + music * 0.07 * Math.sin(beat * Math.PI * 2), dt);
    // Curious head tilt: towards a key being watched, or a fidget, or a pointer resting nearby.
    let roll = 0;
    if (striking) roll = clamp(P.shift.x * 1.2, -0.18, 0.18);
    if (act && act.kind === 'tilt') roll += act.side * 0.26 * actEnv;
    if (yawn) roll += act.side * 0.1 * yawn;
    if (beg) roll += act.side * 0.14 * beg;
    if (flop) roll += act.side * 0.18 * flop;
    if (music) roll += 0.07 * music * Math.sin(beat * Math.PI);
    roll += 0.06 * starve;
    roll += 0.1 * happy;
    if (S.cursor && !striking && !mousing(t) && t - S.cursorSeen > 1.2 && Math.abs(lx) < 0.5 && Math.abs(ly) < 0.6) roll += 0.12 * Math.sign(lx || 1);
    // The classic curious head cock, towards the side the pointer is on.
    roll += 0.2 * curious * (lx >= 0 ? -1 : 1);
    P.roll.step(roll - petSide * 0.12 * S.rub + 0.08 * S.sleep, dt);
    cat.headPivot.rotation.set(P.pitch.x, -cat.body.rotation.y + P.yaw.x + shake + shiver * 0.32, -P.yaw.x * 0.2 + rubWave);
    // The head stays level however the body leans, and cocks about its own centre.
    cat.head.rotation.z = P.roll.x - cat.body.rotation.z;
    P.pat.step(0, dt);
    const pat = clamp(P.pat.x, -0.12, 0.26);
    cat.head.scale.set(1 + 0.45 * pat, 1 - pat, 1 + 0.3 * pat);
    cat.head.position.y = 0.42 - 0.1 * pat;
    cat.headPivot.position.x += rubWave * 0.4;
    cat.placeCollar();

    // Ears perk up when excited, stand up and swivel forward when curious, flatten back when
    // rubbed, go out sideways ("airplane ears") when cross; a fidget flicks one of them.
    P.ears.step(0.1 * S.excite * (1 - cross) + 0.12 * curious - 0.22 * S.rub - 0.55 * cross
      - 0.25 * yawn - 0.15 * knead + 0.1 * eat - 0.25 * refusing - 0.15 * hunger - 0.1 * beg - 0.2 * rumble
      - 0.3 * starve - 0.15 * meow - 0.2 * flop + 0.14 * bugWatch - 0.35 * fun.wet + 0.2 * yarnWatch - 0.2 * pat, dt);
    for (const e of cat.ears) {
      const flick = act && act.kind === 'ear' && e.s === act.side ? Math.sin(actU * Math.PI * 3) * 0.3 * (1 - actU) : 0;
      e.group.rotation.z = -e.s * (e.tilt - P.ears.x) + flick + shiver * 0.3;
      e.group.rotation.x = -0.12 - 0.35 * cross + 0.12 * curious;
    }

    // Eyes: pupils lead; blink, slow-blink when relaxed, squint when petted, close when asleep.
    // A curious cat stares: no blinking while it watches.
    if (t > S.nextBlink + 0.15) S.nextBlink = t + 2.5 + Math.random() * 4;
    if (curiousNow && t > S.nextBlink - 0.2) S.nextBlink = t + 0.5;
    let blink = t > S.nextBlink ? Math.sin(clamp((t - S.nextBlink) / 0.15, 0, 1) * Math.PI) : 0;
    if (act && act.kind === 'slowBlink') blink = Math.max(blink, 0.85 * Math.sin(clamp(actU, 0, 1) * Math.PI));
    // Kneading, the eyes go half shut with contentment.
    blink = Math.max(blink, 0.6 * knead, 0.45 * eat, starve * (0.4 + 0.12 * Math.sin(t * 1.7)) * (1 - flop) * (1 - beg), 0.4 * fun.wet);
    const closed = (pet && !S.cross) || S.sleep > 0.5 || yawn > 0.5 || shakeEnv > 0.3 || refusing > 0.5 || happy > 0.4
      || (music > 0.5 && t - S.lastKey > 1.5 && Math.sin(beat * Math.PI * 0.25) > -0.3);
    // Chewing: the mouth opens and closes a little, quickly.
    // Chewing: about two bites a second. The mouth opens to a small "o" and shuts all the way
    // back to the "ω" between bites.
    const chew = eat > 0.5 ? Math.max(0, Math.sin(t * 12.5)) : 0;
    cat.setYawn(Math.max(yawnOpen, 0.2 * chew, 0.5 * meow, K.talk.mouth()),
      clamp((P.pitch.x + 0.28) * 2.2, 0, 1));
    // Cross, or turning its nose up at food: the smile turns into a pout.
    cat.setFrown(clamp(Math.max(cross, 0.8 * refusing, 0.9 * fun.wet), 0, 1));
    // Excited and curious cats' pupils go wide and round (curious most of all, up to the size set
    // in the 调节 window); cross ones narrow to slits under heavy lids. The pupil never grows past
    // the iris, so it stays a black disc inside a coloured ring.
    const dilate = Math.min(2.6, mix(1 + 0.25 * S.excite + 1.1 * beg + 1.2 * flop + 0.6 * meow + 1.2 * bugWatch + 1 * yarnWatch, TUNING.pupilSize / 100, curious) * (1 - 0.5 * cross));
    for (const e of cat.eyes) {
      e.iris.visible = e.pupil.visible = e.shine.visible = !closed;
      e.arc.visible = closed;
      e.group.scale.y = (1 - 0.9 * blink) * (1 - 0.42 * cross) * (1 + 0.1 * curious);
      e.group.scale.x = 1 + 0.06 * curious;
      let px = P.gazeX.x, py = P.gazeY.x;
      if (focus) {
        const es = screen(e.group.getWorldPosition(tmp2), V());
        px = clamp((focus.x - es.x) / 170, -1, 1);
        py = clamp((focus.y - es.y) / 170, -1, 1);
      }
      // Width grows with `dilate`; very wide, the slit's height shrinks a touch so it reads round.
      e.pupil.scale.x += (0.044 * dilate - e.pupil.scale.x) * approach(10, dt);
      e.pupil.scale.y += (0.11 - 0.012 * Math.max(0, dilate - 1.5) - e.pupil.scale.y) * approach(10, dt);
      // A slight inward, downward resting gaze gives the reference's soft cross-eyed look. The
      // pupil may only travel as far as keeps it inside the iris, so a wide one sits near the
      // centre; the limit applies to where it is now, not only where it is heading.
      const room = Math.max(0, e.iris.scale.x - e.pupil.scale.x - 0.012);
      e.pupil.position.x += (clamp(px * 0.07 - e.s * 0.012, -room, room) - e.pupil.position.x) * approach(22, dt);
      e.pupil.position.x = clamp(e.pupil.position.x, -room, room);
      e.pupil.position.y += (-py * 0.02 - e.pupil.position.y) * approach(22, dt);
    }
    // Rubbing flushes the cheeks; the "blush" look keeps a faint flush all the time.
    cat.blushMat.opacity = Math.max(0.55 * S.rub, 0.5 * happy, cat.look.blush ? 0.4 : 0) * (1 - cross);

    // The tail sways faster when the cat is worked up and twitches as irritation builds; a fidget
    // gives it a flick.
    // Curious, the tail goes still apart from a quick twitch at the tip.
    S.tailPhase += dt * (1 + 1.4 * S.excite + 2.5 * S.annoy + 3 * curious);
    const flickTail = act && act.kind === 'tail' ? Math.sin(actU * Math.PI) * 2 : 0;
    // Cross: bursts of three thumps (lift slowly, slam down hard, rest a beat), then a pause.
    let lift = 0, lash = 0;
    if (cross > 0.05) {
      const prev = S.thumpPhase;
      S.thumpPhase += dt * TUNING.thumpRate;
      const beat = Math.floor(S.thumpPhase), u = S.thumpPhase - beat, resting = beat % 4 === 3;
      if (!resting) lift = u < 0.6 ? smooth(0, 0.6, u) : u < 0.72 ? 1 - ((u - 0.6) / 0.12) ** 2 : 0;
      lash = Math.sin(S.thumpPhase * Math.PI * 0.5) * 0.6;
      const slamAt = beat + 0.72;
      if (!resting && S.cross && prev < slamAt && S.thumpPhase >= slamAt) slam(t);
    }
    S.thumpLift += (lift - S.thumpLift) * approach(40, dt);
    // The tip touches the right half of the space bar; the tail is about 0.075 thick there.
    if (tailTap.key) keyboard.keyTop(tailTap.key, tailTap.tip).add(V(0.36, 0.075 + tailTap.hover, -0.02));
    const reach = smooth(0, 1, tailTap.reach);
    cat.updateTail(S.tailPhase, (1 - S.sleep) * (1 + 0.6 * S.excite + flickTail + 1.5 * S.annoy + 2 * shakeEnv + 0.6 * happy + 2.2 * yarnWatch) * (1 - 0.5 * knead) * (1 - 0.4 * hunger) * (1 - 0.7 * starve) * (1 - cross) * (1 - 0.55 * curious) * (1 - reach), Math.max(S.sleep, 0.55 * starve, 0.8 * flop, 0.45 * fun.wet),
      cross * (1 - reach), S.thumpLift, lash, reach, tailTap.tip);

    // The desk hops when the tail lands; the anger mark pulses on each thump.
    P.desk.step(0, dt);
    keyboard.group.position.y = 0.02 + P.desk.x;
    mouseProp.group.position.y += P.desk.x * 1.4;
    angerMark.visible = cross > 0.1;
    if (angerMark.visible) {
      cat.headPivot.updateMatrixWorld();
      angerMark.position.set(-0.42, 0.85, 0.2).applyMatrix4(cat.headPivot.matrixWorld);
      const pulse = 1 + 0.25 * Math.max(0, 1 - (t - S.lastSlam) / 0.25);
      angerMark.scale.setScalar(0.27 * cross * pulse);
      angerMark.material.opacity = cross;
    }
    for (let i = effects.length - 1; i >= 0; i--) {
      const fx = effects[i], age = t - fx.t0, u = age / fx.life;
      if (u >= 1) { scene.remove(fx.sprite); effects.splice(i, 1); continue; }
      fx.sprite.visible = age >= 0;
      if (age < 0) continue;
      fx.sprite.position.copy(fx.from).addScaledVector(fx.vel, age);
      if (fx.kind === 'pop') {
        const s = fx.size * (0.4 + 0.6 * smooth(0, 0.12, u) + 0.1 * Math.sin(smooth(0, 0.2, u) * Math.PI));
        fx.sprite.scale.set(s * fx.aspect, s, 1);
        fx.sprite.material.opacity = 1 - smooth(0.75, 1, u);
        continue;
      }
      const s = fx.size * (fx.kind === 'bang' ? 0.5 + 0.7 * smooth(0, 0.3, u) : 0.6 + 0.9 * u);
      fx.sprite.scale.set(s, s, 1);
      fx.sprite.material.opacity = fx.kind === 'bang' ? 1 - smooth(0.5, 1, u) : 0.9 * (1 - u);
    }
    for (const arm of cat.arms) cat.updateArm(arm, arm.s < 0 ? paws.L.pos : paws.R.pos);
    cat.headPivot.updateMatrixWorld();
    K.talk.update(screen(V(0, 1.12, 0.08).applyMatrix4(cat.headPivot.matrixWorld), V()), quietFor, S.sleep > 0.5);
    if (K.talk.showing()) S.busyUntil = Math.max(S.busyUntil, t + 0.5);

    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i], age = t - p.t0;
      if (!p.key.down && p.upAt === null) p.upAt = t;
      const fade = p.upAt === null ? 1 : clamp(1 - (t - p.upAt - 0.35) / 0.3, 0, 1);
      const pop = 0.6 + 0.4 * Math.min(1, age / 0.12);
      const h = 0.27 * pop;
      p.sprite.scale.set(h * p.sprite.userData.aspect, h, 1);
      p.sprite.position.copy(p.sprite.userData.base).add(V(0, 0.22 + 0.14 * smooth(0, 0.25, age), 0));
      p.sprite.material.opacity = fade;
      if (fade <= 0) { scene.remove(p.sprite); popups.splice(i, 1); }
    }

    if (S.sleep > 0.7 && t > S.nextZ) {
      S.nextZ = t + 1.3;
      const { tex } = K.labelTexture('Z', 'z');
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
      sprite.renderOrder = 40;
      cat.head.getWorldPosition(sprite.position).add(V(0.45, 0.55, 0));
      sprite.userData.base = sprite.position.clone();
      scene.add(sprite);
      zs.push({ sprite, t0: t });
    }
    for (let i = zs.length - 1; i >= 0; i--) {
      const z = zs[i], age = t - z.t0;
      const s = 0.16 + age * 0.08;
      z.sprite.scale.set(s, s, 1);
      z.sprite.position.copy(z.sprite.userData.base).add(V(Math.sin(age * 2.2) * 0.08 + age * 0.12, age * 0.32, 0));
      z.sprite.material.opacity = clamp(Math.min(age / 0.3, (2.6 - age) / 0.6), 0, 1);
      if (age > 2.6) { scene.remove(z.sprite); zs.splice(i, 1); }
    }

    if (pet || popups.length || zs.length || effects.length || cross > 0.02 || S.sleep > 0.02 && S.sleep < 0.98 || t - S.wakeAt < 0.7) {
      S.busyUntil = Math.max(S.busyUntil, t + 0.5);
    }
  }

  // Raycast the pointer: 'pet' over head/ears, 'drag' over the rest, 'none' elsewhere.
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const dragMeshes = [...cat.dragMeshes, ...keyboard.hitMeshes, ...mouseProp.hitMeshes];
  function hitTest(x, y) {
    ndc.set(x / window.innerWidth * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.intersectObjects(cat.petMeshes, false).length) return 'pet';
    if (ray.intersectObjects(dragMeshes, false).length) return 'drag';
    return 'none';
  }

  let last = now(), frame = 0;
  function loop() {
    requestAnimationFrame(loop);
    S.ticks = (S.ticks || 0) + 1;
    if (frozen !== null) return;
    const t = now();
    const dt = Math.min(0.1, t - last);
    const busy = t < S.busyUntil;
    // When nothing is happening, draw ~20 fps: enough for breathing and eye tracking.
    if (!busy && ++frame % 3 !== 0) return;
    last = t;
    update(t, dt);
    renderer.render(scene, camera);
    if (S.cursor) {
      const hit = hitTest(S.cursor.x, S.cursor.y);
      if (hit !== S.hit) {
        S.hit = hit;
        window.webkit?.messageHandlers?.cat?.postMessage({ hit });
      }
    }
  }

  window.cat = {
    key(code, down) { key(code, down); },
    mouseMove(dx, dy) {
      const t = now();
      if (Math.abs(dx) + Math.abs(dy) < 0.5) return;
      S.lastMouse = t;
      // Distance travelled, for the pointer speed that makes the cat curious.
      S.moves.push([t, Math.hypot(dx, dy)]);
      mouseProp.kick.x = clamp(mouseProp.kick.x + dx * 0.004, -0.16, 0.16);
      mouseProp.kick.z = clamp(mouseProp.kick.z + dy * 0.004, -0.12, 0.12);
      wake(t, true);
    },
    mouseButton(down) { const t = now(); S.mouseDown = down; S.lastMouse = t; wake(t); },
    // Plays an idle fidget now ('yawn', 'knead', 'shake', 'tilt', …), for checking them.
    // Puts down a bowl of 'fish', 'kibble', 'can' or 'milk' (the 喂食 menu).
    feed(kind) { return feed(kind); },
    // The 调节 window's 让它饿了 / 让它吃饱 buttons.
    hungryNow() { S.full = 6; S.fullAt = Date.now(); reportHunger(now()); window.cat.act('rumble'); },
    fullNow() { S.full = 100; S.fullAt = Date.now(); reportHunger(now()); },
    // The 调节 window's 说句话试试 button.
    talkNow() { K.talk.sayNow(); S.busyUntil = now() + 6; },
    // The 调节 window's other 试试 buttons: fireworks, a shower of rain, the day's typing tally.
    test(name) {
      const t = now();
      S.busyUntil = t + 14;
      if (name === 'fireworks') K.extras.fireworks(4);
      else if (name === 'rain') {
        S.asleep = false; S.sleep = 0; S.lastInput = t;
        K.extras.rainNow();
      } else if (name === 'summary') K.talk.say(K.extras.summary());
      else return false;
      return true;
    },
    // Forced, it plays even with fidgets switched off (the 调节 window's 试试 buttons).
    act(kind) {
      if (!(kind in ACTS)) return false;
      const t = now();
      S.asleep = false; S.sleep = 0; S.cross = false; S.annoy = 0; S.curiousUntil = -100;
      startAct(kind, t);
      S.act.forced = true;
      return true;
    },
    // Canvas CSS pixels; may lie outside the canvas so the eyes keep following the pointer.
    cursor(x, y) {
      if (!S.cursor || Math.abs(S.cursor.x - x) + Math.abs(S.cursor.y - y) > 3) S.cursorSeen = now();
      S.cursor = { x, y };
      S.busyUntil = Math.max(S.busyUntil, now() + 0.6);
    },
    pet(down, x) {
      const t = now();
      const tapped = down && !S.petting;
      S.petting = down;
      S.petStart = down ? (S.petStart < 0 ? t : S.petStart) : -1;
      if (down) S.lastPetAt = t;
      if (tapped && !S.cross) {
        // A tap on the head: it squashes down and bounces back like jelly, eyes shut happily,
        // a heart floats up.
        P.pat.kick(5.5);
        S.happyUntil = Math.max(S.happyUntil, t + 1.5);
        S.nextPetHeart = t + 1.3;
        const h = cat.head.getWorldPosition(V());
        popFx(K.fxTexture('heart'), h.add(V(0.12 * (Math.random() - 0.5), 0.62, 0.15)), 0.18, 1.2, V(0.05 * (Math.random() - 0.5), 0.35, 0));
      }
      if (down) {
        S.petUntil = t + 0.9;
        const hs = screen(cat.head.getWorldPosition(tmp2), V());
        S.petX = (x - hs.x) / 120;
        if (!S.petting || t - S.petStart < 0.05) K.talk.event('pet');
        wake(t);
      }
    },
    options(o) {
      // The saved hunger is only taken once, when the page loads: later option pushes carry the
      // host's copy, which can be a few seconds stale.
      if (o.hunger && typeof o.hunger.full === 'number' && !S.hungerRestored) {
        S.hungerRestored = true;
        S.full = clamp(o.hunger.full, 0, 100);
        S.fullAt = Number(o.hunger.at) || Date.now();
      }
      delete o.hunger;
      Object.assign(opts, o);
      // `tune` holds only the settings that differ from the defaults, so start from those.
      if (o.tune) {
        for (const g of TUNING_SCHEMA) for (const it of g.items) TUNING[it.key] = it.key in o.tune ? o.tune[it.key] : it.def;
      }
      cat.setLook(Object.fromEntries(Object.entries(o).filter(([k]) => k in cat.look)));
      S.busyUntil = now() + 1;
    },
    sleepNow() { S.asleep = true; S.lastInput = now() - opts.sleepAfter; },
    // Makes the cat cross right away (for checking the tail thump).
    annoyNow() { poke(1, now(), true); S.busyUntil = now() + 3; },
    // Makes the cat curious for a few seconds (the 调节 window's 试试 button).
    curiousNow(seconds = 3) { const t = now(); S.curiousUntil = t + seconds; S.busyUntil = t + seconds + 1; wake(t); },
    reset() {
      S.mouseDown = false; S.lastMouse = -100; S.lastKey = -100; S.petting = false; S.petUntil = 0;
      S.asleep = false; S.sleep = 0; S.lastInput = now(); S.busyUntil = now() + 2;
      S.strokes = []; S.excite = 0; S.act = null; S.nextAct = now() + 4;
      S.lastActive = now(); S.yawned = false;
      if (S.meal) { K.foodProp.setShown(0); S.meal = null; }
      K.extras.reset();
      P.pat.set(0); cat.head.scale.set(1, 1, 1);
      S.lickT0 = -100; S.happyUntil = -100;
      S.annoy = 0; S.cross = false; S.petStart = -1; S.thumpLift = 0;
      S.moves = []; S.mouseSpeed = 0; S.curiousUntil = -100;
      P.cross.set(0); P.desk.set(0); P.curious.set(0);
      for (const fx of [...effects, ...zs, ...popups]) scene.remove(fx.sprite);
      effects.length = 0;
      zs.length = 0;
      popups.length = 0;
      keyboard.releaseAll();
      for (const k of ['shift', 'hunch', 'squash', 'yaw', 'roll', 'gazeX', 'gazeY', 'ears']) P[k].set(0);
      P.pitch.set(-0.28);
      for (const p of Object.values(paws)) { p.key = null; p.down = false; p.t0 = -100; }
      Object.assign(tailTap, { key: null, t0: -100, down: false, landAt: -100, reach: 0, hover: 0.12 });
    },
    hitTest,
    state: S,
  };
  if (K.dev) {
    window.cat.freeze = () => { frozen = performance.now() / 1000; last = frozen; };
    window.cat.step = seconds => {
      for (let i = 0; i < Math.round(seconds * 60); i++) { frozen += 1 / 60; update(frozen, 1 / 60); last = frozen; }
      renderer.render(scene, camera);
      return 1;
    };
  }

  if (K.dev) {
    window.addEventListener('keydown', e => { if (!e.repeat) key(e.code, true); });
    window.addEventListener('keyup', e => key(e.code, false));
  }
  if (K.devPointer) {
    window.addEventListener('mousemove', e => { window.cat.cursor(e.clientX, e.clientY); window.cat.mouseMove(e.movementX, e.movementY); });
    window.addEventListener('mousedown', e => hitTest(e.clientX, e.clientY) === 'pet' ? window.cat.pet(true, e.clientX) : window.cat.mouseButton(true));
    window.addEventListener('mouseup', () => { window.cat.pet(false); window.cat.mouseButton(false); });
  }
  loop();
})();
