/* Архив Чемпионата АЖИ — статистика. Чистые функции над базой из core.js.
   Работает в браузере (window.Stats) и в Node (module.exports). */
(function (root) {
  'use strict';
  const Core = root.Core || (typeof require !== 'undefined' ? require('./core.js') : null);

  const LEAGUE_IDS = ['chemp', 'media', 'brand'];
  const BINS = ['1–5', '6–10', '11–15', '16–20', '21–25', '26–30', '31–35', '36–40', '41–45', '46–50', 'доп. время'];
  const binOf = min => (min == null ? -1 : min > 50 ? 10 : Math.max(0, Math.ceil(min / 5) - 1));
  const STAT_KEYS = ['shots', 'on_target', 'woodwork', 'corners', 'fouls'];

  /* ---------- фильтр ---------- */
  // f: {from, to (метки сезонов), kind: 'all'|'league'|'cup'|<id турнира>, team: id команды|null, club: имя клуба|null}
  function filterMatches(db, f = {}) {
    const order = db.seasons.map(s => s.label);
    const fi = f.from ? order.indexOf(f.from) : 0, ti = f.to ? order.indexOf(f.to) : order.length - 1;
    return db.matches.filter(m => {
      const si = order.indexOf(m.season.label);
      if (si < fi || si > ti) return false;
      if (f.kind && f.kind !== 'all') {
        if (f.kind === 'league' && !LEAGUE_IDS.includes(m.tour.id)) return false;
        if (f.kind === 'cup' && LEAGUE_IDS.includes(m.tour.id)) return false;
        if (f.kind !== 'league' && f.kind !== 'cup' && m.tour.id !== f.kind) return false;
      }
      if (f.team && m.home.id !== f.team && m.away.id !== f.team) return false;
      if (f.club && m.home.club !== f.club && m.away.club !== f.club) return false;
      return true;
    });
  }
  const isPlayed = m => !!m.score && !m.tech;
  const sideTeam = (m, s) => (s === 'h' ? m.home : m.away);
  const sideName = (m, s) => (s === 'h' ? m.homeName : m.awayName);
  const other = s => (s === 'h' ? 'a' : 'h');

  /* ---------- ход матча ---------- */
  // последовательность счёта по голам; победный гол; отыгрыши
  function flow(m) {
    if (!isPlayed(m) || !m.goals.length) return null;
    let h = 0, a = 0, maxDefH = 0, maxDefA = 0, first = null;
    const seq = [];
    for (const g of m.goals) {
      if (g.side === 'h') h++; else if (g.side === 'a') a++; else continue;
      if (!first) first = g.side;
      maxDefH = Math.max(maxDefH, a - h);
      maxDefA = Math.max(maxDefA, h - a);
      seq.push({ g, h, a });
    }
    const complete = h === m.score[0] && a === m.score[1];
    let winner = null;
    if (complete && m.score[0] !== m.score[1]) {
      const w = m.score[0] > m.score[1] ? 'h' : 'a';
      const loserGoals = Math.min(m.score[0], m.score[1]);
      let cnt = 0;
      for (const x of seq) if (x.g.side === w) { cnt++; if (cnt === loserGoals + 1) { winner = x.g; break; } }
    }
    return { seq, first, maxDefH, maxDefA, complete, winner };
  }

  /* ---------- игроки ---------- */
  function playerTable(db, ms) {
    const set = new Set(ms);
    const rows = new Map();
    const R = p => {
      if (!rows.has(p.id)) rows.set(p.id, { p, apps: 0, goals: 0, pen: 0, free: 0, tenm: 0, og: 0, mpTotal: 0, mpSaved: 0, mpWide: 0, mpPost: 0, yc: 0, rc: 0, hat: 0, brace: 0, winners: 0, firsts: 0, late: 0, streak: 0, teams: new Map(), seasons: new Set(), bins: new Array(11).fill(0), lastApp: null });
      return rows.get(p.id);
    };
    const sorted = ms.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const cur = new Map();
    for (const m of sorted) {
      const fl = flow(m);
      const scorers = new Map();
      for (const g of m.goals) {
        const r = R(g.p);
        if (g.og) { r.og++; continue; }
        r.goals++; if (g.pen) r.pen++; if (g.free) r.free++; if (g.tenm) r.tenm++;
        const b = binOf(g.min); if (b >= 0) r.bins[b]++;
        if (g.min != null && g.min >= 46 && g.min <= 50) r.late++;
        scorers.set(g.p, (scorers.get(g.p) || 0) + 1);
      }
      if (fl && fl.winner && !fl.winner.og) R(fl.winner.p).winners++;
      if (fl && fl.seq.length && !fl.seq[0].g.og) R(fl.seq[0].g.p).firsts++;
      for (const [p, n] of scorers) { if (n >= 3) R(p).hat++; else if (n === 2) R(p).brace++; }
      const present = new Map();
      for (const s of ['h', 'a']) for (const x of m.lineups[s]) present.set(x.p, s);
      for (const g of m.goals) if (!g.og && !present.has(g.p)) present.set(g.p, g.side);
      for (const [p, s] of present) {
        const r = R(p); r.apps++; r.seasons.add(m.season.label);
        const t = sideTeam(m, s); const tr = r.teams.get(t.id) || { team: t, names: new Set(), apps: 0 }; tr.apps++; tr.names.add(sideName(m, s)); r.teams.set(t.id, tr);
        const sc = scorers.get(p) || 0;
        const c = sc > 0 ? (cur.get(p) || 0) + 1 : 0; cur.set(p, c); if (c > r.streak) r.streak = c;
      }
      for (const c of m.yc) R(c.p).yc++;
      for (const c of m.rc) R(c.p).rc++;
      for (const x of m.mp) { const r = R(x.p); r.mpTotal++; if (x.how === 'вратарь') r.mpSaved++; else if (x.how === 'мимо') r.mpWide++; else if (x.how === 'штанга' || x.how === 'перекладина') r.mpPost++; }
    }
    for (const r of rows.values()) {
      r.gpm = r.apps ? r.goals / r.apps : 0;
      r.penAtt = r.pen + r.mpTotal;
      r.penPct = r.penAtt ? r.pen / r.penAtt : null;
      r.fair = r.yc + r.rc * 5;
    }
    return [...rows.values()].filter(r => r.apps || r.goals || r.yc || r.rc || r.mpTotal);
  }

  /* ---------- команды ---------- */
  function teamTable(db, ms) {
    const rows = new Map();
    const R = t => {
      if (!rows.has(t.id)) rows.set(t.id, { team: t, names: new Set(), p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, cs: 0, fts: 0, statN: 0, shots: 0, shotsA: 0, on: 0, onA: 0, wood: 0, corners: 0, fouls: 0, yc: 0, rc: 0, pen: 0, penA: 0, mp: 0, comebacks: 0, lostLeads: 0, firstGoal: 0, firstGoalWins: 0, binsF: new Array(11).fill(0), binsA: new Array(11).fill(0), seasons: new Set(), bigWin: null, bigLoss: null, streaks: null, tech: 0 });
      return rows.get(t.id);
    };
    const sorted = ms.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const seqs = new Map();
    for (const m of sorted) {
      const sc = Core.tableScore(m);
      for (const s of ['h', 'a']) {
        const t = sideTeam(m, s), r = R(t); r.names.add(sideName(m, s)); r.seasons.add(m.season.label);
        if (!sc) continue;
        const f = s === 'h' ? sc.gh : sc.ga, a = s === 'h' ? sc.ga : sc.gh;
        r.p++; r.gf += f; r.ga += a;
        const res = sc.bothLost ? 'L' : f > a ? 'W' : f < a ? 'L' : 'D';
        r[res.toLowerCase()]++;
        if (m.tech) r.tech++;
        if (!m.tech) {
          if (a === 0) r.cs++;
          if (f === 0) r.fts++;
          const diff = f - a;
          if (diff > 0 && (!r.bigWin || diff > r.bigWin.d || (diff === r.bigWin.d && f > r.bigWin.f))) r.bigWin = { m, d: diff, f };
          if (diff < 0 && (!r.bigLoss || -diff > r.bigLoss.d)) r.bigLoss = { m, d: -diff };
        }
        if (!seqs.has(t.id)) seqs.set(t.id, []);
        seqs.get(t.id).push({ m, res, f, a, tech: !!m.tech });
      }
      if (m.stats && !m.tech) {
        for (const s of ['h', 'a']) {
          const r = R(sideTeam(m, s)), i = s === 'h' ? 0 : 1, j = 1 - i;
          r.statN++;
          r.shots += (m.stats.shots || [0, 0])[i]; r.shotsA += (m.stats.shots || [0, 0])[j];
          r.on += (m.stats.on_target || [0, 0])[i]; r.onA += (m.stats.on_target || [0, 0])[j];
          r.wood += (m.stats.woodwork || [0, 0])[i]; r.corners += (m.stats.corners || [0, 0])[i]; r.fouls += (m.stats.fouls || [0, 0])[i];
        }
      }
      for (const c of m.yc) if (c.side) R(sideTeam(m, c.side)).yc++;
      for (const c of m.rc) if (c.side) R(sideTeam(m, c.side)).rc++;
      for (const g of m.goals) {
        if (g.side !== 'h' && g.side !== 'a') continue;
        const b = binOf(g.min);
        if (b >= 0) { R(sideTeam(m, g.side)).binsF[b]++; R(sideTeam(m, other(g.side))).binsA[b]++; }
        if (g.pen) { R(sideTeam(m, g.side)).pen++; R(sideTeam(m, other(g.side))).penA++; }
      }
      for (const x of m.mp) if (x.side) R(sideTeam(m, x.side)).mp++;
      const fl = flow(m);
      if (fl && fl.complete) {
        const w = Core.winnerSide(m);
        if (fl.first) { const r = R(sideTeam(m, fl.first)); r.firstGoal++; if (w === fl.first) r.firstGoalWins++; }
        if (w === 'h' && fl.maxDefH > 0) { R(m.home).comebacks++; R(m.away).lostLeads++; }
        if (w === 'a' && fl.maxDefA > 0) { R(m.away).comebacks++; R(m.home).lostLeads++; }
      }
    }
    for (const [id, list] of seqs) rows.get(id).streaks = streaks(list);
    for (const r of rows.values()) {
      r.pts = r.w * 3 + r.d;
      r.winPct = r.p ? r.w / r.p : 0;
      r.gfpm = r.p ? r.gf / r.p : 0; r.gapm = r.p ? r.ga / r.p : 0;
      r.acc = r.shots ? r.on / r.shots : null;
      r.conv = r.shots ? null : null;
      r.fair = r.yc + r.rc * 5;
    }
    return [...rows.values()];
  }

  // серии команды по хронологии (технические результаты не прерывают и не продлевают голевые серии)
  function streaks(list) {
    const best = { win: 0, unbeaten: 0, loss: 0, winless: 0, scoring: 0, cs: 0 };
    const at = {};
    const cur = { win: 0, unbeaten: 0, loss: 0, winless: 0, scoring: 0, cs: 0 };
    const start = {};
    for (const x of list) {
      const upd = (k, cond) => {
        if (cond) { if (cur[k] === 0) start[k] = x.m; cur[k]++; if (cur[k] > best[k]) { best[k] = cur[k]; at[k] = { from: start[k], to: x.m }; } }
        else cur[k] = 0;
      };
      upd('win', x.res === 'W'); upd('unbeaten', x.res !== 'L'); upd('loss', x.res === 'L'); upd('winless', x.res !== 'W');
      if (!x.tech) { upd('scoring', x.f > 0); upd('cs', x.a === 0); }
    }
    return { best, at };
  }

  /* ---------- матчи ---------- */
  function matchLists(ms) {
    const pl = ms.filter(isPlayed);
    const total = m => m.score[0] + m.score[1], margin = m => Math.abs(m.score[0] - m.score[1]);
    const cards = m => m.yc.length + m.rc.length * 2;
    const sstat = (m, k) => (m.stats && m.stats[k] ? m.stats[k][0] + m.stats[k][1] : -1);
    const comebacks = [];
    const fastest = [], lateWinners = [];
    for (const m of pl) {
      const fl = flow(m);
      if (!fl || !fl.complete) continue;
      const w = Core.winnerSide(m);
      const def = w === 'h' ? fl.maxDefH : w === 'a' ? fl.maxDefA : Math.max(fl.maxDefH, fl.maxDefA);
      if (def >= 2) comebacks.push({ m, def, won: w === 'h' || w === 'a' });
      if (fl.winner && fl.winner.min != null && fl.winner.min >= 46) lateWinners.push({ m, g: fl.winner });
      const g0 = m.goals[0]; if (g0 && g0.min != null && g0.min >= 1) fastest.push({ m, g: g0 });
    }
    return {
      biggest: pl.slice().sort((a, b) => margin(b) - margin(a) || total(b) - total(a)).slice(0, 20),
      highest: pl.slice().sort((a, b) => total(b) - total(a) || margin(a) - margin(b)).slice(0, 20),
      comebacks: comebacks.sort((a, b) => b.def - a.def || (b.won - a.won)).slice(0, 20),
      fastest: fastest.sort((a, b) => a.g.min - b.g.min).slice(0, 20),
      lateWinners: lateWinners.sort((a, b) => b.g.min - a.g.min).slice(0, 20),
      cards: pl.filter(m => cards(m) > 0).sort((a, b) => cards(b) - cards(a)).slice(0, 15),
      shots: pl.filter(m => sstat(m, 'shots') >= 0).sort((a, b) => sstat(b, 'shots') - sstat(a, 'shots')).slice(0, 15),
      corners: pl.filter(m => sstat(m, 'corners') >= 0).sort((a, b) => sstat(b, 'corners') - sstat(a, 'corners')).slice(0, 15),
      attendance: ms.filter(m => m.att).sort((a, b) => b.att - a.att).slice(0, 15),
      draws: pl.filter(m => m.score[0] === m.score[1]).sort((a, b) => total(b) - total(a)).slice(0, 15),
    };
  }

  /* ---------- общая картина ---------- */
  function overview(db, ms) {
    const pl = ms.filter(isPlayed);
    const goals = pl.reduce((s, m) => s + m.score[0] + m.score[1], 0);
    const bins = new Array(11).fill(0);
    let pens = 0, free = 0, tenm = 0, og = 0, yc = 0, rc = 0;
    const binsBy = { open: new Array(11).fill(0), pen: new Array(11).fill(0), tenm: new Array(11).fill(0), fk: new Array(11).fill(0), og: new Array(11).fill(0) };
    const seasonBins = new Map();
    const mp = { 'вратарь': 0, 'мимо': 0, 'штанга': 0, other: 0 };
    const margins = new Map();
    let draws = 0;
    for (const m of pl) {
      for (const g of m.goals) {
        const b = binOf(g.min); const ty = g.og ? 'og' : g.pen ? 'pen' : g.tenm ? 'tenm' : g.free ? 'fk' : 'open';
        if (b >= 0) { bins[b]++; binsBy[ty][b]++; const sb = seasonBins.get(m.season.label) || new Array(11).fill(0); sb[b]++; seasonBins.set(m.season.label, sb); }
        if (g.pen) pens++; if (g.free) free++; if (g.tenm) tenm++; if (g.og) og++;
      }
      const d = Math.abs(m.score[0] - m.score[1]); margins.set(Math.min(d, 10), (margins.get(Math.min(d, 10)) || 0) + 1); if (!d) draws++;
    }
    for (const m of ms) { yc += m.yc.length; rc += m.rc.length; for (const x of m.mp) { if (mp[x.how] != null) mp[x.how]++; else if (x.how === 'перекладина') mp['штанга']++; else mp.other++; } }
    const bySeason = [];
    for (const s of db.seasons) {
      const sm = pl.filter(m => m.season === s);
      if (!sm.length) continue;
      const g = sm.reduce((t, m) => t + m.score[0] + m.score[1], 0);
      const att = sm.filter(m => m.att);
      const sp = sm.reduce((t, m) => t + m.goals.filter(x => x.pen).length, 0), smp = ms.filter(m => m.season === s).reduce((t, m) => t + m.mp.length, 0);
      bySeason.push({ s, matches: sm.length, goals: g, gpm: g / sm.length, att: att.length ? att.reduce((t, m) => t + m.att, 0) / att.length : null, attN: att.length, yc: sm.reduce((t, m) => t + m.yc.length, 0), penPct: sp + smp ? sp / (sp + smp) : null, pens: sp, mp: smp });
    }
    const missedTotal = Object.values(mp).reduce((a, b) => a + b, 0);
    return { matches: ms.length, played: pl.length, goals, gpm: pl.length ? goals / pl.length : 0, bins, binsBy, seasonBins, pens, free, tenm, og, yc, rc, mp, missedTotal, penPct: pens + missedTotal ? pens / (pens + missedTotal) : null, margins: [...margins.entries()].sort((a, b) => a[0] - b[0]), draws, bySeason };
  }

  /* ---------- судьи ---------- */
  function referees(ms) {
    const map = new Map();
    for (const m of ms) {
      if (!m.ref || m.tech) continue;
      const r = map.get(m.ref) || { name: m.ref, n: 0, goals: 0, yc: 0, rc: 0, pens: 0, seasons: new Set(), first: m.date, last: m.date };
      r.n++; if (m.score) r.goals += m.score[0] + m.score[1]; r.yc += m.yc.length; r.rc += m.rc.length; r.pens += m.goals.filter(g => g.pen).length + m.mp.length;
      r.seasons.add(m.season.label); if (m.date < r.first) r.first = m.date; if (m.date > r.last) r.last = m.date;
      map.set(m.ref, r);
    }
    return [...map.values()].map(r => ({ ...r, gpm: r.goals / r.n, ycpm: r.yc / r.n })).sort((a, b) => b.n - a.n);
  }

  /* ---------- турнир: позиции по турам и шахматка ---------- */
  function progression(t, div) {
    const ms = t.matches.filter(m => Core.isRoundStage(m.stage) && (m.div || null) === (div || null));
    const rounds = [...new Set(ms.map(m => parseInt(m.stage, 10)))].sort((a, b) => a - b);
    const teams = new Map();
    for (const m of ms) { teams.set(m.home.id, m.homeName); teams.set(m.away.id, m.awayName); }
    const series = new Map([...teams.keys()].map(id => [id, []]));
    for (const r of rounds) {
      const upto = ms.filter(m => parseInt(m.stage, 10) <= r);
      const rows = Core.standings(upto);
      for (const row of rows) series.get(row.team.id).push({ round: r, pos: row.pos, pts: row.pts });
    }
    return { rounds, n: teams.size, series: [...series.entries()].map(([id, pts]) => ({ id, name: teams.get(id), team: (ms.find(m => m.home.id === id) || {}).home || (ms.find(m => m.away.id === id) || {}).away, pts })) };
  }
  function crossTable(t, div, order) {
    const ms = t.matches.filter(m => Core.isRoundStage(m.stage) && (m.div || null) === (div || null));
    const cell = new Map();
    for (const m of ms) {
      const k = m.home.id + '|' + m.away.id;
      if (!cell.has(k)) cell.set(k, []);
      cell.get(k).push(m);
    }
    return { get: (a, b) => cell.get(a + '|' + b) || [], order };
  }
  function goalsByRound(t) {
    const map = new Map();
    for (const m of t.matches) {
      if (!isPlayed(m)) continue;
      const k = m.stage || '—';
      const r = map.get(k) || { stage: k, goals: 0, n: 0 };
      r.goals += m.score[0] + m.score[1]; r.n++; map.set(k, r);
    }
    return [...map.values()];
  }

  /* ---------- игрок: подробности ---------- */
  function playerDetail(p) {
    const bins = new Array(11).fill(0);
    const bySeason = new Map();
    const opp = new Map(), mates = new Map();
    let winners = 0, firsts = 0;
    for (const g of p.goals) {
      const b = binOf(g.e.min); if (b >= 0) bins[b]++;
      const s = g.m.season.label; bySeason.set(s, (bySeason.get(s) || 0) + 1);
      const o = sideTeam(g.m, other(g.e.side)); const r = opp.get(o.id) || { team: o, goals: 0 }; r.goals++; opp.set(o.id, r);
    }
    const seenW = new Set();
    for (const a of p.apps) {
      const fl = flow(a.m);
      if (fl && fl.winner && fl.winner.p === p && !fl.winner.og && !seenW.has(a.m.id)) { winners++; seenW.add(a.m.id); }
      if (fl && fl.seq.length && fl.seq[0].g.p === p && !fl.seq[0].g.og) firsts++;
      for (const x of a.m.lineups[a.side]) if (x.p !== p) { const r = mates.get(x.p.id) || { p: x.p, n: 0 }; r.n++; mates.set(x.p.id, r); }
    }
    let best = 0, cur = 0, curStart = null, bestRange = null;
    for (const a of p.apps) {
      const sc = a.m.goals.some(g => g.p === p && !g.og);
      if (sc) { if (!cur) curStart = a.m; cur++; if (cur > best) { best = cur; bestRange = { from: curStart, to: a.m }; } } else cur = 0;
    }
    const appsBySeason = new Map();
    for (const a of p.apps) appsBySeason.set(a.m.season.label, (appsBySeason.get(a.m.season.label) || 0) + 1);
    return {
      bins, winners, firsts, streak: best, streakRange: bestRange,
      bySeason: [...appsBySeason.keys()].map(s => ({ s, apps: appsBySeason.get(s), goals: bySeason.get(s) || 0 })),
      opponents: [...opp.values()].sort((a, b) => b.goals - a.goals).slice(0, 10),
      mates: [...mates.values()].sort((a, b) => b.n - a.n).slice(0, 10),
      pens: p.goals.filter(g => g.e.pen).length, free: p.goals.filter(g => g.e.free).length,
      mp: { total: p.mp.length, saved: p.mp.filter(x => x.e.how === 'вратарь').length, wide: p.mp.filter(x => x.e.how === 'мимо').length, post: p.mp.filter(x => x.e.how === 'штанга' || x.e.how === 'перекладина').length },
      hat: 0,
    };
  }

  const Stats = { BINS, LEAGUE_IDS, filterMatches, playerTable, teamTable, matchLists, overview, referees, progression, crossTable, goalsByRound, playerDetail, flow, streaks, binOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = Stats; else root.Stats = Stats;
})(typeof window !== 'undefined' ? window : globalThis);
