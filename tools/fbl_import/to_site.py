"""Перенос протоколов из архива программы (sources/fbl/json) в файлы сезонов сайта (data/seasons).

Запуск из корня проекта: python3 tools/fbl_import/to_site.py [сезон ...]
Без аргументов переносит все сезоны из SEASONS. Сезон 2010/11 не трогает:
его протоколы уже на сайте из блога.

Что делает:
- названия команд переводит в названия того времени, как в блоге (NAMES);
- группы кубков восстанавливает по тому, кто с кем играл в групповом этапе;
- матчам за места без стадии подбирает стадию («За 5-8 места» и т. п.);
- «штрафной» из программы записывает как 10-метровый (tenm), технические голы убирает,
  оставляя счёт и отметку tech;
- итоговые таблицы и бомбардиров из блога (final) убирает: сайт считает их по протоколам.
"""
import json, os, sys, re, collections

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'sources', 'fbl', 'json')
DATA = os.path.join(ROOT, 'data', 'seasons')

# сезон сайта -> файлы программы: (файл, id турнира, название турнира)
SEASONS = {
    '2003': [('2003', 'chemp', None)],
    '2003-04': [('2003-2004', 'chemp', None), ('cup_2004', 'cup', 'Кубок АЖИ')],
    '2004-05': [('2004-2005', 'chemp', None)],
    '2005-06': [('2005-2006', 'chemp', 'Чемпионат АЖИ')],
    '2006-07': [('2006-2007', 'chemp', None)],
    '2007': [('2007', 'chemp', None)],
    '2007-08': [('2007-2008_m', 'media', None), ('2007-2008_b', 'brand', None), ('cup_2007-2008', 'cup', 'Кубок АЖИ'),
                ('champions_2008', 'cl', 'Лига Чемпионов'), ('hope_2008', 'hope', 'Кубок Надежды'), ('league_cup_2008', 'lc', 'Кубок Лиги')],
    '2008-09': [('2008-2009', 'chemp', None), ('cup_2009', 'cup', 'Кубок АЖИ'), ('hope_2009', 'hope', 'Кубок Надежды')],
    '2009-10': [('2009-2010', 'chemp', None), ('cup_2010', 'cup', 'Кубок АЖИ'), ('hope_2010', 'hope', 'Кубок Надежды')],
}

# название в программе -> название того времени (как в итоговой таблице блога этого сезона).
# Соответствия найдены совпадением таблиц (см. sources/fbl/README.md); чего нет — название как в программе.
NAMES = {
    '2003': {'АЖИ': 'Время-АЖИ', 'Комсомолка': 'КТС', 'Наша команда': 'NW 912'},
    '2003-04': {'АЖИ': 'Время-АЖИ', 'Комсомолка': 'КТС', 'Наша команда': 'NW-912', 'Фаворит ТВ (Мета)': 'Фаворит ТВ',
                'Sport.ua': 'Sport.com.ua'},
    '2004-05': {'АЖИ': 'Время-АЖИ', 'Комсомолка': 'Комсомольская правда', 'Наша команда': 'Вечёрка', 'Sport.ua': 'Sport.com.ua'},
    # таблицы 2005/06 в блоге нет; Алексей: АЖИ, Комсомолка, Наша команда — как в программе, Харьков спортивный — отдельная команда
    '2005-06': {'Sport.ua': 'Sport.com.ua'},
    '2006-07': {'Sport.ua': 'Sport.com.ua', 'Фаворит ТВ (Мета)': 'Фаворит ТВ'},
    '2007': {'Sport.ua': 'Sport.com.ua', 'Winbau (Вестник УФСИ)': 'Вестник УФСИ', 'Городской Доzор': 'Городской дозор',
             'Фаворит ТВ (Мета)': 'Фаворит ТВ'},
    '2007-08': {'Winbau (Вестник УФСИ)': 'Вестник УФСИ', 'ИРМИ (АЖИ-медиа)': 'АЖИ (медиа)', 'Sport.ua': 'Sport.com.ua',
                'АЖИ': 'АЖИ (бренд)', 'Фаворит ТВ (Мета)': 'Мета'},
    '2008-09': {'Sport.ua': 'Sport.com.ua', 'Winbau (Вестник УФСИ)': 'Вестник УФСИ', 'Металлист ТВ': 'Все про Металлист',
                'ComCom (FastFoot)': 'Comcom'},
    '2009-10': {'ComCom (FastFoot)': 'Fast foot', 'Winbau (Вестник УФСИ)': 'Winbau'},
}

VENUES = {'Спорткомплекс Фамуниверситета': 'СК Фармуниверситета', 'Вирта': 'СК «Вирта»', 'СК "Вирта"': 'СК «Вирта»',
          'СК "Коммунар"': 'СК «Коммунар»', 'СК "Звезда"': 'СК «Звезда»'}
