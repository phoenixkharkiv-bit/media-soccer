/* Архив Чемпионата АЖИ по футзалу — ядро данных.
   Чистые функции без DOM: загрузка нормализованных данных, таблицы, статистика.
   Работает и в браузере (window.Core), и в Node (module.exports) для проверок. */
(function (root) {
  'use strict';

  const COMP_ORDER = ['chemp', 'media', 'brand', 'cup', 'gold', 'hope', 'cl', 'lc'];

  /* ---------- имена ---------- */
  function normName(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').replace(/\s*\(\s*мл\.?\s*\)/, ' (мл)').replace(/\s*\(\s*ст\.?\s*\)/, ' (ст)').trim();
  }
  const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', і: 'i', ї: 'yi', є: 'ye', ґ: 'g' };
  function slug(s) {
    return String(s).toLowerCase().split('').map(c => (c in TR ? TR[c] : c)).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
  }

  /* ---------- сборка базы ---------- */
  function build(raw) {
    // raw: {seasons:[seasonObj...], teams:{teams:[...]}, players:{merge:[], split:[]}}
    const db = { seasons: [], matches: [], teams: new Map(), teamByName: new Map(), players: new Map(), playerByKey: new Map(), tournaments: [] };

    for (const t of raw.teams.teams) {
      const team = { id: t.id, name: t.name, names: t.names.slice(), club: t.club || null, matches: [], namesBySeason: new Map(), note: t.note || null };
      db.teams.set(t.id, team);
      for (const n of t.names) db.teamByName.set(n, team);
    }
    function teamOf(name) {
      let t = db.teamByName.get(name);
      if (!t) {
        let id = slug(name);
        while (db.teams.has(id)) id += '-x';
        t = { id, name, names: [name], matches: [], namesBySeason: new Map(), note: null };
        db.teams.set(id, t);
        db.teamByName.set(name, t);
      }
      return t;
    }

    const alias = new Map(); // нормализованный вариант -> нормализованное основное
    const mainDisplay = new Map();
    for (const [main, variant] of (raw.players.merge || [])) { if (normName(variant) !== normName(main)) alias.set(normName(variant), normName(main)); mainDisplay.set(normName(main), main); }
    for (const sp of (raw.players.split || [])) mainDisplay.set(normName(sp.as), sp.as);
    const splits = raw.players.split || []; // [{name, as, match_ids:[...]} или {name, as, teams:[...]}]
    const splitMap = new Map(), splitTeam = new Map();
    for (const s of splits) {
      for (const id of s.match_ids || []) splitMap.set(id + '|' + normName(s.name), s.as);
      for (const tn of s.teams || []) splitTeam.set(normName(s.name) + '|' + tn, s.as);
    }

    function playerOf(name, matchId, teamName) {
      let display = String(name).trim();
      const sp = splitMap.get(matchId + '|' + normName(display)) || (teamName && splitTeam.get(normName(display) + '|' + teamName));
      if (sp) display = sp;
      let key = normName(display);
      while (alias.has(key)) key = alias.get(key);
      let p = db.playerByKey.get(key);
      if (!p) {
        let id = slug(key.replace(/\(мл\)/, 'ml').replace(/\(ст\)/, 'st'));
        while (db.players.has(id)) id += '-2';
        p = { id, key, name: display, spellings: new Map(), apps: [], goals: [], og: [], yc: [], rc: [], mp: [], archive: [] };
        db.players.set(id, p);
        db.playerByKey.set(key, p);
      }
      p.spellings.set(display, (p.spellings.get(display) || 0) + 1);
      return p;
    }

    for (const s of raw.seasons) {
      const season = { id: s.season.replace('/', '-'), label: s.season, source: s.source, tournaments: [], archive: !s.matches.length };
      db.seasons.push(season);
      const tmap = new Map();
      for (const t of s.tournaments) {
        const tour = { id: t.id, key: season.id + '-' + t.id, name: t.name, format: t.format, divisions: t.divisions || [], season, matches: [], final: t.final || null, status: t.status || null, note: t.note || null };
        season.tournaments.push(tour);
        tmap.set(t.id, tour);
        db.tournaments.push(tour);
        if (tour.final) {
          for (const tb of tour.final.tables) for (const r of tb.rows) {
            const team = teamOf(r.team);
            noteName(team, season, r.team);
            r.teamObj = team;
          }
          for (const sc of tour.final.scorers) {
            const p = playerOf(sc.name, 'archive-' + season.id, sc.team);
            const team = teamOf(sc.team);
            noteName(team, season, sc.team);
            p.archive.push({ season, tour, team, teamName: sc.team, goals: sc.goals, pens: sc.pens || 0 });
            sc.player = p;
            sc.teamObj = team;
          }
        }
      }
      for (const m of s.matches) {
        const tour = tmap.get(m.t);
        const mt = {
          id: m.id, season, tour, div: m.div, stage: m.stage, date: m.date,
          homeName: m.home, awayName: m.away, home: teamOf(m.home), away: teamOf(m.away),
          score: m.score, tech: m.tech || null, pens: m.pens || null, ref: m.ref || null, venue: m.venue || null, att: m.att || null,
          goals: [], lineups: { h: [], a: [] }, yc: [], rc: [], shootout: m.shootout || null, mp: [], stats: m.stats || null,
        };
        noteName(mt.home, season, m.home);
        noteName(mt.away, season, m.away);
        for (const side of ['h', 'a']) {
          for (const [no, name] of (m.lineups && m.lineups[side]) || []) {
            const p = playerOf(name, m.id, side === 'h' ? m.home : m.away);
            mt.lineups[side].push({ no, name, p });
            p.apps.push({ m: mt, side });
          }
        }
        for (const g of m.goals || []) {
          const [name, min, side, flag] = g;
          const scorerSide = flag === 'og' ? (side === 'h' ? 'a' : 'h') : side;
          const p = playerOf(name, m.id, scorerSide === 'h' ? m.home : scorerSide === 'a' ? m.away : null);
          const e = { name, p, min, side, og: flag === 'og', pen: flag === 'pen', free: flag === 'free', tenm: flag === 'tenm' };
          mt.goals.push(e);
          if (e.og) p.og.push({ m: mt, e });
          else p.goals.push({ m: mt, e });
          // игрок забил, но не указан в составе — считаем участие
          const ownSide = e.og ? (side === 'h' ? 'a' : 'h') : side;
          if ((side === 'h' || side === 'a') && !mt.lineups[ownSide].some(x => x.p === p) && !p.apps.some(a => a.m === mt)) {
            p.apps.push({ m: mt, side: ownSide, fromGoal: true });
          }
        }
        for (const [kind, list] of [['yc', m.yc], ['rc', m.rc]]) {
          for (const c of list || []) {
            const [name, side, min, note] = c;
            const p = playerOf(name, m.id, side === 'h' ? m.home : side === 'a' ? m.away : null);
            const e = { name, p, side, min, note: note || null };
            mt[kind].push(e);
            p[kind].push({ m: mt, e });
          }
        }
        for (const [name, side, min, how] of m.mp || []) {
          const p = playerOf(name, m.id, side === 'h' ? m.home : side === 'a' ? m.away : null);
          const e = { name, p, side, min, how: how || null };
          mt.mp.push(e);
          p.mp.push({ m: mt, e });
        }
        tour.matches.push(mt);
        db.matches.push(mt);
        mt.home.matches.push(mt);
        mt.away.matches.push(mt);
      }
    }
    // основное написание игрока — самое частое
    for (const p of db.players.values()) {
      let best = p.name, bc = -1;
      for (const [n, c] of p.spellings) if (c > bc) { best = n; bc = c; }
      p.name = mainDisplay.get(p.key) || best;
    }
    db.seasons.sort((a, b) => seasonOrder(a.label) - seasonOrder(b.label));
    for (const s of db.seasons) s.tournaments.sort((a, b) => COMP_ORDER.indexOf(a.id) - COMP_ORDER.indexOf(b.id));
    for (const t of db.tournaments) t.matches.sort(byDate);
    for (const team of db.teams.values()) team.matches.sort(byDate);
    for (const p of db.players.values()) { p.apps.sort((a, b) => byDate(a.m, b.m)); }
    // удаляем пустые карточки команд (названия без матчей)
    for (const [id, t] of db.teams) if (!t.matches.length && !t.namesBySeason.size) db.teams.delete(id);
    computeAll(db);
    return db;

    function noteName(team, season, name) {
      if (!team.namesBySeason.has(season.label)) team.namesBySeason.set(season.label, new Set());
      team.namesBySeason.get(season.label).add(name);
    }
  }

  function seasonOrder(label) { const y = parseInt(label, 10); return y * 10 + (label.length > 4 ? 5 : 0); }
  function byDate(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id < b.id ? -1 : 1); }

  /* ---------- результат матча ---------- */
  // Возвращает {gh, ga, ph, pa, counted} для таблицы. Техническое «+:-» по регламенту = 6:0.
  function tableScore(m) {
    if (m.score) {
      return { gh: m.score[0], ga: m.score[1], counted: true };
    }
    if (Array.isArray(m.tech)) {
      const [h, a] = m.tech;
      if (h === '+' && a === '-') return { gh: 6, ga: 0, counted: true, techWin: 'h' };
      if (h === '-' && a === '+') return { gh: 0, ga: 6, counted: true, techWin: 'a' };
      return { gh: 0, ga: 0, counted: true, bothLost: true };
    }
    return null;
  }
  function winnerSide(m) {
    const s = tableScore(m);
    if (!s) return null;
    if (s.bothLost) return null;
    if (s.gh > s.ga) return 'h';
    if (s.ga > s.gh) return 'a';
    if (m.pens) return m.pens[0] > m.pens[1] ? 'h' : 'a';
    return 'd';
  }
  function scoreText(m) {
    if (m.score) return m.score[0] + ':' + m.score[1];
    if (Array.isArray(m.tech)) return m.tech[0].replace('-', '–') + ':' + m.tech[1].replace('-', '–');
    return '—';
  }

  /* ---------- турнирная таблица по регламенту АЖИ (п. 4.9) ---------- */
  function standings(matches) {
    const rows = new Map();
    const row = (team, name) => {
      if (!rows.has(team.id)) rows.set(team.id, { team, name, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, fair: 0, form: [] });
      return rows.get(team.id);
    };
    for (const m of matches) {
      const s = tableScore(m);
      const H = row(m.home, m.homeName), A = row(m.away, m.awayName);
      if (!s) continue;
      H.p++; A.p++;
      H.gf += s.gh; H.ga += s.ga; A.gf += s.ga; A.ga += s.gh;
      if (s.bothLost) { H.l++; A.l++; H.form.push('L'); A.form.push('L'); }
      else if (s.gh > s.ga) { H.w++; A.l++; H.pts += 3; H.form.push('W'); A.form.push('L'); }
      else if (s.gh < s.ga) { A.w++; H.l++; A.pts += 3; A.form.push('W'); H.form.push('L'); }
      else { H.d++; A.d++; H.pts++; A.pts++; H.form.push('D'); A.form.push('D'); }
      for (const c of m.yc) { if (c.side === 'h') H.fair += 1; else if (c.side === 'a') A.fair += 1; }
      for (const c of m.rc) { if (c.side === 'h') H.fair += 5; else if (c.side === 'a') A.fair += 5; }
    }
    const list = [...rows.values()];
    const h2h = (ids) => {
      const set = new Set(ids);
      const r = new Map(ids.map(id => [id, { pts: 0, w: 0, gd: 0 }]));
      for (const m of matches) {
        if (!set.has(m.home.id) || !set.has(m.away.id)) continue;
        const s = tableScore(m); if (!s) continue;
        const H = r.get(m.home.id), A = r.get(m.away.id);
        H.gd += s.gh - s.ga; A.gd += s.ga - s.gh;
        if (s.bothLost) continue;
        if (s.gh > s.ga) { H.pts += 3; H.w++; } else if (s.gh < s.ga) { A.pts += 3; A.w++; } else { H.pts++; A.pts++; }
      }
      return r;
    };
    list.sort((a, b) => b.pts - a.pts);
    // группы с равными очками — по личным встречам и далее
    const out = [];
    for (let i = 0; i < list.length;) {
      let j = i; while (j < list.length && list[j].pts === list[i].pts) j++;
      const grp = list.slice(i, j);
      if (grp.length > 1) {
        const hh = h2h(grp.map(r => r.team.id));
        grp.sort((a, b) => {
          const x = hh.get(a.team.id), y = hh.get(b.team.id);
          return (y.pts - x.pts) || (y.w - x.w) || (y.gd - x.gd) || (b.w - a.w) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf) || (a.fair - b.fair) || a.name.localeCompare(b.name, 'ru');
        });
      }
      out.push(...grp); i = j;
    }
    out.forEach((r, k) => { r.pos = k + 1; });
    return out;
  }

  // Завершён ли круговой турнир: сыгран последний тур полного числа кругов.
  // Кругов = максимум встреч одной пары; туров в круге = n-1 (чётное n) или n (нечётное).
  function isComplete(rows, matches) {
    if (!rows.length || !matches || !matches.length) return false;
    // снявшиеся по ходу турнира команды (меньше половины матчей лидера по числу игр) не учитываем
    const maxP = Math.max(...rows.map(r => r.p));
    const n = rows.filter(r => r.p * 2 >= maxP).length;
    const pairs = new Map();
    let maxRound = 0;
    for (const m of matches) {
      const k = [m.home.id, m.away.id].sort().join('|');
      pairs.set(k, (pairs.get(k) || 0) + 1);
      const r = parseInt(m.stage, 10);
      if (r > maxRound) maxRound = r;
    }
    const circles = Math.max(...pairs.values());
    const expected = circles * (n % 2 === 0 ? n - 1 : n);
    return maxRound >= expected;
  }

  /* ---------- разбор турнира ---------- */
  function isRoundStage(st) { return !!st && /^\d+ тур$/.test(st); }
  function tournamentView(t) {
    const v = { t, tables: [], playoff: [], winner: null, runnerUp: null, third: null, complete: false, rounds: [] };
    if (t.final) {
      for (const tb of t.final.tables) {
        v.tables.push({ div: tb.div, rows: tb.rows.map(r => ({ team: r.teamObj, name: r.team, p: r.p, w: r.w, d: r.d, l: r.l, gf: r.gf, ga: r.ga, pts: r.pts, pos: r.pos, form: [] })), complete: true, archive: true });
      }
      v.complete = true;
      if (v.tables.length === 1) { const r = v.tables[0].rows; v.winner = r[0] && r[0].team; v.runnerUp = r[1] && r[1].team; v.third = r[2] && r[2].team; }
      v.divWinners = v.tables.map(tb => ({ div: tb.div, team: tb.rows[0] && tb.rows[0].team, name: tb.rows[0] && tb.rows[0].name }));
      return v;
    }
    const groupMatches = t.matches.filter(m => t.format === 'league' || isRoundStage(m.stage));
    const divs = t.divisions.length ? t.divisions : [null];
    for (const d of divs) {
      const ms = groupMatches.filter(m => (m.div || null) === d);
      if (!ms.length) continue;
      const rows = standings(ms);
      let complete = isComplete(rows, ms);
      if (t.status === 'finished') complete = true;
      if (t.status === 'unfinished' || t.status === 'unknown') complete = false;
      v.tables.push({ div: d, rows, complete, matches: ms });
    }
    v.status = t.status || null;
    v.note = t.note || null;
    v.playoff = t.matches.filter(m => t.format === 'cup' && !isRoundStage(m.stage));
    const fin = v.playoff.find(m => (m.stage === 'Финал' || m.stage === 'Фінал'));
    const third = v.playoff.find(m => /^За 3/.test(m.stage || ''));
    if (fin) {
      const w = winnerSide(fin);
      if (w === 'h' || w === 'a') { v.winner = w === 'h' ? fin.home : fin.away; v.winnerName = w === 'h' ? fin.homeName : fin.awayName; v.runnerUp = w === 'h' ? fin.away : fin.home; v.runnerUpName = w === 'h' ? fin.awayName : fin.homeName; }
      if (third) { const w3 = winnerSide(third); if (w3 === 'h' || w3 === 'a') { v.third = w3 === 'h' ? third.home : third.away; v.thirdName = w3 === 'h' ? third.homeName : third.awayName; } }
      v.complete = true;
    } else if (t.format === 'cup' && v.tables.length === 1 && !v.playoff.length && v.tables[0].complete) {
      const r = v.tables[0].rows; v.winner = r[0].team; v.winnerName = r[0].name; v.runnerUp = r[1] && r[1].team; v.runnerUpName = r[1] && r[1].name; v.third = r[2] && r[2].team; v.thirdName = r[2] && r[2].name; v.complete = true;
    } else if (t.format === 'league') {
      v.complete = v.tables.every(tb => tb.complete);
      if (v.tables.length === 1 && v.complete) { const r = v.tables[0].rows; v.winner = r[0].team; v.winnerName = r[0].name; v.runnerUp = r[1] && r[1].team; v.runnerUpName = r[1] && r[1].name; v.third = r[2] && r[2].team; v.thirdName = r[2] && r[2].name; }
    }
    v.divWinners = v.tables.map(tb => ({ div: tb.div, team: tb.complete && tb.rows[0] ? tb.rows[0].team : null, name: tb.complete && tb.rows[0] ? tb.rows[0].name : null, complete: tb.complete }));
    // туры
    const byStage = new Map();
    for (const m of t.matches) {
      const k = m.stage || 'Без стадії';
      if (!byStage.has(k)) byStage.set(k, []);
      byStage.get(k).push(m);
    }
    v.rounds = [...byStage.entries()].map(([stage, ms]) => ({ stage, ms }));
    return v;
  }

  /* ---------- бомбардиры турнира/выборки ---------- */
  function scorers(matches, limit) {
    const map = new Map();
    for (const m of matches) for (const g of m.goals) {
      if (g.og) continue;
      const team = g.side === 'h' ? m.home : m.away;
      const teamName = g.side === 'h' ? m.homeName : m.awayName;
      const k = g.p.id;
      if (!map.has(k)) map.set(k, { p: g.p, goals: 0, pens: 0, teams: new Map() });
      const r = map.get(k); r.goals++; if (g.pen) r.pens++;
      r.teams.set(team.id, { team, name: teamName });
    }
    const list = [...map.values()].sort((a, b) => b.goals - a.goals || a.pens - b.pens || a.p.name.localeCompare(b.p.name, 'ru'));
    return limit ? list.slice(0, limit) : list;
  }

  /* ---------- сводки ---------- */
  function computeAll(db) {
    db.views = new Map();
    for (const t of db.tournaments) db.views.set(t.key, tournamentView(t));
    // команды
    for (const team of db.teams.values()) {
      const s = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
      for (const m of team.matches) {
        const sc = tableScore(m); if (!sc) continue;
        const home = m.home === team;
        const f = home ? sc.gh : sc.ga, a = home ? sc.ga : sc.gh;
        s.p++; s.gf += f; s.ga += a;
        if (sc.bothLost) s.l++; else if (f > a) s.w++; else if (f < a) s.l++; else s.d++;
      }
      team.totals = s;
      team.seasons = [...team.namesBySeason.keys()].sort((a, b) => seasonOrder(a) - seasonOrder(b));
      team.trophies = [];
      team.finishes = [];
    }
    for (const t of db.tournaments) {
      const v = db.views.get(t.key);
      for (const tb of v.tables) {
        for (const r of tb.rows) if (r.team) r.team.finishes.push({ t, div: tb.div, pos: r.pos, n: tb.rows.length, complete: tb.complete, row: r });
      }
      const medal = (team, place, name) => { if (team) team.trophies.push({ t, place, name, div: null }); };
      if (t.format === 'league' && v.tables.length > 1) {
        for (const tb of v.tables) if (tb.complete) tb.rows.slice(0, 3).forEach((r, k) => r.team && r.team.trophies.push({ t, place: k + 1, name: r.name, div: tb.div }));
      } else {
        medal(v.winner, 1, v.winnerName); medal(v.runnerUp, 2, v.runnerUpName); medal(v.third, 3, v.thirdName);
      }
    }
    // игроки
    for (const p of db.players.values()) {
      p.teams = new Map();
      for (const a of p.apps) {
        const team = a.side === 'h' ? a.m.home : a.m.away;
        const name = a.side === 'h' ? a.m.homeName : a.m.awayName;
        if (!p.teams.has(team.id)) p.teams.set(team.id, { team, names: new Set(), apps: 0, goals: 0, seasons: new Set() });
        const r = p.teams.get(team.id); r.apps++; r.names.add(name); r.seasons.add(a.m.season.label);
      }
      for (const g of p.goals) {
        const team = g.e.side === 'h' ? g.m.home : g.m.away;
        if (!p.teams.has(team.id)) p.teams.set(team.id, { team, names: new Set([g.e.side === 'h' ? g.m.homeName : g.m.awayName]), apps: 0, goals: 0, seasons: new Set([g.m.season.label]) });
        p.teams.get(team.id).goals++;
      }
      p.seasonsPlayed = new Set([...p.apps.map(a => a.m.season.label), ...p.archive.map(a => a.season.label)]);
      p.archiveGoals = p.archive.reduce((s, a) => s + a.goals, 0);
      p.hatTricks = 0;
      const per = new Map();
      for (const g of p.goals) per.set(g.m.id, (per.get(g.m.id) || 0) + 1);
      p.bestGame = 0;
      for (const v of per.values()) { if (v >= 3) p.hatTricks++; if (v > p.bestGame) p.bestGame = v; }
    }
  }

  /* ---------- рекорды ---------- */
  function records(db) {
    const played = db.matches.filter(m => m.score && !m.tech);
    const margin = m => Math.abs(m.score[0] - m.score[1]);
    const total = m => m.score[0] + m.score[1];
    const players = [...db.players.values()];
    const perGame = [];
    for (const m of played) {
      const c = new Map();
      for (const g of m.goals) if (!g.og) c.set(g.p, (c.get(g.p) || 0) + 1);
      for (const [p, n] of c) if (n >= 5) perGame.push({ p, n, m, side: m.goals.find(g => g.p === p && !g.og).side });
    }
    const quick = [];
    for (const m of played) for (const g of m.goals) if (!g.og && g.min != null && g.min <= 1) quick.push({ m, g });
    return {
      biggestWins: played.slice().sort((a, b) => margin(b) - margin(a) || total(b) - total(a)).slice(0, 15),
      mostGoals: played.slice().sort((a, b) => total(b) - total(a) || margin(a) - margin(b)).slice(0, 15),
      topScorers: players.filter(p => p.goals.length).sort((a, b) => b.goals.length - a.goals.length).slice(0, 30),
      mostApps: players.filter(p => p.apps.length).sort((a, b) => b.apps.length - a.apps.length).slice(0, 30),
      mostSeasons: players.slice().sort((a, b) => b.seasonsPlayed.size - a.seasonsPlayed.size || b.apps.length - a.apps.length).slice(0, 30),
      hatTricks: players.filter(p => p.hatTricks).sort((a, b) => b.hatTricks - a.hatTricks).slice(0, 20),
      bigGames: perGame.sort((a, b) => b.n - a.n || (a.m.date < b.m.date ? -1 : 1)).slice(0, 25),
      attendance: db.matches.filter(m => m.att).sort((a, b) => b.att - a.att).slice(0, 10),
    };
  }

  const Core = { build, standings, tournamentView, scorers, records, tableScore, winnerSide, scoreText, isRoundStage, normName, slug, seasonOrder };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core; else root.Core = Core;
})(typeof window !== 'undefined' ? window : globalThis);
