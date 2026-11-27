// The director. Big scenes (a shower of rain, a ball of yarn, a bug, listening to music, flopping
// down hungry) each used to come round on their own timer, so they could pile up. Now they ask
// here first: only one plays at a time, there is a rest between two of them, and each has a cap
// per day so it stays a treat. The 热闹程度 setting scales everything at once: how often fidgets,
// scenes and chatter come round, the rest between scenes and the daily caps.
'use strict';
(() => {
  const MIN = 60000;
  // rate: how much more often things happen; gap: minutes between two big scenes; caps: scale of
  // the daily caps.
  const LEVELS = {
    1: { rate: 0.55, gap: 6, caps: 0.6 },   // 安静
    2: { rate: 1, gap: 4, caps: 1 },        // 适中
    3: { rate: 1.6, gap: 2.5, caps: 1.6 },  // 活泼
  };
  const CAPS = { rain: 3, bug: 6, yarn: 5, music: 6, flop: 6 };

  // Today's counts, kept across restarts.
  const STORE = 'stage.day';
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  let day = { date: today(), n: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved && saved.date === day.date) day = saved;
  } catch (e) { /* no storage: counts start over */ }
  const fresh = () => { if (day.date !== today()) day = { date: today(), n: {} }; };

  let current = null, lastEnd = 0;
  const level = () => LEVELS[TUNING.lively] || LEVELS[2];

  K.stage = {
    isBig: kind => kind in CAPS,
    // How much more often things come round than the base settings say.
    rate: () => level().rate,
    // Whether a big scene may start now.
    canStart(kind) {
      if (!(kind in CAPS)) return true;
      fresh();
      if (current) return false;
      if (Date.now() - lastEnd < level().gap * MIN) return false;
      return (day.n[kind] || 0) < Math.max(1, Math.round(CAPS[kind] * level().caps));
    },
    // A big scene has started (counted even when forced by a 试试 button).
    started(kind) {
      if (!(kind in CAPS)) return;
      fresh();
      day.n[kind] = (day.n[kind] || 0) + 1;
      try { localStorage.setItem(STORE, JSON.stringify(day)); } catch (e) { /* ignore */ }
    },
    // Called every frame with the big scene on now (or null); notes when one ends.
    sync(kind) {
      if (current && !kind) lastEnd = Date.now();
      current = kind || null;
    },
    busy: () => !!current,
    todayCounts: () => ({ ...day.n }),
  };
})();
