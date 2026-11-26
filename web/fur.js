// Fur: flat sticker colour plus the markings that make a coat read as a real cat — a pale muzzle
// and bib, pink inner ears, tabby stripes, calico patches, Siamese-style points, a rex curl, the
// white face, chest and forelegs of a tabby-and-white — and a soft top-left shade for volume.
// Markings are placed in each part's rest shape, so they stay put when the spine bends.
'use strict';
(() => {
  const C = c => new THREE.Color(c);
  // Shared by every fur material, so a coat change is one set of writes.
  const U = {
    uFur: { value: C('#151515') },
    uLight: { value: C('#f7f4ea') },     // muzzle, bib, tuxedo white
    uDark: { value: C('#151515') },      // tabby stripes
    uPatchA: { value: C('#151515') },    // calico patches
    uPatchB: { value: C('#151515') },
    uPoint: { value: C('#151515') },     // colourpoint mask, ears, legs and tail
    uInner: { value: C('#151515') },     // inner ear
    uStripes: { value: 0 },
    uMuzzle: { value: 0 },
    uBib: { value: 0 },
    uCalico: { value: 0 },
    uTuxedo: { value: 0 },
    uPoints: { value: 0 },
    uCurl: { value: 0 },
    uBicolor: { value: 0 },              // tabby-and-white: white face V, chest, belly, forelegs
    uVee: { value: 0.5 },                // how fast the face V widens below the forehead
    uWarm: { value: 0.75 },              // strength of the ginger wash on hips and tail base
    uSleeve: { value: 0.1 },             // where along the foreleg the white starts (0 shoulder, 1 paw)
    uBelt: { value: 0 },                 // a band of tabby and ginger across the tummy, white below it
    uBeltStyle: { value: 0 },            // 0 arched bridge, 1 two side patches with a white gap, 2 broad with a white spot
    uFringe: { value: 0 },               // ginger where the tabby meets the white of the belly
    uCap: { value: 0 },                  // heavier, darker markings on the top of the head
    uInnerAmt: { value: 0 },
    uShade: { value: 0 },
    uWet: { value: 0 },                  // soaked by rain: darker, a touch bluer
  };

  const vertex = `
    attribute vec3 rest;
    attribute float along;
    varying vec3 vRest;
    varying vec3 vNormal;
    varying float vAlong;
    void main() {
      #if defined(BODY) || defined(EAR)
        vRest = rest;
      #else
        vRest = position;
      #endif
      vAlong = along;
      vNormal = normalize(normalMatrix * normal);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      #ifdef ARM
        ${K.ARM_ROOT_PUSH}
      #endif
      gl_Position = projectionMatrix * mv;
    }`;

  const fragment = `
    uniform vec3 uFur, uLight, uDark, uPatchA, uPatchB, uPoint, uInner;
    uniform float uStripes, uMuzzle, uBib, uCalico, uTuxedo, uPoints, uCurl, uBicolor, uVee, uWarm, uSleeve, uBelt, uBeltStyle, uFringe, uCap, uInnerAmt, uShade, uWet;
    varying vec3 vRest;
    varying vec3 vNormal;
    varying float vAlong;
    // Soft-edged ellipse: 1 inside, 0 outside, with a thin anti-aliased edge.
    // Edges are only a pixel or two wide: flat colour shapes, as in a 2D illustration.
    float blob(vec2 p, vec2 c, vec2 r) { return 1.0 - smoothstep(0.96, 1.0, length((p - c) / r)); }
    float blob3(vec3 p, vec3 c, float r) { return 1.0 - smoothstep(r * 0.97, r, length(p - c)); }
    // A tapering line from a to b, half-width w at a, w * taper at b.
    float stroke(vec2 p, vec2 a, vec2 b, float w, float taper) {
      vec2 ab = b - a;
      float h = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
      float r = w * mix(1.0, taper, h);
      return 1.0 - smoothstep(r * 0.88, r, length(p - a - ab * h));
    }
    // Rings across a 0..1 coordinate: n bands, each \`fill\` of a period wide.
    float rings(float x, float n, float fill) {
      float f = fract(x * n);
      float d = abs(f - 0.5);
      return 1.0 - smoothstep(fill * 0.5 - 0.025, fill * 0.5, d);
    }
    void main() {
      vec3 col = uFur;
      vec3 p = vRest;
      // \`point\`: how far into the colourpoint this spot is; \`curl\`: the rex coat's waves.
      // \`warm\`: a soft ginger wash under the stripes, on a tabby-and-white's hips and tail base.
      float light = 0.0, dark = 0.0, inner = 0.0, point = 0.0, curl = 0.0, warm = 0.0;
      #ifdef HEAD
        // Head geometry is a unit sphere scaled (0.56, 0.47, 0.47) by the mesh.
        if (p.z > 0.0) {
          vec2 q = p.xy;
          // Colourpoint mask: an oval over eyes, nose and muzzle that fades out towards the brow.
          point = 1.0 - smoothstep(0.62, 1.0, length((q - vec2(0.0, -0.2)) / vec2(0.74, 0.74)));
          // Two lobes under the nose and a little chin: the classic pale cat muzzle.
          float m = max(max(blob(q, vec2(-0.2, -0.47), vec2(0.27, 0.22)), blob(q, vec2(0.2, -0.47), vec2(0.27, 0.22))),
                        blob(q, vec2(0.0, -0.66), vec2(0.26, 0.18)));
          light = max(light, m * uMuzzle);
          // Tuxedo blaze: the muzzle widens and runs up between the eyes.
          float blaze = max(m, blob(q, vec2(0.0, -0.1), vec2(0.12, 0.42)) * step(q.y, 0.35));
          light = max(light, blaze * uTuxedo);
          // Tabby-and-white face: the whole lower face is white, and the white rises between the
          // eyes as an inverted V that narrows to a point on the forehead. The eyes sit on its edge.
          float vee = 1.0 - smoothstep(-0.02, 0.02, abs(q.x) - (0.07 + max(0.0, 0.5 - q.y) * uVee));
          vee *= 1.0 - smoothstep(0.46, 0.5, q.y);
          float lower = 1.0 - smoothstep(-0.24, -0.2, q.y);
          light = max(light, max(vee, lower) * uBicolor);
          // Tabby "M" on the forehead and streaks running back from the eyes.
          // \`uCap\` thickens the three forehead stripes until they nearly join into a dark crown.
          float mk = stroke(q, vec2(0.0, 0.42), vec2(0.0, 0.85), 0.07 * (1.0 + 0.7 * uCap), 0.55 + 0.4 * uCap);
          mk = max(mk, stroke(vec2(abs(q.x), q.y), vec2(0.15, 0.4), vec2(0.27, 0.84), 0.06 * (1.0 + 0.7 * uCap), 0.45 + 0.5 * uCap));
          mk = max(mk, stroke(vec2(abs(q.x), q.y), vec2(0.72, 0.05), vec2(0.98, 0.16), 0.055, 0.4));
          mk = max(mk, stroke(vec2(abs(q.x), q.y), vec2(0.74, -0.16), vec2(0.99, -0.12), 0.05, 0.4));
          dark = max(dark, mk * uStripes);
        }
        // Calico: an orange patch over the left brow and ear, a black one over the right.
        float pa = blob3(p, vec3(-0.6, 0.7, 0.35), 0.62);
        float pb = blob3(p, vec3(0.72, 0.55, 0.1), 0.55);
      #endif
      #ifdef BODY
        // Lathe body: y is height, angle from the front is atan(x, z).
        float a = abs(atan(p.x, p.z));
        float bibW = mix(0.55, 0.85, smoothstep(0.75, 1.2, p.y));
        float bib = 1.0 - smoothstep(bibW * 0.96, bibW, a);
        light = max(light, bib * max(uBib, uTuxedo));
        // Tabby-and-white: the white front is broader and the belly is white all the way round low
        // down; the hips behind carry a ginger wash under the stripes.
        float edgeA = a + 0.35 * smoothstep(0.55, 1.15, p.y);
        float bibB = 1.0 - smoothstep(1.0, 1.05, edgeA);
        // \`uBelt\`: under the white chest the flank tabby reaches round across the tummy, with the
        // white lower belly showing again below it. Three shapes (\`uBeltStyle\`):
        // 0: broad at the sides, narrowing to a thin bridge in the middle (the white chest dips into
        //    it from above, the white belly rises into it from below);
        // 1: the two sides come in as rounded patches but don't meet, leaving white down the middle;
        // 2: a broad band with a white oval left in it, like a white tummy spot.
        float mid = exp(-a * a / 0.2);
        float wobA = 0.02 * sin(a * 5.0 + 0.6), wobB = 0.02 * sin(a * 4.0 + 1.3);
        float beltTop = 0.74 - 0.17 * mid + wobA, beltBot = 0.36 + 0.13 * mid + wobB, cut = 0.0;
        if (uBeltStyle > 1.5) {
          beltTop = 0.8 - 0.1 * mid + wobA;
          beltBot = 0.3 + wobB;
          cut = blob(vec2(a, p.y), vec2(0.0, 0.5), vec2(0.5, 0.12));
        } else if (uBeltStyle > 0.5) {
          beltTop = 0.74 + wobA;
          beltBot = 0.36 + wobB;
          cut = 1.0 - smoothstep(0.0, 0.03, a - (0.2 + 4.0 * (p.y - 0.55) * (p.y - 0.55)));
        }
        float belt = smoothstep(beltBot - 0.012, beltBot, p.y) * (1.0 - smoothstep(beltTop, beltTop + 0.012, p.y)) * (1.0 - cut) * uBelt;
        light = max(light, max(bibB * (1.0 - belt), 1.0 - smoothstep(0.2, 0.24, p.y)) * uBicolor);
        warm = blob3(vec3(abs(p.x), p.y, p.z), vec3(0.5, 0.35, -0.3), 0.5) * 0.75;
        // The tummy band is ginger all the way across, so it matches the hips it runs into.
        warm = max(warm, belt * 0.72);
        // \`uFringe\`: ginger wherever the tabby meets the white. Low on the body it goes all the
        // way round (strongest just above the white belly, fading out up the flanks), and it runs
        // up the edge of the white chest. The back and shoulders stay grey-brown.
        float low = 1.0 - smoothstep(0.26, 0.82, p.y);
        float fringe = smoothstep(1.0, 1.05, edgeA) * (1.0 - smoothstep(1.05, 1.6, edgeA)) * (1.0 - smoothstep(0.75, 1.08, p.y));
        warm = max(warm, max(low * 0.8, fringe * 0.75) * uFringe);
        // Mackerel stripes wrap round the flanks and back, stopping short of the chest. They taper
        // to a point where they stop rather than fading, like brush strokes.
        float wave = p.y + 0.05 * sin(a * 3.0);
        float reach = max(smoothstep(0.62, 1.1, a), belt * 0.62 * uBicolor);
        float band = rings(wave, 6.5, 0.36 * reach) * step(0.3, p.y) * step(p.y, 1.2);
        dark = max(dark, band * uStripes);
        float pa = blob3(p, vec3(-0.5, 0.95, -0.3), 0.55);
        float pb = blob3(p, vec3(0.55, 0.55, -0.15), 0.5) * (1.0 - bib);
        // Rex waves: short wavy lines all over, a shade darker than the coat.
        curl = rings(p.y + 0.035 * sin(a * 11.0 + p.y * 7.0), 10.0, 0.14) * step(0.18, p.y) * step(p.y, 1.22);
      #endif
      #ifdef EAR
        // Ear lathe: radius shrinks from 0.28 at the base to 0 at the tip (y 0.37).
        // Every point lies on the lathe radius, so the inner ear is a band across the front face.
        // The point colour comes in above the base, so the ear grows out of the head's colour
        // rather than sitting on it like a cut-out.
        point = smoothstep(0.06, 0.2, p.y);
        float rMax = mix(0.28, 0.0, clamp((p.y + 0.06) / 0.43, 0.0, 1.0));
        inner = (1.0 - smoothstep(0.52, 0.58, abs(p.x) / max(rMax, 0.001))) * smoothstep(0.13, 0.14, p.y) * (1.0 - smoothstep(0.3, 0.31, p.y)) * step(0.0, p.z);
        #ifdef LEFT
          float pa = 1.0, pb = 0.0;
        #else
          float pa = 0.0, pb = 1.0;
        #endif
      #endif
      #ifdef TAIL
        // Rings down the tail, a dark tip; calico tails are black with one orange band.
        dark = max(dark, rings(vAlong, 5.0, 0.42) * step(0.2, vAlong) * uStripes);
        dark = max(dark, smoothstep(0.9, 0.91, vAlong) * uStripes);
        float pa = rings(vAlong + 0.12, 1.0, 0.3), pb = 1.0 - pa;
        point = smoothstep(0.0, 0.3, vAlong);
        warm = (1.0 - smoothstep(0.15, 0.4, vAlong)) * 0.7;
        curl = rings(vAlong, 9.0, 0.16) * step(0.12, vAlong);
      #endif
      #ifdef ARM
        dark = max(dark, rings(vAlong, 3.0, 0.38) * step(0.4, vAlong) * uStripes);
        // Calico forelegs are white, as on most real calicos.
        float pa = 0.0, pb = 0.0;
        // Points darken the legs from the elbow down.
        point = smoothstep(0.3, 0.8, vAlong);
        // Tabby-and-white forelegs: white from just below the shoulder.
        light = max(light, smoothstep(uSleeve, uSleeve + 0.012, vAlong) * uBicolor);
      #endif
      col = mix(col, uPatchA, pa * uCalico);
      col = mix(col, uPatchB, pb * uCalico);
      col = mix(col, uPoint, point * uPoints);
      col = mix(col, uPatchA, min(1.0, warm * uWarm) * uBicolor);
      col = mix(col, uDark, max(dark, curl * uCurl));
      col = mix(col, uLight, light);
      col = mix(col, uInner, inner * uInnerAmt);
      // Soft volume: lit from the top left, a touch darker towards the silhouette and underneath.
      vec3 n = normalize(vNormal);
      // Only the sides darken: a dark top edge would draw a seam where the ears meet the head.
      float lit = dot(n, normalize(vec3(-0.35, 0.75, 0.55)));
      float edge = (1.0 - clamp(n.z, 0.0, 1.0)) * abs(n.x);
      // Where the ears grow out of the head, the ear's front face sits over the head's turning
      // edge; shading them differently outlines the skull through the ear. So the top of the head
      // and the ears share one even shade, matching the light the brow already gets.
      #ifdef HEAD
        float calm = smoothstep(0.05, 0.45, p.y);
        lit = mix(lit, 0.8, calm);
        edge *= 1.0 - calm;
      #endif
      #ifdef EAR
        lit = 0.8;
        edge = 0.0;
      #endif
      col *= 1.0 + uShade * (0.18 * lit - 0.4 * edge * edge - 0.05);
      col *= mix(vec3(1.0), vec3(0.85, 0.89, 0.95), uWet);
      gl_FragColor = vec4(col, 1.0);
    }`;

  // `part` picks the markings: 'HEAD', 'BODY', 'EAR', 'TAIL' or 'ARM'; `side` -1 is screen left.
  K.furMaterial = (part, side = 0) => {
    const defines = { [part]: 1 };
    if (side < 0) defines.LEFT = 1;
    return new THREE.ShaderMaterial({ uniforms: U, vertexShader: vertex, fragmentShader: fragment, defines });
  };

  K.setWet = v => { U.uWet.value = v; };

  // Writes a coat: colours plus how strongly each marking shows (0 hides it).
  K.setFur = f => {
    for (const k of ['fur', 'light', 'dark', 'patchA', 'patchB', 'point', 'inner']) U['u' + k[0].toUpperCase() + k.slice(1)].value.set(f[k] || f.fur);
    for (const k of ['stripes', 'muzzle', 'bib', 'calico', 'tuxedo', 'points', 'curl', 'bicolor', 'innerAmt', 'shade']) U['u' + k[0].toUpperCase() + k.slice(1)].value = f[k] || 0;
    // Tabby-and-white tuning, with defaults.
    U.uVee.value = f.vee ?? 0.5;
    U.uWarm.value = f.warm ?? 1;
    U.uSleeve.value = f.sleeve ?? 0.1;
    U.uBelt.value = f.belt ?? 0;
    U.uBeltStyle.value = f.beltStyle ?? 0;
    U.uFringe.value = f.fringe ?? 0;
    U.uCap.value = f.cap ?? 0;
  };
})();
