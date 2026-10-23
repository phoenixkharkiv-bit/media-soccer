/* Архив Чемпионата АЖИ по футзалу — интерфейс (без библиотек). Маршруты в адресе после #. */
(function () {
  'use strict';
  const Core = window.Core, UK = window.UK;
  const app = document.getElementById('app');
  let db = null, recs = null, reviewIndex = {}, videos = { matches: {} };
  const reviewCache = new Map();

  /* ---------- утилиты ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONTHS = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
  const HOW = UK.HOW;
  const fmtDate = d => { const [y, m, dd] = d.split('-').map(Number); return `${dd} ${MONTHS[m - 1]} ${y}`; };
  const shortDate = d => { const [y, m, dd] = d.split('-'); return `${dd}.${m}.${y.slice(2)}`; };
  const nf = n => n.toLocaleString('uk-UA');
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c); };
  // склад клубу «АЖІ (бренд)» показуємо як «АЖІ» з позначкою ліги
  const SQUAD = /^(.*) \((бренд|медіа)\)$/;
  const nameHtml = n => { const m = String(n || '').match(SQUAD); if (!m) return esc(n); const md = m[2] === 'медіа'; return `${esc(m[1])}<span class="lgm ${md ? 'm' : 'b'}" title="${md ? 'Медіа-ліга' : 'Бренд-ліга'}">${md ? 'М' : 'Б'}</span>`; };
  const plainName = n => String(n || '').replace(SQUAD, '$1');
  const teamLink = (team, name) => team ? `<a href="#t-${team.id}">${nameHtml(name || team.name)}</a>` : nameHtml(name || '—');
  // умовна емблема клубу: щит у кольорах, сталих для клубу, і його ініціали (справжніх логотипів команд у даних немає)
  const CREST = [['#1f7fe0', '#0b3d91'], ['#e5302a', '#8f1410'], ['#f2b200', '#a86f00'], ['#13a36b', '#0a5c3b'], ['#7b4fd6', '#3f2390'], ['#ff7a1a', '#a8470a'], ['#0aa5b8', '#05606b'], ['#d63f8c', '#7d1a4e'], ['#4a5a78', '#1f2a40'], ['#2f9e44', '#1b5e20'], ['#c2185b', '#6a0f33'], ['#3949ab', '#1a237e']];
  const hashStr = x => { let h = 0; for (const c of String(x)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const crestColors = team => CREST[hashStr(team ? clubHome(team).id : '') % CREST.length];
  function crest(team, size) {
    if (!team) return '';
    const [c1, c2] = crestColors(team);
    const big = size === 'lg' || size === 'xl' || size === 'xxl';
    return `<span class="cr-s${size ? ' ' + size : ''}" style="--c1:${c1};--c2:${c2}" aria-hidden="true">${esc(mono(clubName(team)).slice(0, big ? 3 : 2))}</span>`;
  }
  const crestLink = (team, name) => `<span class="tn">${crest(team)}${teamLink(team, name)}</span>`;
  function avatar(p, team) {
    const [c1, c2] = team ? crestColors(team) : ['#4a5a78', '#1f2a40'];
    const ini = p.name.split(' ').slice(0, 2).map(w => w[0]).reverse().join('');
    return `<span class="av" style="--c1:${c1};--c2:${c2}" aria-hidden="true">${esc(ini)}</span>`;
  }
  const playerLink = (p, name) => `<a href="#p-${p.id}">${esc(name || p.name)}</a>`;
  const seasonLink = s => `<a href="#s-${s.id}">${esc(s.label)}</a>`;
  const tourHref = t => `#s-${t.season.id}-${t.id}`;
  const tourTitle = t => `${t.name}${t.final ? '' : ''} ${t.season.label}`;
  const medalCls = p => (p >= 1 && p <= 3 ? ' g' + p : '');

  function scoreHtml(m) {
    let s = esc(Core.scoreText(m));
    if (m.pens) s += `<small>пен. ${m.pens[0]}:${m.pens[1]}</small>`;
    return s;
  }
  function matchRow(m, opts = {}) {
    const w = Core.winnerSide(m);
    const ctx = opts.ctx ? `<span class="ctx">${opts.ctx}</span>` : '';
    return `<a class="mrow" href="#m-${m.id}">
      <span class="d">${shortDate(m.date)}</span>
      <span class="h${w === 'h' ? ' w' : ''}">${nameHtml(m.homeName)}${crest(m.home)}</span>
      <span class="sc">${scoreHtml(m)}</span>
      <span class="a${w === 'a' ? ' w' : ''}">${crest(m.away)}${nameHtml(m.awayName)}</span>
      <span class="x">${m.tech ? 'тех.' : ''}${videos.matches[m.id] ? '<span title="Є відео">▶</span>' : ''}</span>${ctx}${opts.note ? `<span class="nt">${esc(opts.note)}</span>` : ''}</a>`;
  }
  function stageCtx(m) {
    const parts = [m.tour.name];
    if (m.div) parts.push(m.div);
    if (m.stage) parts.push(m.stage);
    return esc(parts.join(' · ') + ' · ' + m.season.label);
  }

  /* ---------- Google Analytics ---------- */
  // сайт має одну сторінку з адресами після #, тому перегляди сторінок надсилаємо самі
  // локальний перегляд (localhost) у статистику не потрапляє
  const GA = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '' : window.GA_ID;
  if (GA) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA, { send_page_view: false });
    const sc = document.createElement('script');
    sc.async = true; sc.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA);
    document.head.appendChild(sc);
  }
  const track = (name, params) => { if (GA && window.gtag) window.gtag('event', name, params || {}); };
  function trackPage(h) {
    const kind = !h ? 'головна' : h.split('-')[0];
    track('page_view', { page_location: location.origin + location.pathname + (h ? '#' + h : ''), page_path: '/' + (h ? h.replace(/^([a-z]+)-/, '$1/') : ''), page_title: document.title, page_kind: kind });
  }

  /* ---------- спливаючі списки матчів ---------- */
  // будь-яке число в статистиці може відкрити список матчів, з яких воно складається
  const pops = new Map();
  let popSeq = 0;
  const popId = fn => { const id = 'q' + (++popSeq); pops.set(id, fn); return id; };
  // fn() => { title, sub, items: [{ m, note }] }
  const popv = (val, fn) => (fn ? `<button type="button" class="popv" data-pop="${popId(fn)}">${val}</button>` : String(val));
  let modalEl = null, modalBack = null;
  function closeModal() { if (!modalEl) return; modalEl.remove(); modalEl = null; document.body.style.overflow = ''; if (modalBack) modalBack.focus(); }
  function openModal(title, sub, body) {
    closeModal();
    modalBack = document.activeElement;
    modalEl = document.createElement('div');
    modalEl.className = 'modal-bg';
    modalEl.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mdl-t"><div class="modal-h"><div><h2 id="mdl-t">${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div><button type="button" class="modal-x" aria-label="Закрити">×</button></div><div class="modal-b">${body}</div></div>`;
    modalEl.addEventListener('click', e => { if (e.target === modalEl || e.target.closest('.modal-x')) closeModal(); });
    document.body.appendChild(modalEl);
    document.body.style.overflow = 'hidden';
    modalEl.querySelector('.modal-x').focus();
    return modalEl;
  }
  function openMatches(r) {
    const items = r.items.slice().sort((a, b) => (a.m.date < b.m.date ? 1 : a.m.date > b.m.date ? -1 : 0));
    const n = items.length;
    const sub = (r.sub ? esc(r.sub) + ' · ' : '') + n + ' ' + plural(n, 'матч', 'матчі', 'матчів');
    track('open_matches', { list: r.title });
    openModal(esc(r.title), sub, n ? `<div class="mlist">${items.map(x => matchRow(x.m, { ctx: stageCtx(x.m), note: x.note })).join('')}</div>` : '<p class="note">Немає матчів.</p>');
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && modalEl) closeModal(); });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-pop]');
    if (b) { const f = pops.get(b.dataset.pop); if (f) openMatches(f()); return; }
    if (e.target.closest('[data-report]')) openReport();
  });
  window.addEventListener('hashchange', closeModal);

  const inSet = ms => { if (!ms) return () => true; const s = new Set(ms); return m => s.has(m); };
  const goalsNote = n => n + ' ' + plural(n, 'гол', 'голи', 'голів');
  function groupByMatch(list, note) {
    const g = new Map();
    for (const x of list) { if (!g.has(x.m)) g.set(x.m, []); g.get(x.m).push(x); }
    return [...g].map(([m, xs]) => ({ m, n: xs.length, note: note(xs) }));
  }
  const minNote = xs => xs.map(x => (x.e.min != null ? x.e.min + '′' : '')).filter(Boolean).join(', ');
  // матчі гравця за показником k (у межах вибірки ms, якщо вона задана)
  function playerItems(p, k, ms) {
    const ok = inSet(ms);
    const goals = p.goals.filter(g => ok(g.m) && !g.e.og);
    const perMatch = () => groupByMatch(goals, xs => goalsNote(xs.length) + (minNote(xs) ? ': ' + minNote(xs) : ''));
    const apps = p.apps.filter(a => ok(a.m)).sort((a, b) => (a.m.date < b.m.date ? -1 : 1));
    const flowHit = test => apps.filter(a => { const fl = Stats.flow(a.m); return fl && test(fl); }).map(a => ({ m: a.m }));
    switch (k) {
      case 'apps': case 'seasons': return apps.map(a => ({ m: a.m }));
      case 'goals': case 'gpm': return perMatch();
      case 'hat': return perMatch().filter(x => x.n >= 3);
      case 'brace': return perMatch().filter(x => x.n === 2);
      case 'pen': case 'free': case 'tenm': return groupByMatch(goals.filter(g => g.e[k]), xs => goalsNote(xs.length) + ' · ' + minNote(xs));
      case 'late': return groupByMatch(goals.filter(g => g.e.min >= 46 && g.e.min <= 50), minNote);
      case 'winners': return flowHit(fl => fl.winner && !fl.winner.og && fl.winner.p === p).map(x => { const g = Stats.flow(x.m).winner; return { m: x.m, note: 'переможний гол' + (g.min != null ? ', ' + g.min + '′' : '') }; });
      case 'firsts': return flowHit(fl => fl.seq.length && !fl.seq[0].g.og && fl.seq[0].g.p === p).map(x => ({ m: x.m, note: 'перший гол матчу' }));
      case 'streak': {
        const scored = new Set(goals.map(g => g.m));
        let cur = [], best = [];
        for (const a of apps) { if (scored.has(a.m)) { cur.push(a.m); if (cur.length > best.length) best = cur.slice(); } else cur = []; }
        const per = new Map(perMatch().map(x => [x.m, x.note]));
        return best.map(m => ({ m, note: per.get(m) }));
      }
      case 'yc': case 'rc': return p[k].filter(c => ok(c.m)).map(c => ({ m: c.m, note: (k === 'yc' ? 'попередження' : 'вилучення') + (c.e.min != null ? ', ' + c.e.min + '′' : '') }));
      case 'fair': return [...playerItems(p, 'yc', ms), ...playerItems(p, 'rc', ms)];
      case 'mp': return p.mp.filter(c => ok(c.m)).map(c => ({ m: c.m, note: 'незабитий: ' + (UK.HOW[c.e.how] || c.e.how || 'без уточнення') + (c.e.min != null ? ', ' + c.e.min + '′' : '') }));
      case 'og': return (p.og || []).filter(c => ok(c.m)).map(c => ({ m: c.m, note: 'автогол' }));
      default: return [];
    }
  }
  const PK = { apps: 'Матчі', seasons: 'Матчі', goals: 'Голи', gpm: 'Голи', hat: 'Хет-трики', brace: 'Дублі', pen: 'Голи з пенальті', free: 'Голи зі штрафних', tenm: 'Голи з 10-метрових', late: 'Голи на 46–50′', winners: 'Переможні голи', firsts: 'Перші голи матчу', streak: 'Найдовша серія з голами', yc: 'Попередження', rc: 'Вилучення', fair: 'Картки', mp: 'Незабиті пенальті', og: 'Автоголи' };
  const ppop = (p, k, ms) => () => ({ title: p.name + ' · ' + PK[k], items: playerItems(p, k, ms) });
  // матчі клубу/складу ts за показником k
  function teamItems(ts, k, ms, extra) {
    const T = new Set(Array.isArray(ts) ? ts : [ts]);
    const ok = inSet(ms);
    const list = [...new Set([...T].flatMap(t => t.matches))].filter(ok).filter(m => !extra || extra(m)).sort((a, b) => (a.date < b.date ? -1 : 1));
    const out = [];
    for (const m of list) {
      const s = T.has(m.home) ? 'h' : 'a';
      const sc = Core.tableScore(m);
      if (!sc) { if (k === 'p' || k === 'all') out.push({ m }); continue; }
      const f = s === 'h' ? sc.gh : sc.ga, a = s === 'h' ? sc.ga : sc.gh;
      const res = sc.bothLost ? 'L' : f > a ? 'W' : f < a ? 'L' : 'D';
      let hit = false, note;
      if (k === 'p' || k === 'all' || k === 'gfpm' || k === 'gapm' || k === 'winPct') hit = true;
      else if (k === 'w' || k === 'd' || k === 'l') hit = res === k.toUpperCase();
      else if (k === 'cs') hit = !m.tech && a === 0;
      else if (k === 'fts') hit = !m.tech && f === 0;
      else if (k === 'comebacks') { const fl = Stats.flow(m); hit = !!(fl && fl.complete && Core.winnerSide(m) === s && (s === 'h' ? fl.maxDefH : fl.maxDefA) > 0); if (hit) note = 'відігралися з −' + (s === 'h' ? fl.maxDefH : fl.maxDefA); }
      else if (k === 'yc' || k === 'rc') { const n = m[k].filter(c => c.side === s).length; hit = n > 0; note = n + ' ' + (k === 'yc' ? plural(n, 'попередження', 'попередження', 'попереджень') : plural(n, 'вилучення', 'вилучення', 'вилучень')); }
      if (hit) out.push({ m, note });
    }
    return out;
  }
  const TK = { p: 'Матчі', all: 'Матчі', w: 'Перемоги', d: 'Нічиї', l: 'Поразки', cs: 'Сухі матчі', fts: 'Матчі без забитих голів', comebacks: 'Камбеки', yc: 'Матчі з попередженнями', rc: 'Матчі з вилученнями', gfpm: 'Матчі', gapm: 'Матчі', winPct: 'Матчі' };
  const tpop = (ts, k, ms, label) => () => ({ title: (label || (Array.isArray(ts) ? clubName(ts[0]) : plainName(ts.name))) + ' · ' + TK[k], items: teamItems(ts, k, ms) });
  // серія команди: матчі між першим і останнім матчем рекордної серії
  function streakPop(team, at, label, ms) {
    if (!at) return null;
    return () => ({ title: plainName(team.name) + ' · ' + label, sub: fmtDate(at.from.date) + ' — ' + fmtDate(at.to.date), items: teamItems(team, 'all', ms, m => m.date >= at.from.date && m.date <= at.to.date) });
  }

  // горизонтальні смуги з підписаними значеннями: [{ label, href, sub, value, text, pop }]
  function hbars(items) {
    if (!items.length) return '<p class="note">Немає даних.</p>';
    const max = Math.max(...items.map(i => i.value)) || 1;
    return `<div class="hbars">${items.map((it, i) => `<div class="hbr"><span class="rk">${i + 1}</span><span class="lb">${it.href ? `<a href="${it.href}">${nameHtml(it.label)}</a>` : nameHtml(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span><span class="tr"><i style="width:${Math.max(1, (it.value / max) * 100)}%"></i></span><span class="vl">${popv(it.text != null ? it.text : it.value, it.pop)}</span></div>`).join('')}</div>`;
  }
  // вертикальні стовпчики з числом над кожним: cols [{ label, values: [..], pop }], colors — колір кожного ряду
  function colsHtml(cols, colors, h = 190) {
    const max = Math.max(1, ...cols.flatMap(c => c.values));
    const two = colors.length > 1;
    return `<div class="cols${two ? ' two' : ''}" style="height:${h}px">${cols.map(c => {
      const total = c.values.reduce((x, y) => x + y, 0);
      const id = c.pop && total ? popId(c.pop) : null;
      return `<button type="button" class="c"${id ? ` data-pop="${id}"` : ' disabled'} aria-label="${esc(c.label)}: ${c.values.join(' / ')}"><span class="v">${c.values.map((v, i) => `<span${two ? ` style="color:${colors[i]}"` : ''}>${v}</span>`).join('')}</span><span class="bx">${c.values.map((v, i) => `<i style="height:${(v / max) * 100}%;background:${colors[i]}"></i>`).join('')}</span><span class="l">${/^\d+–\d+$/.test(c.label) ? `<span class="lf">${esc(c.label)}</span><span class="ls">${esc(c.label.split('–')[1])}′</span>` : esc(c.label)}</span></button>`;
    }).join('')}</div>`;
  }
  // голи вибірки за п'ятихвилинками; type: all/open/pen/tenm/fk/og
  function minuteCols(ms, type, filterGoal) {
    const per = Array.from({ length: 10 }, () => []);
    for (const m of ms) for (const g of m.goals) {
      const b = Stats.binOf(g.min); if (b < 0 || b > 9) continue;
      if (type && type !== 'all' && goalType(g) !== type) continue;
      if (filterGoal && !filterGoal(g, m)) continue;
      per[b].push({ m, g });
    }
    return per.map((list, b) => ({
      label: Stats.BINS[b], values: [list.length],
      pop: () => ({ title: 'Голи на ' + Stats.BINS[b] + ' хвилинах', items: [...groupMap(list)].map(([m, xs]) => ({ m, note: xs.map(x => x.g.min + '′ ' + x.g.name).join(', ') })) }),
    }));
  }
  function groupMap(list) { const g = new Map(); for (const x of list) { if (!g.has(x.m)) g.set(x.m, []); g.get(x.m).push(x); } return g; }

  /* ---------- шапка, поиск ---------- */
  function setNav(route) {
    document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.r === route));
  }
  function initSearch() {
    const inp = document.getElementById('q');
    const box = document.getElementById('qres');
    let items = [], act = -1;
    const index = [];
    for (const c of clubRows()) index.push({ kind: 'Клуб', label: c.name, extra: c.names.join(', '), href: '#t-' + c.home.id, weight: c.tot.p + 50, keys: c.keys.concat(Core.normName(c.name)) });
    for (const p of db.players.values()) index.push({ kind: 'Гравець', label: p.name, extra: '', href: '#p-' + p.id, weight: p.apps.length + p.archive.length * 5, keys: [...p.spellings.keys()].map(Core.normName) });
    function run() {
      const q = Core.normName(inp.value);
      if (q.length < 2) { box.hidden = true; return; }
      const words = q.split(' ');
      items = index.filter(it => it.keys.some(k => words.every(w => k.includes(w)))).sort((a, b) => {
        const as = a.keys.some(k => k.startsWith(q)) ? 1 : 0, bs = b.keys.some(k => k.startsWith(q)) ? 1 : 0;
        return bs - as || b.weight - a.weight;
      }).slice(0, 12);
      act = -1;
      box.innerHTML = items.length ? items.map((it, i) => `<a href="${it.href}" data-i="${i}"><span>${esc(it.label)}${it.extra ? ` <small>(${esc(it.extra)})</small>` : ''}</span><small>${it.kind}</small></a>`).join('') : '<div class="empty">Нічого не знайдено. Спробуйте прізвище або частину назви.</div>';
      box.hidden = false;
    }
    inp.addEventListener('input', run);
    inp.addEventListener('focus', run);
    inp.addEventListener('keydown', e => {
      const links = [...box.querySelectorAll('a')];
      if (e.key === 'ArrowDown') { act = Math.min(links.length - 1, act + 1); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { act = Math.max(0, act - 1); e.preventDefault(); }
      else if (e.key === 'Enter') { const l = links[act >= 0 ? act : 0]; if (l) { location.hash = l.getAttribute('href'); close(); } return; }
      else if (e.key === 'Escape') { close(); return; }
      links.forEach((l, i) => l.classList.toggle('act', i === act));
    });
    box.addEventListener('click', e => { if (e.target.closest('a')) close(); });
    document.addEventListener('click', e => { if (!e.target.closest('.search')) box.hidden = true; });
    function close() { box.hidden = true; inp.value = ''; inp.blur(); }
  }

  /* ---------- главная ---------- */
  function honorTable() {
    const rows = db.seasons.slice().reverse().map(s => {
      const win = t => {
        const v = db.views.get(t.key);
        const team = t.format === 'league' ? (v.divWinners[0] && v.divWinners[0].team) : v.winner;
        const name = t.format === 'league' ? (v.divWinners[0] && v.divWinners[0].name) : v.winnerName;
        if (team) return `<span class="medal m1">${teamLink(team, name)}</span>`;
        if (t.format === 'league') return `<span class="muted">${v.status === 'unknown' ? 'уточнюється' : 'не завершено'}</span>`;
        return '<span class="muted">—</span>';
      };
      const T = id => s.tournaments.find(x => x.id === id);
      const dash = '<span class="dash">—</span>';
      let leagues;
      if (T('chemp')) leagues = `<td colspan="2"><div class="cell"><span class="lg">Чемпіонат АЖІ</span>${win(T('chemp'))}</div></td>`;
      else leagues = `<td>${T('media') ? win(T('media')) : dash}</td><td>${T('brand') ? win(T('brand')) : dash}</td>`;
      const others = s.tournaments.filter(t => !['chemp', 'media', 'brand', 'cup'].includes(t.id)).map(t => {
        const v = db.views.get(t.key);
        return v.winner ? `<div><span class="lg">${esc(t.name)}:</span> ${teamLink(v.winner, v.winnerName)}</div>` : '';
      }).join('');
      return `<tr><td class="season"><a href="#s-${s.id}">${esc(s.label)}</a></td>${leagues}<td>${T('cup') ? win(T('cup')) : dash}</td><td class="hide-s"><div class="cell">${others || dash}</div></td></tr>`;
    }).join('');
    return `<div class="tw"><table class="honor"><thead><tr><th>Сезон</th><th>Медіа-ліга</th><th>Бренд-ліга</th><th>Кубок АЖІ</th><th class="hide-s">Інші турніри</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  // останній сезон із протоколами: головний турнір, таблиця, останній ігровий день
  function latest() {
    const s = db.seasons.slice().reverse().find(x => !x.archive);
    const ms = db.matches.filter(m => m.season === s).sort((a, b) => (a.date < b.date ? -1 : 1));
    const main = s.tournaments.find(t => t.format === 'league') || s.tournaments[0];
    const v = db.views.get(main.key);
    const tb = v.tables[0];
    const lastDate = ms.length ? ms[ms.length - 1].date : null;
    const day = ms.filter(m => m.date === lastDate);
    const leader = tb && tb.rows[0] ? tb.rows[0].team : null;
    const feature = day.find(m => m.home === leader || m.away === leader) || day[0];
    return { s, main, v, tb, day, feature };
  }
  const mono = n => { const w = plainName(n).replace(/[«»"'.]/g, '').split(/[\s-]+/).filter(Boolean); return (w.length === 1 ? w[0].slice(0, 3) : w.slice(0, 2).map(x => x[0]).join('')).toUpperCase(); };
  const LOGO = '<img class="mark" src="assets/img/logo-hero.png" alt="Логотип Чемпіонату АЖІ з футзалу" width="380" height="232">';
  // прев'ю у високій якості; якщо YouTube його не має (віддає заглушку 120×90), беремо hqdefault
  const thumb = id => `<img src="https://i.ytimg.com/vi/${id}/maxresdefault.jpg" alt="" loading="lazy" onload="if(this.naturalWidth<=120&&!this.dataset.f){this.dataset.f=1;this.src='https://i.ytimg.com/vi/${id}/hqdefault.jpg'}" onerror="if(!this.dataset.f){this.dataset.f=1;this.src='https://i.ytimg.com/vi/${id}/hqdefault.jpg'}">`;
  function videoCards(list) {
    return `<div class="videos">${list.map(({ v, m }, i) => `<a class="vid${i === 0 && list.length > 3 ? ' big' : ''}" href="#m-${m.id}"><span class="thumb">${thumb(v.id)}<span class="playbtn" aria-hidden="true"></span><span class="kind${v.kind === 'review' ? ' review' : ''}">${v.kind === 'review' ? 'Огляд' : 'Повний матч'}</span></span>${nameHtml(m.homeName)} – ${nameHtml(m.awayName)} ${esc(Core.scoreText(m))}<span>${esc(m.stage || m.tour.name)} · ${shortDate(m.date)}</span></a>`).join('')}</div>`;
  }
  function allVideos() {
    const out = [];
    for (const [id, list] of Object.entries(videos.matches || {})) { const m = db.matches.find(x => x.id === id); if (m) for (const v of list) out.push({ v, m }); }
    return out.sort((a, b) => (a.m.date < b.m.date ? 1 : a.m.date > b.m.date ? -1 : (a.v.kind === 'review') - (b.v.kind === 'review')));
  }
  function pageHome() {
    const goals = db.matches.reduce((s, m) => s + m.goals.length, 0);
    const first = db.seasons[0].label, last = db.seasons[db.seasons.length - 1].label;
    const people = [...db.players.values()].filter(p => p.apps.length || p.archive.length).length;
    const L = latest();
    const f = L.feature;
    const vids = allVideos();
    const fvid = f && videos.matches[f.id];
    const feature = f ? `<div class="feature">
        <div class="k">Останній зіграний матч · ${esc(L.main.name)} · ${esc(f.stage || '')} · ${fmtDate(f.date)}</div>
        <div class="score"><div class="t r">${teamLink(f.home, f.homeName)}${crest(f.home, 'lg')}</div><a class="s" href="#m-${f.id}">${esc(Core.scoreText(f))}</a><div class="t">${crest(f.away, 'lg')}${teamLink(f.away, f.awayName)}</div></div>
        <div class="row"><a href="#m-${f.id}">Протокол матчу</a>${fvid ? `<a href="#m-${f.id}">▶ Відео: ${fvid.map(v => (v.kind === 'review' ? 'огляд' : 'повний матч')).join(' і ')}</a>` : ''}</div>
        ${L.v.note ? `<div class="banner"><b>!</b><span>${esc(L.v.note)}</span></div>` : ''}
      </div>` : '';
    const others = L.day.filter(m => m !== f);
    const ticker = others.length ? `<div class="ticker" aria-label="Інші матчі останнього ігрового дня">${others.map(m => { const w = Core.winnerSide(m); const sc = m.score || ['–', '–']; return `<a class="tk" href="#m-${m.id}"><span class="h">${esc(m.stage || '')} · ${shortDate(m.date)}</span><span class="${w === 'h' ? 'w' : ''}">${crest(m.home)}${nameHtml(m.homeName)}</span><b>${sc[0]}</b><span class="${w === 'a' ? 'w' : ''}">${crest(m.away)}${nameHtml(m.awayName)}</span><b>${sc[1]}</b></a>`; }).join('')}</div>` : '';
    const tb = L.tb;
    const table = tb ? `<div class="pnl"><div class="pnl-h"><h2>Таблиця · ${esc(L.main.name)} ${esc(L.s.label)}</h2><a href="${tourHref(L.main)}">Повна</a></div>
      <div class="tw"><table class="st"><thead><tr><th class="n">#</th><th>Команда</th><th class="n">І</th><th class="n">М’ячі</th><th class="n">О</th></tr></thead><tbody>${tb.rows.map(r => `<tr><td class="n"><span class="pos${tb.complete ? medalCls(r.pos) : ''}">${r.pos}</span></td><td>${crestLink(r.team, r.name)}</td><td class="n">${popv(r.p, tpop(r.team, 'p', L.v.tables[0].matches, plainName(r.name)))}</td><td class="n">${r.gf}–${r.ga}</td><td class="n pts">${r.pts}</td></tr>`).join('')}</tbody></table></div>
      ${tb.complete ? '' : '<p class="note pad" style="padding-top:10px">Таблиця станом на останній зіграний тур.</p>'}</div>` : '';
    const top = recs.topScorers.slice(0, 8), apps = recs.mostApps.slice(0, 5);
    const ldList = (list, val, k) => list.map((p, i) => { const c = clubsOf(p.teams)[0]; return `<div class="ld${i === 0 ? ' first' : ''}"><span class="n">${i + 1}</span><span class="nm">${playerLink(p)}<small>${mainTeams(p) || ''}</small></span><b class="num">${popv(val(p), ppop(p, k))}</b></div>`; }).join('');
    return `<div class="page">
      <div class="home">
        <div class="col">
          <section class="hero2">
            ${LOGO}
            <div class="k">Асоціація «Журналістська ініціатива» · Харків</div>
            <h1>Чемпіонат АЖІ <em>з футзалу</em></h1>
            <p class="lead">Архів турніру медійників з ${esc(first)} по ${esc(last)}: таблиці, протоколи, клуби, гравці й відео.</p>
            <div class="tally2" aria-label="Архів у цифрах">
              <div><b>${db.seasons.length}</b><span>${plural(db.seasons.length, 'сезон', 'сезони', 'сезонів')}</span></div>
              <div><b>${nf(db.matches.length)}</b><span>матчів</span></div>
              <div><b>${nf(goals)}</b><span>голів</span></div>
              <div><b>${nf(people)}</b><span>гравців</span></div>
            </div>
            ${feature}
          </section>
          ${ticker}
          ${vids.length ? `<section class="pnl"><div class="pnl-h"><h2>Відео з каналу турніру</h2><a href="#videos">Усі відео (${vids.length})</a></div><div class="pad">${videoCards(vids.slice(0, 6))}</div></section>` : ''}
          <section class="pnl"><div class="pnl-h"><h2>Переможці за сезонами</h2><a href="#seasons">Усі сезони</a></div>${honorTable()}</section>
        </div>
        <aside class="col side">
          ${table}
          <section class="pnl"><div class="pnl-h"><h2>Бомбардири за всю історію</h2><a href="#records">Рекорди</a></div>${ldList(top, p => p.goals.length, 'goals')}<p class="note pad" style="padding-top:8px">За протоколами з 2010/11. Натисніть на число, щоб побачити матчі.</p></section>
          <section class="pnl"><div class="pnl-h"><h2>Найбільше матчів</h2><a href="#players">Усі гравці</a></div>${ldList(apps, p => p.apps.length, 'apps')}</section>
          <section class="pnl"><div class="pnl-h"><h2>Знайшли неточність?</h2></div><div class="pad"><p class="note" style="margin-bottom:10px">Неправильне ім’я, рахунок чи склад — напишіть нам.</p><button type="button" class="btn pri" data-report="1">Повідомити про неточність</button></div></section>
        </aside>
      </div>
    </div>`;
  }
  function pageSeasons() {
    return `<div class="page"><div class="block"><div class="eyebrow">2003–2022</div><h1 class="title">Сезони</h1><p class="lead">Переможці всіх турнірів. Натисніть на сезон, щоб відкрити таблиці й матчі.</p></div>${honorTable()}</div>`;
  }
  function pageVideos() {
    const list = allVideos();
    return `<div class="page"><div class="block"><div class="eyebrow">YouTube-канал турніру</div><h1 class="title">Відео</h1><p class="lead">Повні записи й огляди матчів. Відео відкривається на сторінці матчу разом із протоколом.</p></div>
      ${list.length ? videoCards(list) : '<div class="callout">Відео ще не додано.</div>'}
      <p class="note">Список оновлюється скриптом tools/youtube/build_videos.py. Усі відео — на <a href="${YT}" target="_blank" rel="noopener">каналі турніру</a>.</p></div>`;
  }
  const YT = 'https://www.youtube.com/@%D0%A7%D0%B5%D0%BC%D0%BF%D0%B8%D0%BE%D0%BD%D0%B0%D1%82%D0%90%D0%96%D0%98%D0%BF%D0%BE%D1%84%D1%83%D1%82%D0%B7%D0%B0%D0%BB%D1%83-%D0%BC2%D0%BF';
  function videoBlock(m) {
    const list = (videos.matches[m.id] || []).slice().sort((a, b) => (a.kind === 'full' ? -1 : 1) - (b.kind === 'full' ? -1 : 1));
    if (!list.length) return '';
    const src = v => `https://www.youtube-nocookie.com/embed/${v.id}`;
    return `<section class="block"><div class="sec-head"><h2 class="sec">Відео</h2>${list.length > 1 ? `<div class="chipset vtabs" role="group">${list.map((v, i) => `<button type="button" data-vid="${v.id}" aria-pressed="${i === 0}">${v.kind === 'review' ? 'Огляд' : 'Повний матч'}</button>`).join('')}</div>` : ''}</div>
      <iframe class="player" id="player" src="${src(list[0])}" title="${esc(list[0].title)}" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></section>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-vid]'); if (!b) return;
    const pl = document.getElementById('player'); if (!pl) return;
    pl.src = 'https://www.youtube-nocookie.com/embed/' + b.dataset.vid;
    b.parentNode.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  });

  /* ---------- матч: стрічка подій, символічні п'ятірки, статистика протистояння ---------- */
  const IC_BALL = '<svg class="ic ic-ball" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.6" fill="#fff" stroke="currentColor" stroke-width="1.4"/><path d="M10 5.8l3.4 2.5-1.3 4h-4.2l-1.3-4z" fill="currentColor"/><path d="M10 5.8V1.6M13.4 8.3l3.9-1.3M12.1 12.3l2.4 3.4M7.9 12.3l-2.4 3.4M6.6 8.3L2.7 7" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>';
  const icCard = k => `<span class="ic ic-card ${k}" aria-hidden="true"></span>`;
  const FL = { pen: 'пенальті', free: 'штрафний', tenm: '10-метровий', og: 'автогол' };
  function eventsBlock(m, side) {
    const ev = [];
    m.goals.forEach((g, i) => ev.push({ t: 'g', min: g.min, side: g.side, g, i }));
    for (const k of ['yc', 'rc']) for (const c of m[k]) if (c.side) ev.push({ t: k, min: c.min, side: c.side, c, i: 1000 + ev.length });
    if (!ev.length) return (m.score && m.score[0] + m.score[1] > 0 && !m.tech ? '<div class="callout">Автори голів у протоколі не вказані.</div>' : '') + (side ? `<section class="block"><div class="fives">${side}</div></section>` : '');
    ev.sort((a, b) => (a.min == null ? 999 : a.min) - (b.min == null ? 999 : b.min) || a.i - b.i);
    const run = [0, 0];
    const timed = ev.every(e => e.min != null);
    // шкала матчу: 2 × 25 хвилин
    const pos = min => Math.min(100, Math.max(0, (min / 50) * 100));
    const marks = ev.filter(e => e.min != null).map(e => `<span class="tl-m ${e.side} ${e.t}" style="left:${pos(e.min)}%" title="${e.min}′ ${esc(e.t === 'g' ? (e.g.og ? 'автогол: ' : 'гол: ') + e.g.name : (e.t === 'yc' ? 'попередження: ' : 'вилучення: ') + (e.c.p ? e.c.p.name : ''))}">${e.t === 'g' ? IC_BALL : icCard(e.t === 'yc' ? 'y' : 'r')}</span>`).join('');
    const ht = m.goals.filter(g => g.min != null && g.min <= 25);
    const htScore = timed && m.goals.length ? [ht.filter(g => g.side === 'h').length, ht.filter(g => g.side === 'a').length] : null;
    let breakDone = false;
    const rows = ev.map(e => {
      let sep = '';
      if (!breakDone && e.min != null && e.min > 25) { breakDone = true; sep = `<div class="ev-sep"><span>Перерва${htScore ? ' · ' + htScore[0] + ':' + htScore[1] : ''}</span></div>`; }
      let who, icon, sc = '';
      if (e.t === 'g') {
        if (e.side === 'h') run[0]++; else if (e.side === 'a') run[1]++;
        const fl = ['og', 'pen', 'tenm', 'free'].find(k => e.g[k]);
        who = `${playerLink(e.g.p, e.g.name)}${fl ? `<span class="ev-tag ${fl}">${FL[fl]}</span>` : ''}`;
        icon = IC_BALL; sc = `<b>${run[0]}:${run[1]}</b>`;
      } else {
        who = e.c.p ? playerLink(e.c.p, e.c.name) : esc(e.c.name || '');
        icon = icCard(e.t === 'yc' ? 'y' : 'r');
      }
      const cell = `<span class="ev-w">${icon}<span>${who}</span></span>`;
      return `${sep}<div class="ev ${e.t === 'g' ? 'goal' : 'card'}"><div class="ev-h">${e.side === 'h' ? cell : ''}</div><div class="ev-c">${sc}<small>${e.min != null ? e.min + '′' : ''}</small></div><div class="ev-a">${e.side === 'a' ? cell : ''}</div></div>`;
    }).join('');
    const nYc = s => m.yc.filter(c => c.side === s).length, nRc = s => m.rc.filter(c => c.side === s).length;
    return `<section class="block"><div class="sec-head"><h2 class="sec">Хід матчу</h2>${htScore ? `<span class="note">1-й тайм ${htScore[0]}:${htScore[1]} · 2-й тайм ${m.goals.filter(g => g.side === 'h').length - htScore[0]}:${m.goals.filter(g => g.side === 'a').length - htScore[1]}</span>` : ''}</div>
      <div class="tl"><div class="tl-teams"><span>${crest(m.home)}${nameHtml(m.homeName)}<small>${IC_BALL}${m.goals.filter(g => g.side === 'h').length}${nYc('h') ? ' ' + icCard('y') + nYc('h') : ''}${nRc('h') ? ' ' + icCard('r') + nRc('h') : ''}</small></span><span>${crest(m.away)}${nameHtml(m.awayName)}<small>${IC_BALL}${m.goals.filter(g => g.side === 'a').length}${nYc('a') ? ' ' + icCard('y') + nYc('a') : ''}${nRc('a') ? ' ' + icCard('r') + nRc('a') : ''}</small></span></div>
        <div class="tl-track"><span class="tl-half"></span>${marks}</div><div class="tl-axis"><span>0′</span><span>25′</span><span>50′</span></div></div>
      <div class="ev-grid${side ? '' : ' solo'}"><div class="evs">${rows}</div>${side || ''}</div>
      ${m.goals.length && m.score && !m.tech && m.goals.length < m.score[0] + m.score[1] ? `<p class="note">У протоколі вказано не всі голи: ${m.goals.length} з ${m.score[0] + m.score[1]}.</p>` : ''}</section>`;
  }

  // символічна п'ятірка на схемі майданчика: воротар + 4 польові, позиції умовні
  function fiveHtml(title, sub, gk, field, note) {
    const spots = [['pv', 50, 17], ['al', 20, 40], ['ar', 80, 40], ['fx', 50, 61]];
    const card = (x, cls, l, t) => `<div class="f5-p ${cls}" style="left:${l}%;top:${t}%">${x ? `<a href="#p-${x.p.id}" class="f5-dot" style="--c1:${x.c1};--c2:${x.c2}">${esc(x.badge)}</a><a href="#p-${x.p.id}" class="f5-n">${esc(x.p.name.split(' ')[0])}<small>${esc(x.p.name.split(' ').slice(1).join(' '))}</small></a><span class="f5-s">${x.line}</span>` : `<span class="f5-dot empty">?</span><span class="f5-n">Воротар<small>не підтверджений</small></span>`}</div>`;
    return `<div class="f5"><div class="f5-h"><h3>${esc(title)}</h3>${sub ? `<span>${sub}</span>` : ''}</div>
      <div class="f5-court"><svg viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true"><rect x="3" y="3" width="94" height="134" rx="2" fill="none" stroke="rgba(255,255,255,.55)" stroke-width=".8"/><line x1="3" y1="70" x2="97" y2="70" stroke="rgba(255,255,255,.55)" stroke-width=".8"/><circle cx="50" cy="70" r="11" fill="none" stroke="rgba(255,255,255,.55)" stroke-width=".8"/><path d="M28 137 A22 22 0 0 1 72 137" fill="none" stroke="rgba(255,255,255,.55)" stroke-width=".8"/><path d="M28 3 A22 22 0 0 0 72 3" fill="none" stroke="rgba(255,255,255,.55)" stroke-width=".8"/><rect x="42" y="137" width="16" height="2.4" fill="rgba(255,255,255,.7)"/><rect x="42" y=".6" width="16" height="2.4" fill="rgba(255,255,255,.7)"/></svg>
        ${spots.map(([cls, l, t], i) => card(field[i], cls, l, t)).join('')}${card(gk, 'gk', 50, 84)}</div>
      ${note ? `<p class="note">${note}</p>` : ''}</div>`;
  }
  const f5Colors = (p, team) => { const [c1, c2] = team ? crestColors(team) : ['#4a5a78', '#1f2a40']; return { c1, c2 }; };
  // п'ятірка матчу: з тих, хто грав; воротар — з підтвердженого списку
  function matchFive(m) {
    const fl = Stats.flow(m), w = Core.winnerSide(m);
    const present = new Map();
    for (const s of ['h', 'a']) for (const x of m.lineups[s]) present.set(x.p, s);
    for (const g of m.goals) if (!g.og && g.p && !present.has(g.p)) present.set(g.p, g.side);
    if (present.size < 5) return '';
    const sc = Core.tableScore(m);
    const rows = [...present].map(([p, s]) => {
      const gl = m.goals.filter(g => g.p === p && !g.og).length;
      const win = fl && fl.winner && fl.winner.p === p && !fl.winner.og;
      const y = m.yc.filter(c => c.p === p).length, r = m.rc.filter(c => c.p === p).length;
      const res = w === s ? 1 : w === 'd' ? 0.4 : 0;
      return { p, s, gl, win, y, r, res, pts: gl * 3 + (win ? 2 : 0) + res - y * 0.5 - r * 2 };
    });
    const team = s => (s === 'h' ? m.home : m.away);
    const keepers = rows.filter(x => x.p.gk);
    // воротар переможців; за нічиєї — той, хто пропустив менше
    const conceded = s => (sc ? (s === 'h' ? sc.ga : sc.gh) : 0);
    const gkRow = keepers.sort((a, b) => b.res - a.res || conceded(a.s) - conceded(b.s))[0];
    const field = rows.filter(x => x !== gkRow && !x.p.gk).sort((a, b) => b.pts - a.pts || b.gl - a.gl).slice(0, 4);
    const mk = x => ({ p: x.p, ...f5Colors(x.p, team(x.s)), badge: x.gl ? String(x.gl) : '•', line: [x.gl ? goalsNote(x.gl) : '', x.win ? 'переможний' : '', x.y ? icCard('y') : '', x.r ? icCard('r') : ''].filter(Boolean).join(' · ') || plainName(x.s === 'h' ? m.homeName : m.awayName) });
    const gk = gkRow ? { p: gkRow.p, ...f5Colors(gkRow.p, team(gkRow.s)), badge: 'В', line: 'пропущено ' + conceded(gkRow.s) } : null;
    return fiveHtml('Символічна п’ятірка матчу', 'з тих, хто грав', gk, field.map(mk), 'Польові — за голами, переможним голом і результатом команди, мінус картки. Позиції умовні: амплуа в протоколах не вказані.' + (gkRow ? '' : ' Воротаря покажемо, щойно список воротарів буде підтверджено.'));
  }
  // п'ятірка противостояння за весь час
  function h2hFive(meets, A, B) {
    const st = new Map();
    for (const x of meets) {
      const sc = Core.tableScore(x); if (!sc) continue;
      const w = Core.winnerSide(x);
      const present = new Map();
      for (const s of ['h', 'a']) for (const l of x.lineups[s]) present.set(l.p, s);
      for (const [p, s] of present) {
        const r = st.get(p) || { p, n: 0, gl: 0, w: 0, ga: 0, team: s === 'h' ? x.home : x.away };
        r.n++; if (w === s) r.w++; r.ga += s === 'h' ? sc.ga : sc.gh; st.set(p, r);
      }
      for (const g of x.goals) if (!g.og && g.p && st.has(g.p)) st.get(g.p).gl++;
    }
    const all = [...st.values()];
    const field = all.filter(r => !r.p.gk && (r.gl || r.n)).sort((a, b) => b.gl - a.gl || b.n - a.n || b.w - a.w).slice(0, 4);
    const ks = all.filter(r => r.p.gk);
    const minN = ks.some(r => r.n >= 3) ? 3 : 1;
    const gkR = ks.filter(r => r.n >= minN).sort((a, b) => b.w / b.n - a.w / a.n || a.ga / a.n - b.ga / b.n)[0];
    if (field.length < 4) return '';
    const mk = r => ({ p: r.p, ...f5Colors(r.p, r.team), badge: String(r.gl), line: goalsNote(r.gl) + ' у ' + r.n + ' ' + plural(r.n, 'матчі', 'матчах', 'матчах') });
    const gk = gkR ? { p: gkR.p, ...f5Colors(gkR.p, gkR.team), badge: 'В', line: gkR.w + ' ' + plural(gkR.w, 'перемога', 'перемоги', 'перемог') + ' у ' + gkR.n + ', пропускав ' + dec(gkR.ga / gkR.n, 1) } : null;
    return fiveHtml('Символічна п’ятірка противостояння', 'найкращі за всі очні зустрічі', gk, field.map(mk), 'Польові — найкращі бомбардири очних зустрічей. Воротар — найкращий відсоток перемог серед підтверджених воротарів' + (minN > 1 ? ' (від 3 матчів)' : '') + '.');
  }

  // розширена статистика противостояння
  function h2hExtra(meets, A, B, nA, nB, persp, five) {
    const played = meets.filter(x => Core.tableScore(x));
    if (played.length < 2) return '';
    const real = played.filter(x => !x.tech);
    const sideOf = (x, S) => (S.has(x.home) ? 'h' : 'a');
    const cards = [];
    // 1. хронологія результатів
    cards.push(`<div class="hx wide"><h3>Хронологія результатів</h3><div class="hx-strip">${played.map(x => { const p = persp(x, A); return `<a class="hs ${p.res}" href="#m-${x.id}" title="${esc(fmtDate(x.date) + ' · ' + x.tour.name + ' · ' + plainName(x.homeName) + ' ' + Core.scoreText(x) + ' ' + plainName(x.awayName))}"><b>${p.tech ? 'тех' : p.f + ':' + p.a}</b><small>${x.date.slice(2, 4)}</small></a>`; }).join('')}</div><p class="note">З погляду ${esc(nA)}: зелений — перемога, сірий — нічия, червоний — поразка. Під рахунком — рік.</p></div>`);
    if (five) cards.push(`<div class="hx hx-five">${five}</div>`);
    // 2. за турнірами
    const byT = new Map();
    for (const x of played) { const k = x.tour.name; const r = byT.get(k) || { n: 0, w: 0, d: 0, l: 0, f: 0, a: 0, list: [] }; const p = persp(x, A); r.n++; r[p.res === 'W' ? 'w' : p.res === 'D' ? 'd' : 'l']++; if (!p.tech) { r.f += p.f; r.a += p.a; } r.list.push(x); byT.set(k, r); }
    cards.push(`<div class="hx"><h3>За турнірами</h3><table class="hx-t"><thead><tr><th>Турнір</th><th class="n">І</th><th class="n">В–Н–П</th><th class="n">М’ячі</th></tr></thead><tbody>${[...byT].sort((a, b) => b[1].n - a[1].n).map(([k, r]) => `<tr><td>${esc(k)}</td><td class="n">${popv(r.n, () => ({ title: nA + ' — ' + nB + ' · ' + k, items: r.list.map(m => ({ m })) }))}</td><td class="n">${r.w}–${r.d}–${r.l}</td><td class="n">${r.f}:${r.a}</td></tr>`).join('')}</tbody></table></div>`);
    // 3. серії
    const streak = (test) => { let cur = [], best = []; for (const x of played) { if (test(persp(x, A))) { cur.push(x); if (cur.length > best.length) best = cur.slice(); } else cur = []; } return best; };
    const sW = streak(p => p.res === 'W'), sL = streak(p => p.res === 'L'), sUA = streak(p => p.res !== 'L'), sUB = streak(p => p.res !== 'W');
    const last = persp(played[played.length - 1], A).res;
    let curN = 0; for (let i = played.length - 1; i >= 0 && persp(played[i], A).res === last; i--) curN++;
    const sp = (list, t) => (list.length ? popv(list.length, () => ({ title: t, sub: fmtDate(list[0].date) + ' — ' + fmtDate(list[list.length - 1].date), items: list.map(m => ({ m })) })) : '0');
    cards.push(`<div class="hx"><h3>Серії</h3><dl class="hx-d"><dt>Перемоги поспіль ${esc(nA)}</dt><dd>${sp(sW, 'Серія перемог ' + nA)}</dd><dt>Перемоги поспіль ${esc(nB)}</dt><dd>${sp(sL, 'Серія перемог ' + nB)}</dd><dt>Без поразок ${esc(nA)}</dt><dd>${sp(sUA, 'Без поразок ' + nA)}</dd><dt>Без поразок ${esc(nB)}</dt><dd>${sp(sUB, 'Без поразок ' + nB)}</dd><dt>Поточна серія</dt><dd>${curN} ${last === 'D' ? plural(curN, 'нічия', 'нічиї', 'нічиїх') : plural(curN, 'перемога', 'перемоги', 'перемог') + ' ' + esc(last === 'W' ? nA : nB)}</dd></dl></div>`);
    // 4. перший гол
    let fA = 0, fB = 0, fAw = 0, fBw = 0;
    for (const x of real) { const fl = Stats.flow(x); if (!fl || !fl.first) continue; const s = sideOf(x, A); const w = Core.winnerSide(x); if (fl.first === s) { fA++; if (w === s) fAw++; } else { fB++; if (w && w !== 'd' && w !== s) fBw++; } }
    if (fA + fB) cards.push(`<div class="hx"><h3>Хто забиває першим</h3><div class="hx-split"><div><b class="a">${fA}</b><span>${esc(nA)}</span><small>і виграв ${fAw}</small></div><div><b class="b">${fB}</b><span>${esc(nB)}</span><small>і виграв ${fBw}</small></div></div><div class="hx-bar"><i class="a" style="width:${(fA / (fA + fB)) * 100}%"></i><i class="b" style="width:${(fB / (fA + fB)) * 100}%"></i></div></div>`);
    // 5. тайми та хвилини
    const gl = { A1: 0, A2: 0, B1: 0, B2: 0 };
    const bins = Array.from({ length: 10 }, () => [0, 0]), binList = Array.from({ length: 10 }, () => []);
    for (const x of real) for (const g of x.goals) {
      if (g.min == null || (g.side !== 'h' && g.side !== 'a')) continue;
      const isA = A.has(g.side === 'h' ? x.home : x.away);
      gl[(isA ? 'A' : 'B') + (g.min <= 25 ? 1 : 2)]++;
      const b = Stats.binOf(g.min); if (b >= 0 && b < 10) { bins[b][isA ? 0 : 1]++; binList[b].push({ m: x, g, isA }); }
    }
    if (gl.A1 + gl.A2 + gl.B1 + gl.B2) cards.push(`<div class="hx wide"><h3>Коли забивають в очних зустрічах</h3><div class="hx-halves"><span>1-й тайм: <b class="a">${gl.A1}</b> : <b class="b">${gl.B1}</b></span><span>2-й тайм: <b class="a">${gl.A2}</b> : <b class="b">${gl.B2}</b></span></div>${colsHtml(bins.map((v, b) => ({ label: Stats.BINS[b], values: v, pop: () => ({ title: 'Голи на ' + Stats.BINS[b] + ' хвилинах', items: [...groupMap(binList[b])].map(([m, xs]) => ({ m, note: xs.map(z => z.g.min + '′ ' + z.g.name).join(', ') })) }) })), ['var(--accent)', 'var(--lg-media)'], 170)}<div class="ring-key"><span><i style="background:var(--accent)"></i>${esc(nA)}</span><span><i style="background:var(--lg-media)"></i>${esc(nB)}</span></div></div>`);
    // 6. характер матчів
    const tot = real.map(x => x.score[0] + x.score[1]);
    const btts = real.filter(x => x.score[0] > 0 && x.score[1] > 0).length, oneGoal = real.filter(x => Math.abs(x.score[0] - x.score[1]) === 1).length, ten = real.filter(x => x.score[0] + x.score[1] >= 10).length;
    const pctS = n => (real.length ? Math.round((n / real.length) * 100) + '%' : '—');
    if (real.length) cards.push(`<div class="hx"><h3>Характер матчів</h3><dl class="hx-d"><dt>Голів за матч</dt><dd>${dec(tot.reduce((a, b) => a + b, 0) / real.length, 1)}</dd><dt>Забивали обидві команди</dt><dd>${pctS(btts)}</dd><dt>Різниця в один гол</dt><dd>${popv(pctS(oneGoal), oneGoal ? () => ({ title: 'Очні зустрічі з різницею в один гол', items: real.filter(x => Math.abs(x.score[0] - x.score[1]) === 1).map(m => ({ m })) }) : null)}</dd><dt>10 і більше голів</dt><dd>${popv(pctS(ten), ten ? () => ({ title: 'Очні зустрічі з 10+ голами', items: real.filter(x => x.score[0] + x.score[1] >= 10).map(m => ({ m })) }) : null)}</dd><dt>Технічні результати</dt><dd>${played.length - real.length}</dd></dl></div>`);
    // 7. статистика ударів з протоколів
    const ms = real.filter(x => x.stats);
    if (ms.length) {
      const sum = (k, isA) => ms.reduce((s, x) => { const v = x.stats[k]; if (!v) return s; const sa = sideOf(x, A) === 'h' ? 0 : 1; return s + v[isA ? sa : 1 - sa]; }, 0);
      const L = [['Удари', 'shots'], ['Удари в створ', 'on_target'], ['Штанги й поперечини', 'woodwork'], ['Кутові', 'corners'], ['Фоли', 'fouls']].filter(([, k]) => ms.some(x => x.stats[k]));
      cards.push(`<div class="hx"><h3>Статистика за протоколами</h3><p class="note">Середнє за матч, ${ms.length} ${plural(ms.length, 'матч', 'матчі', 'матчів')} з даними</p>${L.map(([lab, k]) => { const a = sum(k, true) / ms.length, b = sum(k, false) / ms.length, mx = Math.max(a, b) || 1; return `<div class="hx-m"><b>${dec(a, 1)}</b><span class="cm-b l"><i style="width:${(a / mx) * 100}%"></i></span><span class="cm-l">${lab}</span><span class="cm-b r"><i style="width:${(b / mx) * 100}%"></i></span><b class="r">${dec(b, 1)}</b></div>`; }).join('')}</div>`);
    }
    // 8. гравці: найбільше очних матчів, хет-трики, картки
    const apps = new Map(), hats = [], crd = new Map();
    for (const x of played) {
      for (const s of ['h', 'a']) for (const l of x.lineups[s]) { const r = apps.get(l.p) || { p: l.p, n: 0, isA: A.has(s === 'h' ? x.home : x.away), list: [] }; r.n++; r.list.push(x); apps.set(l.p, r); }
      const per = new Map(); for (const g of x.goals) if (!g.og && g.p) per.set(g.p, (per.get(g.p) || 0) + 1);
      for (const [p, n] of per) if (n >= 3) hats.push({ p, n, x });
      for (const k of ['yc', 'rc']) for (const c of x[k]) if (c.p) { const r = crd.get(c.p) || { p: c.p, y: 0, r: 0, list: [] }; r[k === 'yc' ? 'y' : 'r']++; r.list.push({ m: x, note: (k === 'yc' ? 'попередження' : 'вилучення') + (c.min != null ? ', ' + c.min + '′' : '') }); crd.set(c.p, r); }
    }
    const topApps = [...apps.values()].sort((a, b) => b.n - a.n).slice(0, 8);
    cards.push(`<div class="hx"><h3>Найбільше очних матчів</h3>${topApps.map((r, i) => `<div class="rk ${r.isA ? 'a' : 'b'}"><span class="i">${i + 1}</span><span class="p">${playerLink(r.p)}</span><span class="b"><i style="width:${(r.n / topApps[0].n) * 100}%"></i></span><b>${popv(r.n, () => ({ title: r.p.name + ' · очні матчі', items: r.list.map(m => ({ m })) }))}</b></div>`).join('')}</div>`);
    const hatRow = h => `<a class="hx-h" href="#m-${h.x.id}"><b>${h.n}</b><span>${esc(h.p.name)}<small>${shortDate(h.x.date)} · ${nameHtml(h.x.homeName)} ${esc(Core.scoreText(h.x))} ${nameHtml(h.x.awayName)}</small></span></a>`;
    hats.sort((a, b) => b.n - a.n || (a.x.date < b.x.date ? 1 : -1));
    if (hats.length) cards.push(`<div class="hx"><h3>Хет-трики в очних зустрічах <span class="note">${hats.length}</span></h3>${hats.slice(0, 8).map(hatRow).join('')}${hats.length > 8 ? `<details class="more"><summary>Ще ${hats.length - 8}</summary>${hats.slice(8).map(hatRow).join('')}</details>` : ''}</div>`);
    const yA = played.reduce((s, x) => s + x.yc.filter(c => c.side && A.has(c.side === 'h' ? x.home : x.away)).length, 0), yB = played.reduce((s, x) => s + x.yc.filter(c => c.side && B.has(c.side === 'h' ? x.home : x.away)).length, 0);
    const rA = played.reduce((s, x) => s + x.rc.filter(c => c.side && A.has(c.side === 'h' ? x.home : x.away)).length, 0), rB = played.reduce((s, x) => s + x.rc.filter(c => c.side && B.has(c.side === 'h' ? x.home : x.away)).length, 0);
    if (yA + yB + rA + rB) {
      const topC = [...crd.values()].sort((a, b) => (b.r * 5 + b.y) - (a.r * 5 + a.y)).slice(0, 5);
      cards.push(`<div class="hx"><h3>Дисципліна</h3><div class="hx-split"><div><b class="a">${icCard('y')} ${yA} ${icCard('r')} ${rA}</b><span>${esc(nA)}</span></div><div><b class="b">${icCard('y')} ${yB} ${icCard('r')} ${rB}</b><span>${esc(nB)}</span></div></div>${topC.map(r => `<div class="hx-c"><span>${playerLink(r.p)}</span><b>${popv(`${r.y ? icCard('y') + r.y : ''}${r.r ? ' ' + icCard('r') + r.r : ''}`, () => ({ title: r.p.name + ' · картки в очних зустрічах', items: r.list }))}</b></div>`).join('')}</div>`);
    }
    return `<h3 class="sub hx-title">Статистика протистояння</h3><div class="hxg">${cards.join('')}</div>`;
  }

  /* ---------- матч: порівняння команд і очні зустрічі ---------- */
  function h2hSection(m) {
    // клуб із кількома складами — усі його склади; матч складів одного клубу — лише ці два склади
    const same = clubHome(m.home) === clubHome(m.away);
    const A = new Set(same ? [m.home] : squadsOf(m.home)), B = new Set(same ? [m.away] : squadsOf(m.away));
    const nA = same ? plainName(m.homeName) : clubName(m.home), nB = same ? plainName(m.awayName) : clubName(m.away);
    const side = (x, S) => (S.has(x.home) ? 'h' : S.has(x.away) ? 'a' : null);
    const persp = (x, S) => { const sc = Core.tableScore(x); if (!sc) return null; const s = side(x, S); const f = s === 'h' ? sc.gh : sc.ga, a = s === 'h' ? sc.ga : sc.gh; return { f, a, res: sc.bothLost ? 'L' : f > a ? 'W' : f < a ? 'L' : 'D', tech: !!x.tech }; };
    const meets = db.matches.filter(x => (A.has(x.home) && B.has(x.away)) || (B.has(x.home) && A.has(x.away))).sort((a, b) => (a.date < b.date ? -1 : 1));
    let out = '';

    // 1. порівняння перед матчем: цей турнір (і група), лише матчі до цього
    const before = m.tour.matches.filter(x => x.date < m.date && (!m.div || x.div === m.div));
    const st = Core.standings(before);
    const rowOf = t => { const i = st.findIndex(r => r.team === t); return i < 0 ? null : { ...st[i], pos: i + 1 }; };
    const rA = rowOf(m.home), rB = rowOf(m.away);
    if (rA && rB && rA.p && rB.p) {
      const cs = t => before.filter(x => (x.home === t || x.away === t) && !x.tech && Core.tableScore(x) && (x.home === t ? Core.tableScore(x).ga : Core.tableScore(x).gh) === 0).length;
      const rows = [
        ['Місце в таблиці', rA.pos, rB.pos, false], ['Очки', rA.pts, rB.pts, true], ['Перемоги', rA.w, rB.w, true], ['Нічиї', rA.d, rB.d, null], ['Поразки', rA.l, rB.l, false],
        ['Забито', rA.gf, rB.gf, true], ['Пропущено', rA.ga, rB.ga, false], ['Різниця м’ячів', rA.gf - rA.ga, rB.gf - rB.ga, true], ['Сухі матчі', cs(m.home), cs(m.away), true],
      ];
      const tp = (t, nm, k) => () => ({ title: nm + ' · ' + TK[k] + ' до матчу', items: teamItems(t, k, before) });
      const pops = { 'Перемоги': 'w', 'Нічиї': 'd', 'Поразки': 'l', 'Сухі матчі': 'cs' };
      out += `<div class="cmp"><div class="cmp-h"><span class="t">${crest(m.home, 'md')}${nameHtml(m.homeName)}</span><span class="m">Перед матчем · ${esc(m.tour.name)}${m.div ? ' · ' + esc(m.div) : ''} · ${rA.p === rB.p ? rA.p + ' ' + plural(rA.p, 'матч', 'матчі', 'матчів') : 'матчі ' + rA.p + ' і ' + rB.p}</span><span class="t r">${nameHtml(m.awayName)}${crest(m.away, 'md')}</span></div>
        ${rows.map(([lab, a, b, more]) => {
          const va = lab === 'Місце в таблиці' ? 1 / a : a, vb = lab === 'Місце в таблиці' ? 1 / b : b;
          const mx = Math.max(Math.abs(va), Math.abs(vb)) || 1;
          const lead = more === null || a === b ? '' : ((more ? a > b : a < b) ? ' la' : ' lb');
          const k = pops[lab];
          return `<div class="cm-r${lead}"><b>${popv(lab === 'Різниця м’ячів' && a > 0 ? '+' + a : a, k && a ? tp(m.home, plainName(m.homeName), k) : null)}</b><span class="cm-b l"><i style="width:${Math.max(0, va) / mx * 100}%"></i></span><span class="cm-l">${lab}</span><span class="cm-b r"><i style="width:${Math.max(0, vb) / mx * 100}%"></i></span><b class="r">${popv(lab === 'Різниця м’ячів' && b > 0 ? '+' + b : b, k && b ? tp(m.away, plainName(m.awayName), k) : null)}</b></div>`;
        }).join('')}</div>`;
      // кільця: зовнішнє — господарі, внутрішнє — гості
      const arc = (r, p, col, w) => { const c = 2 * Math.PI * r; return `<circle cx="66" cy="66" r="${r}" fill="none" stroke="var(--line-soft)" stroke-width="${w}"/><circle cx="66" cy="66" r="${r}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 66 66)"/>`; };
      const q = (n, d) => (d ? n / d : 0);
      const rings = [['Очки від можливих', q(rA.pts, rA.p * 3), q(rB.pts, rB.p * 3)], ['Матчі з перемогою', q(rA.w, rA.p), q(rB.w, rB.p)], ['Матчі без поразки', q(rA.w + rA.d, rA.p), q(rB.w + rB.d, rB.p)], ['Матчі «на нуль»', q(cs(m.home), rA.p), q(cs(m.away), rB.p)]];
      out += `<div class="rings">${rings.map(([t, a, b]) => `<div class="ring"><svg viewBox="0 0 132 132" role="img" aria-label="${esc(t)}: ${esc(plainName(m.homeName))} ${Math.round(a * 100)}%, ${esc(plainName(m.awayName))} ${Math.round(b * 100)}%">${arc(58, a, 'var(--accent)', 9)}${arc(44, b, 'var(--lg-media)', 7)}<text x="66" y="66" text-anchor="middle" class="rg-a">${Math.round(a * 100)}%</text><text x="66" y="86" text-anchor="middle" class="rg-b">${Math.round(b * 100)}%</text></svg><span class="t">${esc(t)}</span></div>`).join('')}<div class="ring-key"><span><i style="background:var(--accent)"></i>${nameHtml(m.homeName)}</span><span><i style="background:var(--lg-media)"></i>${nameHtml(m.awayName)}</span></div></div>`;
    }

    // 2. форма: 5 останніх матчів кожної команди до цього, у будь-якому турнірі
    const form = (t, nm) => {
      const list = t.matches.filter(x => x.date < m.date && Core.tableScore(x)).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-5);
      if (!list.length) return '';
      const mx = Math.max(1, ...list.map(x => { const p = persp(x, new Set([t])); return Math.max(p.f, p.a); }));
      return `<div class="frm"><div class="frm-h">${crest(t, 'md')}<span>${nameHtml(nm)}<small>Форма · ${list.length} ${plural(list.length, 'матч', 'матчі', 'матчів')} до цього</small></span></div>
        <div class="frm-c">${list.map(x => { const p = persp(x, new Set([t])); const o = x.home === t ? x.awayName : x.homeName; return `<a class="fc ${p.res}" href="#m-${x.id}" title="${esc(shortDate(x.date) + ' · ' + x.tour.name)}"><b>${p.tech ? 'тех.' : p.f + ':' + p.a}</b><small>${esc(plainName(o))}</small></a>`; }).join('')}</div>
        <div class="frm-g">${list.map(x => { const p = persp(x, new Set([t])); return `<div class="g"><span class="u" style="height:${p.f / mx * 100}%"></span><span class="d" style="height:${p.a / mx * 100}%"></span></div>`; }).join('')}</div><div class="frm-k"><span>▲ забиті</span><span>▼ пропущені</span></div></div>`;
    };
    const fA = form(m.home, m.homeName), fB = form(m.away, m.awayName);
    if (fA || fB) out += `<div class="frms">${fA}${fB}</div>`;

    // 3. очні зустрічі: підсумок
    let w = 0, d = 0, l = 0, gf = 0, ga = 0, n = 0;
    for (const x of meets) { const p = persp(x, A); if (!p) continue; n++; if (p.res === 'W') w++; else if (p.res === 'D') d++; else l++; if (!p.tech) { gf += p.f; ga += p.a; } }
    const mp = (k, title) => () => ({ title: nA + ' — ' + nB + ' · ' + title, items: meets.filter(x => { const p = persp(x, A); return p && (k === 'all' || p.res === k); }).map(x => ({ m: x })) });
    if (n > 1 || (n === 1 && meets[0] !== m)) {
      const played = meets.filter(x => Core.tableScore(x) && !x.tech);
      out += `<div class="h2h"><div class="h2h-t">${crest(m.home, 'xl')}<span>${esc(nA)}</span></div>
        <div class="h2h-m"><div class="h2h-big"><b class="w">${popv(w, w ? mp('W', 'перемоги ' + nA) : null)}</b><i>–</i><b>${popv(d, d ? mp('D', 'нічиї') : null)}</b><i>–</i><b class="l">${popv(l, l ? mp('L', 'перемоги ' + nB) : null)}</b></div>
        <div class="h2h-lg"><span>Перемоги ${esc(nA)}</span><span>Нічиї</span><span>Перемоги ${esc(nB)}</span></div>
        <div class="h2h-ag">${popv(n, mp('all', 'усі очні зустрічі'))} ${plural(n, 'матч', 'матчі', 'матчів')} · м’ячі <b>${gf}:${ga}</b>${played.length ? ` · у середньому ${dec(gf / played.length, 1)} : ${dec(ga / played.length, 1)}` : ''}</div></div>
        <div class="h2h-t r">${crest(m.away, 'xl')}<span>${esc(nB)}</span></div></div>`;
      // рекорди очних зустрічей
      const big = s => played.filter(x => persp(x, s).res === 'W').sort((a, b) => { const pa = persp(a, s), pb = persp(b, s); return (pb.f - pb.a) - (pa.f - pa.a) || pb.f - pa.f; })[0];
      const most = played.slice().sort((a, b) => (b.score[0] + b.score[1]) - (a.score[0] + a.score[1]))[0];
      const bA = big(A), bB = big(B);
      const rec = (lab, x) => (x ? `<a class="h2r" href="#m-${x.id}"><span>${lab}</span><b>${nameHtml(x.homeName)} ${esc(Core.scoreText(x))} ${nameHtml(x.awayName)}</b><small>${shortDate(x.date)} · ${esc(x.tour.name)}</small></a>` : '');
      // бомбардири очних зустрічей
      const sc = new Map();
      for (const x of meets) for (const g of x.goals) if (!g.og && g.p) { const r = sc.get(g.p) || { p: g.p, n: 0, side: A.has(g.side === 'h' ? x.home : x.away) ? 'a' : 'b' }; r.n++; sc.set(g.p, r); }
      const top = [...sc.values()].sort((a, b) => b.n - a.n).slice(0, 8);
      const mxs = top.length ? top[0].n : 1;
      const card = x => {
          const goals = x.goals.filter(g => !g.og && g.p); const per = new Map(); for (const g of goals) per.set(g.p, (per.get(g.p) || 0) + 1);
          const cur = x === m;
          return `<a class="mt${cur ? ' cur' : ''}${x === most ? ' top' : ''}" href="#m-${x.id}"><span class="mt-i"><b>${fmtDate(x.date)}${cur ? '<em>цей матч</em>' : x === most ? '<em>найрезультативніша</em>' : ''}</b><small>${esc(x.tour.name)}${x.stage ? ' · ' + esc(x.stage) : ''} · ${esc(x.season.label)}</small>${per.size ? `<small>Голи: ${[...per].map(([p, k]) => esc(p.name) + (k > 1 ? ' ' + k : '')).join(', ')}</small>` : ''}</span>
            <span class="mt-s"><span class="h">${nameHtml(x.homeName)}${crest(x.home)}</span><b>${esc(Core.scoreText(x))}</b><span>${crest(x.away)}${nameHtml(x.awayName)}</span></span>${videos.matches[x.id] ? '<span class="mt-v">▶ відео</span>' : ''}</a>`;
      };
      // останні 8 зустрічей одразу, решта — під кнопкою
      const rev = meets.slice().reverse();
      out += `<div class="h2h-g"><div class="h2h-list">${rev.slice(0, 8).map(card).join('')}${rev.length > 8 ? `<details class="more"><summary>Ще ${rev.length - 8} ${plural(rev.length - 8, 'зустріч', 'зустрічі', 'зустрічей')}</summary><div class="h2h-list">${rev.slice(8).map(card).join('')}</div></details>` : ''}</div>
        <div class="h2h-side">${rec('Найбільша перемога ' + nA, bA)}${rec('Найбільша перемога ' + nB, bB)}${rec('Найрезультативніша зустріч', most)}
        ${top.length ? `<div class="pnl"><div class="pnl-h"><h3>Бомбардири очних зустрічей</h3></div><div class="pad">${top.map((r, i) => `<div class="rk ${r.side}"><span class="i">${i + 1}</span><span class="p">${playerLink(r.p)}</span><span class="b"><i style="width:${r.n / mxs * 100}%"></i></span><b>${popv(r.n, () => ({ title: r.p.name + ' · голи в очних зустрічах', items: groupByMatch(r.p.goals.filter(g => meets.includes(g.m) && !g.e.og), xs => goalsNote(xs.length)) }))}</b></div>`).join('')}<div class="rk-key"><span><i class="a"></i>${esc(nA)}</span><span><i class="b"></i>${esc(nB)}</span></div></div></div>` : ''}</div></div>`;
    }
    if (meets.length > 1) out += h2hExtra(meets, A, B, nA, nB, persp, h2hFive(meets, A, B));
    if (!out) return '';
    return `<section class="block"><div class="sec-head"><h2 class="sec">Порівняння та очні зустрічі</h2><span class="note">${n} ${plural(n, 'очна зустріч', 'очні зустрічі', 'очних зустрічей')} за всю історію</span></div>${out}</section>`;
  }

  /* ---------- повідомлення про неточність ---------- */
  const REPORT_TO = 'jia.ukraine@gmail.com';
  function openReport() {
    track('report_open', { page_title: document.title });
    const page = (document.querySelector('#app h1') || {}).textContent || 'Головна';
    const el = openModal('Повідомити про неточність', 'Лист піде на ' + REPORT_TO, `<form class="rform" id="rf" novalidate>
      <label>Сторінка<input id="rf-page" value="${esc(page.trim())}" readonly></label>
      <label>Що не так<select id="rf-kind"><option>Неправильне ім’я або прізвище</option><option>Неправильний рахунок або автор гола</option><option>Неправильний склад або команда</option><option>Два гравці злиті в одного або навпаки</option><option>Інше</option></select></label>
      <label>Як правильно<textarea id="rf-text" required placeholder="Опишіть, що виправити. Якщо це ваше ім’я — напишіть, як воно пишеться."></textarea></label>
      <label>Ваше ім’я та email для відповіді (необов’язково)<input id="rf-from" autocomplete="email"></label>
      <div class="act"><button type="submit" class="btn pri">Надіслати</button><span class="note" id="rf-msg"></span></div>
    </form>`);
    el.querySelector('#rf').addEventListener('submit', e => {
      e.preventDefault();
      const text = el.querySelector('#rf-text').value.trim();
      const msg = el.querySelector('#rf-msg');
      if (!text) { msg.textContent = 'Напишіть, що саме виправити.'; el.querySelector('#rf-text').focus(); return; }
      const body = `Сторінка: ${el.querySelector('#rf-page').value}\nПосилання: ${location.href}\nЩо не так: ${el.querySelector('#rf-kind').value}\n\n${text}\n\nВід: ${el.querySelector('#rf-from').value.trim() || 'не вказано'}`;
      location.href = `mailto:${REPORT_TO}?subject=${encodeURIComponent('Неточність на media-soccer.org: ' + el.querySelector('#rf-page').value)}&body=${encodeURIComponent(body)}`;
      el.querySelector('.modal-b').innerHTML = `<p>Має відкритися ваша поштова програма з готовим листом — залишиться натиснути «Надіслати».</p><p class="note">Якщо поштова програма не відкрилася, скопіюйте текст і надішліть його на адресу:</p><div class="copybox">${REPORT_TO}</div><div class="copybox" style="white-space:pre-wrap">${esc(body)}</div>`;
    });
  }
  const reportBtn = () => '<p><button type="button" class="report-btn" data-report="1">Повідомити про неточність</button></p>';

  /* ---------- клуб: усі склади на одній сторінці ---------- */
  const clubName = t => (t.club ? t.club : plainName(t.name));
  function squadsOf(t) {
    if (!t.club) return [t];
    return [...db.teams.values()].filter(x => x.club === t.club && (x.matches.length || x.finishes.length || x.trophies.length))
      .sort((a, b) => (b.name === t.club) - (a.name === t.club) || b.matches.length - a.matches.length);
  }
  const clubHome = t => squadsOf(t)[0] || t;
  const CAT = t => (t.format === 'league' || ['chemp', 'media', 'brand'].includes(t.id) ? 'league' : t.id === 'cup' ? 'cup' : 'other');
  const lgChip = t => `<span class="lg-chip ${t.id === 'media' ? 'media' : t.id === 'brand' ? 'brand' : CAT(t) === 'league' ? 'chemp' : 'cup'}">${esc(t.name)}</span>`;
  const range = list => (list.length ? esc(list[0]) + (list.length > 1 ? '–' + esc(list[list.length - 1]) : '') : '');
  const clubTabs = new Map();
  function pageTeam(id) {
    const focus = db.teams.get(id);
    if (!focus) return notFound();
    const sq = squadsOf(focus);
    if (!sq.includes(focus)) sq.push(focus);
    const S = new Set(sq);
    const name = clubName(focus);
    const multi = sq.length > 1;
    const sorder = (a, b) => Core.seasonOrder(a) - Core.seasonOrder(b);
    const seasons = [...new Set(sq.flatMap(t => t.seasons))].sort(sorder);
    const matches = [...new Set(sq.flatMap(t => t.matches))].sort((a, b) => (a.date < b.date ? -1 : 1));
    const tot = sq.reduce((o, t) => { for (const k of ['p', 'w', 'd', 'l', 'gf', 'ga']) o[k] += t.totals[k] || 0; return o; }, { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 });
    const trophies = sq.flatMap(t => t.trophies.map(x => ({ ...x, squad: t }))).sort((a, b) => Core.seasonOrder(b.t.season.label) - Core.seasonOrder(a.t.season.label) || a.place - b.place);
    const golds = trophies.filter(x => x.place === 1);
    const fin = sq.flatMap(t => t.finishes.map(f => ({ ...f, squad: t }))).sort((a, b) => Core.seasonOrder(b.t.season.label) - Core.seasonOrder(a.t.season.label));
    const tp = (k, extra, label) => () => ({ title: (label || name) + ' · ' + TK[k], items: teamItems(sq, k, null, extra) });

    const catPanel = c => {
      const f = fin.filter(x => CAT(x.t) === c);
      const tr = trophies.filter(x => CAT(x.t) === c);
      const ms = matches.filter(m => CAT(m.tour) === c);
      if (!f.length && !tr.length && !ms.length) return null;
      const bySeason = new Map();
      for (const m of ms) { if (!bySeason.has(m.season.label)) bySeason.set(m.season.label, []); bySeason.get(m.season.label).push(m); }
      const rowPop = (x, k) => (x.t.final ? null : () => ({ title: name + ' · ' + x.t.name + ' ' + x.t.season.label + ' · ' + TK[k], items: teamItems(x.squad, k, null, m => m.tour === x.t) }));
      return `${tr.length ? `<div class="chips">${tr.map(x => `<span class="chip"><span class="medal m${x.place}">${x.place === 1 ? 'Перемога' : x.place + ' місце'}</span> · ${esc(x.t.season.label)} · ${esc(x.t.name)}${x.name && (SQUAD.test(x.name) || plainName(x.name) !== name) ? ' · ' + nameHtml(x.name) : ''}</span>`).join('')}</div>` : ''}
        ${f.length ? `<div class="tw"><table><thead><tr><th>Сезон</th><th>Турнір</th><th class="n">Місце</th><th class="n">І</th><th class="n hide-s">В–Н–П</th><th class="n">М’ячі</th><th class="n">О</th></tr></thead><tbody>${f.map(x => `<tr><td>${seasonLink(x.t.season)}</td><td><a href="${tourHref(x.t)}">${c === 'league' ? lgChip(x.t) : esc(x.t.name)}</a>${x.div ? ` <span class="muted">· ${esc(x.div)}</span>` : ''}${SQUAD.test(x.row.name) || plainName(x.row.name) !== name ? ` <span class="muted">${nameHtml(x.row.name)}</span>` : ''}</td><td class="n"><span class="pos${x.complete && x.t.format === 'league' ? medalCls(x.pos) : ''}">${x.pos}</span><span class="muted"> з ${x.n}</span></td><td class="n">${popv(x.row.p, rowPop(x, 'p'))}</td><td class="n hide-s">${popv(x.row.w, x.row.w ? rowPop(x, 'w') : null)}–${popv(x.row.d, x.row.d ? rowPop(x, 'd') : null)}–${popv(x.row.l, x.row.l ? rowPop(x, 'l') : null)}</td><td class="n">${x.row.gf}–${x.row.ga}</td><td class="n pts">${x.row.pts}</td></tr>`).join('')}</tbody></table></div>
        ${c !== 'league' ? '<p class="note">Місця в групових етапах кубків показано без медалей.</p>' : ''}` : ''}
        ${bySeason.size ? `<div class="mlist">${[...bySeason.entries()].reverse().map(([lbl, list]) => `<details class="round"><summary>Матчі ${esc(lbl)} <span>${list.length} ${plural(list.length, 'матч', 'матчі', 'матчів')}</span></summary>${list.map(m => matchRow(m, { ctx: stageCtx(m) })).join('')}</details>`).join('')}</div>` : ''}`;
    };
    // гравці клубу
    const own = m => (g => S.has(g.side === 'h' ? m.home : m.away));
    const sc = Core.scorers(matches.map(m => ({ ...m, goals: m.goals.filter(own(m)) })), 20);
    const appMap = new Map();
    for (const m of matches) for (const side of ['h', 'a']) if (S.has(side === 'h' ? m.home : m.away)) for (const x of m.lineups[side]) appMap.set(x.p, (appMap.get(x.p) || 0) + 1);
    const apps = [...appMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    const clubGoals = p => () => ({ title: p.name + ' · голи за ' + name, items: groupByMatch(p.goals.filter(g => S.has(g.e.side === 'h' ? g.m.home : g.m.away)), xs => goalsNote(xs.length)) });
    const clubApps = p => () => ({ title: p.name + ' · матчі за ' + name, items: p.apps.filter(a => S.has(a.side === 'h' ? a.m.home : a.m.away)).map(a => ({ m: a.m })) });
    const players = (sc.length || apps.length) ? `<div class="grid2"><div class="block"><h2 class="sec">Бомбардири клубу</h2><div class="tw"><table><thead><tr><th class="n">#</th><th>Гравець</th><th class="n">Голи</th></tr></thead><tbody>${sc.map((r, i) => `<tr><td class="n muted">${i + 1}</td><td>${playerLink(r.p)}</td><td class="n pts">${popv(r.goals, clubGoals(r.p))}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="block"><h2 class="sec">Найбільше матчів</h2><div class="tw"><table><thead><tr><th class="n">#</th><th>Гравець</th><th class="n">Матчі</th></tr></thead><tbody>${apps.map(([p, n], i) => `<tr><td class="n muted">${i + 1}</td><td>${playerLink(p)}</td><td class="n pts">${popv(n, clubApps(p))}</td></tr>`).join('')}</tbody></table></div></div></div><p class="note">За протоколами з 2010/11. Натисніть на число, щоб побачити матчі.</p>` : null;
    // суперники
    const opp = new Map();
    for (const m of matches) {
      const mine = S.has(m.home) ? 'h' : 'a', o = mine === 'h' ? m.away : m.home;
      if (S.has(o)) continue;
      const s2 = Core.tableScore(m); if (!s2) continue;
      const f = mine === 'h' ? s2.gh : s2.ga, a = mine === 'h' ? s2.ga : s2.gh;
      const key = clubHome(o).id;
      const r = opp.get(key) || { team: clubHome(o), p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, set: new Set(squadsOf(o)) };
      r.p++; r.gf += f; r.ga += a; if (s2.bothLost || f < a) r.l++; else if (f > a) r.w++; else r.d++;
      opp.set(key, r);
    }
    const opps = [...opp.values()].sort((a, b) => b.p - a.p).slice(0, 20);
    const vsPop = (r, k) => () => ({ title: name + ' — ' + clubName(r.team) + ' · ' + TK[k], items: teamItems(sq, k, null, m => r.set.has(m.home) || r.set.has(m.away)) });
    const stats = `${opps.length ? `<section class="block"><h2 class="sec">Найчастіші суперники</h2><div class="tw"><table><thead><tr><th>Суперник</th><th class="n">І</th><th class="n">В</th><th class="n">Н</th><th class="n">П</th><th class="n">М’ячі</th></tr></thead><tbody>${opps.map(r => `<tr><td>${teamLink(r.team, clubName(r.team))}</td>${['p', 'w', 'd', 'l'].map(k => `<td class="n">${popv(r[k], r[k] ? vsPop(r, k) : null)}</td>`).join('')}<td class="n">${r.gf}–${r.ga}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
      ${sq.filter(t => t.matches.length).map(t => (multi ? `<h2 class="sec">Склад ${nameHtml(t.name)}</h2>` : '') + teamStatsSection(t)).join('')}`;
    const tabs = [['league', 'Чемпіонат', catPanel('league')], ['cup', 'Кубок АЖІ', catPanel('cup')], ['other', 'Інші кубки', catPanel('other')], ['players', 'Гравці', players], ['stats', 'Статистика', matches.length ? stats : null]].filter(x => x[2]);
    const key = sq[0].id;
    const cur = tabs.some(x => x[0] === clubTabs.get(key)) ? clubTabs.get(key) : (tabs[0] || [])[0];
    // історія назв для клубу з одним складом
    const nameRuns = [];
    for (const lbl of focus.seasons) {
      const names = [...focus.namesBySeason.get(lbl)].join(' / ');
      const l = nameRuns[nameRuns.length - 1];
      if (l && l.names === names) l.to = lbl; else nameRuns.push({ names, from: lbl, to: lbl });
    }
    const squadsHtml = multi
      ? `<div class="squads">${sq.map(t => `<a class="squad${t === focus ? ' on' : ''}" href="#t-${t.id}">${nameHtml(t.name)} · ${range(t.seasons)}${t.names.length > 1 ? ' · ' + esc(t.names.filter(n => n !== t.name).map(plainName).join(', ')) : ''}</a>`).join('')}</div><p class="note">Клуб виступав кількома складами: М — у Медіа-лізі, Б — у Бренд-лізі. Нижче — усі склади разом, у таблицях видно, де грав кожен.</p>`
      : (nameRuns.length > 1 ? `<div class="chips">${nameRuns.map(r => `<span class="chip">${esc(r.names)} · ${esc(r.from)}${r.to !== r.from ? '–' + esc(r.to) : ''}</span>`).join('')}</div>` : '');
    return `<div class="page">
      <div class="block">
        <div class="club-head">
          ${crest(focus, 'xxl')}
          <div style="display:grid;gap:4px"><div class="eyebrow">Клуб</div><h1 class="title">${esc(name)}</h1>${seasons.length ? `<span class="muted">Сезони ${range(seasons)}</span>` : ''}</div>
          <div class="facts">
            <div class="fact"><b>${seasons.length}</b><span>${plural(seasons.length, 'сезон', 'сезони', 'сезонів')}</span></div>
            <div class="fact"><b>${popv(tot.p, tot.p ? tp('p') : null)}</b><span>матчів у протоколах</span></div>
            <div class="fact"><b>${popv(tot.w, tot.w ? tp('w') : null)}–${popv(tot.d, tot.d ? tp('d') : null)}–${popv(tot.l, tot.l ? tp('l') : null)}</b><span>перемоги, нічиї, поразки</span></div>
            <div class="fact"><b>${tot.gf}–${tot.ga}</b><span>м’ячі</span></div>
            <div class="fact"><b>${golds.length}</b><span>${plural(golds.length, 'титул', 'титули', 'титулів')}</span></div>
          </div>
        </div>
        ${squadsHtml}
      </div>
      ${tabs.length ? `<div class="ptabs" role="tablist" data-club="${key}">${tabs.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${k === cur}">${l}</button>`).join('')}</div>
      ${tabs.map(([k, , html]) => `<div class="tabpanel" data-panel="${k}"${k === cur ? '' : ' hidden'}>${html}</div>`).join('')}` : '<div class="callout">Протоколів матчів цього клубу в архіві немає.</div>'}
      ${reportBtn()}
    </div>`;
  }
  function bindTabs() {
    const bar = app.querySelector('.ptabs'); if (!bar) return;
    bar.addEventListener('click', e => {
      const b = e.target.closest('[data-tab]'); if (!b) return;
      clubTabs.set(bar.dataset.club, b.dataset.tab);
      bar.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
      app.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== b.dataset.tab; });
      Charts.hideTip(); chartMounts.forEach(f => f());
    });
  }

  // два головні клуби гравця (склади одного клубу не повторюємо)
  function clubsOf(teams) {
    const seen = new Map();
    for (const t of [...teams.values()].sort((a, b) => b.apps - a.apps)) { const h = clubHome(t.team); if (!seen.has(h.id)) seen.set(h.id, { team: h, name: t.team.club ? clubName(t.team) : plainName([...t.names][0]) }); }
    return [...seen.values()].slice(0, 2);
  }
  function mainTeams(p) { return clubsOf(p.teams).map(c => teamLink(c.team, c.name)).join(', '); }
  function playerTable(list, val, label, k) {
    return `<div class="tw"><table><thead><tr><th class="n">#</th><th>Гравець</th><th class="hide-s">Команди</th><th class="n">${label}</th></tr></thead><tbody>${list.map((p, i) => `<tr><td class="n muted">${i + 1}</td><td>${playerLink(p)}</td><td class="hide-s muted">${mainTeams(p)}</td><td class="n pts">${k ? popv(val(p), ppop(p, k)) : val(p)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  /* ---------- сезон ---------- */
  function pageSeason(id, tid) {
    const s = db.seasons.find(x => x.id === id);
    if (!s) return notFound();
    const i = db.seasons.indexOf(s);
    const prev = db.seasons[i - 1], next = db.seasons[i + 1];
    const t = s.tournaments.find(x => x.id === tid) || s.tournaments[0];
    const tabs = s.tournaments.length > 1 ? `<div class="tabs" role="tablist">${s.tournaments.map(x => `<button role="tab" aria-selected="${x === t}" data-href="#s-${s.id}-${x.id}">${esc(x.name)}</button>`).join('')}</div>` : '';
    return `<div class="page">
      <div class="block">
        <div class="season-nav">${prev ? `<a href="#s-${prev.id}">← ${esc(prev.label)}</a>` : ''}<span class="eyebrow">Сезон</span>${next ? `<a href="#s-${next.id}">${esc(next.label)} →</a>` : ''}</div>
        <h1 class="title">Сезон ${esc(s.label)}</h1>
        ${tabs}
      </div>
      ${tournamentBody(t)}
      ${reviewsBlock(s)}
      <p class="note">Джерело: ${esc(s.source)}.</p>
    </div>`;
  }
  function tableHtml(tb, opts = {}) {
    const showMedals = tb.complete && (opts.league || tb.archive);
    const cols = tb.archive ? '' : '<th class="hide-s">Форма</th>';
    return `<div class="tw"><table class="st"><thead><tr><th class="n">#</th><th>Команда</th><th class="n">І</th><th class="n">В</th><th class="n">Н</th><th class="n">П</th><th class="n">М’ячі</th><th class="n hide-s">Різн.</th><th class="n">О</th>${cols}</tr></thead><tbody>${tb.rows.map(r => `<tr class="${showMedals && r.pos <= 3 ? 'z' + r.pos : ''}">
      <td class="n"><span class="pos">${r.pos}</span></td>
      <td class="team">${crestLink(r.team, r.name)}</td>
      ${['p', 'w', 'd', 'l'].map(k => `<td class="n">${!tb.archive && tb.matches && r[k] ? popv(r[k], tpop(r.team, k, tb.matches, plainName(r.name))) : r[k]}</td>`).join('')}
      <td class="n">${r.gf}–${r.ga}</td><td class="n hide-s">${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td>
      <td class="n pts">${r.pts}</td>${tb.archive ? '' : `<td class="hide-s"><span class="form">${r.form.slice(-5).map(f => `<i class="${f}" title="${f === 'W' ? 'перемога' : f === 'D' ? 'нічия' : 'поразка'}">${f === 'W' ? 'В' : f === 'D' ? 'Н' : 'П'}</i>`).join('')}</span></td>`}</tr>`).join('')}</tbody></table></div>${showMedals ? '<div class="zlegend"><span><i class="z1"></i>чемпіон</span><span><i class="z2"></i>2 місце</span><span><i class="z3"></i>3 місце</span></div>' : ''}`;
  }
  /* --- сітка плей-офф --- */
  // cols: раунди від першого до фіналу; пари вишиковуємо від фіналу назад за командами, що пройшли далі
  function orderBracket(cols) {
    for (let k = cols.length - 2; k >= 0; k--) {
      const next = cols[k + 1], cur = cols[k].slice(), ordered = [];
      for (const m of next) for (const t of [m.home, m.away]) { const i = cur.findIndex(x => x.home === t || x.away === t); if (i >= 0) ordered.push(cur.splice(i, 1)[0]); }
      cols[k] = ordered.concat(cur);
    }
    // зверху в картці — команда з верхнього матчу попереднього раунду
    return cols.map((col, k) => col.map((m, j) => {
      if (!k) return { m, flip: false };
      const up = cols[k - 1][j * 2];
      return { m, flip: !!up && (up.home === m.away || up.away === m.away) && !(up.home === m.home || up.away === m.home) };
    }));
  }
  function bkCard(x, label) {
    const m = x.m, w = Core.winnerSide(m);
    const sc = Core.scoreText(m).split(':');
    const sides = [['h', m.home, m.homeName, sc[0], m.pens && m.pens[0]], ['a', m.away, m.awayName, sc[1], m.pens && m.pens[1]]];
    if (x.flip) sides.reverse();
    return `<a class="bk-m" href="#m-${m.id}">${label ? `<span class="bk-l">${esc(label)}</span>` : ''}${sides.map(([s, t, n, g, p]) => `<span class="bk-t${w === s ? ' w' : ''}">${crest(t)}<span class="bk-n">${nameHtml(n)}</span><b>${esc(g)}${p != null ? `<small>(${p})</small>` : ''}</b></span>`).join('')}<span class="bk-d">${shortDate(m.date)}${videos.matches[m.id] ? ' · ▶' : ''}</span></a>`;
  }
  function bracketHtml(titles, cols, extra) {
    const ord = orderBracket(cols);
    return `<div class="bk-scroll"><div class="bk${extra && extra.length ? ' has-extra' : ''}" style="--cols:${ord.length}">${ord.map((col, k) => `<div class="bk-col"><div class="bk-h">${esc(titles[k])}</div><div class="bk-body">${k < ord.length - 1
      ? Array.from({ length: Math.ceil(col.length / 2) }, (_, i) => `<div class="bk-pair">${col.slice(i * 2, i * 2 + 2).map(x => `<div class="bk-slot">${bkCard(x)}</div>`).join('')}</div>`).join('')
      : col.map(x => `<div class="bk-fin"><div class="bk-slot last">${bkCard(x)}${extra && extra.length ? `<div class="bk-extra">${extra.map(([l, m]) => bkCard({ m }, l)).join('')}</div>` : ''}</div></div>`).join('')}</div></div>`).join('')}</div></div>`;
  }
  function playoffHtml(list) {
    const by = st => list.filter(m => m.stage === st);
    const main = [['1/4 фіналу', by('1/4 фіналу')], ['1/2 фіналу', by('1/2 фіналу')], ['Фінал', by('Фінал')]].filter(x => x[1].length);
    const third = list.filter(m => /^За 3/.test(m.stage || ''));
    const used = new Set([...main.flatMap(x => x[1]), ...third]);
    let html = '';
    if (main.length) html += bracketHtml(main.map(x => x[0]), main.map(x => x[1].slice()), third.map(m => ['Матч за 3-тє місце', m]));
    // утішна сітка: за 5–8 місця → за 5–6 і за 7–8
    const semi58 = by('За 5–8 місця'), f56 = by('За 5–6 місця'), f78 = by('За 7–8 місця');
    if (semi58.length && f56.length) {
      html += `<h3 class="sub bk-sub">Матчі за 5–8 місця</h3>` + bracketHtml(['За 5–8 місця', 'За 5–6 місця'], [semi58.slice(), f56.slice()], f78.map(m => ['За 7–8 місця', m]));
      [...semi58, ...f56, ...f78].forEach(m => used.add(m));
    }
    const rest = list.filter(m => !used.has(m)).sort((a, b) => STAGE_ORDER(a.stage) - STAGE_ORDER(b.stage));
    if (rest.length) html += `<h3 class="sub bk-sub">Інші матчі плей-офф</h3><div class="mlist">${rest.map(m => matchRow(m, { ctx: esc(m.stage || '') })).join('')}</div>`;
    return `<section class="block"><h2 class="sec">Плей-офф</h2>${html}</section>`;
  }
  const STAGE_ORDER = s => {
    if (!s) return 99;
    if (/^\d+ тур$/.test(s)) return parseInt(s, 10);
    if (s === '1/4 фіналу') return 101; if (s === '1/2 фіналу') return 102;
    if (/^За [5-9]/.test(s)) return 103; if (/^За 3/.test(s)) return 104; if (s === 'Фінал') return 105;
    return 100;
  };
  function tournamentBody(t) {
    const v = db.views.get(t.key);
    let out = '';
    const status = t.final ? '' : (v.complete ? '<span class="status done">Завершено</span>' : (v.status === 'unknown' ? '<span class="status">Статус уточнюється</span>' : '<span class="status">Не завершено за даними блогу</span>'));
    out += `<div class="sec-head"><h2 class="sec">${esc(t.name)}</h2>${status}</div>`;
    if (v.note) out += `<div class="callout">${esc(v.note)}</div>`;
    if (v.winner) {
      out += `<div class="winner"><span class="lbl">${t.format === 'league' ? 'Чемпіон' : 'Переможець'}</span>${teamLink(v.winner, v.winnerName)}<span class="rest">${v.runnerUp ? '2. ' + teamLink(v.runnerUp, v.runnerUpName) : ''}${v.third ? ' · 3. ' + teamLink(v.third, v.thirdName) : ''}</span></div>`;
    } else if (t.format === 'league' && v.tables.length > 1 && v.divWinners.some(d => d.team)) {
      out += `<div class="winner"><span class="lbl">Чемпіони</span>${v.divWinners.filter(d => d.team).map(d => `<span class="rest">${esc(d.div)}:</span> ${teamLink(d.team, d.name)}`).join(' ')}</div>`;
    }
    if (t.final) {
      out += '<div class="callout">Протоколів матчів цього сезону поки немає в архіві. Показано підсумкову таблицю та бомбардирів зі сторінки «Минулі турніри» старого блогу.</div>';
    }
    const tables = v.tables.map(tb => `<div class="block">${tb.div ? `<h3 class="sub">${esc(tb.div)}</h3>` : ''}${tableHtml(tb, { league: t.format === 'league' })}</div>`).join('');
    if (tables) out += `<section class="${v.tables.length > 1 && t.format === 'cup' ? 'grid2' : 'block'}">${tables}</section>`;
    if (v.playoff && v.playoff.length) out += playoffHtml(v.playoff);
    if (t.final) {
      const sc = t.final.scorers;
      if (sc.length) {
        const divs = [...new Set(sc.map(x => x.div || null))];
        out += `<section class="block"><h2 class="sec">Бомбардири</h2><div class="${divs.length > 1 ? 'grid2' : 'block'}">${divs.map(d => `<div class="block">${d ? `<h3 class="sub">${esc(d)}</h3>` : ''}<div class="tw"><table><thead><tr><th>Гравець</th><th>Команда</th><th class="n">Голи</th><th class="n">З пен.</th></tr></thead><tbody>${sc.filter(x => (x.div || null) === d).map(x => `<tr><td>${playerLink(x.player, x.name)}</td><td>${teamLink(x.teamObj, x.team)}</td><td class="n pts">${x.goals}</td><td class="n muted">${x.pens || ''}</td></tr>`).join('')}</tbody></table></div></div>`).join('')}</div></section>`;
      }
      return out;
    }
    // туры (групповые)
    const roundStages = v.rounds.filter(r => Core.isRoundStage(r.stage)).sort((a, b) => STAGE_ORDER(a.stage) - STAGE_ORDER(b.stage));
    if (roundStages.length) {
      out += `<section class="block"><div class="sec-head"><h2 class="sec">${v.playoff && v.playoff.length ? 'Груповий етап · матчі за турами' : 'Матчі за турами'}</h2><span class="note">${roundStages.length} ${plural(roundStages.length, 'тур', 'тури', 'турів')}</span></div><div class="mlist">${roundStages.map((r, k) => `<details class="round"><summary>${esc(r.stage)} <span>${fmtDate(r.ms[0].date)}</span></summary>${r.ms.map(m => matchRow(m, { ctx: m.div && v.tables.length > 1 ? esc(m.div) : '' })).join('')}</details>`).join('')}</div></section>`;
    }
    const sc = Core.scorers(t.matches, 20);
    if (sc.length) {
      out += `<section class="grid2"><div class="block"><h2 class="sec">Бомбардири</h2><div class="tw"><table><thead><tr><th class="n">#</th><th>Гравець</th><th>Команда</th><th class="n">Голи</th><th class="n hide-s">З пен.</th></tr></thead><tbody>${sc.map((r, i) => `<tr><td class="n muted">${i + 1}</td><td>${playerLink(r.p)}</td><td>${[...r.teams.values()].map(x => teamLink(x.team, x.name)).join(', ')}</td><td class="n pts">${popv(r.goals, ppop(r.p, 'goals', t.matches))}</td><td class="n muted hide-s">${r.pens ? popv(r.pens, ppop(r.p, 'pen', t.matches)) : ''}</td></tr>`).join('')}</tbody></table></div></div>${disciplineBlock(t.matches)}</section>`;
    }
    out += tournamentStats(t, v);
    return out;
  }
  function disciplineBlock(matches) {
    const map = new Map();
    for (const m of matches) {
      for (const c of m.yc) { const r = map.get(c.p.id) || { p: c.p, y: 0, r: 0, team: c.side ? (c.side === 'h' ? [m.home, m.homeName] : [m.away, m.awayName]) : null }; r.y++; map.set(c.p.id, r); }
      for (const c of m.rc) { const r = map.get(c.p.id) || { p: c.p, y: 0, r: 0, team: c.side ? (c.side === 'h' ? [m.home, m.homeName] : [m.away, m.awayName]) : null }; r.r++; map.set(c.p.id, r); }
    }
    const list = [...map.values()].sort((a, b) => (b.r * 5 + b.y) - (a.r * 5 + a.y)).slice(0, 12);
    if (!list.length) return '<div></div>';
    return `<div class="block"><h2 class="sec">Картки</h2><div class="tw"><table><thead><tr><th>Гравець</th><th class="hide-s">Команда</th><th class="n"><span class="card y" title="Попередження"></span></th><th class="n"><span class="card r" title="Вилучення"></span></th></tr></thead><tbody>${list.map(r => `<tr><td>${playerLink(r.p)}</td><td class="hide-s">${r.team ? teamLink(r.team[0], r.team[1]) : ''}</td><td class="n">${r.y || ''}</td><td class="n">${r.r || ''}</td></tr>`).join('')}</tbody></table></div><p class="note">Штрафні очки за регламентом: вилучення — 5, попередження — 1.</p></div>`;
  }

  /* ---------- матч ---------- */
  function pageMatch(id) {
    const m = db.matches.find(x => x.id === id);
    if (!m) return notFound();
    const sideName = s => s === 'h' ? m.homeName : m.awayName;
    const marks = (p, side) => {
      const gs = m.goals.filter(g => g.p === p && !g.og).length;
      const y = m.yc.filter(c => c.p === p).length, r = m.rc.filter(c => c.p === p).length;
      return `<span class="marks">${gs ? `<span class="ball" title="Голи">${gs > 1 ? gs : '•'}</span>` : ''}${'<span class="card y" title="Попередження"></span>'.repeat(y)}${'<span class="card r" title="Вилучення"></span>'.repeat(r)}</span>`;
    };
    const lineup = side => {
      const list = m.lineups[side];
      const team = side === 'h' ? m.home : m.away;
      return `<div class="lineup"><h3>${teamLink(team, sideName(side))}</h3>${list.length ? list.map(x => `<div class="pl"><span class="no">${x.no != null ? x.no : ''}</span><span>${playerLink(x.p, x.name)}</span>${marks(x.p, side)}</div>`).join('') : '<div class="pl"><span></span><span class="muted">Склад не опубліковано</span><span></span></div>'}</div>`;
    };
    const STAT_L = { shots: 'Удари', on_target: 'Удари в створ', woodwork: 'Штанги й поперечини', corners: 'Кутові', fouls: 'Фоли' };
    const stats = m.stats ? `<section class="block"><h2 class="sec">Статистика</h2><div class="stats">${Object.entries(m.stats).map(([k, [h, a]]) => { const t = h + a || 1; return `<div class="stat"><span class="lbl">${STAT_L[k] || k}</span><span class="v">${h}</span><div class="bar"><i class="h" style="width:${(h / t) * 100}%"></i><i class="a" style="width:${(a / t) * 100}%"></i></div><span class="v r">${a}</span></div>`; }).join('')}</div></section>` : '';
    const sub = [];
    if (m.pens) sub.push(`Серія пенальті ${m.pens[0]}:${m.pens[1]}`);
    if (m.tech) sub.push(Array.isArray(m.tech) ? 'Технічна поразка' : 'Технічний результат');
    const meta = [fmtDate(m.date), m.venue ? 'Харків, ' + esc(m.venue) : '', m.att ? `${m.att} ${plural(m.att, 'глядач', 'глядачі', 'глядачів')}` : '', m.ref ? 'Суддя: ' + esc(m.ref) : ''].filter(Boolean);
    return `<div class="page">
      <div class="crumbs"><a href="#s-${m.season.id}">Сезон ${esc(m.season.label)}</a><span class="sep">/</span><a href="${tourHref(m.tour)}">${esc(m.tour.name)}</a>${m.div ? `<span class="sep">/</span><span>${esc(m.div)}</span>` : ''}${m.stage ? `<span class="sep">/</span><span>${esc(m.stage)}</span>` : ''}</div>
      <h1 class="sr-only">${esc(plainName(m.homeName))} — ${esc(plainName(m.awayName))} ${esc(Core.scoreText(m))}, ${fmtDate(m.date)}</h1>
      <section class="board" aria-label="Рахунок матчу">
        <div class="board-main">
          <div class="board-team h">${teamLink(m.home, m.homeName)}${crest(m.home, 'xl')}</div>
          <div class="board-score">${esc(Core.scoreText(m))}</div>
          <div class="board-team">${crest(m.away, 'xl')}${teamLink(m.away, m.awayName)}</div>
        </div>
        ${sub.length ? `<div class="board-sub">${sub.join(' · ')}</div>` : ''}
        <div class="board-meta">${meta.map(x => `<span>${x}</span>`).join('')}</div>
      </section>
      ${videoBlock(m)}
      ${(() => { const f = matchFive(m); const e = eventsBlock(m, f); return e || (f ? `<section class="block"><div class="fives">${f}</div></section>` : ''); })()}
      ${m.shootout ? `<section class="block"><h2 class="sec">Післяматчеві пенальті</h2><div class="callout">${m.shootout.map(esc).join(' · ')}</div></section>` : ''}
      <section class="block"><h2 class="sec">Склади</h2><div class="lineups">${lineup('h')}${lineup('a')}</div>${m.mp.length ? `<p class="note">Незабиті пенальті: ${m.mp.map(x => `${playerLink(x.p, x.name)}${x.min != null ? ', ' + x.min + '′' : ''}${x.how ? ' (' + esc(HOW[x.how] || x.how) + ')' : ''}`).join('; ')}</p>` : ''}</section>
      ${stats}
      ${reportBtn()}
      ${h2hSection(m)}
    </div>`;
  }

  /* ---------- игрок ---------- */
  function pageScorerKey(p) { return p; }
  function pagePlayer(id) {
    const p = db.players.get(id);
    if (!p) return notFound();
    const spell = [...p.spellings.keys()].filter(n => n !== p.name);
    const rows = new Map();
    for (const a of p.apps) {
      const k = a.m.season.label + '|' + (a.side === 'h' ? a.m.home.id : a.m.away.id);
      const r = rows.get(k) || { season: a.m.season, team: a.side === 'h' ? a.m.home : a.m.away, names: new Set(), apps: 0, goals: 0, y: 0, r: 0 };
      r.apps++; r.names.add(a.side === 'h' ? a.m.homeName : a.m.awayName); rows.set(k, r);
    }
    for (const g of p.goals) { const team = g.e.side === 'h' ? g.m.home : g.m.away; const k = g.m.season.label + '|' + team.id; const r = rows.get(k); if (r) r.goals++; }
    for (const [kind, list] of [['y', p.yc], ['r', p.rc]]) for (const c of list) {
      const team = c.e.side ? (c.e.side === 'h' ? c.m.home : c.m.away) : null;
      const r = team && rows.get(c.m.season.label + '|' + team.id); if (r) r[kind]++;
    }
    const table = [...rows.values()].sort((a, b) => Core.seasonOrder(b.season.label) - Core.seasonOrder(a.season.label));
    const pens = p.goals.filter(g => g.e.pen).length;
    const matchesDesc = p.apps.slice().reverse();
    return `<div class="page">
      <div class="block">
        <div class="eyebrow">Гравець</div>
        <h1 class="title">${esc(p.name)}</h1>
        ${spell.length ? `<p class="muted">У протоколах також: ${spell.map(esc).join(', ')}</p>` : ''}
        <div class="facts">
          <div class="fact"><b>${p.apps.length}</b><span>${plural(p.apps.length, 'матч', 'матчі', 'матчів')}</span></div>
          <div class="fact"><b>${popv(p.goals.length, p.goals.length ? ppop(p, 'goals') : null)}</b><span>${plural(p.goals.length, 'гол', 'голи', 'голів')}${pens ? `, з них ${pens} з пен.` : ''}</span></div>
          <div class="fact"><b>${p.seasonsPlayed.size}</b><span>${plural(p.seasonsPlayed.size, 'сезон', 'сезони', 'сезонів')}</span></div>
          ${p.hatTricks ? `<div class="fact"><b>${popv(p.hatTricks, ppop(p, 'hat'))}</b><span>${plural(p.hatTricks, 'хет-трик', 'хет-трики', 'хет-триків')}</span></div>` : ''}
          ${p.archiveGoals ? `<div class="fact"><b>${p.archiveGoals}</b><span>голів у 2003–2010*</span></div>` : ''}
        </div>
        <div class="chips">${[...p.teams.values()].filter(t => t.apps).sort((a, b) => b.apps - a.apps).map(t => `<span class="chip">${teamLink(t.team, [...t.names].join(' / '))} · ${t.apps} ${plural(t.apps, 'матч', 'матчі', 'матчів')}</span>`).join('')}</div>
      </div>
      ${playerStatsSection(p)}
      ${table.length ? `<section class="block"><h2 class="sec">За сезонами</h2><div class="tw"><table><thead><tr><th>Сезон</th><th>Команда</th><th class="n">Матчі</th><th class="n">Голи</th><th class="n"><span class="card y" title="Попередження"></span></th><th class="n"><span class="card r" title="Вилучення"></span></th></tr></thead><tbody>${table.map(r => `<tr><td>${seasonLink(r.season)}</td><td>${teamLink(r.team, [...r.names].join(' / '))}</td><td class="n">${r.apps}</td><td class="n pts">${r.goals || ''}</td><td class="n">${r.y || ''}</td><td class="n">${r.r || ''}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
      ${p.archive.length ? `<section class="block"><h2 class="sec">Ранні сезони</h2><div class="tw"><table><thead><tr><th>Сезон</th><th>Команда</th><th class="n">Голи</th></tr></thead><tbody>${p.archive.slice().sort((a, b) => Core.seasonOrder(b.season.label) - Core.seasonOrder(a.season.label)).map(a => `<tr><td>${seasonLink(a.season)}</td><td>${teamLink(a.team, a.teamName)}</td><td class="n pts">${a.goals}</td></tr>`).join('')}</tbody></table></div><p class="note">* За підсумковими списками бомбардирів старого блогу: там указано лише найкращих снайперів сезону, тому ці голи рахуються окремо й не входять до загального підсумку за протоколами.</p></section>` : ''}
      ${matchesDesc.length ? `<section class="block"><h2 class="sec">Матчі</h2><div class="mlist">${groupBySeason(matchesDesc).map(([lbl, list], k) => `<details class="round"${k === 0 ? ' open' : ''}><summary>${esc(lbl)} <span>${list.length} ${plural(list.length, 'матч', 'матчі', 'матчів')}</span></summary>${list.map(a => { const g = a.m.goals.filter(x => x.p === p && !x.og).length; return matchRow(a.m, { ctx: stageCtx(a.m) + (g ? ` · голів: ${g}` : '') }); }).join('')}</details>`).join('')}</div></section>` : ''}
      <p class="note">Гравця визначено за написанням імені в протоколах. Якщо двох різних людей записано однаково або одну людину по-різному, напишіть нам — виправимо.</p>
      ${reportBtn()}
    </div>`;
  }
  function groupBySeason(apps) {
    const map = new Map();
    for (const a of apps) { const k = a.m.season.label; if (!map.has(k)) map.set(k, []); map.get(k).push(a); }
    return [...map.entries()];
  }

  /* ---------- списки ---------- */
  function clubRows() {
    const seen = new Map();
    for (const t of db.teams.values()) {
      if (!t.matches.length && !t.finishes.length && !t.trophies.length) continue;
      const home = clubHome(t);
      if (seen.has(home.id)) continue;
      const sq = squadsOf(t);
      const seasons = [...new Set(sq.flatMap(x => x.seasons))].sort((a, b) => Core.seasonOrder(a) - Core.seasonOrder(b));
      const tot = sq.reduce((o, x) => { for (const k of ['p', 'w', 'd', 'l']) o[k] += x.totals[k] || 0; return o; }, { p: 0, w: 0, d: 0, l: 0 });
      const names = [...new Set(sq.flatMap(x => x.names).map(plainName))].filter(n => n !== clubName(t));
      seen.set(home.id, { home, sq, name: clubName(t), seasons, tot, names, titles: sq.reduce((n, x) => n + x.trophies.filter(y => y.place === 1).length, 0), keys: sq.flatMap(x => x.names).map(Core.normName) });
    }
    return [...seen.values()];
  }
  function pageTeams() {
    const list = clubRows().sort((a, b) => b.seasons.length - a.seasons.length || b.tot.p - a.tot.p);
    return `<div class="page">
      <div class="block"><div class="eyebrow">Усі учасники</div><h1 class="title">Клуби</h1><p class="lead">${list.length} ${plural(list.length, 'клуб', 'клуби', 'клубів')}. Якщо клуб змінював назву або виступав кількома складами в різних лігах, усе зібрано на одній сторінці.</p></div>
      <div class="toolbar"><input id="tf" type="search" placeholder="Знайти клуб" aria-label="Знайти клуб"></div>
      <div class="tw"><table><thead><tr><th>Клуб</th><th>Сезони</th><th class="n">Матчі</th><th class="n hide-s">В–Н–П</th><th class="n">Титули</th></tr></thead><tbody id="tl">${list.map(c => `<tr data-k="${esc(c.keys.join(' '))}"><td><span class="tn">${crest(c.home)}<a href="#t-${c.home.id}">${esc(c.name)}</a></span>${c.sq.length > 1 ? ` <span class="muted note">${c.sq.length} ${plural(c.sq.length, 'склад', 'склади', 'складів')}</span>` : ''}${c.names.length ? `<div class="note">${esc(c.names.join(', '))}</div>` : ''}</td><td class="muted">${range(c.seasons)}${c.seasons.length ? ` <span class="note">(${c.seasons.length})</span>` : ''}</td><td class="n">${c.tot.p || ''}</td><td class="n hide-s">${c.tot.p ? `${c.tot.w}–${c.tot.d}–${c.tot.l}` : ''}</td><td class="n pts">${c.titles || ''}</td></tr>`).join('')}</tbody></table></div>
    </div>`;
  }
  function bindTeams() {
    const f = document.getElementById('tf'); if (!f) return;
    f.addEventListener('input', () => { const q = Core.normName(f.value); document.querySelectorAll('#tl tr').forEach(tr => { tr.hidden = q && !tr.dataset.k.includes(q); }); });
  }
  let playersState = { q: '', sort: 'goals', shown: 100 };
  function pagePlayers() {
    return `<div class="page">
      <div class="block"><div class="eyebrow">Усі учасники</div><h1 class="title">Гравці</h1><p class="lead">Усі, хто потрапив до протоколів матчів з 2010/11, і бомбардири ранніх сезонів.</p></div>
      <div class="toolbar"><input id="pf" type="search" placeholder="Прізвище або ім’я" aria-label="Знайти гравця" value="${esc(playersState.q)}">
        <label class="muted" for="ps">Сортувати</label>
        <select id="ps"><option value="goals">за голами</option><option value="apps">за матчами</option><option value="seasons">за сезонами</option><option value="name">за абеткою</option></select></div>
      <div id="plist"></div>
    </div>`;
  }
  function bindPlayers() {
    const f = document.getElementById('pf'), s = document.getElementById('ps'), box = document.getElementById('plist');
    if (!f) return;
    s.value = playersState.sort;
    const all = [...db.players.values()].filter(p => p.apps.length || p.archive.length);
    function render() {
      const q = Core.normName(f.value);
      let list = q ? all.filter(p => [...p.spellings.keys()].some(n => Core.normName(n).includes(q))) : all.slice();
      const key = { goals: p => -p.goals.length * 1000 - p.archiveGoals, apps: p => -p.apps.length, seasons: p => -p.seasonsPlayed.size * 1000 - p.apps.length };
      if (playersState.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      else list.sort((a, b) => key[playersState.sort](a) - key[playersState.sort](b) || a.name.localeCompare(b.name, 'ru'));
      const shown = list.slice(0, playersState.shown);
      box.innerHTML = `<div class="tw"><table><thead><tr><th>Гравець</th><th class="hide-s">Команди</th><th class="n">Сезони</th><th class="n">Матчі</th><th class="n">Голи</th></tr></thead><tbody>${shown.map(p => `<tr><td>${playerLink(p)}</td><td class="hide-s muted">${mainTeams(p) || (p.archive[0] ? teamLink(p.archive[0].team, p.archive[0].teamName) : '')}</td><td class="n">${p.seasonsPlayed.size}</td><td class="n">${p.apps.length || ''}</td><td class="n pts">${p.goals.length || ''}${p.archiveGoals ? `<span class="note"> +${p.archiveGoals}*</span>` : ''}</td></tr>`).join('')}</tbody></table></div>
        <div class="toolbar"><span class="note">Показано ${shown.length} з ${list.length}. * Голи ранніх сезонів за списками бомбардирів.</span>${list.length > shown.length ? '<button class="btn" id="more">Показати ще</button>' : ''}</div>`;
      const more = document.getElementById('more');
      if (more) more.addEventListener('click', () => { playersState.shown += 200; render(); });
    }
    f.addEventListener('input', () => { playersState.q = f.value; playersState.shown = 100; render(); });
    s.addEventListener('change', () => { playersState.sort = s.value; playersState.shown = 100; render(); });
    render();
  }

  function pageRecords() {
    const r = recs;
    const mtable = (list, title, note) => `<div class="block"><h2 class="sec">${title}</h2><div class="mlist">${list.map(m => matchRow(m, { ctx: stageCtx(m) })).join('')}</div>${note ? `<p class="note">${note}</p>` : ''}</div>`;
    return `<div class="page">
      <div class="block"><div class="eyebrow">За протоколами 2010–2022</div><h1 class="title">Рекорди</h1><p class="lead">Усе пораховано за опублікованими протоколами. Технічні результати до рекордів матчів не входять.</p></div>
      <section class="grid2">
        <div class="block"><h2 class="sec">Бомбардири за всю історію</h2>${playerTable(r.topScorers.slice(0, 20), p => p.goals.length, 'Голи', 'goals')}</div>
        <div class="block"><h2 class="sec">Найбільше матчів</h2>${playerTable(r.mostApps.slice(0, 20), p => p.apps.length, 'Матчі', 'apps')}</div>
      </section>
      <section class="grid2">
        ${mtable(r.biggestWins, 'Найбільші перемоги')}
        ${mtable(r.mostGoals, 'Найрезультативніші матчі')}
      </section>
      <section class="grid2">
        <div class="block"><h2 class="sec">П’ять голів і більше за матч</h2><div class="tw"><table><thead><tr><th>Гравець</th><th class="hide-s">Матч</th><th class="n">Голи</th></tr></thead><tbody>${r.bigGames.map(x => `<tr><td>${playerLink(x.p)}<div class="note">${shortDate(x.m.date)} · ${esc(x.side === 'h' ? x.m.homeName : x.m.awayName)}</div></td><td class="hide-s"><a href="#m-${x.m.id}">${esc(x.m.homeName)} — ${esc(x.m.awayName)} ${esc(Core.scoreText(x.m))}</a></td><td class="n pts">${x.n}</td></tr>`).join('')}</tbody></table></div></div>
        <div class="block"><h2 class="sec">Хет-трики</h2>${playerTable(r.hatTricks.slice(0, 15), p => p.hatTricks, 'Хет-трики', 'hat')}</div>
      </section>
      <section class="grid2">
        <div class="block"><h2 class="sec">Найбільше сезонів</h2>${playerTable(r.mostSeasons.slice(0, 15), p => p.seasonsPlayed.size, 'Сезони', 'apps')}<p class="note">З урахуванням ранніх сезонів, де гравець потрапив до списку бомбардирів.</p></div>
        ${mtable(r.attendance, 'Найбільше глядачів', 'За даними протоколів, де вказано кількість глядачів.')}
      </section>
    </div>`;
  }


  /* ---------- клубы ---------- */
  function clubLine(t) {
    if (!t.club) return '';
    const mates = [...db.teams.values()].filter(x => x.club === t.club && x !== t);
    if (!mates.length) return '';
    return `<p class="muted">Клуб «${esc(t.club)}». Інші склади клубу: ${mates.map(x => teamLink(x)).join(', ')}.</p>`;
  }

  /* ---------- обзоры ---------- */
  const authorText = a => a ? esc(a) : 'автора не вказано';
  function reviewsBlock(s) {
    const list = reviewIndex[s.id] || [];
    if (!list.length) return '';
    return `<section class="block"><div class="sec-head"><h2 class="sec">Огляди та анонси</h2><span class="note">${list.length} ${plural(list.length, 'текст', 'тексти', 'текстів')}</span></div>
      <div class="mlist"><details class="round"><summary>Усі огляди сезону <span>${fmtDate(list[0].date)} — ${fmtDate(list[list.length - 1].date)}</span></summary>${list.slice().reverse().map(r => `<a class="rrow" href="#r-${r.id}"><span class="d">${shortDate(r.date)}</span><span class="rt">${esc(r.title)}</span><span class="ra">${authorText(r.author)}</span></a>`).join('')}</details></div></section>`;
  }
  function findReview(id) {
    for (const [sid, list] of Object.entries(reviewIndex)) { const r = list.find(x => x.id === id); if (r) return { sid, r }; }
    return null;
  }
  function pageReview(id) {
    const f = findReview(id);
    if (!f) return notFound();
    const season = db.seasons.find(x => x.id === f.sid);
    const body = reviewCache.get(f.sid);
    if (!body) {
      fetch(`data/reviews/${f.sid}.json`).then(r => r.json()).then(j => { reviewCache.set(f.sid, j); if (location.hash === '#r-' + id) route(); });
      return `<div class="loading"><div class="ballspin"></div><p>Завантажую огляд…</p></div>`;
    }
    const r = body.reviews.find(x => x.id === id);
    const list = reviewIndex[f.sid], k = list.findIndex(x => x.id === id);
    const prev = list[k - 1], next = list[k + 1];
    return `<div class="page">
      <div class="crumbs"><a href="#s-${season.id}">Сезон ${esc(season.label)}</a><span class="sep">/</span><span>Огляди та анонси</span></div>
      <article class="review">
        <div class="eyebrow">${fmtDate(r.date)}</div>
        <h1 class="title">${esc(r.title)}</h1>
        <p class="byline">${r.author ? 'Автор: ' + esc(UK.person(r.author)) : 'Автора в блозі не вказано'}</p>
        ${r.paras.map(p => `<p>${esc(p)}</p>`).join('')}
      </article>
      <div class="season-nav">${prev ? `<a href="#r-${prev.id}">← ${esc(prev.title)}</a>` : ''}${next ? `<a href="#r-${next.id}">${esc(next.title)} →</a>` : ''}</div>
      <p class="note">Джерело: блог media-soccer.org, публікація ${fmtDate(r.date)}.</p>
    </div>`;
  }


  /* ================= виджеты: графики и сортируемые таблицы ================= */
  let mounts = [], chartMounts = [];
  const S = n => Charts.css('--s' + n);
  function chart(kind, opts, h = 220) {
    const id = 'w' + Math.random().toString(36).slice(2, 9);
    const fn = () => { const el = document.getElementById(id); if (el) Charts[kind](el, typeof opts === 'function' ? opts() : opts); };
    mounts.push(fn); chartMounts.push(fn);
    return `<div class="chart" id="${id}" style="height:${h}px"></div>`;
  }
  function legend(items) {
    return `<div class="legend">${items.map(i => `<span><i class="${i.line ? 'ln' : ''}" style="background:${i.color}"></i>${esc(i.label)}</span>`).join('')}</div>`;
  }
  const pct = v => (v == null ? '—' : Math.round(v * 100) + '%');
  const dec = (v, d = 1) => (v == null || isNaN(v) ? '—' : v.toLocaleString('uk-UA', { minimumFractionDigits: d, maximumFractionDigits: d }));
  // cols: [{k, label, title, num, get(r), html(r), sortVal(r)}]
  function sortable(cfg) {
    const id = 'w' + Math.random().toString(36).slice(2, 9);
    const st = { sort: cfg.sort, dir: cfg.dir || -1, shown: cfg.limit || 50 };
    const render = () => {
      const el = document.getElementById(id); if (!el) return;
      const col = cfg.cols.find(c => c.k === st.sort) || cfg.cols[0];
      const val = r => (col.sortVal ? col.sortVal(r) : col.get ? col.get(r) : 0);
      const rows = cfg.rows.slice().sort((a, b) => {
        const x = val(a), y = val(b);
        if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
        return typeof x === 'string' ? (st.dir === 1 ? x.localeCompare(y, 'ru') : y.localeCompare(x, 'ru')) : (st.dir === 1 ? x - y : y - x);
      });
      const shown = rows.slice(0, st.shown);
      const vmax = col.num ? Math.max(0, ...rows.map(r => { const v = col.get ? col.get(r) : null; return typeof v === 'number' && isFinite(v) ? v : 0; })) : 0;
      const cellHtml = (c, r) => {
        if (c.html) return c.html(r);
        const v = c.get(r); let txt = esc(v == null ? '—' : (c.fmt ? c.fmt(v) : v));
        if (c.pop && typeof v === 'number' && v > 0) txt = popv(txt, c.pop(r));
        if (c === col && c.num && vmax > 0 && typeof v === 'number' && v > 0) return `<span class="db" style="--w:${Math.round(v / vmax * 100)}%"><span>${txt}</span></span>`;
        return txt;
      };
      el.innerHTML = `<div class="tw"><table class="sortable"><thead><tr><th class="n">#</th>${cfg.cols.map(c => `<th class="${c.num ? 'n' : ''}${c.hideS ? ' hide-s' : ''}"${c.title ? ` title="${esc(c.title)}"` : ''}><button type="button" data-k="${c.k}" class="${c.k === st.sort ? 'on' : ''}">${c.label}${c.k === st.sort ? (st.dir === -1 ? ' ↓' : ' ↑') : ''}</button></th>`).join('')}</tr></thead><tbody>${shown.map((r, i) => `<tr><td class="n muted">${i + 1}</td>${cfg.cols.map(c => `<td class="${c.num ? 'n' : ''}${c.k === st.sort ? ' pts' : ''}${c.hideS ? ' hide-s' : ''}">${cellHtml(c, r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        ${rows.length > shown.length ? `<div class="toolbar"><span class="note">Показано ${shown.length} з ${rows.length}</span><button class="btn" type="button" data-more="1">Показати ще</button></div>` : (rows.length > 15 ? `<p class="note">Усього ${rows.length}</p>` : '')}
        ${cfg.note ? `<p class="note">${cfg.note}</p>` : ''}`;
      el.querySelectorAll('th button').forEach(b => b.addEventListener('click', () => {
        const k = b.dataset.k;
        if (st.sort === k) st.dir = -st.dir; else { st.sort = k; const c = cfg.cols.find(x => x.k === k); st.dir = c && c.asc ? 1 : -1; }
        render();
      }));
      const more = el.querySelector('[data-more]'); if (more) more.addEventListener('click', () => { st.shown += 100; render(); });
    };
    mounts.push(render);
    return `<div id="${id}"></div>`;
  }
  function runMounts() { const list = mounts; mounts = []; list.forEach(f => f()); }
  let rsz = null;
  window.addEventListener('resize', () => { clearTimeout(rsz); rsz = setTimeout(() => { Charts.hideTip(); chartMounts.forEach(f => f()); }, 150); });

  const kpi = (v, label) => `<div class="fact"><b>${v}</b><span>${label}</span></div>`;
  const mlistBlock = (title, items, ctx, note) => items.length ? `<div class="block"><h3 class="sub">${title}</h3><div class="mlist">${items.map(x => matchRow(x.m || x, { ctx: (ctx ? ctx(x) + ' · ' : '') + stageCtx(x.m || x) })).join('')}</div>${note ? `<p class="note">${note}</p>` : ''}</div>` : '';

  /* ================= раздел «Статистика» ================= */
  const TABS = [['', 'Огляд'], ['players', 'Гравці'], ['teams', 'Команди'], ['compare', 'Порівняння'], ['matches', 'Матчі'], ['streaks', 'Серії'], ['setpieces', 'Стандарти'], ['cards', 'Дисципліна'], ['refs', 'Судді']];
  const statsState = { from: '', to: '', kind: 'all', team: '', minApps: 10, q: '' };
  const SP = {
    pen: { label: 'Пенальті', short: 'Пен.', note: 'У протоколах блогу 10-метрові удари окремо не позначено. Якщо їх записували як пенальті, вони входять до цього показника.' },
    tenm: { label: '10-метрові', short: '10 м' },
    fk: { label: 'Штрафні удари', short: 'Штр.' },
  };
  const KIND_OPTS = () => {
    const names = new Map();
    for (const t of db.tournaments) if (!t.final) names.set(t.id, t.name);
    const order = ['chemp', 'media', 'brand', 'cup', 'gold', 'hope', 'cl', 'lc'];
    return [['all', 'Усі турніри'], ['league', 'Усі ліги'], ['cup', 'Усі кубки'], ...order.filter(id => names.has(id)).map(id => [id, names.get(id)])];
  };
  function statsFilterBar() {
    const seasons = db.seasons.filter(s => !s.archive).map(s => s.label);
    const teams = [...db.teams.values()].filter(t => t.matches.length).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const opt = (v, l, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(l)}</option>`;
    return `<form class="filters" id="sf" onsubmit="return false">
      <label>З сезону <select id="sf-from">${seasons.map(s => opt(s, s, s === (statsState.from || seasons[0]))).join('')}</select></label>
      <label>по <select id="sf-to">${seasons.map(s => opt(s, s, s === (statsState.to || seasons[seasons.length - 1]))).join('')}</select></label>
      <label>Турніри <select id="sf-kind">${KIND_OPTS().map(([v, l]) => opt(v, l, v === statsState.kind)).join('')}</select></label>
      <label>Команда <select id="sf-team">${opt('', 'Усі команди', !statsState.team)}${teams.map(t => opt(t.id, t.name, t.id === statsState.team)).join('')}</select></label>
      <button type="button" class="btn" id="sf-reset">Скинути</button>
    </form>`;
  }
  function bindStatsFilters(tab) {
    const f = document.getElementById('sf'); if (!f) return;
    const upd = () => {
      statsState.from = document.getElementById('sf-from').value; statsState.to = document.getElementById('sf-to').value;
      if (db.seasons.findIndex(s => s.label === statsState.to) < db.seasons.findIndex(s => s.label === statsState.from)) { const x = statsState.from; statsState.from = statsState.to; statsState.to = x; }
      statsState.kind = document.getElementById('sf-kind').value; statsState.team = document.getElementById('sf-team').value;
      renderStatsBody(tab);
    };
    f.querySelectorAll('select').forEach(s => s.addEventListener('change', upd));
    document.getElementById('sf-reset').addEventListener('click', () => { Object.assign(statsState, { from: '', to: '', kind: 'all', team: '' }); route(); });
  }
  function filterDesc() {
    const parts = [];
    const ss = db.seasons.filter(s => !s.archive);
    const from = statsState.from || ss[0].label, to = statsState.to || ss[ss.length - 1].label;
    parts.push(from === to ? 'сезон ' + from : `сезони ${from} — ${to}`);
    const k = KIND_OPTS().find(x => x[0] === statsState.kind); if (k && statsState.kind !== 'all') parts.push(k[1]);
    if (statsState.team) parts.push(db.teams.get(statsState.team).name);
    return parts.join(' · ');
  }
  function pageStats(tab) {
    return `<div class="page">
      <div class="block"><div class="eyebrow">За протоколами 2010–2022</div><h1 class="title">Статистика</h1>
      <div class="tabs" role="tablist">${TABS.map(([k, l]) => `<button role="tab" aria-selected="${k === tab}" data-href="#stats${k ? '-' + k : ''}">${l}</button>`).join('')}</div></div>
      ${tab === 'compare' ? '' : statsFilterBar()}
      <div id="stats-body"></div>
    </div>`;
  }
  function renderStatsBody(tab) {
    const box = document.getElementById('stats-body'); if (!box) return;
    chartMounts = [];
    let html;
    if (tab === 'compare') html = statsCompare();
    else {
      const f = { from: statsState.from, to: statsState.to, kind: statsState.kind, team: statsState.team || null };
      const ms = Stats.filterMatches(db, f);
      html = `<p class="note filter-desc">${esc(filterDesc())} · ${nf(ms.length)} ${plural(ms.length, 'матч', 'матчі', 'матчів')}</p>`;
      if (!ms.length) html += '<div class="callout">За вибраними умовами не знайдено жодного матчу. Змініть фільтр.</div>';
      else html += ({ '': statsOverview, players: statsPlayers, teams: statsTeams, matches: statsMatches, streaks: statsStreaks, setpieces: statsSetPieces, cards: statsCards, refs: statsRefs }[tab] || statsOverview)(ms);
    }
    box.innerHTML = html;
    runMounts();
    const mi = document.getElementById('st-min');
    if (mi) mi.addEventListener('change', () => { statsState.minApps = Math.max(0, parseInt(mi.value, 10) || 0); renderStatsBody(tab); });
    const q = document.getElementById('st-q');
    if (q) q.addEventListener('change', () => { statsState.q = q.value; renderStatsBody(tab); });
  }

  /* ---------- общие интерактивные панели ---------- */
  // переключатель показателя + график, который перерисовывается без перезагрузки страницы
  function switcher(opts, draw, cur) {
    const id = 'sw' + Math.random().toString(36).slice(2, 8);
    const st = { cur: cur || opts[0][0] };
    const render = () => {
      const box = document.getElementById(id); if (!box) return;
      box.querySelectorAll('.chipset button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === st.cur)));
      draw(box.querySelector('.sw-body'), st.cur);
    };
    mounts.push(() => {
      const box = document.getElementById(id); if (!box) return;
      box.querySelectorAll('.chipset button').forEach(b => b.addEventListener('click', () => { st.cur = b.dataset.v; render(); }));
      render();
    });
    chartMounts.push(render);
    return `<div id="${id}" class="sw"><div class="chipset" role="group">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="false">${l}</button>`).join('')}</div><div class="sw-body"></div></div>`;
  }
  // контейнер для списка матчей, который заполняется по клику на график
  function drillBox() { const id = 'dr' + Math.random().toString(36).slice(2, 8); return { id, html: `<div id="${id}" class="drill"></div>` }; }
  function fillDrill(id, title, list, ctx) {
    const el = document.getElementById(id); if (!el) return;
    el.innerHTML = list.length ? `<div class="block"><div class="sec-head"><h3 class="sub">${esc(title)}</h3><span class="note">${list.length} ${plural(list.length, 'матч', 'матчі', 'матчів')}${list.length > 40 ? ', показано останні 40' : ''}</span></div><div class="mlist">${list.slice(-40).reverse().map(m => matchRow(m, { ctx: (ctx ? ctx(m) + ' · ' : '') + stageCtx(m) })).join('')}</div></div>` : '';
  }
  const goalType = g => (g.og ? 'og' : g.pen ? 'pen' : g.tenm ? 'tenm' : g.free ? 'fk' : 'open');
  const goalPop = (ms, test, title) => () => ({ title, items: [...groupMap(ms.flatMap(m => m.goals.filter(test).map(g => ({ m, g }))))].map(([m, xs]) => ({ m, note: xs.map(x => (x.g.min != null ? x.g.min + '′ ' : '') + x.g.name).join(', ') })) });
  const cardPop = (ms, k) => () => ({ title: k === 'rc' ? 'Вилучення' : 'Попередження', items: ms.filter(m => m[k].length).map(m => ({ m, note: m[k].map(c => (c.min != null ? c.min + '′ ' : '') + (c.p ? c.p.name : '')).join(', ') })) });
  const hasTenm = () => db.matches.some(m => m.goals.some(g => g.tenm));

  /* --- обзор --- */
  function statsOverview(ms) {
    const o = Stats.overview(db, ms);
    const att = ms.filter(m => m.att);
    const multi = o.bySeason.length > 1;
    const types = [['all', 'Усі голи'], ['open', 'З гри'], ['pen', SP.pen.label], ...(hasTenm() ? [['tenm', SP.tenm.label]] : []), ['fk', SP.fk.label], ['og', 'Автоголи']];
    const byMinute = switcher(types, (el, v) => { el.innerHTML = colsHtml(minuteCols(ms, v), [S(1)], 220); });
    const seasons = [...o.seasonBins.keys()];
    const heat = multi ? chart('heatmap', { rows: seasons, cols: Stats.BINS.slice(0, 10).map(x => x.replace('–', '-')), values: seasons.map(s => o.seasonBins.get(s).slice(0, 10)), unit: 'голів', corner: 'сезон', cellW: 40, showValues: true, onClick: (i, j) => { const sm = ms.filter(m => m.season.label === seasons[i]); const c = minuteCols(sm, 'all')[j]; openMatches({ ...c.pop(), sub: 'сезон ' + seasons[i] }); } }, 0) : '';
    return `
      <section class="facts big">
        ${kpi(nf(o.played), 'зіграних матчів')}${kpi(nf(o.goals), 'голів')}${kpi(dec(o.gpm), 'голів за матч')}
        ${kpi(popv(nf(o.pens), goalPop(ms, g => g.pen, 'Голи з пенальті')), 'голів з пенальті')}${o.tenm ? kpi(popv(nf(o.tenm), goalPop(ms, g => g.tenm, 'Голи з 10-метрових')), 'з 10-метрових') : ''}${kpi(popv(nf(o.free), goalPop(ms, g => g.free, 'Голи зі штрафних ударів')), 'зі штрафних ударів')}
        ${kpi(popv(nf(o.og), goalPop(ms, g => g.og, 'Автоголи')), 'автоголів')}${kpi(nf(o.yc), 'попереджень')}${kpi(popv(nf(o.rc), cardPop(ms, 'rc')), 'вилучень')}
        ${att.length ? kpi(dec(att.reduce((s, m) => s + m.att, 0) / att.length, 0), 'глядачів у середньому') : ''}
      </section>
      ${(() => { const pr = Stats.playerTable(db, ms); const tr = Stats.teamTable(db, ms).filter(r => r.p); const tp = (v, k) => pr.filter(r => v(r) > 0).sort((a, b) => v(b) - v(a)).map(r => pRow(r, v, k, ms)); return `<div class="tgrid">${topCard('Бомбардири', tp(r => r.goals, 'goals'))}${topCard('Хет-трики', tp(r => r.hat, 'hat'))}${topCard('Перемоги', tr.filter(r => r.w).sort((a, b) => b.w - a.w).map(r => tRow(r, x => x.w, 'w', ms)))}</div>`; })()}
      <section class="block panel"><h3 class="sub">Коли забивають</h3>${byMinute}<p class="note">Голи за п’ятихвилинками, матч триває 2 × 25 хвилин. Натисніть на стовпчик, щоб побачити матчі.</p></section>
      ${multi ? `<section class="block panel"><h3 class="sub">Голи за сезонами та хвилинами</h3>${heat}<p class="note">Що темніша клітинка, то більше голів. Натисніть на клітинку, щоб побачити матчі.</p></section>` : ''}
      ${raceBlock(ms)}
      ${teamsScatter(ms)}`;
  }

  /* --- гонка бомбардиров: накопленные голы по сезонам с выбором игроков --- */
  function raceBlock(ms) {
    const set = new Set(ms.map(m => m.id));
    const seasons = [...new Set(ms.map(m => m.season.label))];
    if (seasons.length < 2) return '';
    const tot = new Map();
    for (const m of ms) for (const g of m.goals) if (!g.og) tot.set(g.p, (tot.get(g.p) || 0) + 1);
    const ranked = [...tot.entries()].sort((a, b) => b[1] - a[1]);
    const pool = ranked.filter(x => x[1] >= 10).map(x => x[0]);
    const id = 'race' + Math.random().toString(36).slice(2, 8);
    const slots = ranked.slice(0, 5).map(x => x[0]);
    const colorOf = p => S(slots.indexOf(p) + 1);
    const draw = () => {
      const box = document.getElementById(id); if (!box) return;
      const series = slots.filter(Boolean).map(p => {
        let acc = 0; const per = new Map();
        for (const g of p.goals) if (set.has(g.m.id)) per.set(g.m.season.label, (per.get(g.m.season.label) || 0) + 1);
        return { name: p.name, color: colorOf(p), values: seasons.map(s => (acc += per.get(s) || 0)) };
      });
      Charts.line(box.querySelector('.chart'), { labels: seasons, series, height: 280 });
      box.querySelector('.pchips').innerHTML = slots.map((p, k) => p ? `<span class="pchip"><i style="background:${S(k + 1)}"></i>${esc(p.name)}<button type="button" data-k="${k}" aria-label="Прибрати ${esc(p.name)}">×</button></span>` : '').join('');
      box.querySelectorAll('.pchip button').forEach(b => b.addEventListener('click', () => { slots[+b.dataset.k] = null; draw(); }));
    };
    mounts.push(() => {
      const box = document.getElementById(id); if (!box) return;
      const inp = box.querySelector('input');
      inp.addEventListener('change', () => {
        const p = pool.find(x => x.name === inp.value.trim()); inp.value = '';
        if (!p || slots.includes(p)) return;
        let k = slots.indexOf(null); if (k < 0) { if (slots.length < 6) k = slots.length; else k = 0; }
        slots[k] = p; draw();
      });
      draw();
    });
    chartMounts.push(draw);
    const dl = id + '-dl';
    return `<section class="block panel" id="${id}"><h3 class="sub">Перегони бомбардирів</h3>
      <div class="picker"><input list="${dl}" placeholder="Додати гравця" aria-label="Додати гравця на графік"><datalist id="${dl}">${pool.map(p => `<option value="${esc(p.name)}"></option>`).join('')}</datalist><span class="pchips"></span></div>
      <div class="chart" style="height:280px"></div><p class="note">Голи наростаючим підсумком за сезонами. До шести гравців; зайвого приберіть хрестиком.</p></section>`;
  }

  /* --- атака и оборона команд --- */
  function teamsScatter(ms) {
    const rows = Stats.teamTable(db, ms).filter(r => r.p >= Math.min(15, Math.max(5, ms.length / 40)) && !(statsState.team && r.team.id !== statsState.team && false));
    if (rows.length < 3) return '';
    const avg = k => rows.reduce((s, r) => s + r[k] * r.p, 0) / rows.reduce((s, r) => s + r.p, 0);
    return `<section class="block panel"><h3 class="sub">Атака й оборона команд</h3>${chart('scatter', {
      points: rows.map(r => ({ id: r.team.id, x: +r.gfpm.toFixed(2), y: +r.gapm.toFixed(2), r: r.p, label: r.team.name, href: '#t-' + r.team.id, rec: r })),
      xLabel: 'забито за матч', yLabel: 'пропущено за матч', invertY: true, avgX: avg('gfpm'), avgY: avg('gapm'),
      highlight: statsState.team ? [statsState.team] : [], labelAll: rows.length <= 14, height: 380,
      tip: p => [{ value: dec(p.x, 2), label: 'забито за матч' }, { value: dec(p.y, 2), label: 'пропущено за матч' }, { value: p.rec.w + '–' + p.rec.d + '–' + p.rec.l, label: p.rec.p + ' ' + plural(p.rec.p, 'матч', 'матчі', 'матчів') }],
    }, 380)}<p class="note">Праворуч — сильніша атака, угору — надійніша оборона. Розмір точки — кількість матчів, пунктир — середні значення. Натисніть на точку, щоб відкрити команду.</p></section>`;
  }

  /* --- картки лідерів: топ-5, у першого число виділено, «Усі» — повний рейтинг --- */
  const ranks = new Map();
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-rank]'); if (!b) return;
    const r = ranks.get(b.dataset.rank); if (!r) return;
    const x = r();
    openModal(esc(x.title), x.sub ? esc(x.sub) : '', `<div class="tcard flat">${x.rows.map((it, i) => tcRow(it, i)).join('')}</div>`);
  });
  function tcRow(it, i) {
    return `<div class="tc-r${i === 0 ? ' first' : ''}${it.icon ? '' : ' noicon'}"><span class="tc-n">${i + 1}</span>${it.icon || ''}<span class="tc-nm"><a href="${it.href}">${nameHtml(it.label)}</a>${it.sub ? `<small>${it.sub}</small>` : ''}</span><span class="tc-v">${popv(it.text != null ? it.text : it.value, it.pop)}</span></div>`;
  }
  // rows: повний відсортований список [{ label, href, icon, sub, value, text, pop }]
  function topCard(title, rows, note) {
    if (!rows.length) return '';
    const id = 'r' + (++popSeq);
    ranks.set(id, () => ({ title, sub: note, rows: rows.slice(0, 50) }));
    return `<section class="tcard"><button type="button" class="tc-h" data-rank="${id}"><h3>${esc(title)}</h3><span>Усі ›</span></button>${rows.slice(0, 5).map((it, i) => tcRow(it, i)).join('')}${note ? `<p class="tc-note">${esc(note)}</p>` : ''}</section>`;
  }
  const pRow = (r, val, k, ms, fmt) => { const c = clubsOf(r.teams)[0]; const v = val(r); return { label: r.p.name, href: '#p-' + r.p.id, icon: '', sub: c ? crest(c.team, 'xs') + esc(c.name) : '', value: v, text: fmt ? fmt(v) : v, pop: ppop(r.p, k, ms) }; };
  const tRow = (r, val, k, ms, fmt) => { const v = val(r); return { label: r.team.name, href: '#t-' + r.team.id, icon: crest(r.team, 'md'), sub: r.p + ' ' + plural(r.p, 'матч', 'матчі', 'матчів'), value: v, text: fmt ? fmt(v) : v, pop: k ? (k.startsWith('streak:') ? streakPop(r.team, r.streaks.at[k.slice(7)], 'серія', ms) : tpop(r.team, k, ms)) : null }; };
  function playerCards(rows, ms) {
    const min = statsState.minApps;
    const top = (val, k, opts = {}) => rows.filter(r => val(r) > 0 && (!opts.min || opts.min(r))).sort((a, b) => val(b) - val(a) || b.goals - a.goals).map(r => pRow(r, val, k, ms, opts.fmt));
    return `<div class="tgrid">
      ${topCard('Бомбардири', top(r => r.goals, 'goals'))}
      ${topCard('Голи за матч', top(r => r.gpm, 'goals', { min: r => r.apps >= min, fmt: v => dec(v, 2) }), `Гравці від ${min} матчів`)}
      ${topCard('Хет-трики', top(r => r.hat, 'hat'), 'Три голи й більше в матчі')}
      ${topCard('Переможні голи', top(r => r.winners, 'winners'), 'Гол, після якого команда повела й більше не поступалася')}
      ${topCard('Серія з голами', top(r => r.streak, 'streak'), 'Матчів поспіль із забитим голом')}
      ${topCard('Найбільше матчів', top(r => r.apps, 'apps'))}
      ${topCard('Перші голи матчу', top(r => r.firsts, 'firsts'))}
      ${topCard('Пенальті', top(r => r.pen, 'pen'))}
      ${topCard('Штрафні удари', top(r => r.free, 'free'))}
    </div>`;
  }
  function teamCards(rows, ms) {
    const minP = Math.min(20, Math.max(5, Math.round(ms.length / 30)));
    const top = (val, k, opts = {}) => rows.filter(r => r.p && (val(r) > 0 || opts.asc) && (!opts.min || opts.min(r))).sort((a, b) => (opts.asc ? val(a) - val(b) : val(b) - val(a)) || b.p - a.p).map(r => tRow(r, val, k, ms, opts.fmt));
    return `<div class="tgrid">
      ${topCard('Перемоги', top(r => r.w, 'w'))}
      ${topCard('Частка перемог', top(r => r.winPct, 'w', { min: r => r.p >= minP, fmt: pct }), `Команди від ${minP} матчів`)}
      ${topCard('Найкраща атака', top(r => r.gfpm, 'p', { min: r => r.p >= minP, fmt: v => dec(v, 2) }), 'Забито за матч')}
      ${topCard('Найкраща оборона', top(r => r.gapm, 'p', { min: r => r.p >= minP, fmt: v => dec(v, 2), asc: true }), 'Пропущено за матч, менше — краще')}
      ${topCard('Сухі матчі', top(r => r.cs, 'cs'))}
      ${topCard('Камбеки', top(r => r.comebacks, 'comebacks'), 'Перемоги після того, як команда поступалася')}
      ${topCard('Перемоги поспіль', top(r => r.streaks.best.win, 'streak:win'), 'Рекордна серія')}
      ${topCard('Без поразок поспіль', top(r => r.streaks.best.unbeaten, 'streak:unbeaten'), 'Рекордна серія')}
    </div>`;
  }

  /* --- рейтинг-полосы с выбором показателя --- */
  function leaders(rows, metrics, opts = {}) {
    return switcher(metrics.map(m => [m.k, m.label]), (el, k) => {
      const m = metrics.find(x => x.k === k);
      const list = rows.filter(r => m.get(r) != null && m.get(r) > 0 && (!m.min || m.min(r))).sort((a, b) => m.get(b) - m.get(a)).slice(0, opts.n || 15);
      if (!list.length) { el.innerHTML = '<p class="note">Немає даних для цього показника.</p>'; return; }
      el.innerHTML = hbars(list.map(r => ({ label: opts.label(r), sub: opts.sub ? opts.sub(r) : '', value: m.get(r), text: m.fmt ? m.fmt(m.get(r)) : m.get(r), href: opts.href(r), pop: opts.pop ? opts.pop(r, k, m) : null })));
      if (m.note) { const p = document.createElement('p'); p.className = 'note'; p.textContent = m.note; el.appendChild(p); }
    });
  }

  /* --- игроки --- */
  const teamsOf = r => clubsOf(r.teams).map(c => teamLink(c.team, c.name)).join(', ');
  const teamsTxt = r => clubsOf(r.teams).map(c => c.name).join(', ');
  function statsPlayers(ms) {
    let rows = Stats.playerTable(db, ms);
    if (statsState.team) rows = rows.filter(r => r.teams.has(statsState.team));
    const min = statsState.minApps;
    const metrics = [
      { k: 'goals', label: 'Голи', get: r => r.goals },
      { k: 'gpm', label: 'Голи за матч', get: r => r.gpm, fmt: v => dec(v, 2), min: r => r.apps >= min, note: `Гравці, які зіграли не менше ${min} матчів.` },
      { k: 'apps', label: 'Матчі', get: r => r.apps },
      { k: 'winners', label: 'Переможні голи', get: r => r.winners, note: 'Гол, після якого команда повела й більше не поступалася.' },
      { k: 'hat', label: 'Хет-трики', get: r => r.hat },
      { k: 'streak', label: 'Серія з голами', get: r => r.streak, note: 'Матчів поспіль із забитим голом.' },
      { k: 'late', label: 'Голи на 46–50′', get: r => r.late },
      { k: 'firsts', label: 'Перші голи', get: r => r.firsts },
      { k: 'seasons', label: 'Сезони', get: r => r.seasons.size },
    ];
    const q = Core.normName(statsState.q || '');
    const trows = q ? rows.filter(r => Core.normName(r.p.name).includes(q)) : rows;
    return `${playerCards(rows, ms)}<p class="note">Натисніть на число, щоб побачити матчі, або на назву картки — щоб побачити повний рейтинг.</p>
      <section class="block"><div class="sec-head"><h3 class="sub">Усі гравці</h3></div>
      <div class="toolbar"><input id="st-q" type="search" placeholder="Знайти гравця" value="${esc(statsState.q || '')}" aria-label="Знайти гравця">
      <label class="muted" for="st-min">Для середніх — не менше</label><input id="st-min" type="number" min="0" max="200" value="${min}" style="width:5em"><span class="muted">матчів</span></div>
      ${sortable({ rows: trows, sort: 'goals', limit: 50, cols: [
        { k: 'name', label: 'Гравець', get: r => r.p.name, html: r => playerLink(r.p), asc: true },
        { k: 'teams', label: 'Команди', html: teamsOf, get: () => '', hideS: true },
        { k: 'apps', label: 'М', title: 'Матчі', num: true, get: r => r.apps, pop: r => ppop(r.p, 'apps', ms) },
        { k: 'goals', label: 'Голи', num: true, get: r => r.goals, pop: r => ppop(r.p, 'goals', ms) },
        { k: 'gpm', label: 'Г/М', title: 'Голів за матч', num: true, get: r => (r.apps >= min ? r.gpm : null), fmt: v => dec(v, 2) },
        { k: 'pen', label: SP.pen.short, title: 'Голи з пенальті', num: true, get: r => r.pen, pop: r => ppop(r.p, 'pen', ms) },
        ...(hasTenm() ? [{ k: 'tenm', label: SP.tenm.short, title: 'Голи з 10-метрових', num: true, get: r => r.tenm, pop: r => ppop(r.p, 'tenm', ms) }] : []),
        { k: 'free', label: SP.fk.short, title: 'Голи зі штрафних ударів', num: true, get: r => r.free, pop: r => ppop(r.p, 'free', ms) },
        { k: 'hat', label: 'Хет-тр.', title: 'Три голи й більше в матчі', num: true, get: r => r.hat, pop: r => ppop(r.p, 'hat', ms) },
        { k: 'winners', label: 'Перем.', title: 'Переможні голи', num: true, get: r => r.winners, pop: r => ppop(r.p, 'winners', ms) },
        { k: 'streak', label: 'Серія', title: 'Матчів поспіль із голом', num: true, get: r => r.streak, pop: r => ppop(r.p, 'streak', ms) },
        { k: 'yc', label: 'ЖК', title: 'Попередження', num: true, get: r => r.yc, pop: r => ppop(r.p, 'yc', ms) },
        { k: 'rc', label: 'КК', title: 'Вилучення', num: true, get: r => r.rc, pop: r => ppop(r.p, 'rc', ms) },
        { k: 'seasons', label: 'Сез.', title: 'Сезонів', num: true, get: r => r.seasons.size },
      ] })}</section>`;
  }

  /* --- команды --- */
  function statsTeams(ms) {
    if (statsState.team) return teamFocus(ms);
    const rows = Stats.teamTable(db, ms).filter(r => r.p);
    const minP = Math.min(20, Math.max(5, Math.round(ms.length / 30)));
    const metrics = [
      { k: 'w', label: 'Перемоги', get: r => r.w },
      { k: 'winPct', label: 'Частка перемог', get: r => r.winPct, fmt: pct, min: r => r.p >= minP, note: `Команди, які зіграли не менше ${minP} матчів.` },
      { k: 'gfpm', label: 'Забивають за матч', get: r => r.gfpm, fmt: v => dec(v, 2), min: r => r.p >= minP },
      { k: 'cs', label: 'Сухі матчі', get: r => r.cs },
      { k: 'comebacks', label: 'Камбеки', get: r => r.comebacks, note: 'Перемоги після того, як команда поступалася.' },
      { k: 'acc', label: 'Удари в створ', get: r => (r.statN >= 5 ? r.acc : null), fmt: pct },
      { k: 'titles', label: 'Титули', get: r => r.team.trophies.filter(x => x.place === 1).length },
    ];
    return `${teamCards(rows, ms)}
      ${teamsScatter(ms)}
      <section class="block"><h3 class="sub">Усі команди</h3>${sortable({ rows, sort: 'w', limit: 100, cols: teamCols(ms), note: 'Удари, кутові й фоли — за матчами, де ця статистика є в протоколі.' })}</section>`;
  }
  function teamCols(ms) {
    const tp = k => r => tpop(r.team, k, ms);
    return [
      { k: 'name', label: 'Команда', get: r => r.team.name, html: r => teamLink(r.team), asc: true },
      { k: 'p', label: 'М', title: 'Матчі', num: true, get: r => r.p, pop: tp('p') },
      { k: 'w', label: 'В', title: 'Перемоги', num: true, get: r => r.w, pop: tp('w') }, { k: 'd', label: 'Н', title: 'Нічиї', num: true, get: r => r.d, pop: tp('d') }, { k: 'l', label: 'П', title: 'Поразки', num: true, get: r => r.l, pop: tp('l') },
      { k: 'winPct', label: '% В', title: 'Частка перемог', num: true, get: r => r.winPct, fmt: pct },
      { k: 'gfpm', label: 'Заб./м', title: 'Забито за матч', num: true, get: r => r.gfpm, fmt: v => dec(v, 2) },
      { k: 'gapm', label: 'Проп./м', title: 'Пропущено за матч', num: true, get: r => r.gapm, fmt: v => dec(v, 2), asc: true },
      { k: 'cs', label: 'Сухі', title: 'Матчі без пропущених голів', num: true, get: r => r.cs, pop: tp('cs') },
      { k: 'comebacks', label: 'Камбеки', title: 'Перемоги після того, як команда поступалася', num: true, get: r => r.comebacks, pop: tp('comebacks') },
      { k: 'shots', label: 'Удари/м', num: true, get: r => (r.statN ? r.shots / r.statN : null), fmt: v => dec(v, 1) },
      { k: 'acc', label: 'В створ', title: 'Частка ударів у створ', num: true, get: r => r.acc, fmt: pct },
      { k: 'corners', label: 'Кут./м', num: true, get: r => (r.statN ? r.corners / r.statN : null), fmt: v => dec(v, 1) },
      { k: 'fouls', label: 'Фоли/м', num: true, get: r => (r.statN ? r.fouls / r.statN : null), fmt: v => dec(v, 1), asc: true },
      { k: 'yc', label: 'ЖК', title: 'Попередження', num: true, get: r => r.yc, pop: tp('yc') }, { k: 'rc', label: 'КК', title: 'Вилучення', num: true, get: r => r.rc, pop: tp('rc') },
    ];
  }
  // одна команда: лента формы, соперники, сводка
  function teamFocus(ms) {
    const me = db.teams.get(statsState.team);
    const mine = Stats.teamTable(db, ms).find(r => r.team === me);
    const opp = new Map();
    for (const m of ms) {
      const sc = Core.tableScore(m); if (!sc) continue;
      const home = m.home === me, o = home ? m.away : m.home;
      const f = home ? sc.gh : sc.ga, a = home ? sc.ga : sc.gh;
      const r = opp.get(o.id) || { team: o, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, last: null };
      r.p++; r.gf += f; r.ga += a; if (sc.bothLost || f < a) r.l++; else if (f > a) r.w++; else r.d++; r.last = m;
      opp.set(o.id, r);
    }
    return `${mine ? teamStatFacts(mine, ms) : ''}
      ${formBlock(me, ms)}
      <section class="block"><h3 class="sub">Результати проти суперників</h3>
      ${sortable({ rows: [...opp.values()], sort: 'p', limit: 100, cols: [
        { k: 'name', label: 'Суперник', get: r => r.team.name, html: r => teamLink(r.team), asc: true },
        ...[['p', 'М'], ['w', 'В'], ['d', 'Н'], ['l', 'П']].map(([k, label]) => ({ k, label, num: true, get: r => r[k], pop: r => () => ({ title: plainName(me.name) + ' — ' + plainName(r.team.name) + ' · ' + TK[k], items: teamItems(me, k, ms, m => m.home === r.team || m.away === r.team) }) })),
        { k: 'pct', label: '% В', num: true, get: r => r.w / r.p, fmt: pct },
        { k: 'diff', label: 'Різн.', num: true, get: r => r.gf - r.ga, fmt: v => (v > 0 ? '+' : '') + v },
        { k: 'last', label: 'Останній матч', get: r => r.last.date, html: r => `<a href="#m-${r.last.id}">${shortDate(r.last.date)} ${esc(Core.scoreText(r.last))}</a>`, hideS: true },
      ] })}</section>`;
  }
  function formBlock(team, ms) {
    const list = ms.filter(m => m.home === team || m.away === team).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!list.length) return '';
    const rows = new Map();
    // лучшая серия побед — отметить
    let cur = [], best = [];
    const items = list.map(m => {
      const w = Core.winnerSide(m), s = m.home === team ? 'h' : 'a';
      const res = w === 'd' ? 'D' : w === s ? 'W' : w ? 'L' : 'L';
      if (res === 'W') { cur.push(m.id); if (cur.length > best.length) best = cur.slice(); } else cur = [];
      return { m, res };
    });
    const bset = new Set(best);
    for (const it of items) {
      const k = it.m.season.label; if (!rows.has(k)) rows.set(k, []);
      const o = it.m.home === team ? it.m.awayName : it.m.homeName;
      const sc = Core.tableScore(it.m); const f = it.m.home === team ? sc && sc.gh : sc && sc.ga, a = it.m.home === team ? sc && sc.ga : sc && sc.gh;
      rows.get(k).push({ ...it, mark: bset.has(it.m.id), title: shortDate(it.m.date) + ' · ' + it.m.tour.name + (it.m.stage ? ', ' + it.m.stage : ''), score: (it.m.tech ? 'тех. ' : '') + f + ':' + a, sub: 'проти ' + o });
    }
    return `<section class="block panel"><h3 class="sub">Стрічка форми</h3>${chart('formStrip', { rows: [...rows.entries()].map(([label, items]) => ({ label, items })) }, 0)}
      <p class="note">Кожен квадрат — матч: В — перемога, Н — нічия, П — поразка. Обведено матчі найкращої серії перемог (${best.length}). Наведіть, щоб побачити рахунок, натисніть, щоб відкрити протокол.</p></section>`;
  }
  function teamStatFacts(r, ms) {
    const s = r.streaks ? r.streaks.best : {};
    const at = r.streaks ? r.streaks.at : {};
    const rng = k => (at[k] ? ` title="${esc(fmtDate(at[k].from.date) + ' — ' + fmtDate(at[k].to.date))}"` : '');
    return `<div class="facts">
      ${kpi(pct(r.winPct), 'перемог')}${kpi(dec(r.gfpm, 2) + ' / ' + dec(r.gapm, 2), 'забито / пропущено за матч')}
      ${kpi(popv(r.cs, tpop(r.team, 'cs', ms)), 'сухих матчів')}${kpi(popv(r.comebacks, tpop(r.team, 'comebacks', ms)), 'перемог після відставання')}
      <div class="fact"${rng('win')}><b>${popv(s.win || 0, streakPop(r.team, at.win, 'перемоги поспіль', ms))}</b><span>перемог поспіль (рекорд)</span></div>
      <div class="fact"${rng('unbeaten')}><b>${popv(s.unbeaten || 0, streakPop(r.team, at.unbeaten, 'без поразок поспіль', ms))}</b><span>матчів без поразок поспіль</span></div>
      ${r.statN ? kpi(dec(r.shots / r.statN, 1), 'ударів за матч') + kpi(pct(r.acc), 'ударів у створ') + kpi(dec(r.corners / r.statN, 1), 'кутових за матч') + kpi(dec(r.fouls / r.statN, 1), 'фолів за матч') : ''}
      ${kpi(popv(r.yc, tpop(r.team, 'yc', ms)) + ' / ' + popv(r.rc, tpop(r.team, 'rc', ms)), 'попереджень / вилучень')}
    </div>`;
  }

  /* --- сравнение --- */
  const cmpState = { mode: 'players', a: null, b: null };
  function statsCompare() {
    const mode = cmpState.mode;
    const allP = [...db.players.values()].filter(p => p.apps.length >= 10).sort((a, b) => b.goals.length - a.goals.length);
    const allT = [...db.teams.values()].filter(t => t.matches.length >= 10).sort((a, b) => b.matches.length - a.matches.length);
    const pool = mode === 'players' ? allP : allT;
    if (!cmpState.a || !pool.includes(cmpState.a)) cmpState.a = pool[0];
    if (!cmpState.b || !pool.includes(cmpState.b) || cmpState.b === cmpState.a) cmpState.b = pool[1];
    const A = cmpState.a, B = cmpState.b;
    const id = 'cmp' + Math.random().toString(36).slice(2, 6);
    mounts.push(() => {
      document.querySelectorAll('#' + id + ' .chipset button').forEach(b => b.addEventListener('click', () => { cmpState.mode = b.dataset.v; cmpState.a = cmpState.b = null; renderStatsBody('compare'); }));
      ['a', 'b'].forEach(k => {
        const inp = document.getElementById(id + '-' + k);
        inp.addEventListener('change', () => { const x = pool.find(o => o.name === inp.value.trim()); if (x) { cmpState[k] = x; renderStatsBody('compare'); } });
      });
    });
    const dl = id + '-dl';
    const head = `<div id="${id}" class="block panel"><div class="chipset" role="group"><button type="button" data-v="players" aria-pressed="${mode === 'players'}">Гравці</button><button type="button" data-v="teams" aria-pressed="${mode === 'teams'}">Команди</button></div>
      <div class="cmp-sel"><label>${mode === 'players' ? 'Перший гравець' : 'Перша команда'}<input id="${id}-a" list="${dl}" value="${esc(A.name)}"></label><label>${mode === 'players' ? 'Другий гравець' : 'Друга команда'}<input id="${id}-b" list="${dl}" value="${esc(B.name)}"></label></div>
      <datalist id="${dl}">${pool.map(o => `<option value="${esc(o.name)}"></option>`).join('')}</datalist>
      <p class="note">Почніть вводити ${mode === 'players' ? 'прізвище' : 'назву'} і виберіть зі списку.</p></div>`;
    return head + (mode === 'players' ? comparePlayers(A, B) : compareTeams(A, B));
  }
  function comparePlayers(A, B) {
    const ra = Stats.playerTable(db, A.apps.map(x => x.m)).find(r => r.p === A), rb = Stats.playerTable(db, B.apps.map(x => x.m)).find(r => r.p === B);
    if (!ra || !rb) return '';
    const rows = [
      { label: 'матчі', a: ra.apps, b: rb.apps }, { label: 'голи', a: ra.goals, b: rb.goals },
      { label: 'голів за матч', a: +ra.gpm.toFixed(2), b: +rb.gpm.toFixed(2), fmt: v => dec(v, 2) },
      { label: 'переможні голи', a: ra.winners, b: rb.winners }, { label: 'хет-трики', a: ra.hat, b: rb.hat }, { label: 'дублі', a: ra.brace, b: rb.brace },
      { label: 'серія з голами', a: ra.streak, b: rb.streak }, { label: 'голи з пенальті', a: ra.pen, b: rb.pen }, { label: 'голи зі штрафних', a: ra.free, b: rb.free },
      { label: 'попередження', a: ra.yc, b: rb.yc, lowerBetter: true }, { label: 'вилучення', a: ra.rc, b: rb.rc, lowerBetter: true }, { label: 'сезони', a: ra.seasons.size, b: rb.seasons.size },
    ];
    const seasons = [...new Set([...A.apps, ...B.apps].map(x => x.m.season.label))].sort((x, y) => Core.seasonOrder(x) - Core.seasonOrder(y));
    const gps = p => seasons.map(s => p.goals.filter(g => g.m.season.label === s).length);
    const vs = A.apps.filter(a => B.apps.some(b => b.m === a.m)).map(a => ({ a, b: B.apps.find(b => b.m === a.m) }));
    const together = vs.filter(x => x.a.side === x.b.side).length, against = vs.filter(x => x.a.side !== x.b.side);
    let aw = 0, bw = 0, dr = 0;
    for (const x of against) { const w = Core.winnerSide(x.a.m); if (w === x.a.side) aw++; else if (w === x.b.side) bw++; else dr++; }
    return `<section class="block panel">${chart('mirror', { a: A.name, b: B.name, rows }, 0)}</section>
      <section class="block panel"><h3 class="sub">Голи за сезонами</h3>${legend([{ label: A.name, color: S(1), line: true }, { label: B.name, color: S(2), line: true }])}${chart('line', { labels: seasons, series: [{ name: A.name, values: gps(A), color: S(1) }, { name: B.name, values: gps(B), color: S(2) }] })}</section>
      <div class="facts">${kpi(together, 'матчів в одній команді')}${kpi(against.length, 'матчів один проти одного')}${against.length ? kpi(aw + '–' + dr + '–' + bw, 'перемоги ' + esc(A.name.split(' ')[0]) + ' – нічиї – перемоги ' + esc(B.name.split(' ')[0])) : ''}</div>
      ${against.length ? `<section class="block"><h3 class="sub">Матчі один проти одного</h3><div class="mlist">${against.slice(-20).reverse().map(x => matchRow(x.a.m, { ctx: stageCtx(x.a.m) })).join('')}</div></section>` : ''}`;
  }
  function compareTeams(A, B) {
    const ra = Stats.teamTable(db, A.matches).find(r => r.team === A), rb = Stats.teamTable(db, B.matches).find(r => r.team === B);
    const rows = [
      { label: 'матчі', a: ra.p, b: rb.p }, { label: 'перемоги', a: ra.w, b: rb.w }, { label: 'частка перемог, %', a: Math.round(ra.winPct * 100), b: Math.round(rb.winPct * 100) },
      { label: 'забито за матч', a: +ra.gfpm.toFixed(2), b: +rb.gfpm.toFixed(2), fmt: v => dec(v, 2) }, { label: 'пропущено за матч', a: +ra.gapm.toFixed(2), b: +rb.gapm.toFixed(2), fmt: v => dec(v, 2), lowerBetter: true },
      { label: 'сухі матчі', a: ra.cs, b: rb.cs }, { label: 'камбеки', a: ra.comebacks, b: rb.comebacks },
      { label: 'перемог поспіль', a: ra.streaks.best.win, b: rb.streaks.best.win }, { label: 'титули', a: A.trophies.filter(x => x.place === 1).length, b: B.trophies.filter(x => x.place === 1).length },
      { label: 'ударів за матч', a: ra.statN ? +(ra.shots / ra.statN).toFixed(1) : null, b: rb.statN ? +(rb.shots / rb.statN).toFixed(1) : null, fmt: v => dec(v, 1) },
      { label: 'попередження', a: ra.yc, b: rb.yc, lowerBetter: true },
    ];
    const h2h = A.matches.filter(m => m.home === B || m.away === B);
    let aw = 0, bw = 0, dr = 0, ag = 0, bg = 0;
    for (const m of h2h) { const sc = Core.tableScore(m); if (!sc) continue; const w = Core.winnerSide(m); const sa = m.home === A ? 'h' : 'a'; if (w === sa) aw++; else if (w === 'd') dr++; else bw++; ag += sa === 'h' ? sc.gh : sc.ga; bg += sa === 'h' ? sc.ga : sc.gh; }
    return `<section class="block panel">${chart('mirror', { a: A.name, b: B.name, rows }, 0)}</section>
      <div class="facts">${kpi(h2h.length, 'особистих зустрічей')}${h2h.length ? kpi(aw + '–' + dr + '–' + bw, 'перемоги ' + esc(A.name) + ' – нічиї – перемоги ' + esc(B.name)) + kpi(ag + ':' + bg, 'м’ячі в особистих зустрічах') : ''}</div>
      ${h2h.length ? `<section class="block"><h3 class="sub">Особисті зустрічі</h3><div class="mlist">${h2h.slice().reverse().slice(0, 30).map(m => matchRow(m, { ctx: stageCtx(m) })).join('')}</div></section>` : ''}`;
  }

  /* --- матчи --- */
  function statsMatches(ms) {
    const pl = ms.filter(m => m.score && !m.tech);
    const L = Stats.matchLists(ms);
    // матрица счетов: голы победителя × голы проигравшего (для ничьих — по диагонали)
    const cap = 15, capL = 10;
    const mx = Array.from({ length: cap + 1 }, () => new Array(capL + 1).fill(0));
    const byCell = new Map();
    for (const m of pl) { const hi = Math.min(cap, Math.max(...m.score)), lo = Math.min(capL, Math.min(...m.score)); mx[hi][lo]++; const k = hi + '|' + lo; if (!byCell.has(k)) byCell.set(k, []); byCell.get(k).push(m); }
    const used = mx.map((r, i) => [r, i]).filter(([r]) => r.some(v => v));
    const totals = new Map(); for (const m of pl) { const t = Math.min(25, m.score[0] + m.score[1]); if (!totals.has(t)) totals.set(t, []); totals.get(t).push(m); }
    const tk = [...totals.keys()].sort((a, b) => a - b);
    const top = [...byCell.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 5).map(([k, v]) => { const [hi, lo] = k.split('|'); return `${hi}${+hi === cap ? '+' : ''}:${lo}${+lo === capL ? '+' : ''} — ${v.length}`; });
    const sum = (m, k) => (m.stats && m.stats[k] ? m.stats[k][0] + m.stats[k][1] : 0);
    return `<section class="block panel"><h3 class="sub">Найчастіші рахунки</h3>
        ${chart('heatmap', { rows: used.map(([, i]) => String(i) + (i === cap ? '+' : '')), cols: Array.from({ length: capL + 1 }, (_, j) => String(j) + (j === capL ? '+' : '')), values: used.map(([r]) => r), unit: 'матчів', corner: 'більше : менше', showValues: true, rowW: 110, cellW: 32, cellTitle: (i, j) => `рахунок ${used[i][1]}:${j}`, onClick: (i, j) => openMatches({ title: `Рахунок ${used[i][1]}:${j}`, items: (byCell.get(used[i][1] + '|' + j) || []).map(m => ({ m })) }) }, 0)}
        <p class="note">Рядок — голи команди, яка забила більше, стовпчик — голи суперника. Найчастіше: ${top.join('; ')}. Натисніть на клітинку, щоб побачити матчі.</p></section>
      <section class="block panel"><h3 class="sub">Скільки голів забивають у матчі</h3>${colsHtml(tk.map(t => ({ label: t === 25 ? '25+' : String(t), values: [totals.get(t).length], pop: () => ({ title: `Голів у матчі: ${t}${t === 25 ? '+' : ''}`, items: totals.get(t).map(m => ({ m })) }) })), [S(1)], 220)}<p class="note">Під стовпчиком — кількість голів у матчі, над ним — скільки таких матчів. Натисніть, щоб побачити матчі.</p></section>
      <section class="grid2">
        ${recordCards('Найбільші перемоги', L.biggest.slice(0, 6), m => '+' + Math.abs(m.score[0] - m.score[1]))}
        ${recordCards('Найрезультативніші', L.highest.slice(0, 6), m => (m.score[0] + m.score[1]) + ' голів')}
        ${recordCards('Камбеки', L.comebacks.slice(0, 6).map(x => x.m), m => { const x = L.comebacks.find(c => c.m === m); return (x.won ? 'перемога' : 'нічия') + ' після −' + x.def; })}
        ${recordCards('Найшвидші голи', L.fastest.slice(0, 6).map(x => x.m), m => { const x = L.fastest.find(c => c.m === m); return x.g.min + '′ · ' + x.g.name; })}
        ${recordCards('Перемога на останніх хвилинах', L.lateWinners.slice(0, 6).map(x => x.m), m => { const x = L.lateWinners.find(c => c.m === m); return x.g.min + '′ · ' + x.g.name; })}
        ${recordCards('Найбільше ударів', L.shots.slice(0, 6), m => sum(m, 'shots') + ' ударів')}
        ${recordCards('Найбільше кутових', L.corners.slice(0, 6), m => sum(m, 'corners') + ' кутових')}
        ${recordCards('Найбільше глядачів', L.attendance.slice(0, 6), m => m.att + ' глядачів')}
      </section>`;
  }
  function recordCards(title, list, tag) {
    if (!list.length) return '';
    return `<div class="block"><h3 class="sub">${title}</h3><div class="rcards">${list.map(m => `<a class="rcard" href="#m-${m.id}"><span class="rc-tag">${esc(tag(m))}</span><span class="rc-teams"><span>${esc(m.homeName)}</span><b>${esc(Core.scoreText(m))}</b><span>${esc(m.awayName)}</span></span><span class="rc-ctx">${shortDate(m.date)} · ${esc(m.tour.name)}</span></a>`).join('')}</div></div>`;
  }

  /* --- серии --- */
  function statsStreaks(ms) {
    const rows = Stats.teamTable(db, ms).filter(r => r.p >= 5);
    let pl = Stats.playerTable(db, ms).filter(r => r.streak >= 2);
    if (statsState.team) pl = pl.filter(r => r.teams.has(statsState.team));
    const sk = (k, label, note) => ({ k, label, get: r => r.streaks.best[k], note });
    const fmtR = r => '';
    const team = statsState.team ? db.teams.get(statsState.team) : null;
    return `${team ? formBlock(team, ms) : '<div class="callout">Виберіть команду у фільтрі, щоб побачити її стрічку форми за сезонами.</div>'}
      <section class="block panel"><h3 class="sub">Рекордні серії команд</h3>${leaders(rows, [sk('win', 'Перемоги поспіль'), sk('unbeaten', 'Без поразок'), sk('scoring', 'Забивали поспіль'), sk('cs', 'Не пропускали поспіль'), sk('loss', 'Поразки поспіль'), sk('winless', 'Без перемог поспіль')], { label: r => r.team.name, href: r => '#t-' + r.team.id, pop: (r, k, m) => streakPop(r.team, r.streaks.at[k], m.label.toLowerCase(), ms) })}
        <p class="note">Серії рахуються за всіма матчами вибраного фільтра в порядку дат. Натисніть на число, щоб побачити матчі серії.</p></section>
      <section class="block panel"><h3 class="sub">Гравці: матчів поспіль із голом</h3>${hbars(pl.sort((a, b) => b.streak - a.streak).slice(0, 15).map(r => ({ label: r.p.name, sub: teamsTxt(r), value: r.streak, href: '#p-' + r.p.id, pop: ppop(r.p, 'streak', ms) })))}</section>
      <section class="block"><h3 class="sub">Таблиця серій</h3>${sortable({ rows, sort: 'win', limit: 100, cols: [
        { k: 'name', label: 'Команда', get: r => r.team.name, html: r => teamLink(r.team), asc: true },
        ...[['win', 'Перемоги'], ['unbeaten', 'Без пораз.'], ['scoring', 'Забивали'], ['cs', 'Не пропуск.'], ['loss', 'Поразки'], ['winless', 'Без перемог']].map(([k, label]) => ({ k, label, num: true, get: r => r.streaks.best[k], html: r => { const a = r.streaks.at[k]; const v = r.streaks.best[k]; return a && v ? popv(v, streakPop(r.team, a, label.toLowerCase(), ms)) : String(v || 0); } })),
      ] })}</section>`;
  }

  /* --- стандарты: пенальти, 10-метровые, штрафные удары --- */
  function statsSetPieces(ms) {
    const o = Stats.overview(db, ms);
    let pl = Stats.playerTable(db, ms);
    if (statsState.team) pl = pl.filter(r => r.teams.has(statsState.team));
    const tenm = hasTenm();
    const missedBy = { 'вратарь': o.mp['вратарь'], 'мимо': o.mp['мимо'], 'штанга': o.mp['штанга'] };
    const type = (k, label, scored, bins, field, extra) => `<section class="block panel sp">
        <div class="sp-head"><h3 class="sub">${label}</h3><span class="sp-num">${nf(scored)}<small>${plural(scored, 'гол', 'голи', 'голів')}</small></span></div>
        ${extra || ''}
        <div class="grid2"><div><h4 class="mini">Коли забивають</h4>${colsHtml(minuteCols(ms, k), [k === 'fk' ? S(3) : S(1)], 190)}</div>
        <div><h4 class="mini">Найкращі виконавці</h4>${hbars(pl.filter(r => r[field] > 0).sort((a, b) => b[field] - a[field]).slice(0, 10).map(r => ({ label: r.p.name, sub: teamsTxt(r), value: r[field], href: '#p-' + r.p.id, pop: ppop(r.p, field, ms) })))}</div></div>
      </section>`;
    const missed = `<div class="facts">${kpi(nf(o.missedTotal), 'не забито')}${kpi(nf(missedBy['вратарь']), 'відбив воротар')}${kpi(nf(missedBy['мимо']), 'повз')}${kpi(nf(missedBy['штанга']), 'штанга або поперечина')}${kpi(pct(o.pens / ((o.pens + o.missedTotal) || 1)), 'реалізація')}</div>`;
    const mpRows = pl.filter(r => r.pen + r.mpTotal > 0);
    return `${type('pen', SP.pen.label + (tenm ? '' : ' *'), o.pens, o.binsBy.pen, 'pen', missed)}
      ${tenm ? type('tenm', SP.tenm.label, o.tenm, o.binsBy.tenm, 'tenm') : ''}
      ${type('fk', SP.fk.label, o.free, o.binsBy.fk, 'free')}
      <section class="block"><h3 class="sub">Виконавці пенальті</h3>${sortable({ rows: mpRows, sort: 'att', limit: 30, cols: [
        { k: 'name', label: 'Гравець', get: r => r.p.name, html: r => playerLink(r.p), asc: true },
        { k: 'teams', label: 'Команди', html: teamsOf, get: () => '', hideS: true },
        { k: 'att', label: 'Ударів', num: true, get: r => r.pen + r.mpTotal },
        { k: 'pen', label: 'Забито', num: true, get: r => r.pen, pop: r => ppop(r.p, 'pen', ms) },
        { k: 'saved', label: 'Воротар', title: 'Відбив воротар', num: true, get: r => r.mpSaved, pop: r => ppop(r.p, 'mp', ms) },
        { k: 'wide', label: 'Повз', num: true, get: r => r.mpWide, pop: r => ppop(r.p, 'mp', ms) },
        { k: 'post', label: 'Штанга', num: true, get: r => r.mpPost, pop: r => ppop(r.p, 'mp', ms) },
        { k: 'pct', label: 'Реаліз.', num: true, get: r => r.pen / (r.pen + r.mpTotal), fmt: pct },
      ] })}</section>
      <p class="note">* ${SP.pen.note} Незабиті удари в протоколах записано під заголовком «Незабиті пенальті», тому промахи враховано тут. Голи зі штрафних ударів позначено в протоколах словом «штрафний».</p>`;
  }

  /* --- дисциплина --- */
  function statsCards(ms) {
    let pl = Stats.playerTable(db, ms).filter(r => r.yc || r.rc);
    if (statsState.team) pl = pl.filter(r => r.teams.has(statsState.team));
    const tt = Stats.teamTable(db, ms).filter(r => r.p >= 5);
    const o = Stats.overview(db, ms);
    const yb = new Array(10).fill(0), rb = new Array(10).fill(0);
    for (const m of ms) { for (const c of m.yc) { const b = Stats.binOf(c.min); if (b >= 0 && b < 10) yb[b]++; } for (const c of m.rc) { const b = Stats.binOf(c.min); if (b >= 0 && b < 10) rb[b]++; } }
    return `<section class="facts big">${kpi(nf(o.yc), 'попереджень')}${kpi(nf(o.rc), 'вилучень')}${kpi(dec(o.yc / (o.played || 1), 2), 'попереджень за матч')}</section>
      <section class="block panel"><h3 class="sub">Коли показують картки</h3>${legend([{ label: 'попередження', color: S(4) }, { label: 'вилучення', color: S(8) }])}${colsHtml(yb.map((y, b) => ({ label: Stats.BINS[b], values: [y, rb[b]], pop: () => ({ title: 'Картки на ' + Stats.BINS[b] + ' хвилинах', items: [...groupMap(ms.flatMap(m => [...m.yc.map(c => ({ m, c, t: 'ЖК' })), ...m.rc.map(c => ({ m, c, t: 'КК' }))]).filter(x => Stats.binOf(x.c.min) === b))].map(([m, xs]) => ({ m, note: xs.map(x => x.t + ' ' + x.c.min + '′ ' + (x.c.p ? x.c.p.name : '')).join(', ') })) }) })), [S(4), S(8)], 210)}<p class="note">Натисніть на стовпчик, щоб побачити матчі.</p></section>
      <section class="grid2">
        <div class="block panel"><h3 class="sub">Гравці</h3>${leaders(pl, [{ k: 'fair', label: 'Штрафні очки', get: r => r.fair, note: 'За регламентом: вилучення — 5 очок, попередження — 1.' }, { k: 'yc', label: 'Попередження', get: r => r.yc }, { k: 'rc', label: 'Вилучення', get: r => r.rc }], { label: r => r.p.name, sub: teamsTxt, href: r => '#p-' + r.p.id, n: 12, pop: (r, k) => ppop(r.p, k, ms) })}</div>
        <div class="block panel"><h3 class="sub">Команди</h3>${leaders(tt, [{ k: 'fairpm', label: 'Найкоректніші', get: r => 1 / (0.05 + r.fair / r.p), fmt: v => dec(1 / v - 0.05, 2) + ' очк./м', note: 'Штрафні очки за матч: що менше, то вище. Команди від 5 матчів.' }, { k: 'rough', label: 'Найбільше очок за матч', get: r => r.fair / r.p, fmt: v => dec(v, 2) }, { k: 'rc', label: 'Вилучення', get: r => r.rc }], { label: r => r.team.name, href: r => '#t-' + r.team.id, n: 12, pop: (r, k) => (k === 'rc' ? tpop(r.team, 'rc', ms) : tpop(r.team, 'yc', ms)) })}</div>
      </section>`;
  }

  /* --- судьи --- */
  function statsRefs(ms) {
    const rows = Stats.referees(ms);
    const big = rows.filter(r => r.n >= 10);
    return `<section class="block panel"><h3 class="sub">Судді: матчі та картки</h3>${big.length >= 3 ? chart('scatter', { points: big.map(r => ({ id: r.name, x: r.n, y: +r.ycpm.toFixed(2), r: r.n, label: r.name, rec: r })), xLabel: 'матчів', yLabel: 'попереджень за матч', labelAll: big.length <= 12, height: 340, tip: p => [{ value: p.rec.n, label: 'матчів' }, { value: dec(p.rec.ycpm, 2), label: 'попереджень за матч' }, { value: dec(p.rec.gpm, 2), label: 'голів за матч' }] }, 340) : ''}<p class="note">Судді від 10 матчів. Що вища точка, то частіше суддя показує картки.</p></section>
      ${sortable({ rows, sort: 'n', limit: 100, cols: [
        { k: 'name', label: 'Суддя', get: r => r.name, asc: true },
        { k: 'n', label: 'Матчі', num: true, get: r => r.n, pop: r => () => ({ title: 'Суддя ' + r.name, items: ms.filter(m => m.ref === r.name).map(m => ({ m, note: (m.yc.length || m.rc.length) ? 'ЖК ' + m.yc.length + (m.rc.length ? ', КК ' + m.rc.length : '') : '' })) }) },
        { k: 'span', label: 'Роки', get: r => r.first, html: r => r.first.slice(0, 4) + (r.last.slice(0, 4) !== r.first.slice(0, 4) ? '–' + r.last.slice(0, 4) : '') },
        { k: 'gpm', label: 'Голів/м', num: true, get: r => r.gpm, fmt: v => dec(v, 2) },
        { k: 'ycpm', label: 'ЖК/м', num: true, get: r => r.ycpm, fmt: v => dec(v, 2) },
        { k: 'rc', label: 'КК', num: true, get: r => r.rc },
        { k: 'pens', label: 'Пенальті', title: 'Призначено пенальті (забиті й незабиті)', num: true, get: r => r.pens },
      ] })}`;
  }

  /* ================= статистика на странице команды ================= */
  function teamStatsSection(t) {
    const rows = Stats.teamTable(db, t.matches);
    const r = rows.find(x => x.team === t);
    if (!r || !r.p) return '';
    const seasons = [...new Set(t.matches.map(m => m.season.label))];
    const per = seasons.map(s => rows && Stats.teamTable(db, t.matches.filter(m => m.season.label === s)).find(x => x.team === t));
    return `<section class="block"><div class="sec-head"><h2 class="sec">Статистика команди</h2><a href="#stats-teams" data-team="${t.id}" class="to-stats">Детально з фільтрами</a></div>
      ${teamStatFacts(r)}
      <div class="grid2">
        ${seasons.length > 1 ? `<div class="block panel"><h3 class="sub">Результати за сезонами</h3>${legend([{ label: 'перемоги', color: S(1) }, { label: 'нічиї', color: S(4) }, { label: 'поразки', color: S(2) }])}${chart('stacked', { labels: seasons, series: [{ name: 'перемоги', values: per.map(x => x.w), color: S(1) }, { name: 'нічиї', values: per.map(x => x.d), color: S(4) }, { name: 'поразки', values: per.map(x => x.l), color: S(2) }] })}</div>` : ''}
        <div class="block panel"><h3 class="sub">Коли забиває та пропускає</h3>${legend([{ label: 'забито', color: S(1) }, { label: 'пропущено', color: S(2) }])}${colsHtml(r.binsF.slice(0, 10).map((v, b) => ({ label: Stats.BINS[b], values: [v, r.binsA[b]], pop: () => ({ title: plainName(t.name) + ' · голи на ' + Stats.BINS[b] + ' хвилинах', items: [...groupMap(t.matches.flatMap(m => m.goals.filter(g => Stats.binOf(g.min) === b && (g.side === 'h' || g.side === 'a')).map(g => ({ m, g }))))].map(([m, xs]) => ({ m, note: xs.map(x => ((x.g.side === 'h') === (m.home === t) ? 'забито ' : 'пропущено ') + x.g.min + '′').join(', ') })) }) })), [S(1), S(2)], 200)}</div>
        ${seasons.length > 1 ? `<div class="block panel"><h3 class="sub">Голів за матч за сезонами</h3>${legend([{ label: 'забито', color: S(1), line: true }, { label: 'пропущено', color: S(2), line: true }])}${chart('line', { labels: seasons, series: [{ name: 'забито', values: per.map(x => +x.gfpm.toFixed(2)), color: S(1) }, { name: 'пропущено', values: per.map(x => +x.gapm.toFixed(2)), color: S(2) }], fmt: v => dec(v, 2) })}</div>` : ''}
        ${placesChart(t)}
      </div>
      <p class="note">* У протоколах незабиті пенальті та штрафні йдуть одним списком.</p>
    </section>`;
  }
  function placesChart(t) {
    const lf = t.finishes.filter(f => f.t.format === 'league' && !f.t.final).sort((a, b) => Core.seasonOrder(a.t.season.label) - Core.seasonOrder(b.t.season.label));
    if (lf.length < 2) return '';
    return `<div class="block panel"><h3 class="sub">Місце в лізі за сезонами</h3>${chart('line', { labels: lf.map(f => f.t.season.label + (f.t.id === 'chemp' ? '' : f.t.id === 'media' ? ' М' : ' Б')), series: [{ name: 'місце', values: lf.map(f => f.pos), color: S(1) }], invert: true, yMax: Math.max(...lf.map(f => f.n)), yFmt: v => String(v), fmt: v => v + ' місце' })}<p class="note">М — Медіа-ліга, Б — Бренд-ліга. Перше місце — угорі.</p></div>`;
  }

  /* ================= статистика на странице игрока ================= */
  function playerStatsSection(p) {
    if (!p.apps.length && !p.goals.length) return '';
    const d = Stats.playerDetail(p);
    const braces = (() => { const per = new Map(); for (const g of p.goals) per.set(g.m.id, (per.get(g.m.id) || 0) + 1); let b = 0; for (const v of per.values()) if (v === 2) b++; return b; })();
    const att = d.pens + d.free + d.mp.total;
    return `<section class="block"><h2 class="sec">Статистика гравця</h2>
      <div class="facts">
        ${kpi(dec(p.apps.length ? p.goals.length / p.apps.length : 0, 2), 'голів за матч')}
        ${kpi(popv(d.winners, ppop(p, 'winners')), 'переможних голів')}${kpi(popv(d.firsts, ppop(p, 'firsts')), 'перших голів у матчі')}
        ${kpi(popv(d.streak, ppop(p, 'streak')), 'матчів поспіль із голом')}
        ${kpi(popv(braces, ppop(p, 'brace')) + ' / ' + popv(p.hatTricks, ppop(p, 'hat')), 'дублів / хет-триків')}
        ${att ? kpi(popv(d.pens, ppop(p, 'pen')) + ' + ' + popv(d.free, ppop(p, 'free')) + ' з ' + att, 'пенальті + штрафні: забито з ударів*') : ''}
        ${d.mp.total ? kpi(popv(d.mp.total, ppop(p, 'mp')), 'не забито: ' + d.mp.saved + ' воротар, ' + d.mp.wide + ' повз, ' + d.mp.post + ' штанга') : ''}
        ${kpi(popv(p.yc.length, ppop(p, 'yc')) + ' / ' + popv(p.rc.length, ppop(p, 'rc')), 'попереджень / вилучень')}${p.og.length ? kpi(popv(p.og.length, ppop(p, 'og')), plural(p.og.length, 'автогол', 'автоголи', 'автоголів')) : ''}
      </div>
      <div class="grid2">
        ${d.bySeason.length > 1 ? `<div class="block panel"><h3 class="sub">Матчі та голи за сезонами</h3>${legend([{ label: 'матчі', color: S(3) }, { label: 'голи', color: S(1) }])}${colsHtml(d.bySeason.map(x => ({ label: x.s, values: [x.apps, x.goals], pop: () => ({ title: p.name + ' · сезон ' + x.s, items: (() => { const per = new Map(playerItems(p, 'goals').map(g => [g.m, g.note])); return playerItems(p, 'apps').filter(a => a.m.season.label === x.s).map(a => ({ m: a.m, note: per.get(a.m) })); })() }) })), [S(3), S(1)], 210)}<p class="note">Натисніть на сезон, щоб побачити матчі.</p></div>` : ''}
        ${p.goals.length >= 5 ? `<div class="block panel"><h3 class="sub">Коли забиває</h3>${colsHtml(minuteCols(p.goals.map(g => g.m).filter((m, i, a) => a.indexOf(m) === i), 'all', g => g.p === p && !g.og), [S(1)], 190)}</div>` : ''}
        ${d.opponents.length ? `<div class="block"><h3 class="sub">Найбільше голів у ворота</h3><div class="tw"><table><tbody>${d.opponents.map(o => `<tr><td>${teamLink(o.team)}</td><td class="n pts">${o.goals}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
        ${d.mates.length ? `<div class="block"><h3 class="sub">Найчастіше на майданчику разом</h3><div class="tw"><table><tbody>${d.mates.map(o => `<tr><td>${playerLink(o.p)}</td><td class="n">${o.n} ${plural(o.n, 'матч', 'матчі', 'матчів')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      </div>
      ${att ? '<p class="note">* Незабиті пенальті та штрафні в протоколах ідуть одним списком.</p>' : ''}
    </section>`;
  }

  /* ================= статистика турнира ================= */
  const bumpHL = new Map();
  function tournamentStats(t, v) {
    if (t.final || !t.matches.length) return '';
    let out = '';
    for (const tb of v.tables) {
      const rounds = new Set(tb.matches.map(m => m.stage)).size;
      if (rounds < 3 || tb.rows.length < 3) continue;
      const key = t.key + '|' + (tb.div || '');
      if (!bumpHL.has(key)) bumpHL.set(key, tb.rows.slice(0, 3).map(r => r.team.id));
      const pr = Stats.progression(t, tb.div);
      const id = 'bump' + Math.random().toString(36).slice(2, 8);
      const draw = () => {
        const el = document.getElementById(id); if (!el) return;
        const hl = bumpHL.get(key);
        Charts.bump(el.querySelector('.chart'), { rounds: pr.rounds, n: pr.n, series: pr.series, highlight: hl, palette: [S(1), S(2), S(3)], onToggle: tid => toggle(tid) });
        el.querySelectorAll('.bchip').forEach(b => { const k = hl.indexOf(b.dataset.id); b.classList.toggle('on', k >= 0); b.style.setProperty('--c', k >= 0 ? [S(1), S(2), S(3)][k] : 'transparent'); });
      };
      const toggle = tid => { let hl = bumpHL.get(key).slice(); const k = hl.indexOf(tid); if (k >= 0) hl.splice(k, 1); else { hl.push(tid); if (hl.length > 3) hl.shift(); } bumpHL.set(key, hl); draw(); };
      mounts.push(() => { draw(); const el = document.getElementById(id); if (el) el.querySelectorAll('.bchip').forEach(b => b.addEventListener('click', () => toggle(b.dataset.id))); });
      chartMounts.push(draw);
      out += `<div class="block panel" id="${id}"><h3 class="sub">Місця за турами${tb.div ? ' · ' + esc(tb.div) : ''}</h3>
        <div class="bchips">${tb.rows.map(r => `<button type="button" class="bchip" data-id="${r.team.id}"><i></i>${esc(r.name)}</button>`).join('')}</div>
        <div class="chart" style="height:${Math.max(220, pr.n * 26 + 40)}px"></div><p class="note">Виберіть до трьох команд, щоб виділити їхні лінії.</p></div>`;
      if (t.format === 'league') out += crossTableHtml(t, tb);
    }
    const tt = Stats.teamTable(db, t.matches).filter(r => r.p);
    out += `<div class="block"><h3 class="sub">Статистика команд турніру</h3>${sortable({ rows: tt, sort: 'gfpm', limit: 40, cols: teamCols(t.matches).filter(c => !['winPct', 'firstWin'].includes(c.k)), note: 'Удари, кутові й фоли — за матчами, де ця статистика є в протоколі.' })}</div>`;
    const gr = Stats.goalsByRound(t).filter(x => Core.isRoundStage(x.stage)).sort((a, b) => parseInt(a.stage, 10) - parseInt(b.stage, 10));
    if (gr.length >= 3) out += `<div class="block panel"><h3 class="sub">Голів за матч за турами</h3>${chart('bars', { labels: gr.map(x => parseInt(x.stage, 10) + ''), values: gr.map(x => +(x.goals / x.n).toFixed(1)), unit: 'голів за матч', color: S(1), fmt: v => dec(v, 1) })}</div>`;
    return `<section class="block"><h2 class="sec">Статистика турніру</h2>${out}</section>`;
  }
  function crossTableHtml(t, tb) {
    const ct = Stats.crossTable(t, tb.div, tb.rows.map(r => r.team.id));
    const rs = tb.rows;
    const cls = (m, me) => { const w = Core.winnerSide(m); const s = m.home.id === me ? 'h' : 'a'; return w === 'd' ? 'd' : w === s ? 'w' : 'l'; };
    return `<div class="block"><h3 class="sub">Шахівка${tb.div ? ' · ' + esc(tb.div) : ''}</h3><div class="tw"><table class="cross"><thead><tr><th></th>${rs.map((r, i) => `<th class="c" title="${esc(r.name)}">${i + 1}</th>`).join('')}</tr></thead><tbody>${rs.map((r, i) => `<tr><th class="ct">${i + 1}. ${teamLink(r.team, r.name)}</th>${rs.map((c, j) => {
      if (i === j) return '<td class="x"></td>';
      const ms = [...ct.get(r.team.id, c.team.id), ...ct.get(c.team.id, r.team.id)].sort((a, b) => (a.date < b.date ? -1 : 1));
      return `<td class="c">${ms.map(m => { const sc = Core.tableScore(m); const f = m.home.id === r.team.id ? sc && sc.gh : sc && sc.ga, a = m.home.id === r.team.id ? sc && sc.ga : sc && sc.gh; return `<a href="#m-${m.id}" class="cr ${cls(m, r.team.id)}">${m.tech ? '+/−' : f + ':' + a}</a>`; }).join('')}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div><p class="note">Рахунок з погляду команди в рядку. Зелений — перемога, сірий — нічия, червоний — поразка.</p></div>`;
  }

  function notFound() {
    return `<div class="page"><h1 class="title">Сторінку не знайдено</h1><p class="lead">Такої сторінки в архіві немає. Поверніться на <a href="#">головну</a> або скористайтеся пошуком.</p></div>`;
  }

  /* ---------- маршрутизация ---------- */
  function route() {
    if (!db) return;
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
    pops.clear(); ranks.clear();
    let html, nav = '';
    let m;
    if (!h) { html = pageHome(); nav = 'home'; }
    else if (h === 'teams') { html = pageTeams(); nav = 'teams'; }
    else if (h === 'players') { html = pagePlayers(); nav = 'players'; }
    else if (h === 'records') { html = pageRecords(); nav = 'records'; }
    else if ((m = h.match(/^stats(?:-(players|teams|compare|matches|streaks|setpieces|cards|refs))?$/))) { html = pageStats(m[1] || ''); nav = 'stats'; }
    else if (h === 'seasons') { html = pageSeasons(); nav = 'seasons'; }
    else if (h === 'videos') { html = pageVideos(); nav = 'videos'; }
    else if ((m = h.match(/^s-(\d{4}(?:-\d{2})?)(?:-([a-z]+))?$/))) { html = pageSeason(m[1], m[2]); nav = 'seasons'; }
    else if ((m = h.match(/^m-(.+)$/))) { html = pageMatch(m[1]); nav = 'seasons'; }
    else if ((m = h.match(/^t-(.+)$/))) { html = pageTeam(m[1]); nav = 'teams'; }
    else if ((m = h.match(/^p-(.+)$/))) { html = pagePlayer(m[1]); nav = 'players'; }
    else if ((m = h.match(/^r-(\d{4}-\d{2}-\d{2}-\d+)$/))) { html = pageReview(m[1]); nav = 'seasons'; }
    else html = notFound();
    chartMounts = [];
    app.innerHTML = html;
    runMounts();
    setNav(nav);
    document.title = titleFor(h);
    trackPage(h);
    app.querySelectorAll('[data-href]').forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.href; }));
    if (h === 'teams') bindTeams();
    bindTabs();
    markStrip(h);
    if (h === 'players') bindPlayers();
    if (nav === 'stats') { const tab = (h.match(/^stats-?(.*)$/) || [])[1] || ''; bindStatsFilters(tab); renderStatsBody(tab); }
    app.querySelectorAll('.to-stats').forEach(a => a.addEventListener('click', () => { statsState.team = a.dataset.team || ''; statsState.kind = 'all'; statsState.from = ''; statsState.to = ''; }));
    window.scrollTo(0, 0);
  }
  // полоса сезонів у шапці
  function renderStrip() {
    const el = document.getElementById('strip'); if (!el) return;
    el.innerHTML = db.seasons.slice().reverse().map(s => `<a href="#s-${s.id}" data-sid="${s.id}">${esc(s.label)}</a>`).join('');
  }
  function markStrip(h) {
    let sid = null, m;
    if ((m = h.match(/^s-(\d{4}(?:-\d{2})?)/))) sid = m[1];
    else if ((m = h.match(/^m-(.+)$/))) { const x = db.matches.find(y => y.id === m[1]); if (x) sid = x.season.id; }
    else if ((m = h.match(/^r-/))) { const f = findReview(h.slice(2)); if (f) sid = f.sid; }
    document.querySelectorAll('#strip a').forEach(a => { const on = a.dataset.sid === sid; a.classList.toggle('on', on); if (on) a.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
  }
  function titleFor(h) {
    const base = 'Чемпіонат АЖІ з футзалу';
    const el = app.querySelector('h1');
    return h && el ? el.textContent.trim() + ' — ' + base : base;
  }

  /* ---------- загрузка ---------- */
  async function load() {
    const get = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ': ' + r.status); return r.json(); });
    const [idx, teams, players, rindex, vids, gks] = await Promise.all([get('data/seasons.json'), get('data/teams.json'), get('data/players.json'), get('data/reviews/index.json').catch(() => ({})), get('data/videos.json').catch(() => ({ matches: {} })), get('data/goalkeepers.json').catch(() => ({ goalkeepers: [] }))]);
    reviewIndex = UK.reviewIndex(rindex);
    const seasons = (await Promise.all(idx.seasons.map(id => get(`data/seasons/${id}.json`)))).map(UK.season);
    db = Core.build({ seasons, teams: UK.teams(teams), players: UK.players(players) });
    recs = Core.records(db);
    // воротарі: амплуа в протоколах немає, список підтверджує адміністратор (data/goalkeepers.json)
    const gkSet = new Set((gks.goalkeepers || []).map(n => Core.normName(UK.person(n))));
    for (const p of db.players.values()) if ([...p.spellings.keys()].some(n => gkSet.has(Core.normName(n)))) p.gk = true;
    videos = vids;
    renderStrip();
    initSearch();
    route();
  }
  window.addEventListener('hashchange', route);
  load().catch(err => {
    app.innerHTML = `<div class="loading"><p>Не вдалося завантажити дані архіву.</p><p class="note">${esc(err.message)}. Сайт треба відкривати через вебсервер: файли даних завантажуються з теки data.</p></div>`;
  });
})();
