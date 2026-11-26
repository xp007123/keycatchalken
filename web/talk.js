// Speech bubbles for Quinn: a light, playful little cat that is always there. It greets her, says
// hi when she comes back, reminds her to drink water and get up, and chats about animals, work,
// psychology and her writing. `K.talk` decides when to speak; behavior.js tells it about keys,
// pointer moves, pats, meals and naps and calls `update` every frame with where the head is on
// screen. The bubble is an HTML element over the canvas (crisp text; clicks pass straight through).
'use strict';
(() => {
  // Everything the cat can say, by occasion. Kept short: the bubble is small.
  const LINES = {
    morning: ['早安 Quinn！今天也是可爱的一天喵', '早饭吃了吗？没吃我会盯着你的喵', '叮咚～你的专属小猫已上线',
      '早呀早呀，今天也一起摸鱼喵'],
    hello: ['来啦来啦！我等你好久啦～', '叮咚～你的专属小猫已上线', '嘿嘿，又见面啦 Quinn'],
    // After she has been away for a while.
    back: ['你回来啦！我一直乖乖守着喵', '欢迎回来～电脑我帮你看好啦', '刚刚有只虫子路过，被我赶跑了',
      '你不在的时候，我数了 100 只小鱼干'],
    animals: ['今天有没有偷偷摸别人家的猫？', '我闻到了！你身上有小狗的味道', '你是全世界小动物的好朋友喵',
      '路边的小猫托我跟你问好～', '听说楼下的小狗也很想你', '刚才窗外有只小鸟，它说你好',
      '等我长大了，要介绍朋友给你认识', '小区的流浪猫说你是好人类', '我们猫圈都在传，Quinn 超温柔',
      '想养小动物？先把我养好喵！', '小兔子、小仓鼠都想被你摸摸', '小动物见了你都想贴贴',
      '本猫申请成为你的头号宠物！', '你包里是不是藏了猫条？我闻到了'],
    freedom: ['上班是为了下班，对吧喵', '摸鱼一分钟，快乐一整天！', '身体在工位，心已经在海边了',
      '偷偷发呆五分钟，我帮你放哨', '等攒够小鱼干，我们一起去旅行'],
    work: ['甲方又改需求了？我咬他喵', '客户说什么都不重要，你最重要', '方案改到第几版啦？我陪你～',
      '今天的 KPI：开心第一，工作第二'],
    psych: ['这不叫拖延，叫情绪调节喵', '猫心理学研究表明：你该休息了', '经过专业评估，你今天超可爱',
      '摸猫能降低压力，有论文的喵', '你一开电脑我就开心，巴甫洛夫效应', '多巴胺补给站：摸我一下',
      '心流状态中…我悄悄不打扰', '正念练习：看我一眼，呼吸三次', '马斯洛说，先吃饱才能实现梦想',
      '我对你产生了安全依恋，喵', '你的情绪稳定值：本猫认证满分', '研究发现：和猫待着的人更快乐',
      '今日心理测试结果：需要一杯奶茶', '冷知识：猫咪呼噜声也能治愈人类'],
    praise: ['Quinn 好厉害，什么都能搞定！', '今天的你也闪闪发光喵', '我宣布，你是本猫最喜欢的人类',
      '偶尔也让我帮帮你嘛～', '你认真的样子，好像在发光', '同济的高材生，就是不一样！',
      '会写小说的人，都是魔法师', '你的脑袋里装着一整个宇宙吧', '又聪明又可爱，犯规了喵',
      '今天的你，比昨天还要棒一点点', '你的打字声，是我最喜欢的音乐', '能遇到你，是本猫的福气',
      '你一笑，我尾巴都翘起来了', '世界上最酷的人，就在我面前',
      // She likes being praised: a second helping.
      'Quinn 今天也好看得不讲道理喵', '你一来，屏幕都亮了一点', '本猫鉴定：Quinn 是限量版人类',
      '你的眼光真好，比如选了我', '这么好的 Quinn，是谁家的呀', '你怎么做什么都这么好看',
      '夸你一百句都不够用喵', '有趣的灵魂，说的就是你', '你认真想事情的样子好迷人',
      '我见过的人类里，你最特别', '你今天的状态，闪到我眼睛了', '又美又有才华，还让不让猫活了',
      '偷偷告诉你，你是我的骄傲', '你值得所有的小鱼干和夸夸', '全世界最好的 Quinn，被我遇到了',
      '今天也想给你颁个可爱奖'],
    // Evening typing: probably writing.
    novel: ['在写小说吗？我要当第一个读者！', '卡文了？摸摸我，灵感就来了喵', '能把我写进小说吗？我要当主角',
      '今天写了一行也超棒的！'],
    sit: ['起来伸伸腰，我陪你一起伸～', '坐太久啦，起来走一走喵', '屁股要和椅子长在一起啦！',
      '站起来转个圈，我帮你数数', '脖子酸不酸？左转转、右转转', '去窗边看看风景，五分钟就好',
      '久坐警报！请起立活动一下喵', '伸个大懒腰，像我这样～', '眼睛累了吧？看看远处休息一下'],
    water: ['喝口水吧，我看你嘴巴干干的', '叮！喝水时间到喵', '杯子空了吗？去接满它！', '多喝水皮肤好，我说的',
      '你今天的喝水量不达标哦', '喝水打卡，一口也算！', '我都喝了三口水了，你呢？'],
    lunch: ['干饭时间到！冲鸭！', '到饭点啦，Quinn 快去吃饭喵', '吃饱饱才有力气摸鱼'],
    offwork: ['下班啦！自由的风在召唤你！', '下班啦！自由时间到！', '撤退！今天的工作就到这儿喵'],
    late: ['夜猫子 Quinn，我也是夜猫子喵', '写完这段就睡好不好～', '再不睡，我就趴在键盘上了哦'],
    monday: ['周一啦，摸鱼模式慢慢启动喵'],
    friday: ['周五啦！自由倒计时开始！'],
    energy: ['肚子咕咕叫…一起吃点东西吧', '本猫饿了，你是不是也饿了？'],
    fed: ['好吃！你是最棒的铲屎官！', '吃饱饱，谢谢 Quinn 喵～'],
    pet: ['呼噜呼噜～再摸一下嘛', '嘿嘿，好舒服喵', '再摸摸，我就给你打呼噜'],
    woken: ['喵？我才没睡着！', '我刚刚只是在闭目养神喵'],
  };

  // What was said today, so no line repeats within a day and the once-a-day ones stay once a day.
  // Kept in localStorage, so a restart doesn't start the day over.
  const STORE = 'quinn.talk';
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
    nextRandom: nowMs() + 4 * MIN,
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
    sayNow(kinds = ['praise', 'animals', 'psych', 'freedom']) { show(pick(kinds)); },
    // Says one given line straight away (milestones, the rain story).
    say(line) { if (TUNING.talkOn && line) show(line); },
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
      const weekday = day >= 1 && day <= 5, evening = h >= 19 || h < 2;

      // Occasions, each queued at most once a day.
      const once = (key, when, kinds) => { if (when && !doneToday(key)) { markToday(key); queue(kinds); } };
      if (!st.greeted && ms - st.startedAt > 4000) {
        st.greeted = true;
        if (h >= 6 && h < 10.5 && !doneToday('morning')) { markToday('morning'); queue(['morning']); } else queue(['hello']);
      }
      // The greeting always comes first.
      if (st.greeted) {
        once('lunch', h >= 11.5 && h < 13.5, ['lunch']);
        if (weekday && h >= 17.5 && h < 19 && !doneToday('offwork')) {
          markToday('offwork');
          // The day's typing tally first, if she typed enough for it to mean something.
          if (K.extras && K.extras.keysToday() >= 300) st.queue.push({ line: K.extras.summary(), until: ms + 15 * MIN });
          queue(['offwork']);
        }
        once('late', h >= 22.5 || h < 3, ['late']);
        once('weekday', (day === 1 || day === 5) && h >= 9 && h < 18, [day === 1 ? 'monday' : 'friday']);
      }

      // Typing steadily for 20 minutes or more: in the evening she is probably writing; in the
      // daytime it's work.
      if (st.lastKey && ms - st.sessionStart > 20 * MIN && st.keys.length > 40 && ms - st.lastBusy > 40 * MIN) {
        st.lastBusy = ms;
        queue(evening ? ['novel'] : weekday && h >= 9 && h < 19 ? ['work', 'praise'] : ['praise']);
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
      // Now and then, a little chat, matched to the time of day.
      if (ms > st.nextRandom) {
        st.nextRandom = ms + TUNING.talkEvery * MIN * (0.7 + 0.6 * Math.random());
        const kinds = ['praise', 'praise', 'praise', 'animals', 'animals', 'psych', 'freedom'];
        if (weekday && h >= 9 && h < 19) kinds.push('work', 'freedom');
        if (evening) kinds.push('novel');
        if (h >= 22.5 || h < 3) kinds.push('late');
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
