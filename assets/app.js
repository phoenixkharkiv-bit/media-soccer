/* Архив Чемпионата АЖИ по футзалу — интерфейс (без библиотек). Маршруты в адресе после #. */
(function () {
  'use strict';
  const Core = window.Core;
  const app = document.getElementById('app');
  let db = null, recs = null, reviewIndex = {};
  const reviewCache = new Map();

  /* ---------- утилиты ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const fmtDate = d => { const [y, m, dd] = d.split('-').map(Number); return `${dd} ${MONTHS[m - 1]} ${y}`; };
  const shortDate = d => { const [y, m, dd] = d.split('-'); return `${dd}.${m}.${y.slice(2)}`; };
  const nf = n => n.toLocaleString('ru-RU');
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c); };
  const teamLink = (team, name) => team ? `<a href="#t-${team.id}">${esc(name || team.name)}</a>` : esc(name || '—');
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
      <span class="h${w === 'h' ? ' w' : ''}">${esc(m.homeName)}</span>
      <span class="sc">${scoreHtml(m)}</span>
      <span class="a${w === 'a' ? ' w' : ''}">${esc(m.awayName)}</span>
      <span class="x">${m.tech ? 'тех.' : ''}</span>${ctx}</a>`;
  }
  function stageCtx(m) {
    const parts = [m.tour.name];
    if (m.div) parts.push(m.div);
    if (m.stage) parts.push(m.stage);
    return esc(parts.join(' · ') + ' · ' + m.season.label);
  }

  /* ---------- шапка, поиск ---------- */
  function setNav(route) {
    document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.r === route));
  }
  function initSearch() {
    const inp = document.getElementById('q');
    const box = document.getElementById('qres');
    let items = [], act = -1;
    const index = [];
    for (const t of db.teams.values()) index.push({ kind: 'Команда', label: t.name, extra: t.names.length > 1 ? t.names.filter(n => n !== t.name).join(', ') : '', href: '#t-' + t.id, weight: t.matches.length + 50, keys: t.names.map(Core.normName) });
    for (const p of db.players.values()) index.push({ kind: 'Игрок', label: p.name, extra: '', href: '#p-' + p.id, weight: p.apps.length + p.archive.length * 5, keys: [...p.spellings.keys()].map(Core.normName) });
    function run() {
      const q = Core.normName(inp.value);
      if (q.length < 2) { box.hidden = true; return; }
      const words = q.split(' ');
      items = index.filter(it => it.keys.some(k => words.every(w => k.includes(w)))).sort((a, b) => {
        const as = a.keys.some(k => k.startsWith(q)) ? 1 : 0, bs = b.keys.some(k => k.startsWith(q)) ? 1 : 0;
        return bs - as || b.weight - a.weight;
      }).slice(0, 12);
      act = -1;
      box.innerHTML = items.length ? items.map((it, i) => `<a href="${it.href}" data-i="${i}"><span>${esc(it.label)}${it.extra ? ` <small>(${esc(it.extra)})</small>` : ''}</span><small>${it.kind}</small></a>`).join('') : '<div class="empty">Ничего не найдено. Попробуйте фамилию или часть названия.</div>';
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
  function pageHome() {
    const goals = db.matches.reduce((s, m) => s + m.goals.length, 0);
    const protoSeasons = db.seasons.filter(s => !s.archive);
    const first = db.seasons[0].label, last = db.seasons[db.seasons.length - 1].label;
    const people = [...db.players.values()].filter(p => p.apps.length || p.archive.length).length;
    const rows = db.seasons.slice().reverse().map(s => {
      const win = t => {
        const v = db.views.get(t.key);
        const team = t.format === 'league' ? (v.divWinners[0] && v.divWinners[0].team) : v.winner;
        const name = t.format === 'league' ? (v.divWinners[0] && v.divWinners[0].name) : v.winnerName;
        if (team) return `<span class="medal m1">${teamLink(team, name)}</span>`;
        if (t.format === 'league') return `<span class="muted">${v.status === 'unknown' ? 'уточняется' : 'не завершён'}</span>`;
        return '<span class="muted">—</span>';
      };
      const T = id => s.tournaments.find(x => x.id === id);
      const dash = '<span class="dash">—</span>';
      let leagues;
      if (T('chemp')) leagues = `<td colspan="2"><div class="cell"><span class="lg">Чемпионат АЖИ</span>${win(T('chemp'))}</div></td>`;
      else leagues = `<td>${T('media') ? win(T('media')) : dash}</td><td>${T('brand') ? win(T('brand')) : dash}</td>`;
      const others = s.tournaments.filter(t => !['chemp', 'media', 'brand', 'cup'].includes(t.id)).map(t => {
        const v = db.views.get(t.key);
        return v.winner ? `<div><span class="lg">${esc(t.name)}:</span> ${teamLink(v.winner, v.winnerName)}</div>` : '';
      }).join('');
      return `<tr><td class="season"><a href="#s-${s.id}">${esc(s.label)}</a></td>${leagues}<td>${T('cup') ? win(T('cup')) : dash}</td><td class="hide-s"><div class="cell">${others || dash}</div></td></tr>`;
    }).join('');
    const top = recs.topScorers.slice(0, 10);
    const apps = recs.mostApps.slice(0, 10);
    return `<div class="page">
      <section class="hero">
        <div class="eyebrow">Ассоциация «Журналистская инициатива» · Харьков</div>
        <h1>Чемпионат АЖИ <em>по футзалу</em></h1>
        <p class="lead">Архив турнира медийщиков с ${esc(first)} по ${esc(last)}: таблицы, протоколы матчей, команды под всеми их названиями и игроки за все сезоны.</p>
        <div class="tally" aria-label="Архив в цифрах">
          <div><b>${db.seasons.length}</b><span>${plural(db.seasons.length, 'сезон', 'сезона', 'сезонов')}</span></div>
          <div><b>${nf(db.matches.length)}</b><span>матчей</span></div>
          <div><b>${nf(goals)}</b><span>голов</span></div>
          <div><b>${nf(people)}</b><span>игроков</span></div>
        </div>
      </section>
      <section class="block">
        <div class="sec-head"><h2 class="sec">Победители по сезонам</h2><span class="note">Протоколы матчей есть с ${esc(protoSeasons[0].label)}, ранние сезоны — по итоговым таблицам</span></div>
        <div class="tw"><table class="honor"><thead><tr><th>Сезон</th><th>Медиа-лига</th><th>Бренд-лига</th><th>Кубок АЖИ</th><th class="hide-s">Другие турниры</th></tr></thead><tbody>${rows}</tbody></table></div>
      </section>
      <section class="grid2">
        <div class="block">
          <div class="sec-head"><h2 class="sec">Лучшие бомбардиры</h2><a href="#records">Все рекорды</a></div>
          ${playerTable(top, p => p.goals.length, 'Голы')}
          <p class="note">По протоколам с 2010/11. Голы ранних сезонов показаны на страницах игроков отдельно.</p>
        </div>
        <div class="block">
          <div class="sec-head"><h2 class="sec">Больше всего матчей</h2><a href="#players">Все игроки</a></div>
          ${playerTable(apps, p => p.apps.length, 'Матчи')}
        </div>
      </section>
    </div>`;
  }
  function mainTeams(p) { return [...p.teams.values()].sort((a, b) => b.apps - a.apps).slice(0, 2).map(t => teamLink(t.team, [...t.names][0])).join(', '); }
  function playerTable(list, val, label) {
    return `<div class="tw"><table><thead><tr><th class="n">#</th><th>Игрок</th><th class="hide-s">Команды</th><th class="n">${label}</th></tr></thead><tbody>${list.map((p, i) => `<tr><td class="n muted">${i + 1}</td><td>${playerLink(p)}</td><td class="hide-s muted">${mainTeams(p)}</td><td class="n pts">${val(p)}</td></tr>`).join('')}</tbody></table></div>`;
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
      <p class="note">Источник: ${esc(s.source)}.</p>
    </div>`;
  }
  function tableHtml(tb, opts = {}) {
    const showMedals = tb.complete && (opts.league || tb.archive);
    const cols = tb.archive ? '' : '<th class="hide-s">Форма</th>';
    return `<div class="tw"><table><thead><tr><th class="n">#</th><th>Команда</th><th class="n">И</th><th class="n">В</th><th class="n">Н</th><th class="n">П</th><th class="n">Мячи</th><th class="n hide-s">Разн.</th><th class="n">О</th>${cols}</tr></thead><tbody>${tb.rows.map(r => `<tr>
      <td class="n"><span class="pos${showMedals ? medalCls(r.pos) : ''}">${r.pos}</span></td>
      <td class="team">${teamLink(r.team, r.name)}</td>
      <td class="n">${r.p}</td><td class="n">${r.w}</td><td class="n">${r.d}</td><td class="n">${r.l}</td>
      <td class="n">${r.gf}–${r.ga}</td><td class="n hide-s">${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td>
      <td class="n pts">${r.pts}</td>${tb.archive ? '' : `<td class="hide-s"><span class="form">${r.form.slice(-5).map(f => `<i class="${f}" title="${f === 'W' ? 'победа' : f === 'D' ? 'ничья' : 'поражение'}"></i>`).join('')}</span></td>`}</tr>`).join('')}</tbody></table></div>`;
  }
  const STAGE_ORDER = s => {
    if (!s) return 99;
    if (/^\d+ тур$/.test(s)) return parseInt(s, 10);
    if (s === '1/4 финала') return 101; if (s === '1/2 финала') return 102;
    if (/^За [5-9]/.test(s)) return 103; if (/^За 3/.test(s)) return 104; if (s === 'Финал') return 105;
    return 100;
  };
  function tournamentBody(t) {
    const v = db.views.get(t.key);
    let out = '';
    const status = t.final ? '' : (v.complete ? '<span class="status done">Завершён</span>' : (v.status === 'unknown' ? '<span class="status">Статус уточняется</span>' : '<span class="status">Не завершён по данным блога</span>'));
    out += `<div class="sec-head"><h2 class="sec">${esc(t.name)}</h2>${status}</div>`;
    if (v.note) out += `<div class="callout">${esc(v.note)}</div>`;
    if (v.winner) {
      out += `<div class="winner"><span class="lbl">${t.format === 'league' ? 'Чемпион' : 'Победитель'}</span>${teamLink(v.winner, v.winnerName)}<span class="rest">${v.runnerUp ? '2. ' + teamLink(v.runnerUp, v.runnerUpName) : ''}${v.third ? ' · 3. ' + teamLink(v.third, v.thirdName) : ''}</span></div>`;
    } else if (t.format === 'league' && v.tables.length > 1 && v.divWinners.some(d => d.team)) {
      out += `<div class="winner"><span class="lbl">Чемпионы</span>${v.divWinners.filter(d => d.team).map(d => `<span class="rest">${esc(d.div)}:</span> ${teamLink(d.team, d.name)}`).join(' ')}</div>`;
    }
    if (t.final) {
      out += '<div class="callout">Протоколов матчей этого сезона пока нет в архиве. Показаны итоговая таблица и бомбардиры со страницы «Прошедшие турниры» старого блога.</div>';
    }
    const tables = v.tables.map(tb => `<div class="block">${tb.div ? `<h3 class="sub">${esc(tb.div)}</h3>` : ''}${tableHtml(tb, { league: t.format === 'league' })}</div>`).join('');
    if (tables) out += `<section class="${v.tables.length > 1 && t.format === 'cup' ? 'grid2' : 'block'}">${tables}</section>`;
    if (v.playoff && v.playoff.length) {
      const st = [...new Set(v.playoff.map(m => m.stage))].sort((a, b) => STAGE_ORDER(a) - STAGE_ORDER(b));
      out += `<section class="block"><h2 class="sec">Плей-офф</h2><div class="mlist">${st.map(sn => `<details class="round" open><summary>${esc(sn)}</summary>${v.playoff.filter(m => m.stage === sn).map(m => matchRow(m)).join('')}</details>`).join('')}</div></section>`;
    }
    if (t.final) {
      const sc = t.final.scorers;
      if (sc.length) {
        const divs = [...new Set(sc.map(x => x.div || null))];
        out += `<section class="block"><h2 class="sec">Бомбардиры</h2><div class="${divs.length > 1 ? 'grid2' : 'block'}">${divs.map(d => `<div class="block">${d ? `<h3 class="sub">${esc(d)}</h3>` : ''}<div class="tw"><table><thead><tr><th>Игрок</th><th>Команда</th><th class="n">Голы</th><th class="n">С пен.</th></tr></thead><tbody>${sc.filter(x => (x.div || null) === d).map(x => `<tr><td>${playerLink(x.player, x.name)}</td><td>${teamLink(x.teamObj, x.team)}</td><td class="n pts">${x.goals}</td><td class="n muted">${x.pens || ''}</td></tr>`).join('')}</tbody></table></div></div>`).join('')}</div></section>`;
      }
      return out;
    }
    // туры (групповые)
    const roundStages = v.rounds.filter(r => Core.isRoundStage(r.stage)).sort((a, b) => STAGE_ORDER(a.stage) - STAGE_ORDER(b.stage));
    if (roundStages.length) {
      out += `<section class="block"><div class="sec-head"><h2 class="sec">Матчи по турам</h2><span class="note">${roundStages.length} ${plural(roundStages.length, 'тур', 'тура', 'туров')}</span></div><div class="mlist">${roundStages.map((r, k) => `<details class="round"${k === roundStages.length - 1 && roundStages.length < 8 ? ' open' : ''}><summary>${esc(r.stage)} <span>${fmtDate(r.ms[0].date)}</span></summary>${r.ms.map(m => matchRow(m, { ctx: m.div && v.tables.length > 1 ? esc(m.div) : '' })).join('')}</details>`).join('')}</div></section>`;
    }
    const sc = Core.scorers(t.matches, 20);
    if (sc.length) {
      out += `<section class="grid2"><div class="block"><h2 class="sec">Бомбардиры</h2><div class="tw"><table><thead><tr><th class="n">#</th><th>Игрок</th><th>Команда</th><th class="n">Голы</th><th class="n hide-s">С пен.</th></tr></thead><tbody>${sc.map((r, i) => `<tr><td class="n muted">${i + 1}</td><td>${playerLink(r.p)}</td><td>${[...r.teams.values()].map(x => teamLink(x.team, x.name)).join(', ')}</td><td class="n pts">${r.goals}</td><td class="n muted hide-s">${r.pens || ''}</td></tr>`).join('')}</tbody></table></div></div>${disciplineBlock(t.matches)}</section>`;
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
    return `<div class="block"><h2 class="sec">Карточки</h2><div class="tw"><table><thead><tr><th>Игрок</th><th class="hide-s">Команда</th><th class="n"><span class="card y" title="Предупреждения"></span></th><th class="n"><span class="card r" title="Удаления"></span></th></tr></thead><tbody>${list.map(r => `<tr><td>${playerLink(r.p)}</td><td class="hide-s">${r.team ? teamLink(r.team[0], r.team[1]) : ''}</td><td class="n">${r.y || ''}</td><td class="n">${r.r || ''}</td></tr>`).join('')}</tbody></table></div><p class="note">Штрафные очки по регламенту: удаление — 5, предупреждение — 1.</p></div>`;
  }

  /* ---------- матч ---------- */
  function pageMatch(id) {
    const m = db.matches.find(x => x.id === id);
    if (!m) return notFound();
    const sideName = s => s === 'h' ? m.homeName : m.awayName;
    let run = [0, 0];
    const goals = m.goals.map(g => {
      if (g.side === 'h') run[0]++; else if (g.side === 'a') run[1]++;
      const tag = g.og ? '<span class="tag">автогол</span>' : g.pen ? '<span class="tag">пенальти</span>' : g.free ? '<span class="tag">штрафной</span>' : '';
      const who = `${playerLink(g.p, g.name)}${tag}`;
      return `<div class="goal"><div class="gh">${g.side === 'h' ? who : ''}</div><div class="gm"><b>${run[0]}:${run[1]}</b>${g.min != null ? g.min + '′' : ''}</div><div>${g.side === 'a' ? who : ''}</div></div>`;
    }).join('');
    const marks = (p, side) => {
      const gs = m.goals.filter(g => g.p === p && !g.og).length;
      const y = m.yc.filter(c => c.p === p).length, r = m.rc.filter(c => c.p === p).length;
      return `<span class="marks">${gs ? `<span class="ball" title="Голы">${gs > 1 ? gs : '•'}</span>` : ''}${'<span class="card y" title="Предупреждение"></span>'.repeat(y)}${'<span class="card r" title="Удаление"></span>'.repeat(r)}</span>`;
    };
    const lineup = side => {
      const list = m.lineups[side];
      const team = side === 'h' ? m.home : m.away;
      return `<div class="lineup"><h3>${teamLink(team, sideName(side))}</h3>${list.length ? list.map(x => `<div class="pl"><span class="no">${x.no != null ? x.no : ''}</span><span>${playerLink(x.p, x.name)}</span>${marks(x.p, side)}</div>`).join('') : '<div class="pl"><span></span><span class="muted">Состав не опубликован</span><span></span></div>'}</div>`;
    };
    const STAT_L = { shots: 'Удары', on_target: 'Удары в створ', woodwork: 'Штанги и перекладины', corners: 'Угловые', fouls: 'Фолы' };
    const stats = m.stats ? `<section class="block"><h2 class="sec">Статистика</h2><div class="stats">${Object.entries(m.stats).map(([k, [h, a]]) => { const t = h + a || 1; return `<div class="stat"><span class="lbl">${STAT_L[k] || k}</span><span class="v">${h}</span><div class="bar"><i class="h" style="width:${(h / t) * 100}%"></i><i class="a" style="width:${(a / t) * 100}%"></i></div><span class="v r">${a}</span></div>`; }).join('')}</div></section>` : '';
    const sub = [];
    if (m.pens) sub.push(`Серия пенальти ${m.pens[0]}:${m.pens[1]}`);
    if (m.tech) sub.push(Array.isArray(m.tech) ? 'Техническое поражение' : 'Технический результат');
    const meta = [fmtDate(m.date), m.venue ? 'Харьков, ' + esc(m.venue) : '', m.att ? `${m.att} ${plural(m.att, 'зритель', 'зрителя', 'зрителей')}` : '', m.ref ? 'Судья: ' + esc(m.ref) : ''].filter(Boolean);
    const h2h = db.matches.filter(x => x !== m && ((x.home === m.home && x.away === m.away) || (x.home === m.away && x.away === m.home)));
    return `<div class="page">
      <div class="crumbs"><a href="#s-${m.season.id}">Сезон ${esc(m.season.label)}</a><span class="sep">/</span><a href="${tourHref(m.tour)}">${esc(m.tour.name)}</a>${m.div ? `<span class="sep">/</span><span>${esc(m.div)}</span>` : ''}${m.stage ? `<span class="sep">/</span><span>${esc(m.stage)}</span>` : ''}</div>
      <h1 class="sr-only">${esc(m.homeName)} — ${esc(m.awayName)} ${esc(Core.scoreText(m))}, ${fmtDate(m.date)}</h1>
      <section class="board" aria-label="Счёт матча">
        <div class="board-main">
          <div class="board-team h">${teamLink(m.home, m.homeName)}</div>
          <div class="board-score">${esc(Core.scoreText(m))}</div>
          <div class="board-team">${teamLink(m.away, m.awayName)}</div>
        </div>
        ${sub.length ? `<div class="board-sub">${sub.join(' · ')}</div>` : ''}
        <div class="board-meta">${meta.map(x => `<span>${x}</span>`).join('')}</div>
      </section>
      ${m.goals.length && m.score && !m.tech && m.goals.length < m.score[0] + m.score[1] ? `<div class="callout">В протоколе указаны не все голы: ${m.goals.length} из ${m.score[0] + m.score[1]}.</div>` : ''}
      ${m.goals.length ? `<section class="block"><h2 class="sec">Голы</h2><div class="goals">${goals}</div></section>` : (m.score && m.score[0] + m.score[1] > 0 && !m.tech ? '<div class="callout">Авторы голов в протоколе не указаны.</div>' : '')}
      ${m.shootout ? `<section class="block"><h2 class="sec">Послематчевые пенальти</h2><div class="callout">${m.shootout.map(esc).join(' · ')}</div></section>` : ''}
      <section class="block"><h2 class="sec">Составы</h2><div class="lineups">${lineup('h')}${lineup('a')}</div>${m.mp.length ? `<p class="note">Незабитые пенальти: ${m.mp.map(x => `${playerLink(x.p, x.name)}${x.min != null ? ', ' + x.min + '′' : ''}${x.how ? ' (' + esc(x.how) + ')' : ''}`).join('; ')}</p>` : ''}</section>
      ${stats}
      ${h2h.length ? `<section class="block"><div class="sec-head"><h2 class="sec">Другие встречи этих команд</h2><span class="note">${h2h.length}</span></div><div class="mlist">${h2h.slice().reverse().slice(0, 12).map(x => matchRow(x, { ctx: stageCtx(x) })).join('')}</div></section>` : ''}
    </div>`;
  }

  /* ---------- команда ---------- */
  function pageTeam(id) {
    const t = db.teams.get(id);
    if (!t) return notFound();
    const s = t.totals;
    // названия по сезонам
    const nameRuns = [];
    for (const lbl of t.seasons) {
      const names = [...t.namesBySeason.get(lbl)].join(' / ');
      const last = nameRuns[nameRuns.length - 1];
      if (last && last.names === names) last.to = lbl; else nameRuns.push({ names, from: lbl, to: lbl });
    }
    const trophies = t.trophies.slice().sort((a, b) => Core.seasonOrder(b.t.season.label) - Core.seasonOrder(a.t.season.label) || a.place - b.place);
    const golds = trophies.filter(x => x.place === 1).length;
    const fin = t.finishes.slice().sort((a, b) => Core.seasonOrder(b.t.season.label) - Core.seasonOrder(a.t.season.label));
    // бомбардиры и игроки команды
    const sc = Core.scorers(t.matches.map(m => ({ ...m, goals: m.goals.filter(g => (g.side === 'h' ? m.home : m.away) === t) })), 15);
    const appMap = new Map();
    for (const m of t.matches) { const side = m.home === t ? 'h' : 'a'; for (const x of m.lineups[side]) appMap.set(x.p, (appMap.get(x.p) || 0) + 1); }
    const apps = [...appMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    // соперники
    const opp = new Map();
    for (const m of t.matches) {
      const o = m.home === t ? m.away : m.home;
      const sc2 = Core.tableScore(m); if (!sc2) continue;
      const f = m.home === t ? sc2.gh : sc2.ga, a = m.home === t ? sc2.ga : sc2.gh;
      const r = opp.get(o.id) || { team: o, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
      r.p++; r.gf += f; r.ga += a; if (sc2.bothLost || f < a) r.l++; else if (f > a) r.w++; else r.d++;
      opp.set(o.id, r);
    }
    const opps = [...opp.values()].sort((a, b) => b.p - a.p).slice(0, 15);
    const bySeason = new Map();
    for (const m of t.matches) { if (!bySeason.has(m.season.label)) bySeason.set(m.season.label, []); bySeason.get(m.season.label).push(m); }
    return `<div class="page">
      <div class="block">
        <div class="eyebrow">Команда</div>
        <h1 class="title">${esc(t.name)}</h1>
        ${clubLine(t)}
        ${t.names.length > 1 || nameRuns.length > 1 ? `<div class="chips">${nameRuns.map(r => `<span class="chip">${esc(r.names)} · ${esc(r.from)}${r.to !== r.from ? '–' + esc(r.to) : ''}</span>`).join('')}</div>` : `<p class="muted">${t.seasons.length ? `Сезоны: ${esc(t.seasons[0])}${t.seasons.length > 1 ? '–' + esc(t.seasons[t.seasons.length - 1]) : ''}` : ''}</p>`}
        <div class="facts">
          <div class="fact"><b>${t.seasons.length}</b><span>${plural(t.seasons.length, 'сезон', 'сезона', 'сезонов')}</span></div>
          <div class="fact"><b>${s.p}</b><span>матчей в протоколах</span></div>
          <div class="fact"><b>${s.w}–${s.d}–${s.l}</b><span>победы, ничьи, поражения</span></div>
          <div class="fact"><b>${s.gf}–${s.ga}</b><span>мячи</span></div>
          <div class="fact"><b>${golds}</b><span>${plural(golds, 'титул', 'титула', 'титулов')}</span></div>
        </div>
      </div>
      ${trophies.length ? `<section class="block"><h2 class="sec">Награды</h2><div class="tw"><table><thead><tr><th>Сезон</th><th>Турнир</th><th>Место</th></tr></thead><tbody>${trophies.map(x => `<tr><td>${seasonLink(x.t.season)}</td><td><a href="${tourHref(x.t)}">${esc(x.t.name)}</a>${x.div ? ` <span class="muted">· ${esc(x.div)}</span>` : ''}${x.name && x.name !== t.name ? ` <span class="muted">(как ${esc(x.name)})</span>` : ''}</td><td><span class="medal m${x.place}">${x.place === 1 ? 'Победа' : x.place + '-е место'}</span></td></tr>`).join('')}</tbody></table></div></section>` : ''}
      ${teamStatsSection(t)}
      ${fin.length ? `<section class="block"><h2 class="sec">По сезонам</h2><div class="tw"><table><thead><tr><th>Сезон</th><th>Турнир</th><th class="n">Место</th><th class="n">И</th><th class="n hide-s">В–Н–П</th><th class="n">Мячи</th><th class="n">О</th></tr></thead><tbody>${fin.map(f => `<tr><td>${seasonLink(f.t.season)}</td><td><a href="${tourHref(f.t)}">${esc(f.t.name)}</a>${f.div ? ` <span class="muted">· ${esc(f.div)}</span>` : ''}${f.row.name !== t.name ? ` <span class="muted">(${esc(f.row.name)})</span>` : ''}</td><td class="n"><span class="pos${f.complete && f.t.format === 'league' ? medalCls(f.pos) : ''}">${f.pos}</span><span class="muted"> из ${f.n}</span></td><td class="n">${f.row.p}</td><td class="n hide-s">${f.row.w}–${f.row.d}–${f.row.l}</td><td class="n">${f.row.gf}–${f.row.ga}</td><td class="n pts">${f.row.pts}</td></tr>`).join('')}</tbody></table></div><p class="note">Места в групповых этапах кубков и в незавершённых турнирах показаны без медалей.</p></section>` : ''}
      ${sc.length ? `<section class="grid2"><div class="block"><h2 class="sec">Бомбардиры команды</h2><div class="tw"><table><thead><tr><th class="n">#</th><th>Игрок</th><th class="n">Голы</th></tr></thead><tbody>${sc.map((r, i) => `<tr><td class="n muted">${i + 1}</td><td>${playerLink(r.p)}</td><td class="n pts">${r.goals}</td></tr>`).join('')}</tbody></table></div></div><div class="block"><h2 class="sec">Больше всего матчей</h2><div class="tw"><table><thead><tr><th class="n">#</th><th>Игрок</th><th class="n">Матчи</th></tr></thead><tbody>${apps.map(([p, n], i) => `<tr><td class="n muted">${i + 1}</td><td>${playerLink(p)}</td><td class="n pts">${n}</td></tr>`).join('')}</tbody></table></div></div></section>` : ''}
      ${opps.length ? `<section class="block"><h2 class="sec">Чаще всего встречались</h2><div class="tw"><table><thead><tr><th>Соперник</th><th class="n">И</th><th class="n">В</th><th class="n">Н</th><th class="n">П</th><th class="n">Мячи</th></tr></thead><tbody>${opps.map(r => `<tr><td>${teamLink(r.team)}</td><td class="n">${r.p}</td><td class="n">${r.w}</td><td class="n">${r.d}</td><td class="n">${r.l}</td><td class="n">${r.gf}–${r.ga}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
      ${bySeason.size ? `<section class="block"><h2 class="sec">Все матчи</h2><div class="mlist">${[...bySeason.entries()].reverse().map(([lbl, ms]) => `<details class="round"><summary>${esc(lbl)} <span>${ms.length} ${plural(ms.length, 'матч', 'матча', 'матчей')}</span></summary>${ms.map(m => matchRow(m, { ctx: stageCtx(m) })).join('')}</details>`).join('')}</div></section>` : ''}
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
        <div class="eyebrow">Игрок</div>
        <h1 class="title">${esc(p.name)}</h1>
        ${spell.length ? `<p class="muted">В протоколах также: ${spell.map(esc).join(', ')}</p>` : ''}
        <div class="facts">
          <div class="fact"><b>${p.apps.length}</b><span>${plural(p.apps.length, 'матч', 'матча', 'матчей')}</span></div>
          <div class="fact"><b>${p.goals.length}</b><span>${plural(p.goals.length, 'гол', 'гола', 'голов')}${pens ? `, из них ${pens} с пен.` : ''}</span></div>
          <div class="fact"><b>${p.seasonsPlayed.size}</b><span>${plural(p.seasonsPlayed.size, 'сезон', 'сезона', 'сезонов')}</span></div>
          ${p.hatTricks ? `<div class="fact"><b>${p.hatTricks}</b><span>${plural(p.hatTricks, 'хет-трик', 'хет-трика', 'хет-триков')}</span></div>` : ''}
          ${p.archiveGoals ? `<div class="fact"><b>${p.archiveGoals}</b><span>голов в 2003–2010*</span></div>` : ''}
        </div>
        <div class="chips">${[...p.teams.values()].filter(t => t.apps).sort((a, b) => b.apps - a.apps).map(t => `<span class="chip">${teamLink(t.team, [...t.names].join(' / '))} · ${t.apps} ${plural(t.apps, 'матч', 'матча', 'матчей')}</span>`).join('')}</div>
      </div>
      ${playerStatsSection(p)}
      ${table.length ? `<section class="block"><h2 class="sec">По сезонам</h2><div class="tw"><table><thead><tr><th>Сезон</th><th>Команда</th><th class="n">Матчи</th><th class="n">Голы</th><th class="n"><span class="card y" title="Предупреждения"></span></th><th class="n"><span class="card r" title="Удаления"></span></th></tr></thead><tbody>${table.map(r => `<tr><td>${seasonLink(r.season)}</td><td>${teamLink(r.team, [...r.names].join(' / '))}</td><td class="n">${r.apps}</td><td class="n pts">${r.goals || ''}</td><td class="n">${r.y || ''}</td><td class="n">${r.r || ''}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
      ${p.archive.length ? `<section class="block"><h2 class="sec">Ранние сезоны</h2><div class="tw"><table><thead><tr><th>Сезон</th><th>Команда</th><th class="n">Голы</th></tr></thead><tbody>${p.archive.slice().sort((a, b) => Core.seasonOrder(b.season.label) - Core.seasonOrder(a.season.label)).map(a => `<tr><td>${seasonLink(a.season)}</td><td>${teamLink(a.team, a.teamName)}</td><td class="n pts">${a.goals}</td></tr>`).join('')}</tbody></table></div><p class="note">* По итоговым спискам бомбардиров старого блога: там указаны только лучшие снайперы сезона, поэтому эти голы считаются отдельно и не входят в общий счёт по протоколам.</p></section>` : ''}
      ${matchesDesc.length ? `<section class="block"><h2 class="sec">Матчи</h2><div class="mlist">${groupBySeason(matchesDesc).map(([lbl, list], k) => `<details class="round"${k === 0 ? ' open' : ''}><summary>${esc(lbl)} <span>${list.length} ${plural(list.length, 'матч', 'матча', 'матчей')}</span></summary>${list.map(a => { const g = a.m.goals.filter(x => x.p === p && !x.og).length; return matchRow(a.m, { ctx: stageCtx(a.m) + (g ? ` · голов: ${g}` : '') }); }).join('')}</details>`).join('')}</div></section>` : ''}
      <p class="note">Игрок определяется по написанию имени в протоколах. Если два разных человека записаны одинаково или один человек по-разному, это поправят администраторы архива.</p>
    </div>`;
  }
  function groupBySeason(apps) {
    const map = new Map();
    for (const a of apps) { const k = a.m.season.label; if (!map.has(k)) map.set(k, []); map.get(k).push(a); }
    return [...map.entries()];
  }

  /* ---------- списки ---------- */
  function pageTeams() {
    const list = [...db.teams.values()].sort((a, b) => b.seasons.length - a.seasons.length || b.totals.p - a.totals.p);
    return `<div class="page">
      <div class="block"><div class="eyebrow">Все участники</div><h1 class="title">Команды</h1><p class="lead">${list.length} ${plural(list.length, 'команда', 'команды', 'команд')}. Если команда выступала под разными названиями, они собраны на одной странице.</p></div>
      <div class="toolbar"><input id="tf" type="search" placeholder="Найти команду" aria-label="Найти команду"></div>
      <div class="tw"><table><thead><tr><th>Команда</th><th>Сезоны</th><th class="n">Матчи</th><th class="n hide-s">В–Н–П</th><th class="n">Титулы</th></tr></thead><tbody id="tl">${list.map(t => `<tr data-k="${esc(t.names.map(Core.normName).join(' '))}"><td>${teamLink(t)}${t.names.length > 1 ? `<div class="note">${esc(t.names.filter(n => n !== t.name).join(', '))}</div>` : ''}${t.club ? `<div class="note">клуб «${esc(t.club)}»</div>` : ''}</td><td class="muted">${t.seasons.length ? esc(t.seasons[0]) + (t.seasons.length > 1 ? '–' + esc(t.seasons[t.seasons.length - 1]) : '') + ` <span class="note">(${t.seasons.length})</span>` : ''}</td><td class="n">${t.totals.p || ''}</td><td class="n hide-s">${t.totals.p ? `${t.totals.w}–${t.totals.d}–${t.totals.l}` : ''}</td><td class="n pts">${t.trophies.filter(x => x.place === 1).length || ''}</td></tr>`).join('')}</tbody></table></div>
    </div>`;
  }
  function bindTeams() {
    const f = document.getElementById('tf'); if (!f) return;
    f.addEventListener('input', () => { const q = Core.normName(f.value); document.querySelectorAll('#tl tr').forEach(tr => { tr.hidden = q && !tr.dataset.k.includes(q); }); });
  }
  let playersState = { q: '', sort: 'goals', shown: 100 };
  function pagePlayers() {
    return `<div class="page">
      <div class="block"><div class="eyebrow">Все участники</div><h1 class="title">Игроки</h1><p class="lead">Все, кто попал в протоколы матчей с 2010/11, и бомбардиры ранних сезонов.</p></div>
      <div class="toolbar"><input id="pf" type="search" placeholder="Фамилия или имя" aria-label="Найти игрока" value="${esc(playersState.q)}">
        <label class="muted" for="ps">Сортировать</label>
        <select id="ps"><option value="goals">по голам</option><option value="apps">по матчам</option><option value="seasons">по сезонам</option><option value="name">по алфавиту</option></select></div>
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
      box.innerHTML = `<div class="tw"><table><thead><tr><th>Игрок</th><th class="hide-s">Команды</th><th class="n">Сезоны</th><th class="n">Матчи</th><th class="n">Голы</th></tr></thead><tbody>${shown.map(p => `<tr><td>${playerLink(p)}</td><td class="hide-s muted">${mainTeams(p) || (p.archive[0] ? teamLink(p.archive[0].team, p.archive[0].teamName) : '')}</td><td class="n">${p.seasonsPlayed.size}</td><td class="n">${p.apps.length || ''}</td><td class="n pts">${p.goals.length || ''}${p.archiveGoals ? `<span class="note"> +${p.archiveGoals}*</span>` : ''}</td></tr>`).join('')}</tbody></table></div>
        <div class="toolbar"><span class="note">Показано ${shown.length} из ${list.length}. * Голы ранних сезонов по спискам бомбардиров.</span>${list.length > shown.length ? '<button class="btn" id="more">Показать ещё</button>' : ''}</div>`;
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
      <div class="block"><div class="eyebrow">По протоколам 2010–2022</div><h1 class="title">Рекорды</h1><p class="lead">Всё посчитано по опубликованным протоколам. Технические результаты в рекорды матчей не входят.</p></div>
      <section class="grid2">
        <div class="block"><h2 class="sec">Бомбардиры за всю историю</h2>${playerTable(r.topScorers.slice(0, 20), p => p.goals.length, 'Голы')}</div>
        <div class="block"><h2 class="sec">Больше всего матчей</h2>${playerTable(r.mostApps.slice(0, 20), p => p.apps.length, 'Матчи')}</div>
      </section>
      <section class="grid2">
        ${mtable(r.biggestWins, 'Крупнейшие победы')}
        ${mtable(r.mostGoals, 'Самые результативные матчи')}
      </section>
      <section class="grid2">
        <div class="block"><h2 class="sec">Пять голов и больше за матч</h2><div class="tw"><table><thead><tr><th>Игрок</th><th class="hide-s">Матч</th><th class="n">Голы</th></tr></thead><tbody>${r.bigGames.map(x => `<tr><td>${playerLink(x.p)}<div class="note">${shortDate(x.m.date)} · ${esc(x.side === 'h' ? x.m.homeName : x.m.awayName)}</div></td><td class="hide-s"><a href="#m-${x.m.id}">${esc(x.m.homeName)} — ${esc(x.m.awayName)} ${esc(Core.scoreText(x.m))}</a></td><td class="n pts">${x.n}</td></tr>`).join('')}</tbody></table></div></div>
        <div class="block"><h2 class="sec">Хет-трики</h2>${playerTable(r.hatTricks.slice(0, 15), p => p.hatTricks, 'Хет-трики')}</div>
      </section>
      <section class="grid2">
        <div class="block"><h2 class="sec">Больше всего сезонов</h2>${playerTable(r.mostSeasons.slice(0, 15), p => p.seasonsPlayed.size, 'Сезоны')}<p class="note">С учётом ранних сезонов, где игрок попал в список бомбардиров.</p></div>
        ${mtable(r.attendance, 'Больше всего зрителей', 'По данным протоколов, где указано число зрителей.')}
      </section>
    </div>`;
  }


  /* ---------- клубы ---------- */
  function clubLine(t) {
    if (!t.club) return '';
    const mates = [...db.teams.values()].filter(x => x.club === t.club && x !== t);
    if (!mates.length) return '';
    return `<p class="muted">Клуб «${esc(t.club)}». Другие составы клуба: ${mates.map(x => teamLink(x)).join(', ')}.</p>`;
  }

  /* ---------- обзоры ---------- */
  const authorText = a => a ? esc(a) : 'автор не указан';
  function reviewsBlock(s) {
    const list = reviewIndex[s.id] || [];
    if (!list.length) return '';
    return `<section class="block"><div class="sec-head"><h2 class="sec">Обзоры и анонсы</h2><span class="note">${list.length} ${plural(list.length, 'текст', 'текста', 'текстов')}</span></div>
      <div class="mlist"><details class="round"><summary>Все обзоры сезона <span>${fmtDate(list[0].date)} — ${fmtDate(list[list.length - 1].date)}</span></summary>${list.slice().reverse().map(r => `<a class="rrow" href="#r-${r.id}"><span class="d">${shortDate(r.date)}</span><span class="rt">${esc(r.title)}</span><span class="ra">${authorText(r.author)}</span></a>`).join('')}</details></div></section>`;
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
      return `<div class="loading"><div class="ballspin"></div><p>Загружаю обзор…</p></div>`;
    }
    const r = body.reviews.find(x => x.id === id);
    const list = reviewIndex[f.sid], k = list.findIndex(x => x.id === id);
    const prev = list[k - 1], next = list[k + 1];
    return `<div class="page">
      <div class="crumbs"><a href="#s-${season.id}">Сезон ${esc(season.label)}</a><span class="sep">/</span><span>Обзоры и анонсы</span></div>
      <article class="review">
        <div class="eyebrow">${fmtDate(r.date)}</div>
        <h1 class="title">${esc(r.title)}</h1>
        <p class="byline">${r.author ? 'Автор: ' + esc(r.author) : 'Автор в блоге не указан'}</p>
        ${r.paras.map(p => `<p>${esc(p)}</p>`).join('')}
      </article>
      <div class="season-nav">${prev ? `<a href="#r-${prev.id}">← ${esc(prev.title)}</a>` : ''}${next ? `<a href="#r-${next.id}">${esc(next.title)} →</a>` : ''}</div>
      <p class="note">Источник: блог media-soccer.org, публикация ${fmtDate(r.date)}.</p>
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
  const dec = (v, d = 1) => (v == null || isNaN(v) ? '—' : v.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }));
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
        const v = c.get(r); const txt = esc(v == null ? '—' : (c.fmt ? c.fmt(v) : v));
        if (c === col && c.num && vmax > 0 && typeof v === 'number' && v > 0) return `<span class="db" style="--w:${Math.round(v / vmax * 100)}%"><span>${txt}</span></span>`;
        return txt;
      };
      el.innerHTML = `<div class="tw"><table class="sortable"><thead><tr><th class="n">#</th>${cfg.cols.map(c => `<th class="${c.num ? 'n' : ''}${c.hideS ? ' hide-s' : ''}"${c.title ? ` title="${esc(c.title)}"` : ''}><button type="button" data-k="${c.k}" class="${c.k === st.sort ? 'on' : ''}">${c.label}${c.k === st.sort ? (st.dir === -1 ? ' ↓' : ' ↑') : ''}</button></th>`).join('')}</tr></thead><tbody>${shown.map((r, i) => `<tr><td class="n muted">${i + 1}</td>${cfg.cols.map(c => `<td class="${c.num ? 'n' : ''}${c.k === st.sort ? ' pts' : ''}${c.hideS ? ' hide-s' : ''}">${cellHtml(c, r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        ${rows.length > shown.length ? `<div class="toolbar"><span class="note">Показано ${shown.length} из ${rows.length}</span><button class="btn" type="button" data-more="1">Показать ещё</button></div>` : (rows.length > 15 ? `<p class="note">Всего ${rows.length}</p>` : '')}
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
  const TABS = [['', 'Обзор'], ['players', 'Игроки'], ['teams', 'Команды'], ['compare', 'Сравнение'], ['matches', 'Матчи'], ['streaks', 'Серии'], ['setpieces', 'Стандарты'], ['cards', 'Дисциплина'], ['refs', 'Судьи']];
  const statsState = { from: '', to: '', kind: 'all', team: '', minApps: 10, q: '' };
  const SP = {
    pen: { label: 'Пенальти', short: 'Пен.', note: 'В протоколах блога 10-метровые удары отдельно не отмечены. Если их записывали как пенальти, они входят в этот показатель.' },
    tenm: { label: '10-метровые', short: '10 м' },
    fk: { label: 'Штрафные удары', short: 'Штр.' },
  };
  const KIND_OPTS = () => {
    const names = new Map();
    for (const t of db.tournaments) if (!t.final) names.set(t.id, t.name);
    const order = ['chemp', 'media', 'brand', 'cup', 'gold', 'hope', 'cl', 'lc'];
    return [['all', 'Все турниры'], ['league', 'Все лиги'], ['cup', 'Все кубки'], ...order.filter(id => names.has(id)).map(id => [id, names.get(id)])];
  };
  function statsFilterBar() {
    const seasons = db.seasons.filter(s => !s.archive).map(s => s.label);
    const teams = [...db.teams.values()].filter(t => t.matches.length).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const opt = (v, l, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(l)}</option>`;
    return `<form class="filters" id="sf" onsubmit="return false">
      <label>С сезона <select id="sf-from">${seasons.map(s => opt(s, s, s === (statsState.from || seasons[0]))).join('')}</select></label>
      <label>по <select id="sf-to">${seasons.map(s => opt(s, s, s === (statsState.to || seasons[seasons.length - 1]))).join('')}</select></label>
      <label>Турниры <select id="sf-kind">${KIND_OPTS().map(([v, l]) => opt(v, l, v === statsState.kind)).join('')}</select></label>
      <label>Команда <select id="sf-team">${opt('', 'Все команды', !statsState.team)}${teams.map(t => opt(t.id, t.name, t.id === statsState.team)).join('')}</select></label>
      <button type="button" class="btn" id="sf-reset">Сбросить</button>
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
    parts.push(from === to ? 'сезон ' + from : `сезоны ${from} — ${to}`);
    const k = KIND_OPTS().find(x => x[0] === statsState.kind); if (k && statsState.kind !== 'all') parts.push(k[1]);
    if (statsState.team) parts.push(db.teams.get(statsState.team).name);
    return parts.join(' · ');
  }
  function pageStats(tab) {
    return `<div class="page">
      <div class="block"><div class="eyebrow">По протоколам 2010–2022</div><h1 class="title">Статистика</h1>
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
      html = `<p class="note filter-desc">${esc(filterDesc())} · ${nf(ms.length)} ${plural(ms.length, 'матч', 'матча', 'матчей')}</p>`;
      if (!ms.length) html += '<div class="callout">Под выбранные условия не попал ни один матч. Измените фильтр.</div>';
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
    el.innerHTML = list.length ? `<div class="block"><div class="sec-head"><h3 class="sub">${esc(title)}</h3><span class="note">${list.length} ${plural(list.length, 'матч', 'матча', 'матчей')}${list.length > 40 ? ', показаны последние 40' : ''}</span></div><div class="mlist">${list.slice(-40).reverse().map(m => matchRow(m, { ctx: (ctx ? ctx(m) + ' · ' : '') + stageCtx(m) })).join('')}</div></div>` : '';
  }
  const goalType = g => (g.og ? 'og' : g.pen ? 'pen' : g.tenm ? 'tenm' : g.free ? 'fk' : 'open');
  const hasTenm = () => db.matches.some(m => m.goals.some(g => g.tenm));

  /* --- обзор --- */
  function statsOverview(ms) {
    const o = Stats.overview(db, ms);
    const att = ms.filter(m => m.att);
    const multi = o.bySeason.length > 1;
    const types = [['all', 'Все голы'], ['open', 'С игры'], ['pen', SP.pen.label], ...(hasTenm() ? [['tenm', SP.tenm.label]] : []), ['fk', SP.fk.label], ['og', 'Автоголы']];
    const byMinute = switcher(types, (el, v) => {
      const vals = v === 'all' ? o.bins : o.binsBy[v];
      Charts.bars(el, { labels: Stats.BINS.slice(0, 10), values: vals.slice(0, 10), unit: 'голов', color: S(1), height: 240 });
    });
    const seasons = [...o.seasonBins.keys()];
    const heat = multi ? chart('heatmap', { rows: seasons, cols: Stats.BINS.slice(0, 10).map(x => x.replace('–', '-')), values: seasons.map(s => o.seasonBins.get(s).slice(0, 10)), unit: 'голов', corner: 'сезон', cellW: 40 }, 0) : '';
    return `
      <section class="facts big">
        ${kpi(nf(o.played), 'сыгранных матчей')}${kpi(nf(o.goals), 'голов')}${kpi(dec(o.gpm), 'голов за матч')}
        ${kpi(nf(o.pens), 'голов с пенальти')}${o.tenm ? kpi(nf(o.tenm), 'с 10-метровых') : ''}${kpi(nf(o.free), 'со штрафных ударов')}
        ${kpi(nf(o.og), 'автоголов')}${kpi(nf(o.yc), 'предупреждений')}${kpi(nf(o.rc), 'удалений')}
        ${att.length ? kpi(dec(att.reduce((s, m) => s + m.att, 0) / att.length, 0), 'зрителей в среднем') : ''}
      </section>
      <section class="block panel"><h3 class="sub">Когда забивают</h3>${byMinute}<p class="note">Голы по пятиминуткам, матч длится 2 × 25 минут. Переключайте вид голов.</p></section>
      ${multi ? `<section class="block panel"><h3 class="sub">Голы по сезонам и минутам</h3>${heat}<p class="note">Чем темнее клетка, тем больше голов. Наведите, чтобы увидеть число.</p></section>` : ''}
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
      box.querySelector('.pchips').innerHTML = slots.map((p, k) => p ? `<span class="pchip"><i style="background:${S(k + 1)}"></i>${esc(p.name)}<button type="button" data-k="${k}" aria-label="Убрать ${esc(p.name)}">×</button></span>` : '').join('');
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
    return `<section class="block panel" id="${id}"><h3 class="sub">Гонка бомбардиров</h3>
      <div class="picker"><input list="${dl}" placeholder="Добавить игрока" aria-label="Добавить игрока на график"><datalist id="${dl}">${pool.map(p => `<option value="${esc(p.name)}"></option>`).join('')}</datalist><span class="pchips"></span></div>
      <div class="chart" style="height:280px"></div><p class="note">Голы нарастающим итогом по сезонам. До шести игроков; уберите лишнего крестиком.</p></section>`;
  }

  /* --- атака и оборона команд --- */
  function teamsScatter(ms) {
    const rows = Stats.teamTable(db, ms).filter(r => r.p >= Math.min(15, Math.max(5, ms.length / 40)) && !(statsState.team && r.team.id !== statsState.team && false));
    if (rows.length < 3) return '';
    const avg = k => rows.reduce((s, r) => s + r[k] * r.p, 0) / rows.reduce((s, r) => s + r.p, 0);
    return `<section class="block panel"><h3 class="sub">Атака и оборона команд</h3>${chart('scatter', {
      points: rows.map(r => ({ id: r.team.id, x: +r.gfpm.toFixed(2), y: +r.gapm.toFixed(2), r: r.p, label: r.team.name, href: '#t-' + r.team.id, rec: r })),
      xLabel: 'забито за матч', yLabel: 'пропущено за матч', invertY: true, avgX: avg('gfpm'), avgY: avg('gapm'),
      highlight: statsState.team ? [statsState.team] : [], labelAll: rows.length <= 14, height: 380,
      tip: p => [{ value: dec(p.x, 2), label: 'забито за матч' }, { value: dec(p.y, 2), label: 'пропущено за матч' }, { value: p.rec.w + '–' + p.rec.d + '–' + p.rec.l, label: p.rec.p + ' ' + plural(p.rec.p, 'матч', 'матча', 'матчей') }],
    }, 380)}<p class="note">Вправо — сильнее атака, вверх — надёжнее оборона. Размер точки — число матчей, пунктир — средние значения. Нажмите на точку, чтобы открыть команду.</p></section>`;
  }

  /* --- рейтинг-полосы с выбором показателя --- */
  function leaders(rows, metrics, opts = {}) {
    return switcher(metrics.map(m => [m.k, m.label]), (el, k) => {
      const m = metrics.find(x => x.k === k);
      const list = rows.filter(r => m.get(r) != null && m.get(r) > 0 && (!m.min || m.min(r))).sort((a, b) => m.get(b) - m.get(a)).slice(0, opts.n || 15);
      if (!list.length) { el.innerHTML = '<p class="note">Нет данных для этого показателя.</p>'; return; }
      Charts.hbars(el, { items: list.map(r => ({ label: opts.label(r), sub: opts.sub ? opts.sub(r) : '', value: m.get(r), href: opts.href(r) })), fmt: m.fmt });
      if (m.note) { const p = document.createElement('p'); p.className = 'note'; p.textContent = m.note; el.appendChild(p); }
    });
  }

  /* --- игроки --- */
  const teamsOf = r => [...r.teams.values()].sort((a, b) => b.apps - a.apps).slice(0, 2).map(t => teamLink(t.team, [...t.names][0])).join(', ');
  const teamsTxt = r => [...r.teams.values()].sort((a, b) => b.apps - a.apps).slice(0, 2).map(t => [...t.names][0]).join(', ');
  function statsPlayers(ms) {
    let rows = Stats.playerTable(db, ms);
    if (statsState.team) rows = rows.filter(r => r.teams.has(statsState.team));
    const min = statsState.minApps;
    const metrics = [
      { k: 'goals', label: 'Голы', get: r => r.goals },
      { k: 'gpm', label: 'Голы за матч', get: r => r.gpm, fmt: v => dec(v, 2), min: r => r.apps >= min, note: `Игроки, сыгравшие не меньше ${min} матчей.` },
      { k: 'apps', label: 'Матчи', get: r => r.apps },
      { k: 'winners', label: 'Победные голы', get: r => r.winners, note: 'Гол, после которого команда повела и больше не уступала.' },
      { k: 'hat', label: 'Хет-трики', get: r => r.hat },
      { k: 'streak', label: 'Серия с голами', get: r => r.streak, note: 'Матчей подряд с забитым голом.' },
      { k: 'late', label: 'Голы на 46–50′', get: r => r.late },
      { k: 'firsts', label: 'Первые голы', get: r => r.firsts },
      { k: 'seasons', label: 'Сезоны', get: r => r.seasons.size },
    ];
    const q = Core.normName(statsState.q || '');
    const trows = q ? rows.filter(r => Core.normName(r.p.name).includes(q)) : rows;
    return `<section class="block panel"><h3 class="sub">Лидеры</h3>${leaders(rows, metrics, { label: r => r.p.name, sub: teamsTxt, href: r => '#p-' + r.p.id })}</section>
      <section class="block"><div class="sec-head"><h3 class="sub">Все игроки</h3></div>
      <div class="toolbar"><input id="st-q" type="search" placeholder="Найти игрока" value="${esc(statsState.q || '')}" aria-label="Найти игрока">
      <label class="muted" for="st-min">Для средних — не меньше</label><input id="st-min" type="number" min="0" max="200" value="${min}" style="width:5em"><span class="muted">матчей</span></div>
      ${sortable({ rows: trows, sort: 'goals', limit: 50, cols: [
        { k: 'name', label: 'Игрок', get: r => r.p.name, html: r => playerLink(r.p), asc: true },
        { k: 'teams', label: 'Команды', html: teamsOf, get: () => '', hideS: true },
        { k: 'apps', label: 'М', title: 'Матчи', num: true, get: r => r.apps },
        { k: 'goals', label: 'Голы', num: true, get: r => r.goals },
        { k: 'gpm', label: 'Г/М', title: 'Голов за матч', num: true, get: r => (r.apps >= min ? r.gpm : null), fmt: v => dec(v, 2) },
        { k: 'pen', label: SP.pen.short, title: 'Голы с пенальти', num: true, get: r => r.pen },
        ...(hasTenm() ? [{ k: 'tenm', label: SP.tenm.short, title: 'Голы с 10-метровых', num: true, get: r => r.tenm }] : []),
        { k: 'free', label: SP.fk.short, title: 'Голы со штрафных ударов', num: true, get: r => r.free },
        { k: 'hat', label: 'Хет-тр.', title: 'Три гола и больше в матче', num: true, get: r => r.hat },
        { k: 'winners', label: 'Побед.', title: 'Победные голы', num: true, get: r => r.winners },
        { k: 'streak', label: 'Серия', title: 'Матчей подряд с голом', num: true, get: r => r.streak },
        { k: 'yc', label: 'ЖК', num: true, get: r => r.yc },
        { k: 'rc', label: 'КК', num: true, get: r => r.rc },
        { k: 'seasons', label: 'Сез.', title: 'Сезонов', num: true, get: r => r.seasons.size },
      ] })}</section>`;
  }

  /* --- команды --- */
  function statsTeams(ms) {
    if (statsState.team) return teamFocus(ms);
    const rows = Stats.teamTable(db, ms).filter(r => r.p);
    const minP = Math.min(20, Math.max(5, Math.round(ms.length / 30)));
    const metrics = [
      { k: 'w', label: 'Победы', get: r => r.w },
      { k: 'winPct', label: 'Доля побед', get: r => r.winPct, fmt: pct, min: r => r.p >= minP, note: `Команды, сыгравшие не меньше ${minP} матчей.` },
      { k: 'gfpm', label: 'Забивают за матч', get: r => r.gfpm, fmt: v => dec(v, 2), min: r => r.p >= minP },
      { k: 'cs', label: 'Сухие матчи', get: r => r.cs },
      { k: 'comebacks', label: 'Камбэки', get: r => r.comebacks, note: 'Победы после того, как команда уступала.' },
      { k: 'acc', label: 'Удары в створ', get: r => (r.statN >= 5 ? r.acc : null), fmt: pct },
      { k: 'titles', label: 'Титулы', get: r => r.team.trophies.filter(x => x.place === 1).length },
    ];
    return `<section class="block panel"><h3 class="sub">Рейтинг команд</h3>${leaders(rows, metrics, { label: r => r.team.name, href: r => '#t-' + r.team.id })}</section>
      ${teamsScatter(ms)}
      <section class="block"><h3 class="sub">Все команды</h3>${sortable({ rows, sort: 'w', limit: 100, cols: teamCols(), note: 'Удары, угловые и фолы — по матчам, где эта статистика есть в протоколе.' })}</section>`;
  }
  function teamCols() {
    return [
      { k: 'name', label: 'Команда', get: r => r.team.name, html: r => teamLink(r.team), asc: true },
      { k: 'p', label: 'М', num: true, get: r => r.p },
      { k: 'w', label: 'В', num: true, get: r => r.w }, { k: 'd', label: 'Н', num: true, get: r => r.d }, { k: 'l', label: 'П', num: true, get: r => r.l },
      { k: 'winPct', label: '% В', title: 'Доля побед', num: true, get: r => r.winPct, fmt: pct },
      { k: 'gfpm', label: 'Заб./м', title: 'Забито за матч', num: true, get: r => r.gfpm, fmt: v => dec(v, 2) },
      { k: 'gapm', label: 'Проп./м', title: 'Пропущено за матч', num: true, get: r => r.gapm, fmt: v => dec(v, 2), asc: true },
      { k: 'cs', label: 'Сухие', title: 'Матчи без пропущенных голов', num: true, get: r => r.cs },
      { k: 'comebacks', label: 'Камбэки', title: 'Победы после того, как команда уступала', num: true, get: r => r.comebacks },
      { k: 'shots', label: 'Удары/м', num: true, get: r => (r.statN ? r.shots / r.statN : null), fmt: v => dec(v, 1) },
      { k: 'acc', label: 'В створ', title: 'Доля ударов в створ', num: true, get: r => r.acc, fmt: pct },
      { k: 'corners', label: 'Угл./м', num: true, get: r => (r.statN ? r.corners / r.statN : null), fmt: v => dec(v, 1) },
      { k: 'fouls', label: 'Фолы/м', num: true, get: r => (r.statN ? r.fouls / r.statN : null), fmt: v => dec(v, 1), asc: true },
      { k: 'yc', label: 'ЖК', num: true, get: r => r.yc }, { k: 'rc', label: 'КК', num: true, get: r => r.rc },
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
    return `${mine ? teamStatFacts(mine) : ''}
      ${formBlock(me, ms)}
      <section class="block"><h3 class="sub">Результаты против соперников</h3>
      ${sortable({ rows: [...opp.values()], sort: 'p', limit: 100, cols: [
        { k: 'name', label: 'Соперник', get: r => r.team.name, html: r => teamLink(r.team), asc: true },
        { k: 'p', label: 'М', num: true, get: r => r.p }, { k: 'w', label: 'В', num: true, get: r => r.w }, { k: 'd', label: 'Н', num: true, get: r => r.d }, { k: 'l', label: 'П', num: true, get: r => r.l },
        { k: 'pct', label: '% В', num: true, get: r => r.w / r.p, fmt: pct },
        { k: 'diff', label: 'Разн.', num: true, get: r => r.gf - r.ga, fmt: v => (v > 0 ? '+' : '') + v },
        { k: 'last', label: 'Последний матч', get: r => r.last.date, html: r => `<a href="#m-${r.last.id}">${shortDate(r.last.date)} ${esc(Core.scoreText(r.last))}</a>`, hideS: true },
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
      rows.get(k).push({ ...it, mark: bset.has(it.m.id), title: shortDate(it.m.date) + ' · ' + it.m.tour.name + (it.m.stage ? ', ' + it.m.stage : ''), score: (it.m.tech ? 'тех. ' : '') + f + ':' + a, sub: 'против ' + o });
    }
    return `<section class="block panel"><h3 class="sub">Лента формы</h3>${chart('formStrip', { rows: [...rows.entries()].map(([label, items]) => ({ label, items })) }, 0)}
      <p class="note">Каждый квадрат — матч: В — победа, Н — ничья, П — поражение. Обведены матчи лучшей серии побед (${best.length}). Наведите, чтобы увидеть счёт, нажмите, чтобы открыть протокол.</p></section>`;
  }
  function teamStatFacts(r) {
    const s = r.streaks ? r.streaks.best : {};
    const at = r.streaks ? r.streaks.at : {};
    const rng = k => (at[k] ? ` title="${esc(fmtDate(at[k].from.date) + ' — ' + fmtDate(at[k].to.date))}"` : '');
    return `<div class="facts">
      ${kpi(pct(r.winPct), 'побед')}${kpi(dec(r.gfpm, 2) + ' / ' + dec(r.gapm, 2), 'забито / пропущено за матч')}
      ${kpi(r.cs, 'сухих матчей')}${kpi(r.comebacks, 'побед после отставания')}
      <div class="fact"${rng('win')}><b>${s.win || 0}</b><span>побед подряд (рекорд)</span></div>
      <div class="fact"${rng('unbeaten')}><b>${s.unbeaten || 0}</b><span>матчей без поражений подряд</span></div>
      ${r.statN ? kpi(dec(r.shots / r.statN, 1), 'ударов за матч') + kpi(pct(r.acc), 'ударов в створ') + kpi(dec(r.corners / r.statN, 1), 'угловых за матч') + kpi(dec(r.fouls / r.statN, 1), 'фолов за матч') : ''}
      ${kpi(r.yc + ' / ' + r.rc, 'предупреждений / удалений')}
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
    const head = `<div id="${id}" class="block panel"><div class="chipset" role="group"><button type="button" data-v="players" aria-pressed="${mode === 'players'}">Игроки</button><button type="button" data-v="teams" aria-pressed="${mode === 'teams'}">Команды</button></div>
      <div class="cmp-sel"><label>${mode === 'players' ? 'Первый игрок' : 'Первая команда'}<input id="${id}-a" list="${dl}" value="${esc(A.name)}"></label><label>${mode === 'players' ? 'Второй игрок' : 'Вторая команда'}<input id="${id}-b" list="${dl}" value="${esc(B.name)}"></label></div>
      <datalist id="${dl}">${pool.map(o => `<option value="${esc(o.name)}"></option>`).join('')}</datalist>
      <p class="note">Начните вводить ${mode === 'players' ? 'фамилию' : 'название'} и выберите из списка.</p></div>`;
    return head + (mode === 'players' ? comparePlayers(A, B) : compareTeams(A, B));
  }
  function comparePlayers(A, B) {
    const ra = Stats.playerTable(db, A.apps.map(x => x.m)).find(r => r.p === A), rb = Stats.playerTable(db, B.apps.map(x => x.m)).find(r => r.p === B);
    if (!ra || !rb) return '';
    const rows = [
      { label: 'матчи', a: ra.apps, b: rb.apps }, { label: 'голы', a: ra.goals, b: rb.goals },
      { label: 'голов за матч', a: +ra.gpm.toFixed(2), b: +rb.gpm.toFixed(2), fmt: v => dec(v, 2) },
      { label: 'победные голы', a: ra.winners, b: rb.winners }, { label: 'хет-трики', a: ra.hat, b: rb.hat }, { label: 'дубли', a: ra.brace, b: rb.brace },
      { label: 'серия с голами', a: ra.streak, b: rb.streak }, { label: 'голы с пенальти', a: ra.pen, b: rb.pen }, { label: 'голы со штрафных', a: ra.free, b: rb.free },
      { label: 'предупреждения', a: ra.yc, b: rb.yc, lowerBetter: true }, { label: 'удаления', a: ra.rc, b: rb.rc, lowerBetter: true }, { label: 'сезоны', a: ra.seasons.size, b: rb.seasons.size },
    ];
    const seasons = [...new Set([...A.apps, ...B.apps].map(x => x.m.season.label))].sort((x, y) => Core.seasonOrder(x) - Core.seasonOrder(y));
    const gps = p => seasons.map(s => p.goals.filter(g => g.m.season.label === s).length);
    const vs = A.apps.filter(a => B.apps.some(b => b.m === a.m)).map(a => ({ a, b: B.apps.find(b => b.m === a.m) }));
    const together = vs.filter(x => x.a.side === x.b.side).length, against = vs.filter(x => x.a.side !== x.b.side);
    let aw = 0, bw = 0, dr = 0;
    for (const x of against) { const w = Core.winnerSide(x.a.m); if (w === x.a.side) aw++; else if (w === x.b.side) bw++; else dr++; }
    return `<section class="block panel">${chart('mirror', { a: A.name, b: B.name, rows }, 0)}</section>
      <section class="block panel"><h3 class="sub">Голы по сезонам</h3>${legend([{ label: A.name, color: S(1), line: true }, { label: B.name, color: S(2), line: true }])}${chart('line', { labels: seasons, series: [{ name: A.name, values: gps(A), color: S(1) }, { name: B.name, values: gps(B), color: S(2) }] })}</section>
      <div class="facts">${kpi(together, 'матчей в одной команде')}${kpi(against.length, 'матчей друг против друга')}${against.length ? kpi(aw + '–' + dr + '–' + bw, 'победы ' + esc(A.name.split(' ')[0]) + ' – ничьи – победы ' + esc(B.name.split(' ')[0])) : ''}</div>
      ${against.length ? `<section class="block"><h3 class="sub">Матчи друг против друга</h3><div class="mlist">${against.slice(-20).reverse().map(x => matchRow(x.a.m, { ctx: stageCtx(x.a.m) })).join('')}</div></section>` : ''}`;
  }
  function compareTeams(A, B) {
    const ra = Stats.teamTable(db, A.matches).find(r => r.team === A), rb = Stats.teamTable(db, B.matches).find(r => r.team === B);
    const rows = [
      { label: 'матчи', a: ra.p, b: rb.p }, { label: 'победы', a: ra.w, b: rb.w }, { label: 'доля побед, %', a: Math.round(ra.winPct * 100), b: Math.round(rb.winPct * 100) },
      { label: 'забито за матч', a: +ra.gfpm.toFixed(2), b: +rb.gfpm.toFixed(2), fmt: v => dec(v, 2) }, { label: 'пропущено за матч', a: +ra.gapm.toFixed(2), b: +rb.gapm.toFixed(2), fmt: v => dec(v, 2), lowerBetter: true },
      { label: 'сухие матчи', a: ra.cs, b: rb.cs }, { label: 'камбэки', a: ra.comebacks, b: rb.comebacks },
      { label: 'побед подряд', a: ra.streaks.best.win, b: rb.streaks.best.win }, { label: 'титулы', a: A.trophies.filter(x => x.place === 1).length, b: B.trophies.filter(x => x.place === 1).length },
      { label: 'ударов за матч', a: ra.statN ? +(ra.shots / ra.statN).toFixed(1) : null, b: rb.statN ? +(rb.shots / rb.statN).toFixed(1) : null, fmt: v => dec(v, 1) },
      { label: 'предупреждения', a: ra.yc, b: rb.yc, lowerBetter: true },
    ];
    const h2h = A.matches.filter(m => m.home === B || m.away === B);
    let aw = 0, bw = 0, dr = 0, ag = 0, bg = 0;
    for (const m of h2h) { const sc = Core.tableScore(m); if (!sc) continue; const w = Core.winnerSide(m); const sa = m.home === A ? 'h' : 'a'; if (w === sa) aw++; else if (w === 'd') dr++; else bw++; ag += sa === 'h' ? sc.gh : sc.ga; bg += sa === 'h' ? sc.ga : sc.gh; }
    return `<section class="block panel">${chart('mirror', { a: A.name, b: B.name, rows }, 0)}</section>
      <div class="facts">${kpi(h2h.length, 'личных встреч')}${h2h.length ? kpi(aw + '–' + dr + '–' + bw, 'победы ' + esc(A.name) + ' – ничьи – победы ' + esc(B.name)) + kpi(ag + ':' + bg, 'мячи в личных встречах') : ''}</div>
      ${h2h.length ? `<section class="block"><h3 class="sub">Личные встречи</h3><div class="mlist">${h2h.slice().reverse().slice(0, 30).map(m => matchRow(m, { ctx: stageCtx(m) })).join('')}</div></section>` : ''}`;
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
    const d1 = drillBox(), d2 = drillBox();
    const totals = new Map(); for (const m of pl) { const t = Math.min(25, m.score[0] + m.score[1]); if (!totals.has(t)) totals.set(t, []); totals.get(t).push(m); }
    const tk = [...totals.keys()].sort((a, b) => a - b);
    const top = [...byCell.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 5).map(([k, v]) => { const [hi, lo] = k.split('|'); return `${hi}${+hi === cap ? '+' : ''}:${lo}${+lo === capL ? '+' : ''} — ${v.length}`; });
    const sum = (m, k) => (m.stats && m.stats[k] ? m.stats[k][0] + m.stats[k][1] : 0);
    return `<section class="block panel"><h3 class="sub">Самые частые счета</h3>
        ${chart('heatmap', { rows: used.map(([, i]) => String(i) + (i === cap ? '+' : '')), cols: Array.from({ length: capL + 1 }, (_, j) => String(j) + (j === capL ? '+' : '')), values: used.map(([r]) => r), unit: 'матчей', corner: 'больше : меньше', showValues: true, rowW: 110, cellW: 32, cellTitle: (i, j) => `счёт ${used[i][1]}:${j}`, onClick: (i, j) => fillDrill(d1.id, `Счёт ${used[i][1]}:${j}`, byCell.get(used[i][1] + '|' + j) || []) }, 0)}
        <p class="note">Строка — голы команды, забившей больше, столбец — голы соперника. Чаще всего: ${top.join('; ')}. Нажмите на клетку, чтобы увидеть матчи.</p>${d1.html}</section>
      <section class="block panel"><h3 class="sub">Сколько голов забивают в матче</h3>${chart('bars', { labels: tk.map(t => t === 25 ? '25+' : String(t)), values: tk.map(t => totals.get(t).length), unit: 'матчей', color: S(1), onClick: i => fillDrill(d2.id, `Голов в матче: ${tk[i]}${tk[i] === 25 ? '+' : ''}`, totals.get(tk[i])) }, 240)}<p class="note">Нажмите на столбец, чтобы увидеть матчи.</p>${d2.html}</section>
      <section class="grid2">
        ${recordCards('Крупнейшие победы', L.biggest.slice(0, 6), m => '+' + Math.abs(m.score[0] - m.score[1]))}
        ${recordCards('Самые результативные', L.highest.slice(0, 6), m => (m.score[0] + m.score[1]) + ' голов')}
        ${recordCards('Камбэки', L.comebacks.slice(0, 6).map(x => x.m), m => { const x = L.comebacks.find(c => c.m === m); return (x.won ? 'победа' : 'ничья') + ' после −' + x.def; })}
        ${recordCards('Самые быстрые голы', L.fastest.slice(0, 6).map(x => x.m), m => { const x = L.fastest.find(c => c.m === m); return x.g.min + '′ · ' + x.g.name; })}
        ${recordCards('Победа на последних минутах', L.lateWinners.slice(0, 6).map(x => x.m), m => { const x = L.lateWinners.find(c => c.m === m); return x.g.min + '′ · ' + x.g.name; })}
        ${recordCards('Больше всего ударов', L.shots.slice(0, 6), m => sum(m, 'shots') + ' ударов')}
        ${recordCards('Больше всего угловых', L.corners.slice(0, 6), m => sum(m, 'corners') + ' угловых')}
        ${recordCards('Больше всего зрителей', L.attendance.slice(0, 6), m => m.att + ' зрителей')}
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
    return `${team ? formBlock(team, ms) : '<div class="callout">Выберите команду в фильтре, чтобы увидеть её ленту формы по сезонам.</div>'}
      <section class="block panel"><h3 class="sub">Рекордные серии команд</h3>${leaders(rows, [sk('win', 'Победы подряд'), sk('unbeaten', 'Без поражений'), sk('scoring', 'Забивали подряд'), sk('cs', 'Не пропускали подряд'), sk('loss', 'Поражения подряд'), sk('winless', 'Без побед подряд')], { label: r => r.team.name, sub: r => { const a = r.streaks.at.win; return ''; }, href: r => '#t-' + r.team.id })}
        <p class="note">Серии считаются по всем матчам выбранного фильтра в порядке дат. Даты серий — на странице команды и в таблице ниже (наведите на число).</p></section>
      <section class="block panel"><h3 class="sub">Игроки: матчей подряд с голом</h3>${chart('hbars', { items: pl.sort((a, b) => b.streak - a.streak).slice(0, 15).map(r => ({ label: r.p.name, sub: teamsTxt(r), value: r.streak, href: '#p-' + r.p.id })) }, 0)}</section>
      <section class="block"><h3 class="sub">Таблица серий</h3>${sortable({ rows, sort: 'win', limit: 100, cols: [
        { k: 'name', label: 'Команда', get: r => r.team.name, html: r => teamLink(r.team), asc: true },
        ...[['win', 'Победы'], ['unbeaten', 'Без пораж.'], ['scoring', 'Забивали'], ['cs', 'Не пропуск.'], ['loss', 'Поражения'], ['winless', 'Без побед']].map(([k, label]) => ({ k, label, num: true, get: r => r.streaks.best[k], html: r => { const a = r.streaks.at[k]; const v = r.streaks.best[k]; return a && v ? `<span title="${esc(fmtDate(a.from.date) + ' — ' + fmtDate(a.to.date))}">${v}</span>` : String(v || 0); } })),
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
        <div class="sp-head"><h3 class="sub">${label}</h3><span class="sp-num">${nf(scored)}<small>${plural(scored, 'гол', 'гола', 'голов')}</small></span></div>
        ${extra || ''}
        <div class="grid2"><div><h4 class="mini">Когда забивают</h4>${chart('bars', { labels: Stats.BINS.slice(0, 10), values: bins.slice(0, 10), unit: 'голов', color: k === 'fk' ? S(3) : S(1), height: 200 }, 200)}</div>
        <div><h4 class="mini">Лучшие исполнители</h4>${chart('hbars', { items: pl.filter(r => r[field] > 0).sort((a, b) => b[field] - a[field]).slice(0, 10).map(r => ({ label: r.p.name, sub: teamsTxt(r), value: r[field], href: '#p-' + r.p.id, color: k === 'fk' ? S(3) : S(1) })) }, 0)}</div></div>
      </section>`;
    const missed = `<div class="facts">${kpi(nf(o.missedTotal), 'не забито')}${kpi(nf(missedBy['вратарь']), 'отбил вратарь')}${kpi(nf(missedBy['мимо']), 'мимо')}${kpi(nf(missedBy['штанга']), 'штанга или перекладина')}${kpi(pct(o.pens / ((o.pens + o.missedTotal) || 1)), 'реализация')}</div>`;
    const mpRows = pl.filter(r => r.pen + r.mpTotal > 0);
    return `${type('pen', SP.pen.label + (tenm ? '' : ' *'), o.pens, o.binsBy.pen, 'pen', missed)}
      ${tenm ? type('tenm', SP.tenm.label, o.tenm, o.binsBy.tenm, 'tenm') : ''}
      ${type('fk', SP.fk.label, o.free, o.binsBy.fk, 'free')}
      <section class="block"><h3 class="sub">Исполнители пенальти</h3>${sortable({ rows: mpRows, sort: 'att', limit: 30, cols: [
        { k: 'name', label: 'Игрок', get: r => r.p.name, html: r => playerLink(r.p), asc: true },
        { k: 'teams', label: 'Команды', html: teamsOf, get: () => '', hideS: true },
        { k: 'att', label: 'Ударов', num: true, get: r => r.pen + r.mpTotal },
        { k: 'pen', label: 'Забито', num: true, get: r => r.pen },
        { k: 'saved', label: 'Вратарь', title: 'Отбил вратарь', num: true, get: r => r.mpSaved },
        { k: 'wide', label: 'Мимо', num: true, get: r => r.mpWide },
        { k: 'post', label: 'Штанга', num: true, get: r => r.mpPost },
        { k: 'pct', label: 'Реализ.', num: true, get: r => r.pen / (r.pen + r.mpTotal), fmt: pct },
      ] })}</section>
      <p class="note">* ${SP.pen.note} Незабитые удары в протоколах записаны под заголовком «Незабитые пенальти», поэтому промахи учтены здесь. Голы со штрафных ударов отмечены в протоколах словом «штрафной».</p>`;
  }

  /* --- дисциплина --- */
  function statsCards(ms) {
    let pl = Stats.playerTable(db, ms).filter(r => r.yc || r.rc);
    if (statsState.team) pl = pl.filter(r => r.teams.has(statsState.team));
    const tt = Stats.teamTable(db, ms).filter(r => r.p >= 5);
    const o = Stats.overview(db, ms);
    const yb = new Array(10).fill(0), rb = new Array(10).fill(0);
    for (const m of ms) { for (const c of m.yc) { const b = Stats.binOf(c.min); if (b >= 0 && b < 10) yb[b]++; } for (const c of m.rc) { const b = Stats.binOf(c.min); if (b >= 0 && b < 10) rb[b]++; } }
    return `<section class="facts big">${kpi(nf(o.yc), 'предупреждений')}${kpi(nf(o.rc), 'удалений')}${kpi(dec(o.yc / (o.played || 1), 2), 'предупреждений за матч')}</section>
      <section class="block panel"><h3 class="sub">Когда показывают карточки</h3>${legend([{ label: 'предупреждения', color: S(4) }, { label: 'удаления', color: S(8) }])}${chart('grouped', { labels: Stats.BINS.slice(0, 10), series: [{ name: 'предупреждения', values: yb, color: S(4) }, { name: 'удаления', values: rb, color: S(8) }] }, 230)}</section>
      <section class="grid2">
        <div class="block panel"><h3 class="sub">Игроки</h3>${leaders(pl, [{ k: 'fair', label: 'Штрафные очки', get: r => r.fair, note: 'По регламенту: удаление — 5 очков, предупреждение — 1.' }, { k: 'yc', label: 'Предупреждения', get: r => r.yc }, { k: 'rc', label: 'Удаления', get: r => r.rc }], { label: r => r.p.name, sub: teamsTxt, href: r => '#p-' + r.p.id, n: 12 })}</div>
        <div class="block panel"><h3 class="sub">Команды</h3>${leaders(tt, [{ k: 'fairpm', label: 'Самые корректные', get: r => 1 / (0.05 + r.fair / r.p), fmt: v => dec(1 / v - 0.05, 2) + ' очк./м', note: 'Штрафные очки за матч, чем меньше, тем выше. Команды от 5 матчей.' }, { k: 'rough', label: 'Больше всего очков за матч', get: r => r.fair / r.p, fmt: v => dec(v, 2) }, { k: 'rc', label: 'Удаления', get: r => r.rc }], { label: r => r.team.name, href: r => '#t-' + r.team.id, n: 12 })}</div>
      </section>`;
  }

  /* --- судьи --- */
  function statsRefs(ms) {
    const rows = Stats.referees(ms);
    const big = rows.filter(r => r.n >= 10);
    return `<section class="block panel"><h3 class="sub">Судьи: матчи и карточки</h3>${big.length >= 3 ? chart('scatter', { points: big.map(r => ({ id: r.name, x: r.n, y: +r.ycpm.toFixed(2), r: r.n, label: r.name, rec: r })), xLabel: 'матчей', yLabel: 'предупреждений за матч', labelAll: big.length <= 12, height: 340, tip: p => [{ value: p.rec.n, label: 'матчей' }, { value: dec(p.rec.ycpm, 2), label: 'предупреждений за матч' }, { value: dec(p.rec.gpm, 2), label: 'голов за матч' }] }, 340) : ''}<p class="note">Судьи от 10 матчей. Чем выше точка, тем чаще судья показывает карточки.</p></section>
      ${sortable({ rows, sort: 'n', limit: 100, cols: [
        { k: 'name', label: 'Судья', get: r => r.name, asc: true },
        { k: 'n', label: 'Матчи', num: true, get: r => r.n },
        { k: 'span', label: 'Годы', get: r => r.first, html: r => r.first.slice(0, 4) + (r.last.slice(0, 4) !== r.first.slice(0, 4) ? '–' + r.last.slice(0, 4) : '') },
        { k: 'gpm', label: 'Голов/м', num: true, get: r => r.gpm, fmt: v => dec(v, 2) },
        { k: 'ycpm', label: 'ЖК/м', num: true, get: r => r.ycpm, fmt: v => dec(v, 2) },
        { k: 'rc', label: 'КК', num: true, get: r => r.rc },
        { k: 'pens', label: 'Пенальти', title: 'Назначено пенальти (забитые и незабитые)', num: true, get: r => r.pens },
      ] })}`;
  }

  /* ================= статистика на странице команды ================= */
  function teamStatsSection(t) {
    const rows = Stats.teamTable(db, t.matches);
    const r = rows.find(x => x.team === t);
    if (!r || !r.p) return '';
    const seasons = [...new Set(t.matches.map(m => m.season.label))];
    const per = seasons.map(s => rows && Stats.teamTable(db, t.matches.filter(m => m.season.label === s)).find(x => x.team === t));
    return `<section class="block"><div class="sec-head"><h2 class="sec">Статистика команды</h2><a href="#stats-teams" data-team="${t.id}" class="to-stats">Подробно с фильтрами</a></div>
      ${teamStatFacts(r)}
      <div class="grid2">
        ${seasons.length > 1 ? `<div class="block panel"><h3 class="sub">Результаты по сезонам</h3>${legend([{ label: 'победы', color: S(1) }, { label: 'ничьи', color: S(4) }, { label: 'поражения', color: S(2) }])}${chart('stacked', { labels: seasons, series: [{ name: 'победы', values: per.map(x => x.w), color: S(1) }, { name: 'ничьи', values: per.map(x => x.d), color: S(4) }, { name: 'поражения', values: per.map(x => x.l), color: S(2) }] })}</div>` : ''}
        <div class="block panel"><h3 class="sub">Когда забивает и пропускает</h3>${legend([{ label: 'забито', color: S(1) }, { label: 'пропущено', color: S(2) }])}${chart('grouped', { labels: Stats.BINS.slice(0, 10), series: [{ name: 'забито', values: r.binsF.slice(0, 10), color: S(1) }, { name: 'пропущено', values: r.binsA.slice(0, 10), color: S(2) }] })}</div>
        ${seasons.length > 1 ? `<div class="block panel"><h3 class="sub">Голов за матч по сезонам</h3>${legend([{ label: 'забито', color: S(1), line: true }, { label: 'пропущено', color: S(2), line: true }])}${chart('line', { labels: seasons, series: [{ name: 'забито', values: per.map(x => +x.gfpm.toFixed(2)), color: S(1) }, { name: 'пропущено', values: per.map(x => +x.gapm.toFixed(2)), color: S(2) }], fmt: v => dec(v, 2) })}</div>` : ''}
        ${placesChart(t)}
      </div>
      <p class="note">* В протоколах незабитые пенальти и штрафные идут одним списком.</p>
    </section>`;
  }
  function placesChart(t) {
    const lf = t.finishes.filter(f => f.t.format === 'league' && !f.t.final).sort((a, b) => Core.seasonOrder(a.t.season.label) - Core.seasonOrder(b.t.season.label));
    if (lf.length < 2) return '';
    return `<div class="block panel"><h3 class="sub">Место в лиге по сезонам</h3>${chart('line', { labels: lf.map(f => f.t.season.label + (f.t.id === 'chemp' ? '' : f.t.id === 'media' ? ' М' : ' Б')), series: [{ name: 'место', values: lf.map(f => f.pos), color: S(1) }], invert: true, yMax: Math.max(...lf.map(f => f.n)), yFmt: v => String(v), fmt: v => v + '-е место' })}<p class="note">М — медиа-лига, Б — бренд-лига. Первое место — вверху.</p></div>`;
  }

  /* ================= статистика на странице игрока ================= */
  function playerStatsSection(p) {
    if (!p.apps.length && !p.goals.length) return '';
    const d = Stats.playerDetail(p);
    const braces = (() => { const per = new Map(); for (const g of p.goals) per.set(g.m.id, (per.get(g.m.id) || 0) + 1); let b = 0; for (const v of per.values()) if (v === 2) b++; return b; })();
    const att = d.pens + d.free + d.mp.total;
    return `<section class="block"><h2 class="sec">Статистика игрока</h2>
      <div class="facts">
        ${kpi(dec(p.apps.length ? p.goals.length / p.apps.length : 0, 2), 'голов за матч')}
        ${kpi(d.winners, 'победных голов')}${kpi(d.firsts, 'первых голов в матче')}
        <div class="fact"${d.streakRange ? ` title="${esc(fmtDate(d.streakRange.from.date) + ' — ' + fmtDate(d.streakRange.to.date))}"` : ''}><b>${d.streak}</b><span>матчей подряд с голом</span></div>
        ${kpi(braces + ' / ' + p.hatTricks, 'дублей / хет-триков')}
        ${att ? kpi(d.pens + ' + ' + d.free + ' из ' + att, 'пенальти + штрафные: забито из ударов*') : ''}
        ${d.mp.total ? kpi(d.mp.saved + ' / ' + d.mp.wide + ' / ' + d.mp.post, 'не забито: вратарь / мимо / штанга') : ''}
        ${kpi(p.yc.length + ' / ' + p.rc.length, 'предупреждений / удалений')}${p.og.length ? kpi(p.og.length, plural(p.og.length, 'автогол', 'автогола', 'автоголов')) : ''}
      </div>
      <div class="grid2">
        ${d.bySeason.length > 1 ? `<div class="block panel"><h3 class="sub">Матчи и голы по сезонам</h3>${legend([{ label: 'матчи', color: S(3) }, { label: 'голы', color: S(1) }])}${chart('grouped', { labels: d.bySeason.map(x => x.s), series: [{ name: 'матчи', values: d.bySeason.map(x => x.apps), color: S(3) }, { name: 'голы', values: d.bySeason.map(x => x.goals), color: S(1) }] })}</div>` : ''}
        ${p.goals.length >= 5 ? `<div class="block panel"><h3 class="sub">Когда забивает</h3>${chart('bars', { labels: Stats.BINS.slice(0, 10), values: d.bins.slice(0, 10), unit: 'голов', color: S(1) })}</div>` : ''}
        ${d.opponents.length ? `<div class="block"><h3 class="sub">Больше всего голов в ворота</h3><div class="tw"><table><tbody>${d.opponents.map(o => `<tr><td>${teamLink(o.team)}</td><td class="n pts">${o.goals}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
        ${d.mates.length ? `<div class="block"><h3 class="sub">Чаще всего на площадке вместе</h3><div class="tw"><table><tbody>${d.mates.map(o => `<tr><td>${playerLink(o.p)}</td><td class="n">${o.n} ${plural(o.n, 'матч', 'матча', 'матчей')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      </div>
      ${att ? '<p class="note">* Незабитые пенальти и штрафные в протоколах идут одним списком.</p>' : ''}
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
      out += `<div class="block panel" id="${id}"><h3 class="sub">Места по турам${tb.div ? ' · ' + esc(tb.div) : ''}</h3>
        <div class="bchips">${tb.rows.map(r => `<button type="button" class="bchip" data-id="${r.team.id}"><i></i>${esc(r.name)}</button>`).join('')}</div>
        <div class="chart" style="height:${Math.max(220, pr.n * 26 + 40)}px"></div><p class="note">Выберите до трёх команд, чтобы выделить их линии.</p></div>`;
      if (t.format === 'league') out += crossTableHtml(t, tb);
    }
    const tt = Stats.teamTable(db, t.matches).filter(r => r.p);
    out += `<div class="block"><h3 class="sub">Статистика команд турнира</h3>${sortable({ rows: tt, sort: 'gfpm', limit: 40, cols: teamCols().filter(c => !['winPct', 'firstWin'].includes(c.k)), note: 'Удары, угловые и фолы — по матчам, где эта статистика есть в протоколе.' })}</div>`;
    const gr = Stats.goalsByRound(t).filter(x => Core.isRoundStage(x.stage)).sort((a, b) => parseInt(a.stage, 10) - parseInt(b.stage, 10));
    if (gr.length >= 3) out += `<div class="block panel"><h3 class="sub">Голов за матч по турам</h3>${chart('bars', { labels: gr.map(x => parseInt(x.stage, 10) + ''), values: gr.map(x => +(x.goals / x.n).toFixed(1)), unit: 'голов за матч', color: S(1), fmt: v => dec(v, 1) })}</div>`;
    return `<section class="block"><h2 class="sec">Статистика турнира</h2>${out}</section>`;
  }
  function crossTableHtml(t, tb) {
    const ct = Stats.crossTable(t, tb.div, tb.rows.map(r => r.team.id));
    const rs = tb.rows;
    const cls = (m, me) => { const w = Core.winnerSide(m); const s = m.home.id === me ? 'h' : 'a'; return w === 'd' ? 'd' : w === s ? 'w' : 'l'; };
    return `<div class="block"><h3 class="sub">Шахматка${tb.div ? ' · ' + esc(tb.div) : ''}</h3><div class="tw"><table class="cross"><thead><tr><th></th>${rs.map((r, i) => `<th class="c" title="${esc(r.name)}">${i + 1}</th>`).join('')}</tr></thead><tbody>${rs.map((r, i) => `<tr><th class="ct">${i + 1}. ${teamLink(r.team, r.name)}</th>${rs.map((c, j) => {
      if (i === j) return '<td class="x"></td>';
      const ms = [...ct.get(r.team.id, c.team.id), ...ct.get(c.team.id, r.team.id)].sort((a, b) => (a.date < b.date ? -1 : 1));
      return `<td class="c">${ms.map(m => { const sc = Core.tableScore(m); const f = m.home.id === r.team.id ? sc && sc.gh : sc && sc.ga, a = m.home.id === r.team.id ? sc && sc.ga : sc && sc.gh; return `<a href="#m-${m.id}" class="cr ${cls(m, r.team.id)}">${m.tech ? '+/−' : f + ':' + a}</a>`; }).join('')}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div><p class="note">Счёт с точки зрения команды в строке. Зелёный — победа, серый — ничья, красный — поражение.</p></div>`;
  }

  function notFound() {
    return `<div class="page"><h1 class="title">Страница не найдена</h1><p class="lead">Такой страницы в архиве нет. Вернитесь на <a href="#">главную</a> или воспользуйтесь поиском.</p></div>`;
  }

  /* ---------- маршрутизация ---------- */
  function route() {
    if (!db) return;
    const h = decodeURIComponent(location.hash.replace(/^#/, ''));
    let html, nav = '';
    let m;
    if (!h) { html = pageHome(); nav = 'home'; }
    else if (h === 'teams') { html = pageTeams(); nav = 'teams'; }
    else if (h === 'players') { html = pagePlayers(); nav = 'players'; }
    else if (h === 'records') { html = pageRecords(); nav = 'records'; }
    else if ((m = h.match(/^stats(?:-(players|teams|compare|matches|streaks|setpieces|cards|refs))?$/))) { html = pageStats(m[1] || ''); nav = 'stats'; }
    else if (h === 'seasons') { html = pageHome(); nav = 'home'; }
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
    app.querySelectorAll('[data-href]').forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.href; }));
    if (h === 'teams') bindTeams();
    if (h === 'players') bindPlayers();
    if (nav === 'stats') { const tab = (h.match(/^stats-?(.*)$/) || [])[1] || ''; bindStatsFilters(tab); renderStatsBody(tab); }
    app.querySelectorAll('.to-stats').forEach(a => a.addEventListener('click', () => { statsState.team = a.dataset.team || ''; statsState.kind = 'all'; statsState.from = ''; statsState.to = ''; }));
    window.scrollTo(0, 0);
  }
  function titleFor(h) {
    const base = 'Чемпионат АЖИ по футзалу';
    const el = app.querySelector('h1');
    return h && el ? el.textContent.trim() + ' — ' + base : base;
  }

  /* ---------- загрузка ---------- */
  async function load() {
    const get = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ': ' + r.status); return r.json(); });
    const [idx, teams, players, rindex] = await Promise.all([get('data/seasons.json'), get('data/teams.json'), get('data/players.json'), get('data/reviews/index.json').catch(() => ({}))]);
    reviewIndex = rindex;
    const seasons = await Promise.all(idx.seasons.map(id => get(`data/seasons/${id}.json`)));
    db = Core.build({ seasons, teams, players });
    recs = Core.records(db);
    initSearch();
    route();
  }
  window.addEventListener('hashchange', route);
  load().catch(err => {
    app.innerHTML = `<div class="loading"><p>Не удалось загрузить данные архива.</p><p class="note">${esc(err.message)}. Сайт нужно открывать через веб-сервер: файлы данных загружаются из папки data.</p></div>`;
  });
})();
