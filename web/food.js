// The food bowl that appears on the desk to the cat's right when it is fed, drawn in the same
// sticker style as the mouse: flat colours with a dark line and a pale rim around the outside.
// `K.foodProp.setKind(kind)` fills it with 'fish' (dried fish), 'kibble', 'can' (wet food) or
// 'milk'; `setLeft(0..1)` is how much is still in it; `setShown(0..1)` pops it in and out.
'use strict';
(() => {
  const { V } = K;
  const HOME = V(0.92, 0, 0.18);
  const group = new THREE.Group();
  group.position.copy(HOME);
  group.visible = false;
  K.scene.add(group);

  // Bowl: a low flared dish, closed at the rim so the outline shells work.
  const BH = 0.11, BR = 0.2;
  const profile = [[0, 0], [0.13, 0], [0.155, 0.01], [0.18, 0.05], [BR, BH], [0, BH]].map(([x, y]) => new THREE.Vector2(x, y));
  const bowlGeo = new THREE.LatheGeometry(profile, 48);
  const bowlMat = K.flat('#e2725b');
  const bowl = new THREE.Mesh(bowlGeo, bowlMat);
  const shell = (color, grow, order) => {
    const m = new THREE.Mesh(bowlGeo, K.back(color));
    m.scale.set(1 + grow / BR, 1 + grow / BH * 0.5, 1 + grow / BR);
    m.position.y = -grow * 0.4;
    m.renderOrder = order;
    return m;
  };
  // The inside of the bowl, seen from above: a darker disc just under the rim, ringed by the rim.
  const inside = new THREE.Mesh(new THREE.CircleGeometry(BR * 0.86, 40), K.flat('#b8503f'));
  inside.rotation.x = -Math.PI / 2;
  inside.position.y = BH + 0.001;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(BR * 0.93, 0.016, 8, 48), K.flat('#f08d77'));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = BH;
  group.add(shell('#f4f1e6', 0.03, -2), shell('#1d1d1b', 0.012, -1), bowl, inside, rim);

  // Contents. Each sits on the inside disc and is scaled down as it is eaten.
  const fill = new THREE.Group();
  fill.position.y = BH;
  group.add(fill);
  const contents = {};
  {
    // Dried fish: a flat silver-blue fish lying across the bowl.
    const fish = new THREE.Shape();
    fish.absellipse(0, 0, 0.1, 0.045, 0, Math.PI * 2, false, 0);
    const tail = new THREE.Shape();
    tail.moveTo(0.085, 0); tail.lineTo(0.15, 0.045); tail.lineTo(0.135, 0); tail.lineTo(0.15, -0.045); tail.closePath();
    const g = new THREE.Group();
    for (const [shape, color] of [[fish, '#9cb8d1'], [tail, '#7fa0bd']]) {
      const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, 20), K.flat(color));
      m.rotation.x = -Math.PI / 2;
      g.add(m);
    }
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.011, 12), K.flat('#2b3a48'));
    eye.rotation.x = -Math.PI / 2;
    eye.position.set(-0.06, 0.002, -0.008);
    g.add(eye);
    g.position.set(-0.02, 0.012, 0);
    g.rotation.y = 0.35;
    contents.fish = g;
  }
  {
    // Kibble: a heap of small brown pellets.
    const g = new THREE.Group();
    const geo = new THREE.SphereGeometry(0.026, 10, 6);
    const mats = [K.flat('#a0673a'), K.flat('#8a5530'), K.flat('#b97c47')];
    let i = 0;
    for (let r = 0; r < 3; r++) {
      const n = [1, 6, 11][r], rad = [0, 0.055, 0.11][r];
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2 + r;
        const m = new THREE.Mesh(geo, mats[i++ % 3]);
        m.position.set(Math.cos(a) * rad, 0.045 - r * 0.016, Math.sin(a) * rad);
        m.scale.y = 0.75;
        g.add(m);
      }
    }
    contents.kibble = g;
  }
  {
    // Wet food: a pink dome with a few lighter chunks.
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), K.flat('#e8a0a0'));
    dome.scale.set(0.15, 0.06, 0.15);
    g.add(dome);
    for (const [x, z] of [[-0.05, 0.02], [0.04, -0.04], [0.03, 0.06]]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), K.flat('#f4c3bd'));
      m.position.set(x, 0.045, z);
      m.scale.y = 0.6;
      g.add(m);
    }
    contents.can = g;
  }
  {
    // Milk: a white pool filling the bowl.
    const m = new THREE.Mesh(new THREE.CircleGeometry(BR * 0.8, 40), K.flat('#fbfaf3'));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.004;
    contents.milk = m;
  }
  for (const c of Object.values(contents)) { c.visible = false; fill.add(c); }

  let kind = 'kibble';
  K.foodProp = {
    group,
    // Where the cat looks and leans to while eating: just above the middle of the bowl.
    target: out => out.copy(HOME).add(V(0, BH + 0.05, 0)),
    setKind(k) {
      kind = k in contents ? k : 'kibble';
      for (const [name, c] of Object.entries(contents)) c.visible = name === kind;
    },
    setLeft(v) {
      const c = contents[kind];
      c.visible = v > 0.02;
      if (kind === 'milk') c.scale.setScalar(0.4 + 0.6 * v);
      else c.scale.setScalar(0.3 + 0.7 * v);
    },
    setShown(v) {
      group.visible = v > 0.01;
      group.scale.setScalar(Math.max(0.001, v));
    },
  };
})();