KIND = {'penalty': 'pen', 'shtrafnoy': 'tenm', 'own_goal': 'og'}
SHOT = {'забит': None, 'вратарь': 'вратарь', 'штанга': 'штанга', 'мимо': 'мимо'}
PLAYOFF = ('1/8 финала', '1/4 финала', '1/2 финала', 'Финал', 'За 3-е место')


def winner(m):
    """'home' / 'away' / None по счёту и серии пенальти."""
    h, a = m['score']
    if h != a:
        return 'home' if h > a else 'away'
    if m.get('shootout_kicks'):
        s = collections.Counter(k['team'] for k in m['shootout_kicks'] if k['result'] == 'забит')
        if s[m['home']] != s[m['away']]:
            return 'home' if s[m['home']] > s[m['away']] else 'away'
    return None


def stages(ms):
    """Группы и стадии кубка: {n: (div, stage)} и список матчей, стадию которых определить не удалось."""
    out = {}
    staged = [m for m in ms if m['stage']]
    if not staged:  # круговой турнир без плей-офф
        return {m['n']: (None, f"{m['round']} тур") for m in ms}, []
    first = min(m['round'] for m in staged)
    rstage = {}
    for m in sorted(staged, key=lambda m: m['round']):
        rstage.setdefault(m['round'], m['stage'])
    # неотмеченный предыдущий раунд плей-офф: его победители — ровно участники первого отмеченного раунда
    prev = {'1/4 финала': '1/8 финала', '1/2 финала': '1/4 финала', 'Финал': '1/2 финала'}
    while first - 1 >= 1 and rstage[first] in prev:
        r = [m for m in ms if m['round'] == first - 1]
        nxt = {m[x] for m in ms if m['round'] == first and m['stage'] == rstage[first] for x in ('home', 'away')}
        wins = {m[winner(m)] for m in r if winner(m)}
        if not r or wins != nxt or len(r) * 2 != len({m[x] for m in r for x in ('home', 'away')}):
            break
        for m in r:
            m['stage'] = prev[rstage[first]]
        first -= 1
        rstage[first] = prev[rstage[first + 1]]
        staged += r
    group = [m for m in ms if m['round'] < first]
    # группы — связные компоненты «кто с кем играл»
    parent = {}
    def find(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            x = parent[x]
        return x
    for m in group:
        parent[find(m['home'])] = find(m['away'])
    roots = list(dict.fromkeys(find(m['home']) for m in group))
    gname = {r: (f"Группа {'ABCDEFGH'[i]}" if len(roots) > 1 else None) for i, r in enumerate(roots)}
    for m in group:
        out[m['n']] = (gname[find(m['home'])], f"{m['round']} тур")
    # плей-офф; матч без стадии в туре плей-офф, победитель которого играет дальше, — тоже плей-офф
    later = collections.defaultdict(set)
    for m in staged:
        later[m['round']].update([m['home'], m['away']])
    for m in ms:
        if m['round'] < first:
            continue
        if m['stage']:
            out[m['n']] = (None, m['stage'])
            continue
        w = winner(m)
        nxt = set().union(*[v for r, v in later.items() if r > m['round']])
        if w and m[w] in nxt and rstage.get(m['round']) in PLAYOFF[:4]:
            out[m['n']] = (None, rstage[m['round']])
    # где выбыла каждая команда
    po = [m for m in ms if out.get(m['n'], (0, ''))[1] in PLAYOFF[:3]]
    elim = {}
    for m in po:
        w = winner(m)
        if w:
            elim[m['away' if w == 'home' else 'home']] = out[m['n']][1]
    # не вышедшие из группы делят места после всех участников плей-офф (включая финал и матч за 3-е место)
    allpo = {m[x] for m in ms if out.get(m['n'], (0, ''))[1] in PLAYOFF for x in ('home', 'away')}
    for t in {m[x] for m in ms for x in ('home', 'away')} - allpo:
        elim[t] = 'группа'
    start, base = {}, 3
    for st in ('1/2 финала', '1/4 финала', '1/8 финала'):
        n = sum(1 for t in elim if elim[t] == st)
        start[st] = (base, n)
        base += n
    start['группа'] = (len(allpo) + 1, sum(1 for t in elim if elim[t] == 'группа'))
    # матчи за места: сетка внутри группы выбывших — победители идут в верхнюю половину мест
    left = [m for m in ms if m['n'] not in out]
    tiers = collections.defaultdict(list)
    for m in left:
        tiers[elim.get(m['home'])].append(m)
    problems = []
    for st, lst in tiers.items():
        if st not in start:
            problems += lst
            continue
        a, n = start[st]
        seg = {t: (a, a + n - 1) for t in elim if elim[t] == st}
        for r in sorted({m['round'] for m in lst}):
            for m in [m for m in lst if m['round'] == r]:
                sh, sa = seg.get(m['home']), seg.get(m['away'])
                if not sh or sh != sa:
                    problems.append(m)
                    continue
                lo, hi = sh
                out[m['n']] = (None, 'За 3-е место' if (lo, hi) == (3, 4) else f'За {lo}-{hi} места')
                w = winner(m)
                if w and hi > lo:
                    mid = (lo + hi) // 2
                    seg[m[w]] = (lo, mid)
                    seg[m['away' if w == 'home' else 'home']] = (mid + 1, hi)
    for m in problems:
        out[m['n']] = (None, 'Матч за места')
    return out, problems


def convert(sid):
    season_file = os.path.join(DATA, sid + '.json')
    old = json.load(open(season_file)) if os.path.exists(season_file) else None
    names = NAMES.get(sid, {})
    nm = lambda n: names.get(n, n)
    tours, matches, report = [], [], []
    for fname, tid, tname in SEASONS[sid]:
        src = json.load(open(os.path.join(SRC, fname + '.json')))
        oldt = next((t for t in (old or {}).get('tournaments', []) if t['id'] == tid), None)
        ms = src['matches']
        st, problems = stages(ms)
        fmt = 'league' if tid in ('chemp', 'media', 'brand') else 'cup'
        divs = sorted({d for d, _ in st.values() if d})
        tour = {'id': tid, 'name': (oldt or {}).get('name') or tname, 'format': fmt}
        if divs:
            tour['divisions'] = divs
        for k in ('status', 'note'):
            if oldt and k in oldt:
                tour[k] = oldt[k]
        tours.append(tour)
        if problems:
            report.append(f'{fname}: стадия не определена у {len(problems)} матчей: ' +
                          '; '.join(f"{m['date']} {m['home']} — {m['away']}" for m in problems))
        for i, m in enumerate(sorted(ms, key=lambda m: (m['date'], m['n'])), 1):
            div, stage = st[m['n']]
            if fmt == 'league':
                div, stage = None, f"{m['round']} тур"
            side = {'home': 'h', 'away': 'a'}
            x = {'id': f'{sid}-{tid}-{i:03d}', 't': tid, 'div': div, 'stage': stage, 'date': m['date'],
                 'home': nm(m['home']), 'away': nm(m['away']), 'score': list(m['score'])}
            if m['technical']:
                x['tech'] = True
            if m.get('shootout_kicks'):
                kicks = m['shootout_kicks']
                x['pens'] = [sum(1 for k in kicks if k['team'] == m[s] and k['result'] == 'забит') for s in ('home', 'away')]
                x['shootout'] = [k['player'] + (f" ({SHOT[k['result']]})" if SHOT.get(k['result']) else '') for k in kicks]
            if m['referee']:
                x['ref'] = m['referee']
            if m['venue']:
                x['venue'] = VENUES.get(m['venue'], m['venue'])
            if m['attendance']:
                x['att'] = m['attendance']
            x['goals'] = [[g['player'], g['minute'], side[g['side']]] + ([KIND[g['kind']]] if g['kind'] in KIND else [])
                          for g in m['goals'] if g['kind'] != 'technical']
            x['lineups'] = {side[s]: [[None, p['player']] for p in m['lineups'][s]] for s in ('home', 'away')}
            yc = [[p['player'], side[s], p['yellow_min']] for s in ('home', 'away') for p in m['lineups'][s] if p['yellow']]
            rc = [[p['player'], side[s], None] for s in ('home', 'away') for p in m['lineups'][s] if p['red']]
            if yc:
                x['yc'] = sorted(yc, key=lambda c: c[2] if c[2] is not None else 99)
            if rc:
                x['rc'] = rc
            mp = [[p['player'], 'h' if p['team'] == m['home'] else 'a', p['minute'], p['outcome']] for p in m.get('missed_pens') or []]
            if mp:
                x['mp'] = mp
            s = m.get('stats')
            if s and any(any(v) for v in s.values()):
                x['stats'] = {k: s[k] for k in ('shots', 'on_target', 'woodwork', 'corners', 'fouls') if k in s}
            matches.append(x)
    label = sid.replace('-', '/') if '-' in sid else sid
    out = {'season': label, 'source': 'Архив программы «Футбольные чемпионаты» (sources/fbl)', 'tournaments': tours, 'matches': matches}
    # как в остальных файлах сезонов: турнир и матч — по строке
    j = lambda v: json.dumps(v, ensure_ascii=False)
    text = ('{\n "season": ' + j(label) + ',\n "source": ' + j(out['source']) + ',\n "tournaments": [\n  ' +
            ',\n  '.join(map(j, tours)) + '\n ],\n "matches": [\n  ' + ',\n  '.join(map(j, matches)) + '\n ]\n}\n')
    open(season_file, 'w').write(text)
    return len(matches), report


if __name__ == '__main__':
    for sid in sys.argv[1:] or list(SEASONS):
        n, rep = convert(sid)
        print(f'{sid}: {n} матчей')
        for r in rep:
            print('  !', r)
