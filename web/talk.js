// Speech bubbles for 杆杆: the cat greets her, reminds her to eat and rest, and cheers her on.
// `K.talk` decides when to speak; behavior.js tells it about keys, pats, meals and naps and calls
// `update` every frame with where the head is on screen. The bubble is an HTML element over the
// canvas (crisp text, and clicks pass straight through it).
'use strict';
(() => {
  // Everything the cat can say, by occasion. Kept short: the bubble is small.
  const LINES = {
    morning: ['杆杆早上好喵～今天也一起加油！', '早呀杆杆，先吃早饭再干活喵', '新的一天，杆杆元气满满！', '喵～键盘我已经帮你焐热啦'],
    hello: ['杆杆来啦！今天也陪着你喵', '喵～杆杆，我在这儿呢', '有我在，今天也会顺顺利利喵'],
    lunch: ['到饭点啦，杆杆快去吃饭喵！', '干饭要紧，文件又不会跑喵', '吃完眯一会儿，下午更有劲'],
    afternoon: ['下午容易困，喝口水吧杆杆', '来杯奶茶续命？我批准了喵！', '再坚持一下，快下班啦～'],
    offwork: ['下班时间到！杆杆辛苦啦～', '今天也超棒的，回家好好休息喵'],
    overtime: ['这么晚还在忙…杆杆辛苦了', '我陪你加班喵，但别太晚哦', '剩下的明天再做也来得及喵'],
    late: ['杆杆该回家睡觉啦，我都困了喵'],
    busy: ['杆杆打字好快，像风一样喵！', '这么多材料都是你写的？太厉害了', '杆杆认真的样子最好看了'],
    rest: ['起来走两步吧，电脑我帮你看着', '喝口水喵，杯子是不是空了？', '看看窗外，让眼睛歇一会儿喵', '肩膀酸不酸？转转脖子吧'],
    energy: ['我饿了…杆杆是不是也饿了？', '一起吃点零食补充能量吧！', '能量告急！需要小鱼干和杆杆'],
    fed: ['吃饱啦！谢谢杆杆喵～', '有杆杆真好，能量满格！', '你也吃点好吃的奖励自己喵'],
    pet: ['嘿嘿，杆杆的手好暖喵', '再摸摸～烦恼都摸走啦', '被杆杆摸头最开心了喵'],
    praise: ['杆杆是商贸局最靠谱的人！', '报表再多，也难不倒杆杆喵', '开会辛苦啦，你说得超好的', '杆杆今天也很棒，我都看到啦',
      '不开心的事，我用尾巴拍走！', '世界很忙，我只忙着喜欢杆杆'],
    monday: ['周一啦，慢慢来不着急喵'],
    friday: ['周五啦！马上就周末咯！'],
    woken: ['喵？杆杆回来啦！', '我才没睡着…是在闭目养神喵'],
  };

  // What was said today, so no line repeats within a day and the once-a-day ones stay once a day.
  // Kept in localStorage, so a restart doesn't start the day over.
  const STORE = 'gangan.talk';
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  let memo = { date: today(), used: [], daily: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved && saved.date === memo.date) memo = { ...memo, ...saved };
  } catch (e) { /* no storage: just forget at restart */ }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(memo)); } catch (e) { /* ignore */ } }
  function freshDay() {
    if (memo.date !== today()) { memo = { date: today(), used: [], daily: [] }; save(); }
  }
  const doneToday = key => memo.daily.includes(key);
  function markToday(key) { memo.daily.push(key); save(); }

  // A line from the given occasions that hasn't been said today (or any, once they all have).
  function pick(kinds) {
    freshDay();
    const all = kinds.flatMap(k => LINES[k] || []);
    const fresh = all.filter(l => !memo.used.includes(l));
    const from = fresh.length ? fresh : all;
    const line = from[Math.floor(Math.random() * from.length)];
    if (line && !memo.used.includes(line)) { memo.used.push(line); save(); }
    return line;
  }

  // The bubble.
  const el = document.createElement('div');
  el.className = 'talk';
  const style = document.createElement('style');
  style.textContent = `
    .talk { position: fixed; left: 0; top: 0; max-width: calc(250px * var(--s, 1)); padding: calc(6px * var(--s, 1)) calc(11px * var(--s, 1));
      background: #fffdf7; color: #2a2722; border: calc(2px * var(--s, 1)) solid #2a2a2a; border-radius: calc(14px * var(--s, 1));
      font: 600 calc(14px * var(--s, 1))/1.35 "PingFang SC", "Microsoft YaHei", sans-serif; letter-spacing: 0.02em;
      box-shadow: 0 calc(2px * var(--s, 1)) 0 rgba(40,40,40,0.35); pointer-events: none; user-select: none;
      opacity: 0; transform-origin: var(--tail, 30%) 100%; }
    .talk::after, .talk::before { content: ''; position: absolute; left: var(--tail, 30%); border-style: solid; border-color: transparent; }
    .talk::before { bottom: calc(-11px * var(--s, 1)); border-width: calc(11px * var(--s, 1)) calc(7px * var(--s, 1)) 0;
      border-top-color: #2a2a2a; margin-left: calc(-7px * var(--s, 1)); }
    .talk::after { bottom: calc(-7.5px * var(--s, 1)); border-width: calc(8px * var(--s, 1)) calc(5px * var(--s, 1)) 0;
      border-top-color: #fffdf7; margin-left: calc(-5px * var(--s, 1)); }`;
  document.head.appendChild(style);
  document.body.appendChild(el);

  const nowMs = () => Date.now();
  const MIN = 60000;
  const st = {
    queue: [],            // { line, at, until }: waiting for a quiet moment
    showing: null,        // { line, t0, t1 } in ms
    startedAt: nowMs(),
    greeted: false,
    nextRandom: nowMs() + 12 * MIN,
    // Work tracking: a session runs while keys keep coming with gaps under 5 minutes.
    lastKey: 0, sessionStart: 0, keys: [], lastBusy: 0, lastPet: 0, restFrom: 0,
  };

  function queue(kinds, waitMin = 15) {
    const line = pick(kinds);
    if (line) st.queue.push({ line, until: nowMs() + waitMin * MIN });
  }
  function show(line) {
    const ms = nowMs();
    st.showing = { line, t0: ms, t1: ms + Math.min(7000, 3200 + 140 * line.length) };
    el.textContent = line;
  }
  function hide() { st.showing = null; el.style.opacity = 0; }

  K.talk = {
    // From the 调节 window's 说句话试试 button, and for checking in dev.
    sayNow(kinds = ['praise']) { show(pick(kinds)); },
    key() {
      const ms = nowMs();
      if (ms - st.lastKey > 5 * MIN) { st.sessionStart = ms; st.restFrom = ms; }
      st.lastKey = ms;
      st.keys.push(ms);
      while (st.keys.length && ms - st.keys[0] > 2 * MIN) st.keys.shift();
    },
    // Things that happened to the cat. Pats, meals and waking up get an answer straight away.
    event(name) {
      if (!TUNING.talkOn) return;
      const ms = nowMs();
      if (name === 'pet') {
        if (ms - st.lastPet < 3 * MIN || Math.random() > 0.4) return;
        st.lastPet = ms;
        show(pick(['pet']));
      } else if (name === 'fed') {
        show(pick(['fed']));
      } else if (name === 'woken') {
        if (Math.random() < 0.6) show(pick(['woken']));
      } else if (name === 'hungry') {
        queue(['energy'], 30);
      }
    },
    // How much the mouth should be open right now: a little "meow" as each bubble pops up.
    mouth() {
      if (!st.showing) return 0;
      const a = (nowMs() - st.showing.t0) / 1000;
      return a < 0.6 ? 0.3 * Math.sin(a / 0.6 * Math.PI) : 0;
    },
    showing: () => !!st.showing,
    // `head`: the top of the head on screen (CSS px); `quiet`: seconds since the last key or click.
    update(head, quiet, asleep) {
      const ms = nowMs(), s = window.innerWidth / 360;
      document.documentElement.style.setProperty('--s', s.toFixed(3));
      if (st.showing && ms > st.showing.t1) hide();
      if (!TUNING.talkOn) { st.queue.length = 0; if (st.showing) hide(); return; }
      freshDay();
      const d = new Date(), h = d.getHours() + d.getMinutes() / 60, day = d.getDay();

      // Occasions, each queued at most once a day.
      const once = (key, when, kinds) => { if (when && !doneToday(key)) { markToday(key); queue(kinds); } };
      if (!st.greeted && ms - st.startedAt > 4000) {
        st.greeted = true;
        if (h >= 6 && h < 10.5 && !doneToday('morning')) { markToday('morning'); queue(['morning']); } else queue(['hello']);
      }
      // The greeting always comes first.
      if (st.greeted) {
        once('lunch', h >= 11.5 && h < 13.5, ['lunch']);
        once('offwork', h >= 17.5 && h < 19, ['offwork']);
        once('late', h >= 22 || h < 3, ['late']);
        once('weekday', (day === 1 || day === 5) && h >= 9 && h < 18, [day === 1 ? 'monday' : 'friday']);
      }

      // Working hard: typing steadily for 20 minutes or more.
      if (st.lastKey && ms - st.sessionStart > 20 * MIN && st.keys.length > 40 && ms - st.lastBusy > 45 * MIN) {
        st.lastBusy = ms;
        queue(['busy']);
      }
      // Time for a break.
      if (TUNING.restEvery > 0 && st.lastKey && ms - st.lastKey < 5 * MIN && ms - st.restFrom > TUNING.restEvery * MIN) {
        st.restFrom = ms;
        queue(['rest']);
      }
      // Now and then, something nice, matched to the time of day.
      if (ms > st.nextRandom) {
        st.nextRandom = ms + TUNING.talkEvery * MIN * (0.7 + 0.6 * Math.random());
        const kinds = ['praise'];
        if (h >= 14 && h < 17) kinds.push('afternoon');
        if (h >= 19 && h < 22) kinds.push('overtime', 'overtime');
        queue(kinds, 10);
      }

      // Speak in a pause: not mid-sentence, not in its sleep, one bubble at a time.
      while (st.queue.length && st.queue[0].until < ms) st.queue.shift();
      if (!st.showing && st.queue.length && quiet > 3 && !asleep) show(st.queue.shift().line);

      // Keep the bubble just above the head, its tail pointing down at it, inside the window.
      if (st.showing && head) {
        const w = el.offsetWidth, hgt = el.offsetHeight, margin = 6 * s;
        const left = Math.max(margin, Math.min(window.innerWidth - w - margin, head.x - w * 0.3));
        const top = Math.max(margin, head.y - hgt - 12 * s);
        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
        el.style.setProperty('--tail', `${Math.max(14 * s, Math.min(w - 14 * s, head.x - left))}px`);
        // Pops in with a little overshoot, fades out at the end. Driven from here rather than by
        // CSS transitions, which a hidden or throttled page may not run.
        const a = (ms - st.showing.t0) / 1000, left_ = (st.showing.t1 - ms) / 1000;
        const pop = a < 0.25 ? 0.6 + 0.4 * K.smooth(0, 0.25, a) + 0.08 * Math.sin(K.smooth(0, 0.25, a) * Math.PI) : 1;
        el.style.opacity = Math.min(1, a / 0.15, left_ / 0.35).toFixed(3);
        el.style.transform = `scale(${pop.toFixed(3)})`;
      }
    },
  };
})();
