/* Простые SVG-графики для архива: столбцы, группы столбцов, линии, «места по турам», стопки.
   Цвета берутся из CSS-переменных темы, подсказки — один общий элемент. */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  let tip = null;

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function tooltip() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    document.body.appendChild(tip);
    return tip;
  }
  // rows: [{value, label, color}] — значение крупно, подпись мелко
  function showTip(evt, title, rows) {
    const t = tooltip();
    t.textContent = '';
    if (title) { const h = document.createElement('div'); h.className = 'tt'; h.textContent = title; t.appendChild(h); }
    for (const r of rows) {
      const line = document.createElement('div'); line.className = 'tr';
      if (r.color) { const k = document.createElement('i'); k.style.background = r.color; line.appendChild(k); }
      const v = document.createElement('b'); v.textContent = r.value; line.appendChild(v);
      if (r.label) { const l = document.createElement('span'); l.textContent = r.label; line.appendChild(l); }
      t.appendChild(line);
    }
    t.hidden = false;
    const pad = 14, w = t.offsetWidth, h = t.offsetHeight;
    let x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = evt.clientY - h - pad;
    t.style.left = Math.max(8, x) + 'px'; t.style.top = Math.max(8, y) + 'px';
  }
  function hideTip() { if (tip) tip.hidden = true; }
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }
  function ticks(max, count = 4) { const step = max / count; return Array.from({ length: count + 1 }, (_, i) => +(step * i).toFixed(6)); }
  const fmtNum = v => (Math.abs(v) >= 100 || Number.isInteger(v) ? Math.round(v).toLocaleString('uk-UA') : v.toLocaleString('uk-UA', { maximumFractionDigits: 2 }));

  function frame(host, height) {
    host.textContent = '';
    const W = Math.max(280, host.clientWidth || 600), H = height || 220;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img' }, host);
    return { svg, W, H };
  }
  function axisY(svg, x0, x1, y, max, H0, H1, fmt) {
    for (const t of ticks(max)) {
      const yy = H1 - (t / max) * (H1 - H0);
      el('line', { x1: x0, x2: x1, y1: yy, y2: yy, class: t === 0 ? 'ax-base' : 'ax-grid' }, svg);
      const tx = el('text', { x: x0 - 6, y: yy + 4, class: 'ax-label', 'text-anchor': 'end' }, svg); tx.textContent = (fmt || fmtNum)(t);
    }
  }
  function xLabels(svg, labels, xs, y, every) {
    const lastShown = every > 1 ? Math.floor((labels.length - 1) / every) * every : labels.length - 1;
    labels.forEach((l, i) => {
      const isLast = i === labels.length - 1;
      if (every > 1 && i % every && !(isLast && i - lastShown >= every / 2 + 0.5)) return;
      const t = el('text', { x: xs[i], y, class: 'ax-label', 'text-anchor': 'middle' }, svg); t.textContent = l;
    });
  }

  /* ---- столбцы (одна серия) ---- */
  function bars(host, o) {
    const { svg, W, H } = frame(host, o.height || 220);
    const max = niceMax(Math.max(...o.values, 0) || 1);
    const L = 14 + 7 * (o.yFmt || fmtNum)(max).length, R = 8, T = 18, B = 26;
    axisY(svg, L, W - R, 0, max, T, H - B, o.yFmt);
    const n = o.values.length, bw = (W - L - R) / n, gap = Math.min(10, bw * 0.25);
    const xs = [];
    const color = o.color || css('--court');
    const best = Math.max(...o.values);
    o.values.forEach((v, i) => {
      const x = L + i * bw + gap / 2, w = bw - gap, h = (v / max) * (H - T - B), y = H - B - h;
      xs.push(x + w / 2);
      const r = Math.min(4, w / 2, h);
      const p = el('path', { d: roundedTop(x, y, w, h, r), fill: color, class: 'mk' }, svg);
      const hit = el('rect', { x: L + i * bw, y: T, width: bw, height: H - T - B, fill: 'transparent', tabindex: 0, style: o.onClick ? 'cursor:pointer' : '' }, svg);
      if (o.onClick) { hit.addEventListener('click', () => { svg.querySelectorAll('.mk.sel').forEach(x => x.classList.remove('sel')); p.classList.add('sel'); o.onClick(i); }); hit.addEventListener('keydown', e => { if (e.key === 'Enter') o.onClick(i); }); }
      const show = e => { p.classList.add('on'); showTip(e, o.labels[i], [{ value: (o.fmt || fmtNum)(v), label: o.unit || '' }].concat(o.onClick ? [{ value: '', label: 'натисніть, щоб побачити матчі' }] : [])); };
      hit.addEventListener('pointermove', show); hit.addEventListener('pointerleave', () => { p.classList.remove('on'); hideTip(); });
      hit.addEventListener('focus', e => { const b = hit.getBoundingClientRect(); show({ clientX: b.x + b.width / 2, clientY: b.y }); }); hit.addEventListener('blur', () => { p.classList.remove('on'); hideTip(); });
      if (o.labelAll || v === best) { const t = el('text', { x: x + w / 2, y: y - 5, class: 'val-label', 'text-anchor': 'middle' }, svg); t.textContent = (o.fmt || fmtNum)(v); }
    });
    xLabels(svg, o.labels, xs, H - 8, Math.ceil(n / Math.max(4, Math.floor((W - L) / 46))));
  }
  function roundedTop(x, y, w, h, r) {
    if (h <= 0) return `M${x},${y}h${w}`;
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  /* ---- сгруппированные столбцы ---- */
  function grouped(host, o) {
    const { svg, W, H } = frame(host, o.height || 230);
    const L = 40, R = 8, T = 14, B = 26;
    const max = niceMax(Math.max(...o.series.flatMap(s => s.values), 0) || 1);
    axisY(svg, L, W - R, 0, max, T, H - B, o.yFmt);
    const n = o.labels.length, gw = (W - L - R) / n, inner = gw * 0.78, k = o.series.length, bw = Math.max(2, (inner - (k - 1) * 2) / k);
    const xs = [];
    o.labels.forEach((lab, i) => {
      const gx = L + i * gw + (gw - inner) / 2; xs.push(gx + inner / 2);
      const marks = [];
      o.series.forEach((s, j) => {
        const v = s.values[i], h = (v / max) * (H - T - B), x = gx + j * (bw + 2), y = H - B - h;
        marks.push(el('path', { d: roundedTop(x, y, bw, h, Math.min(4, bw / 2, h)), fill: s.color, class: 'mk' }, svg));
      });
      const hit = el('rect', { x: L + i * gw, y: T, width: gw, height: H - T - B, fill: 'transparent', tabindex: 0 }, svg);
      const show = e => { marks.forEach(m => m.classList.add('on')); showTip(e, lab, o.series.map(s => ({ value: (o.fmt || fmtNum)(s.values[i]), label: s.name, color: s.color }))); };
      hit.addEventListener('pointermove', show); hit.addEventListener('pointerleave', () => { marks.forEach(m => m.classList.remove('on')); hideTip(); });
      hit.addEventListener('focus', e => { const b = hit.getBoundingClientRect(); show({ clientX: b.x + b.width / 2, clientY: b.y }); }); hit.addEventListener('blur', () => { marks.forEach(m => m.classList.remove('on')); hideTip(); });
    });
    xLabels(svg, o.labels, xs, H - 8, Math.ceil(n / Math.max(4, Math.floor((W - L) / 46))));
  }

  /* ---- стопки (например, победы/ничьи/поражения по сезонам) ---- */
  function stacked(host, o) {
    const { svg, W, H } = frame(host, o.height || 230);
    const L = 40, R = 8, T = 14, B = 26;
    const totals = o.labels.map((_, i) => o.series.reduce((s, x) => s + x.values[i], 0));
    const max = niceMax(Math.max(...totals, 0) || 1);
    axisY(svg, L, W - R, 0, max, T, H - B);
    const n = o.labels.length, bw = (W - L - R) / n, gap = Math.min(12, bw * 0.3), xs = [];
    o.labels.forEach((lab, i) => {
      const x = L + i * bw + gap / 2, w = bw - gap; xs.push(x + w / 2);
      let y = H - B; const marks = [];
      o.series.forEach((s, j) => {
        const v = s.values[i]; if (!v) return;
        const h = (v / max) * (H - T - B);
        const top = j === o.series.length - 1 || o.series.slice(j + 1).every(z => !z.values[i]);
        marks.push(el(top ? 'path' : 'rect', top ? { d: roundedTop(x, y - h + 1, w, h - 1, Math.min(4, w / 2, h)), fill: s.color, class: 'mk' } : { x, y: y - h + 1, width: w, height: Math.max(0, h - 2), fill: s.color, class: 'mk' }, svg));
        y -= h;
      });
      const hit = el('rect', { x: L + i * bw, y: T, width: bw, height: H - T - B, fill: 'transparent', tabindex: 0 }, svg);
      const show = e => { marks.forEach(m => m.classList.add('on')); showTip(e, lab, o.series.slice().reverse().map(s => ({ value: fmtNum(s.values[i]), label: s.name, color: s.color }))); };
      hit.addEventListener('pointermove', show); hit.addEventListener('pointerleave', () => { marks.forEach(m => m.classList.remove('on')); hideTip(); });
      hit.addEventListener('focus', e => { const b = hit.getBoundingClientRect(); show({ clientX: b.x + b.width / 2, clientY: b.y }); }); hit.addEventListener('blur', hideTip);
    });
    xLabels(svg, o.labels, xs, H - 8, Math.ceil(n / Math.max(4, Math.floor((W - L) / 46))));
  }

  /* ---- линии с перекрестием ---- */
  function line(host, o) {
    const { svg, W, H } = frame(host, o.height || 220);
    const L = 40, R = 12, T = 16, B = 26;
    const all = o.series.flatMap(s => s.values.filter(v => v != null));
    const lo = o.invert ? 1 : (o.yMin != null ? o.yMin : 0);
    const max = o.invert ? Math.max(o.yMax || 1, ...all) : niceMax(Math.max(...all, 0) - lo) + lo;
    const n = o.labels.length;
    const X = i => L + (n === 1 ? (W - L - R) / 2 : (i / (n - 1)) * (W - L - R));
    const Y = o.invert ? v => T + ((v - 1) / Math.max(1, max - 1)) * (H - T - B) : v => H - B - ((v - lo) / (max - lo)) * (H - T - B);
    const tv = o.invert ? [...new Set([1, Math.round((max + 1) / 2), max])] : [0, 1, 2, 3, 4].map(k => lo + ((max - lo) * k) / 4);
    for (const v of tv) {
      const yy = Y(v), k = v === lo ? 0 : 1;
      el('line', { x1: L, x2: W - R, y1: yy, y2: yy, class: k === 0 && !o.invert ? 'ax-base' : 'ax-grid' }, svg);
      const tx = el('text', { x: L - 6, y: yy + 4, class: 'ax-label', 'text-anchor': 'end' }, svg); tx.textContent = (o.yFmt || fmtNum)(v);
    }
    o.series.forEach(s => {
      let d = '';
      s.values.forEach((v, i) => { if (v == null) return; d += (d && s.values[i - 1] != null ? 'L' : 'M') + X(i) + ',' + Y(v); });
      el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      if (n <= 24) s.values.forEach((v, i) => { if (v != null) el('circle', { cx: X(i), cy: Y(v), r: 3.5, fill: s.color, stroke: css('--surface'), 'stroke-width': 2 }, svg); });
    });
    xLabels(svg, o.labels, o.labels.map((_, i) => X(i)), H - 8, Math.ceil(n / Math.max(4, Math.floor((W - L) / 52))));
    const cross = el('line', { y1: T, y2: H - B, class: 'crosshair', visibility: 'hidden' }, svg);
    const hit = el('rect', { x: L, y: T, width: W - L - R, height: H - T - B, fill: 'transparent' }, svg);
    hit.addEventListener('pointermove', e => {
      const b = svg.getBoundingClientRect(), px = ((e.clientX - b.left) / b.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1))));
      cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
      showTip(e, o.labels[i], o.series.filter(s => s.values[i] != null).map(s => ({ value: (o.fmt || fmtNum)(s.values[i]), label: s.name, color: s.color })));
    });
    hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); hideTip(); });
  }

  /* ---- места по турам: все линии приглушены, выбранные команды выделены ---- */
  function bump(host, o) {
    const { svg, W, H } = frame(host, o.height || Math.max(220, o.n * 26 + 40));
    const L = 30, R = 12, T = 12, B = 26;
    const rs = o.rounds, nr = rs.length;
    const X = i => L + (nr === 1 ? 0 : (i / (nr - 1)) * (W - L - R));
    const Y = p => T + ((p - 1) / Math.max(1, o.n - 1)) * (H - T - B);
    for (let p = 1; p <= o.n; p++) { const t = el('text', { x: L - 8, y: Y(p) + 4, class: 'ax-label', 'text-anchor': 'end' }, svg); t.textContent = p; el('line', { x1: L, x2: W - R, y1: Y(p), y2: Y(p), class: 'ax-grid' }, svg); }
    xLabels(svg, rs.map(String), rs.map((_, i) => X(i)), H - 8, Math.ceil(nr / Math.max(4, Math.floor((W - L) / 30))));
    const muted = css('--line');
    const groups = [];
    o.series.forEach(s => {
      const g = el('g', { class: 'bump-line' }, svg);
      const d = s.pts.map((p, i) => (i ? 'L' : 'M') + X(rs.indexOf(p.round)) + ',' + Y(p.pos)).join('');
      const path = el('path', { d, fill: 'none', stroke: muted, 'stroke-width': 2, 'stroke-linejoin': 'round' }, g);
      const hitp = el('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': 12 }, g);
      hitp.addEventListener('pointermove', e => {
        const b = svg.getBoundingClientRect(), px = ((e.clientX - b.left) / b.width) * W;
        const i = Math.max(0, Math.min(nr - 1, Math.round(((px - L) / (W - L - R)) * (nr - 1))));
        const pt = s.pts.find(p => p.round === rs[i]);
        showTip(e, s.name, pt ? [{ value: pt.pos + ' місце', label: rs[i] + ' тур, ' + pt.pts + ' очк.' }] : []);
      });
      hitp.addEventListener('pointerleave', hideTip);
      hitp.addEventListener('click', () => o.onToggle && o.onToggle(s.id));
      groups.push({ s, path, g });
    });
    const pal = o.palette || [css('--s1'), css('--s2'), css('--s3')];
    (o.highlight || []).forEach((id, k) => {
      const x = groups.find(z => z.s.id === id); if (!x) return;
      x.path.setAttribute('stroke', pal[k % pal.length]); x.path.setAttribute('stroke-width', 3);
      svg.appendChild(x.g);
      const last = x.s.pts[x.s.pts.length - 1];
      if (last) el('circle', { cx: X(rs.indexOf(last.round)), cy: Y(last.pos), r: 4.5, fill: pal[k % pal.length], stroke: css('--surface'), 'stroke-width': 2 }, x.g);
    });
  }


  /* ---- горизонтальные полосы-рейтинг (HTML, кликабельные) ---- */
  function hbars(host, o) {
    host.textContent = '';
    host.style.height = 'auto';
    const max = Math.max(...o.items.map(i => i.value), 0) || 1;
    const wrap = document.createElement('div'); wrap.className = 'hb';
    o.items.forEach((it, k) => {
      const row = document.createElement(it.href ? 'a' : 'div'); row.className = 'hb-row';
      if (it.href) row.href = it.href;
      const rank = document.createElement('span'); rank.className = 'hb-rank'; rank.textContent = k + 1;
      const lab = document.createElement('span'); lab.className = 'hb-label'; lab.textContent = it.label;
      if (it.sub) { const sb = document.createElement('small'); sb.textContent = it.sub; lab.appendChild(sb); }
      const track = document.createElement('span'); track.className = 'hb-track';
      const fill = document.createElement('span'); fill.className = 'hb-fill'; fill.style.width = (it.value / max * 100) + '%'; fill.style.background = it.color || o.color || css('--s1');
      track.appendChild(fill);
      const val = document.createElement('b'); val.className = 'hb-val'; val.textContent = (o.fmt || fmtNum)(it.value);
      row.append(rank, lab, track, val);
      wrap.appendChild(row);
    });
    host.appendChild(wrap);
  }

  /* ---- тепловая карта (HTML-сетка) ---- */
  function heatmap(host, o) {
    host.textContent = ''; host.style.height = 'auto';
    const vals = o.values.flat(); const max = Math.max(...vals, 0) || 1;
    const sc = document.createElement('div'); sc.className = 'hm-scroll';
    const grid = document.createElement('div'); grid.className = 'hm';
    grid.style.gridTemplateColumns = `minmax(${o.rowW || 64}px, auto) repeat(${o.cols.length}, minmax(${o.cellW || 34}px, 1fr))`;
    const corner = document.createElement('span'); corner.className = 'hm-corner'; corner.textContent = o.corner || ''; grid.appendChild(corner);
    o.cols.forEach(c => { const h = document.createElement('span'); h.className = 'hm-col'; h.textContent = c; grid.appendChild(h); });
    o.rows.forEach((r, i) => {
      const rh = document.createElement('span'); rh.className = 'hm-row'; rh.textContent = r; grid.appendChild(rh);
      o.cols.forEach((c, j) => {
        const v = o.values[i][j];
        const cell = document.createElement(o.onClick && v ? 'button' : 'span'); cell.className = 'hm-cell';
        if (o.onClick && v) cell.type = 'button';
        const t = v ? 0.12 + 0.88 * (v / max) : 0;
        cell.style.background = v ? `color-mix(in srgb, var(--s1) ${Math.round(t * 100)}%, var(--surface))` : 'var(--line-soft)';
        if (t > 0.55) cell.classList.add('dk');
        if (o.showValues && v) cell.textContent = (o.fmt || fmtNum)(v);
        const tipRows = [{ value: (o.fmt || fmtNum)(v || 0), label: o.unit || '' }];
        cell.addEventListener('pointermove', e => showTip(e, (o.cellTitle ? o.cellTitle(i, j) : r + ' · ' + c), tipRows));
        cell.addEventListener('pointerleave', hideTip);
        if (o.onClick && v) cell.addEventListener('click', () => { grid.querySelectorAll('.hm-cell.sel').forEach(x => x.classList.remove('sel')); cell.classList.add('sel'); o.onClick(i, j); });
        grid.appendChild(cell);
      });
    });
    sc.appendChild(grid); host.appendChild(sc);
  }

  /* ---- точечная диаграмма с пузырьками ---- */
  function scatter(host, o) {
    const { svg, W, H } = frame(host, o.height || 360);
    const L = 48, R = 14, T = 14, B = 40;
    const xs = o.points.map(p => p.x), ys = o.points.map(p => p.y);
    const pad = (a, b) => { const d = (b - a) || 1; return [a - d * 0.08, b + d * 0.08]; };
    const [x0, x1] = o.xRange || pad(Math.min(...xs), Math.max(...xs));
    const [y0, y1] = o.yRange || pad(Math.min(...ys), Math.max(...ys));
    const X = v => L + ((v - x0) / (x1 - x0)) * (W - L - R);
    const Y = o.invertY ? v => T + ((v - y0) / (y1 - y0)) * (H - T - B) : v => H - B - ((v - y0) / (y1 - y0)) * (H - T - B);
    const nice = (a, b) => {
      const raw = (b - a) / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
      const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
      const out = []; for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(+v.toFixed(6)); return out;
    };
    for (const xv of nice(x0, x1)) {
      el('line', { x1: X(xv), x2: X(xv), y1: T, y2: H - B, class: 'ax-grid' }, svg);
      const tx = el('text', { x: X(xv), y: H - B + 16, class: 'ax-label', 'text-anchor': 'middle' }, svg); tx.textContent = (o.xFmt || fmtNum)(xv);
    }
    for (const yv of nice(y0, y1)) {
      el('line', { x1: L, x2: W - R, y1: Y(yv), y2: Y(yv), class: 'ax-grid' }, svg);
      const ty = el('text', { x: L - 6, y: Y(yv) + 4, class: 'ax-label', 'text-anchor': 'end' }, svg); ty.textContent = (o.yFmt || fmtNum)(yv);
    }
    // подписи у крайних точек, если подписывать все нельзя
    const named = new Set();
    if (!o.labelAll && o.points.length > 3) {
      const by = (f, n) => o.points.slice().sort(f).slice(0, n).forEach(p => named.add(p));
      by((a, b) => b.x - a.x, 2); by((a, b) => (o.invertY ? a.y - b.y : b.y - a.y), 2); by((a, b) => (b.r || 0) - (a.r || 0), 2);
    }
    if (o.xLabel) { const t = el('text', { x: (L + W - R) / 2, y: H - 6, class: 'ax-title', 'text-anchor': 'middle' }, svg); t.textContent = o.xLabel; }
    if (o.yLabel) { const t = el('text', { x: 12, y: (T + H - B) / 2, class: 'ax-title', 'text-anchor': 'middle', transform: `rotate(-90 12 ${(T + H - B) / 2})` }, svg); t.textContent = o.yLabel; }
    if (o.avgX != null) el('line', { x1: X(o.avgX), x2: X(o.avgX), y1: T, y2: H - B, class: 'ax-avg' }, svg);
    if (o.avgY != null) el('line', { x1: L, x2: W - R, y1: Y(o.avgY), y2: Y(o.avgY), class: 'ax-avg' }, svg);
    const rmax = Math.max(...o.points.map(p => p.r || 1));
    const base = css('--s1'), hl = css('--s2');
    const order = o.points.slice().sort((a, b) => (b.r || 1) - (a.r || 1));
    for (const p of order) {
      const rr = 4 + 10 * Math.sqrt((p.r || 1) / rmax);
      const on = o.highlight && o.highlight.includes(p.id);
      const c = el('circle', { cx: X(p.x), cy: Y(p.y), r: rr, fill: on ? hl : base, 'fill-opacity': on ? 0.95 : 0.55, stroke: css('--surface'), 'stroke-width': 2, class: 'pt' }, svg);
      if (on || o.labelAll || named.has(p)) { const right = X(p.x) > W - R - 120; const t = el('text', { x: right ? X(p.x) - rr - 4 : X(p.x) + rr + 4, y: Y(p.y) + 4, class: 'pt-label', 'text-anchor': right ? 'end' : 'start' }, svg); t.textContent = p.label; }
      const hit = el('circle', { cx: X(p.x), cy: Y(p.y), r: Math.max(12, rr), fill: 'transparent', tabindex: 0, style: p.href ? 'cursor:pointer' : '' }, svg);
      const show = e => { c.setAttribute('fill-opacity', 1); showTip(e, p.label, (o.tip ? o.tip(p) : [{ value: fmtNum(p.x), label: o.xLabel }, { value: fmtNum(p.y), label: o.yLabel }])); };
      hit.addEventListener('pointermove', show);
      hit.addEventListener('pointerleave', () => { c.setAttribute('fill-opacity', on ? 0.95 : 0.55); hideTip(); });
      hit.addEventListener('focus', () => { const b = hit.getBoundingClientRect(); show({ clientX: b.x + b.width / 2, clientY: b.y }); });
      hit.addEventListener('blur', hideTip);
      if (p.href) { hit.addEventListener('click', () => { hideTip(); location.hash = p.href; }); hit.addEventListener('keydown', e => { if (e.key === 'Enter') location.hash = p.href; }); }
    }
  }

  /* ---- лента формы: квадраты результатов по сезонам ---- */
  function formStrip(host, o) {
    host.textContent = ''; host.style.height = 'auto';
    const wrap = document.createElement('div'); wrap.className = 'fs';
    for (const row of o.rows) {
      const r = document.createElement('div'); r.className = 'fs-row';
      const lab = document.createElement('span'); lab.className = 'fs-label'; lab.textContent = row.label; r.appendChild(lab);
      const cells = document.createElement('span'); cells.className = 'fs-cells';
      for (const it of row.items) {
        const a = document.createElement('a'); a.className = 'fs-c ' + it.res + (it.mark ? ' mk' : ''); a.href = '#m-' + it.m.id;
        a.textContent = it.res === 'W' ? 'В' : it.res === 'D' ? 'Н' : 'П';
        a.addEventListener('pointermove', e => showTip(e, it.title, [{ value: it.score, label: it.sub }]));
        a.addEventListener('pointerleave', hideTip);
        cells.appendChild(a);
      }
      r.appendChild(cells); wrap.appendChild(r);
    }
    host.appendChild(wrap);
  }

  /* ---- зеркальное сравнение двух объектов ---- */
  function mirror(host, o) {
    host.textContent = ''; host.style.height = 'auto';
    const wrap = document.createElement('div'); wrap.className = 'mr';
    const head = document.createElement('div'); head.className = 'mr-head';
    const ha = document.createElement('b'); ha.textContent = o.a; const hb = document.createElement('b'); hb.textContent = o.b;
    head.append(ha, document.createElement('span'), hb); wrap.appendChild(head);
    for (const r of o.rows) {
      const max = Math.max(r.a || 0, r.b || 0) || 1;
      const row = document.createElement('div'); row.className = 'mr-row';
      const better = r.lowerBetter ? (r.a < r.b ? 'a' : r.b < r.a ? 'b' : '') : (r.a > r.b ? 'a' : r.b > r.a ? 'b' : '');
      const side = (v, cls) => {
        const s = document.createElement('span'); s.className = 'mr-side ' + cls;
        const bar = document.createElement('i'); bar.style.width = ((v || 0) / max * 100) + '%'; bar.style.background = cls === 'a' ? css('--s1') : css('--s2');
        const val = document.createElement('b'); val.textContent = v == null ? '—' : (r.fmt || fmtNum)(v);
        if (better === cls) val.classList.add('win');
        s.append(bar, val); return s;
      };
      const lab = document.createElement('span'); lab.className = 'mr-label'; lab.textContent = r.label;
      row.append(side(r.a, 'a'), lab, side(r.b, 'b')); wrap.appendChild(row);
    }
    host.appendChild(wrap);
  }

  root.Charts = { bars, grouped, stacked, line, bump, hbars, heatmap, scatter, formStrip, mirror, css, hideTip, showTip };
})(window);
