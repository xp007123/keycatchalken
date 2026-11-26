// Speech bubbles for 杆杆: the cat greets her, says hi when she comes back, reminds her to eat,
// drink and get up, and cheers her through busy days at the 商贸局 when her battery runs low.
// `K.talk` decides when to speak; behavior.js tells it about keys, pointer moves, pats, meals and
// naps and calls `update` every frame with where the head is on screen. The bubble is an HTML
// element over the canvas (crisp text; clicks pass straight through).
'use strict';
(() => {
  // Everything the cat can say, by occasion. Kept short: the bubble is small.
  const LINES = {
    morning: ['杆杆早上好喵～今天也一起加油！', '早呀杆杆，先吃早饭再干活喵', '新的一天，杆杆元气满满！',
      '喵～键盘我已经帮你焐热啦', '早安杆杆，今天的材料也会顺顺的', '早上好喵，先喝杯温水再开工'],
    hello: ['杆杆来啦！今天也陪着你喵', '喵～杆杆，我在这儿呢', '有我在，今天也会顺顺利利喵',
      '杆杆上线！本猫陪班模式开启'],
    // After she has been away for a while (a meeting, a visit, a phone call).
    back: ['杆杆开完会回来啦？辛苦辛苦', '回来啦～位置我帮你焐热了', '走访回来啦？外面冷不冷喵',
      '电话打完啦？先喘口气喵', '欢迎回来，文件一份没少喵'],
    lunch: ['到饭点啦，杆杆快去吃饭喵！', '干饭要紧，文件又不会跑喵', '吃完眯一会儿，下午更有劲',
      '杆杆，食堂今天有好吃的吗？'],
    afternoon: ['下午容易困，喝口水吧杆杆', '来杯奶茶续命？我批准了喵！', '再坚持一下，快下班啦～',
      '下午三点，适合来点小零食', '困了就站起来晃一晃喵'],
    offwork: ['下班时间到！杆杆辛苦啦～', '今天也超棒的，回家好好休息喵', '下班打卡！今天的杆杆也满分',
      '电脑关机，杆杆开启休息模式'],
    overtime: ['这么晚还在忙…杆杆辛苦了', '我陪你加班喵，但别太晚哦', '剩下的明天再做也来得及喵',
      '加班的杆杆，也是最好看的', '晚饭吃了吗？不许饿着加班'],
    late: ['杆杆该回家睡觉啦，我都困了喵', '这么晚还不睡，明天会没电的喵'],
    // Typing steadily for a long while.
    busy: ['杆杆打字好快，像风一样喵！', '这么多材料都是你写的？太厉害了', '杆杆认真的样子最好看了',
      '杆杆一个人顶三个人用吧', '忙成小陀螺的杆杆也好可爱', '键盘都要被你敲出火花啦', '这效率，本猫给你打满分'],
    // The 商贸局.
    work: ['又在写材料呀，杆杆是大笔杆子', '报表数字对不上？先喝口水再看', '这份文件盖完章就轻松啦',
      '领导又找你？因为杆杆最靠谱', '企业走访辛苦啦，脚还酸吗', '材料改到第几稿啦？下一稿准过',
      '数据统计完，世界都清净了喵', '商贸局的门面担当，就是杆杆', '电话一个接一个，我帮你挡挡',
      '会议纪要写完啦？奖励摸猫一次'],
    // Her battery runs low easily.
    charge: ['检测到杆杆电量低，请补充零食', '充电提醒：奶茶一杯，电量+50%', '低电量模式启动：先深呼吸三次',
      '摸摸猫可以快充，要不要试试', '杆杆电量满格的样子最好看'],
    cheer: ['忙完这阵子，奖励自己一顿好的', '事情做不完的，先照顾好杆杆', '慢一点也没关系，我在旁边陪着',
      '今天辛苦啦，晚上早点休息喵'],
    praise: ['杆杆是商贸局最靠谱的人！', '报表再多，也难不倒杆杆喵', '开会辛苦啦，你说得超好的',
      '杆杆今天也很棒，我都看到啦', '不开心的事，我用尾巴拍走！', '世界很忙，我只忙着喜欢杆杆',
      '杆杆做事，本猫最放心', '再难的活，到杆杆手里都好办', '杆杆笑一下，猫咪开心一整天'],
    sit: ['起来走两步吧，电脑我帮你看着', '看看窗外，让眼睛歇一会儿喵', '肩膀酸不酸？转转脖子吧',
      '坐太久腰会抗议哦，起来扭一扭', '去走廊溜达一圈再回来吧', '眼睛也要下班一会儿，看看远处'],
    water: ['喝口水喵，杯子是不是空了？', '杆杆喝水啦，水杯在等你', '一天八杯水，现在第几杯啦？',
      '忙也要喝水，不然会变成猫干', '水杯举起来，干杯！喝水啦喵'],
    monday: ['周一啦，慢慢来不着急喵'],
    wednesday: ['周三啦，一周过半，杆杆真棒！'],
    friday: ['周五啦！马上就周末咯！'],
    energy: ['我饿了…杆杆是不是也饿了？', '一起吃点零食补充能量吧！', '能量告急！需要小鱼干和杆杆'],
    fed: ['吃饱啦！谢谢杆杆喵～', '有杆杆真好，能量满格！', '你也吃点好吃的奖励自己喵', '吃饱了，杆杆也去吃点好的'],
    pet: ['嘿嘿，杆杆的手好暖喵', '再摸摸～烦恼都摸走啦', '被杆杆摸头最开心了喵', '杆杆摸头，猫猫满电'],
    woken: ['喵？杆杆回来啦！', '我才没睡着…是在闭目养神喵', '杆杆来啦？我立刻清醒了喵'],
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
  // An occasion listed twice is twice as likely.
  function pick(kinds) {
    freshDay();
    const pool = kinds.flatMap(k => LINES[k] || []);
    const fresh = pool.filter(l => !memo.used.includes(l));
    const from = fresh.length ? fresh : pool;
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
    queue: [],            // { line, until }: waiting for a pause in typing
    showing: null,        // { line, t0, t1 } in ms
    startedAt: nowMs(),
    greeted: false,
    nextRandom: nowMs() + 6 * MIN,
    // Typing: a session runs while keys keep coming with gaps under 5 minutes.
    lastKey: 0, sessionStart: 0, keys: [], lastBusy: 0, lastPet: 0,
    // Any input (keys or pointer): how long she has been at the computer, and when she was last here.
    lastActive: 0, sitFrom: 0, waterFrom: 0, lastReminder: 0, backAt: 0,
  };

  function queue(kinds, waitMin = 15, first = false) {
    const line = pick(kinds);
    if (!line) return;
    const item = { line, until: nowMs() + waitMin * MIN };
    if (first) st.queue.unshift(item); else st.queue.push(item);
  }
  function show(line) {
    const ms = nowMs();
    st.showing = { line, t0: ms, t1: ms + Math.min(7000, 3200 + 140 * line.length) };
    el.textContent = line;
  }
  function hide() { st.showing = null; el.style.opacity = 0; }

  K.talk = {
    // From the 调节 window's 说句话试试 button, and for checking in dev.
    sayNow(kinds = ['praise', 'charge', 'cheer', 'work']) { show(pick(kinds)); },
    key() {
      const ms = nowMs();
      if (ms - st.lastKey > 5 * MIN) st.sessionStart = ms;
      st.lastKey = ms;
      st.keys.push(ms);
      while (st.keys.length && ms - st.keys[0] > 2 * MIN) st.keys.shift();
    },
    // Any key, click or pointer move. Back after half an hour or more: "you're back!", first thing.
    // Away for 5 minutes or more counts as a break for the sit and water reminders.
    activity() {
      const ms = nowMs();
      if (st.lastActive && ms - st.lastActive > 30 * MIN && TUNING.talkOn) {
        st.backAt = ms;
        queue(['back'], 5, true);
      }
      if (!st.lastActive || ms - st.lastActive > 5 * MIN) { st.sitFrom = ms; st.waterFrom = ms; }
      st.lastActive = ms;
    },
    // Things that happened to the cat. Pats, meals and waking up get an answer straight away.
    event(name) {
      if (!TUNING.talkOn) return;
      const ms = nowMs();
      if (name === 'pet') {
        if (ms - st.lastPet < 2 * MIN || Math.random() > 0.5) return;
        st.lastPet = ms;
        show(pick(['pet']));
      } else if (name === 'fed') {
        show(pick(['fed']));
      } else if (name === 'woken') {
        // Coming back after a long while already gets its own hello.
        if (ms - st.backAt > 2000 && Math.random() < 0.6) show(pick(['woken']));
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
    // `head`: the top of the head on screen (CSS px). Bubbles wait for a pause in typing (3 s
    // without a key); moving or clicking the mouse doesn't hold them back.
    update(head, quiet, asleep) {
      const ms = nowMs(), s = window.innerWidth / 360;
      document.documentElement.style.setProperty('--s', s.toFixed(3));
      if (st.showing && ms > st.showing.t1) hide();
      if (!TUNING.talkOn) { st.queue.length = 0; if (st.showing) hide(); return; }
      freshDay();
      const d = new Date(), h = d.getHours() + d.getMinutes() / 60, day = d.getDay();
      const weekday = day >= 1 && day <= 5, office = weekday && h >= 9 && h < 18.5;

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
        const special = { 1: 'monday', 3: 'wednesday', 5: 'friday' }[day];
        once('weekday', special && h >= 9 && h < 18, [special]);
      }

      // Typing steadily for 20 minutes or more.
      if (st.lastKey && ms - st.sessionStart > 20 * MIN && st.keys.length > 40 && ms - st.lastBusy > 40 * MIN) {
        st.lastBusy = ms;
        queue(office ? ['busy', 'work'] : h >= 19 ? ['busy', 'overtime'] : ['busy']);
      }
      // Get up, and drink some water: each on its own timer, never two reminders within 5 minutes.
      const here = st.lastActive && ms - st.lastActive < 5 * MIN;
      if (here && ms - st.lastReminder > 5 * MIN) {
        if (TUNING.sitEvery > 0 && ms - st.sitFrom > TUNING.sitEvery * MIN) {
          st.sitFrom = ms; st.lastReminder = ms; queue(['sit'], 10);
        } else if (TUNING.waterEvery > 0 && ms - st.waterFrom > TUNING.waterEvery * MIN) {
          st.waterFrom = ms; st.lastReminder = ms; queue(['water'], 10);
        }
      }
      // Now and then, a little cheering up, matched to the time of day.
      if (ms > st.nextRandom) {
        st.nextRandom = ms + TUNING.talkEvery * MIN * (0.7 + 0.6 * Math.random());
        const kinds = ['praise', 'praise', 'charge', 'cheer'];
        if (office) kinds.push('work', 'work');
        if (h >= 14 && h < 17) kinds.push('afternoon');
        if (h >= 19 && h < 22) kinds.push('overtime', 'overtime');
        if (h >= 22 || h < 3) kinds.push('late');
        queue(kinds, 10);
      }

      // Speak in a pause in typing, not in its sleep, one bubble at a time.
      while (st.queue.length && st.queue[0].until < ms) st.queue.shift();
      if (!st.showing && st.queue.length && ms - st.lastKey > 3000 && !asleep) show(st.queue.shift().line);

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
        const a = (ms - st.showing.t0) / 1000, remain = (st.showing.t1 - ms) / 1000;
        const pop = a < 0.25 ? 0.6 + 0.4 * K.smooth(0, 0.25, a) + 0.08 * Math.sin(K.smooth(0, 0.25, a) * Math.PI) : 1;
        el.style.opacity = Math.min(1, a / 0.15, remain / 0.35).toFixed(3);
        el.style.transform = `scale(${pop.toFixed(3)})`;
      }
    },
  };
})();
