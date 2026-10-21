"""Сборка нормализованной базы проекта из разобранных протоколов и архивной страницы."""
import json, re, sys, os, collections

WORK, PROJ = sys.argv[1], sys.argv[2]
M = json.load(open(f'{WORK}/m.json'))
PAST = json.load(open(f'{WORK}/past_lines.json'))
os.makedirs(f'{PROJ}/data/seasons', exist_ok=True)

COMP_ID = {'Чемпионат': 'chemp', 'Кубок АЖИ': 'cup', 'Кубок Надежды': 'hope', 'Кубок «Золотая середина»': 'gold',
           'Лига Чемпионов': 'cl', 'Кубок Лиги': 'lc'}
COMP_NAME = {'chemp': 'Чемпионат АЖИ', 'media': 'Медиа-лига', 'brand': 'Бренд-лига', 'cup': 'Кубок АЖИ', 'hope': 'Кубок Надежды', 'gold': 'Кубок "Золотая середина"',
             'cl': 'Лига Чемпионов', 'lc': 'Кубок Лиги'}
COMP_ORDER = ['chemp', 'media', 'brand', 'cup', 'gold', 'hope', 'cl', 'lc']
LEAGUE_ID = {'Медиа-лига': 'media', 'Бренд-лига': 'brand'}


def norm_stage(s):
    if not s or s.strip() in ('Харьков',):
        return None
    s = s.replace(' Харьков', '').strip()
    s = re.sub(r'^Матч\s+', '', s)
    s = re.sub(r'^(?:За|за)\s+', 'За ', s)
    s = re.sub(r'^\d+-\d+ места', lambda m: 'За ' + m.group(0), s)
    s = s.replace('За 3 место', 'За 3-е место')
    s = re.sub(r'места?$', 'места', s) if re.match(r'^За \d+-\d+', s) else s
    if re.match(r'^За \d+ место$', s):
        pass
    return s[0].upper() + s[1:]


def season_id(label):
    return label.replace('/', '-')


# ---------- матчи по сезонам ----------
# Ручные исправления очевидных опечаток источника (перечислены в сверочном списке)
FIXES = [
    # 08.10.2011, 6 тур бренд-лиги: в заголовке «116» вместо названия; состав совпадает с Barcelona
    ({'date': '2011-10-08', 'home': '116'}, {'home': 'Barcelona'}),
]
for m in M:
    for cond, upd in FIXES:
        if all(m.get(k) == v for k, v in cond.items()):
            m.update(upd)

# Статус турниров, который нельзя вывести из протоколов
STATUS = {
    ('2019-20', 'chemp'): {'status': 'finished', 'note': 'Сезон состоял из одного круга. «Спартак» и Adonis набрали по 33 очка, чемпион определён по личной встрече.'},
    ('2021-22', 'chemp'): {'status': 'unfinished', 'note': 'Чемпионат не был доигран: после 18 тура (19 февраля 2022 г.) началась война.'},
}

by_season = collections.defaultdict(list)
for m in M:
    by_season[m['season']].append(m)

log = collections.Counter()
out_seasons = {}
for season, ms in sorted(by_season.items()):
    ms.sort(key=lambda m: (m['date'], m['src']))
    # состав групп/лиг для подстановки пропущенных
    membership = collections.defaultdict(lambda: collections.defaultdict(set))
    for m in ms:
        if m['div']:
            membership[m['comp']][m['div']] |= {m['home'], m['away']}
    # лига чемпионата — по большинству матчей команды
    tl = collections.defaultdict(collections.Counter)
    for m in ms:
        if m['comp'] == 'Чемпионат' and m['div']:
            tl[m['home']][m['div']] += 1
            tl[m['away']][m['div']] += 1
    for m in ms:
        if m['comp'] == 'Чемпионат' and tl:
            lh = tl[m['home']].most_common(1)[0][0] if tl[m['home']] else None
            la = tl[m['away']].most_common(1)[0][0] if tl[m['away']] else None
            cur_d = m['div']
            stray = cur_d is None or tl[m['home']][cur_d] <= 2 or tl[m['away']][cur_d] <= 2
            if lh and lh == la and cur_d != lh and stray:
                m['div'] = lh
                log['league_fixed'] += 1
    # одна и та же вывеска в обеих лигах (АЖИ, ГолStar в 2011/12) — уточняем лигу в названии
    dual = {n for n, c in tl.items() if sum(1 for v in c.values() if v >= 3) >= 2}
    for m in ms:
        if m['comp'] == 'Чемпионат' and m['div']:
            suf = ' (медиа)' if m['div'].startswith('Медиа') else ' (бренд)'
            for side in ('home', 'away'):
                if m[side] in dual:
                    m[side] = m[side] + suf
                    log['dual_renamed'] += 1
    for m in ms:
        m['stage'] = norm_stage(m['stage'])
        is_round = bool(m['stage'] and re.match(r'^\d+ тур$', m['stage']))
        if m['div'] is None and is_round and membership[m['comp']]:
            cands = [d for d, teams in membership[m['comp']].items() if m['home'] in teams and m['away'] in teams]
            if len(cands) == 1:
                m['div'] = cands[0]
                log['div_filled'] += 1
            else:
                log['div_unresolved'] += 1
                log.setdefault('unres', [])
        if m['div'] and not is_round and m['comp'] != 'Чемпионат':
            # плей-офф кубков не относится к группе
            m['div'] = None
    tours = collections.OrderedDict()
    recs = []
    for k, m in enumerate(ms):
        cid = COMP_ID[m['comp']]
        if cid == 'chemp' and m['div'] in LEAGUE_ID:
            # медиа-лига и бренд-лига — отдельные турниры разного уровня
            cid = LEAGUE_ID[m['div']]
            m['div'] = None
        tours.setdefault(cid, set())
        if m['div']:
            tours[cid].add(m['div'])
        goals = []
        px = py = 0
        hn_ = {p['n'] for p in m['lineups']['home']}
        an_ = {p['n'] for p in m['lineups']['away']}
        for g in m['goals']:
            side = 'h' if g['x'] > px else ('a' if g['y'] > py else '?')
            px, py = g['x'], g['y']
            # сторона по составу надёжнее хода счёта (в протоколах бывают опечатки в счёте)
            ih, ia = g['n'] in hn_, g['n'] in an_
            if ih != ia:
                own = 'h' if ih else 'a'
                lineup_side = ('a' if own == 'h' else 'h') if g['og'] else own
                if lineup_side != side:
                    log['goal_side_by_lineup'] += 1
                    side = lineup_side
            e = [g['n'], g['min'], side]
            if g['og']:
                e.append('og')
            elif g['pen']:
                e.append('pen')
            elif g.get('free'):
                e.append('free')
            goals.append(e)
        hn = {p['n'] for p in m['lineups']['home']}
        an = {p['n'] for p in m['lineups']['away']}

        def card_side(c):
            if c.get('team'):
                if c['team'] == m['home']:
                    return 'h'
                if c['team'] == m['away']:
                    return 'a'
            if c['n'] in hn:
                return 'h'
            if c['n'] in an:
                return 'a'
            return None

        rec = {
            't': cid, 'div': m['div'], 'stage': m['stage'], 'date': m['date'],
            'home': m['home'], 'away': m['away'],
            'score': [m['hs'], m['as']] if m['hs'] is not None else None,
        }
        if m['tech']:
            rec['tech'] = m['tech']
        elif m.get('tech_result'):
            rec['tech'] = True
        if m['pens']:
            rec['pens'] = m['pens']
        for key in ('ref', 'venue', 'att'):
            if m.get(key):
                rec[key] = m[key]
        if goals:
            rec['goals'] = goals
        rec['lineups'] = {'h': [[p['no'], p['n']] for p in m['lineups']['home']],
                          'a': [[p['no'], p['n']] for p in m['lineups']['away']]}
        if m['yc']:
            rec['yc'] = [[c['n'], card_side(c), c['min']] for c in m['yc']]
        if m['rc']:
            rec['rc'] = [[c['n'], card_side(c), c['min']] + ([c['note']] if c.get('note') else []) for c in m['rc']]
        if m.get('shootout'):
            rec['shootout'] = m['shootout']
        if m.get('missed'):
            def ms_side(c):
                if c['team'] == m['home']: return 'h'
                if c['team'] == m['away']: return 'a'
                if c['n'] in hn: return 'h'
                if c['n'] in an: return 'a'
                return None
            rec['mp'] = [[c['n'], ms_side(c), c['min'], c['how']] for c in m['missed']]
        if m['stats']:
            rec['stats'] = m['stats']
        recs.append(rec)
    # нумерация
    sid = season_id(season)
    cnt = collections.Counter()
    for r in recs:
        cnt[r['t']] += 1
        r['id'] = f"{sid}-{r['t']}-{cnt[r['t']]:03d}"
        # id первым ключом
    recs = [{'id': r.pop('id'), **r} for r in recs]
    sid = season_id(season)
    tlist = []
    for cid in sorted(tours, key=COMP_ORDER.index):
        divs = sorted(tours[cid], key=lambda d: (0 if d.startswith('Медиа') else 1 if d.startswith('Бренд') else 2, d))
        t = {'id': cid, 'name': COMP_NAME[cid], 'format': 'league' if cid in ('chemp', 'media', 'brand') else 'cup'}
        st = STATUS.get((sid, cid))
        if st:
            t.update(st)
        if divs:
            t['divisions'] = divs
        tlist.append(t)
    out_seasons[sid] = {'season': season, 'source': 'Блог media-soccer.org', 'tournaments': tlist, 'matches': recs}

# ---------- архив 2003–2010 ----------
ARCH_TITLES = {
    'Чемпионат АЖИ 2003': ('2003', 'Чемпионат АЖИ 2003'),
    'Чемпионат АЖИ по мини-футболу 2003-2004': ('2003-04', 'Чемпионат АЖИ по мини-футболу'),
    'Открытый Чемпионат АЖИ 2004-2005': ('2004-05', 'Открытый Чемпионат АЖИ'),
    'Чемпионат АЖИ 2006-2007': ('2006-07', 'Чемпионат АЖИ'),
    'Чемпионат АЖИ 2007': ('2007', 'Чемпионат АЖИ 2007'),
    'Чемпионат АЖИ 2007/08': ('2007-08', 'Чемпионат АЖИ'),
    'Чемпионат АЖИ 2008/09': ('2008-09', 'Чемпионат АЖИ'),
    'Чемпионат АЖИ 2009/10': ('2009-10', 'Чемпионат АЖИ'),
}
SWAP_NAMES = {'2003', '2003-04', '2004-05'}  # там бомбардиры записаны «Имя Фамилия»
arch = collections.OrderedDict()
cur = None
div = None
mode = None
for l in PAST:
    key = l.strip()
    if key in ARCH_TITLES:
        sid, name = ARCH_TITLES[key]
        cur = {'season': sid.replace('-', '/') if '-' in sid else sid, 'source': 'Блог media-soccer.org, страница «Прошедшие турниры»',
               'tournaments': [{'id': 'chemp', 'name': name, 'format': 'league', 'final': {'tables': [], 'scorers': []}}], 'matches': []}
        arch[sid] = cur
        div = None
        mode = None
        continue
    if cur is None:
        continue
    fin = cur['tournaments'][0]['final']
    if re.match(r'^(Медиа|Бренд)-лига$', key):
        div = key
        continue
    if key.startswith('| | И |') or key.startswith('| | И'):
        mode = 'table'
        fin['tables'].append({'div': div, 'rows': []})
        continue
    if key.startswith('Бомбардиры'):
        mode = 'scorers_wait'
        continue
    if key.startswith('Игрок |'):
        mode = 'scorers'
        continue
    cells = [c.strip() for c in key.split('|')]
    cells = [c for c in cells]
    if mode == 'table' and re.match(r'^\d+$', cells[0] or ''):
        c = cells
        fin['tables'][-1]['rows'].append({'pos': int(c[0]), 'team': c[1], 'p': int(c[2]), 'w': int(c[3]), 'd': int(c[4]), 'l': int(c[5]),
                                          'gf': int(c[6]), 'ga': int(c[7]), 'pts': int(c[9])})
    elif mode == 'scorers' and len(cells) >= 3 and re.match(r'^\d+$', cells[2] or ''):
        name = cells[0]
        if cur['season'].replace('/', '-') in SWAP_NAMES:
            parts = name.split()
            if len(parts) == 2:
                name = parts[1] + ' ' + parts[0]
        pen = re.search(r'\((\d+)\)', cells[3] if len(cells) > 3 else '')
        e = {'name': name, 'team': cells[1], 'goals': int(cells[2])}
        if pen:
            e['pens'] = int(pen.group(1))
        if div:
            e['div'] = div
        fin['scorers'].append(e)
# архив 2007/08: две лиги — два турнира; у АЖИ был состав в каждой лиге
for sid, s in arch.items():
    t = s['tournaments'][0]
    divs = [x['div'] for x in t['final']['tables'] if x['div']]
    if divs:
        names = collections.Counter(r['team'] for tb in t['final']['tables'] for r in tb['rows'])
        dual = {n for n, c in names.items() if c > 1}
        suf = lambda d: ' (медиа)' if d.startswith('Медиа') else ' (бренд)'
        tours_ = []
        for d in sorted(divs, key=lambda x: 0 if x.startswith('Медиа') else 1):
            tb = [x for x in t['final']['tables'] if x['div'] == d][0]
            for r in tb['rows']:
                if r['team'] in dual:
                    r['team'] += suf(d)
            sc = [dict(x) for x in t['final']['scorers'] if x.get('div') == d]
            for x in sc:
                x.pop('div', None)
                if x['team'] in dual:
                    x['team'] += suf(d)
            tb = dict(tb, div=None)
            tours_.append({'id': LEAGUE_ID[d], 'name': d, 'format': 'league', 'final': {'tables': [tb], 'scorers': sc}})
        s['tournaments'] = tours_
    out_seasons[sid] = s

# ---------- запись ----------
def dump_season(obj):
    j = lambda x: json.dumps(x, ensure_ascii=False, separators=(',', ':'))
    parts = ['{', f' "season": {j(obj["season"])},', f' "source": {j(obj["source"])},', ' "tournaments": [']
    parts.append(',\n'.join('  ' + json.dumps(t, ensure_ascii=False) for t in obj['tournaments']))
    parts.append(' ],')
    parts.append(' "matches": [')
    parts.append(',\n'.join('  ' + j(m) for m in obj['matches']))
    parts.append(' ]')
    parts.append('}')
    return '\n'.join(parts) + '\n'


order = sorted(out_seasons, key=lambda s: (int(s[:4]), len(s)))
for sid in order:
    with open(f'{PROJ}/data/seasons/{sid}.json', 'w') as f:
        f.write(dump_season(out_seasons[sid]))

# ---------- команды ----------
def tkey(n):
    return re.sub(r'[\s\-–"«»“”\'.]', '', n.lower().replace('ё', 'е'))

TRANS = dict(zip('абвгдеёжзийклмнопрстуфхцчшщъыьэюяіїєґ',
                 ['a', 'b', 'v', 'g', 'd', 'e', 'e', 'zh', 'z', 'i', 'y', 'k', 'l', 'm', 'n', 'o', 'p', 'r', 's', 't', 'u', 'f', 'kh', 'ts', 'ch',
                  'sh', 'shch', '', 'y', '', 'e', 'yu', 'ya', 'i', 'yi', 'ye', 'g']))


def slug(n):
    s = ''.join(TRANS.get(ch, ch) for ch in n.lower())
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s or 'team'

usage = collections.defaultdict(lambda: collections.Counter())
for sid in order:
    s = out_seasons[sid]
    for m in s['matches']:
        for t in (m['home'], m['away']):
            usage[t][s['season']] += 1
    for t in s['tournaments']:
        for tb in t.get('final', {}).get('tables', []):
            for r in tb['rows']:
                usage[r['team']][s['season']] += 1
        for sc in t.get('final', {}).get('scorers', []):
            usage[sc['team']][s['season']] += 0

# Решения организатора по сверке (октябрь 2026): одна команда под разными названиями
TEAM_GROUPS = [
    ['Банзай', 'Республика Славутич', 'Карлсберг', 'MFC Titan'],
    ['Рокос', 'Хроник-спорт', 'ХИБМ', 'Спартак'],
    ['Meliart', 'Adonis'],
    ['Харьков-Спорт (бренд)', 'Мегас'],
    ['Укрресурс', 'Атлетик'],
    ['Pride-520', 'Allcookies'],
    ['Меццо-2', 'Mezzo-Mobus', 'Green Team - Mezzo', 'Меццо'],
    ['Sport.com.ua', 'Sport.ua'],
    ['Комсомольская правда', 'Комсомолка'],
    ['Городской дозор', 'Городской Доzор'],
]
# Один клуб — несколько составов (по одному на лигу); названия клубов
CLUBS = {
    'АЖИ': ['АЖИ', 'АЖИ (медиа)', 'АЖИ (бренд)'],
    'ГолStar': ['ГолStar', 'ГолStar (медиа)', 'ГолStar (бренд)'],
    'Харьков-Спорт': ['Харьков-Спорт', 'Харьков-Спорт (медиа)', 'Харьков-Спорт (бренд)'],
    'Меццо': ['Меццо', 'Unlimiters', 'Mobus.com'],
}
groups = collections.OrderedDict()
for name in sorted(usage, key=lambda n: -sum(usage[n].values())):
    groups.setdefault(tkey(name), []).append(name)
# объединяем группы по решениям
name2key = {n: k for k, ns in groups.items() for n in ns}
for grp in TEAM_GROUPS:
    keys = [name2key[n] for n in grp if n in name2key]
    if not keys:
        continue
    base = keys[0]
    for k in keys[1:]:
        if k != base and k in groups:
            groups[base] += groups.pop(k)
            for n in groups[base]:
                name2key[n] = base
def last_season(n):
    return max((int(x[:4]) * 10 + len(x)) for x in usage[n]) if usage[n] else 0
teams = []
seen_ids = set()
club_of = {n: c for c, ns in CLUBS.items() for n in ns}
for k, names in groups.items():
    if len(names) > 1 and any(n in g for g in TEAM_GROUPS for n in names):
        main = max(names, key=last_season)  # переименованная команда — под последним названием
    else:
        main = max(names, key=lambda n: sum(usage[n].values()))
    tid = slug(main)
    while tid in seen_ids:
        tid += '-2'
    seen_ids.add(tid)
    t = {'id': tid, 'name': main, 'names': sorted(names, key=lambda n: (last_season(n), sum(usage[n].values())))}
    clubs = {club_of[n] for n in names if n in club_of}
    if clubs:
        t['club'] = sorted(clubs)[0]
    teams.append(t)
teams.sort(key=lambda t: t['name'].lower())
json.dump({'_comment': 'Команды. Все названия из списка names считаются одной командой. Поле club объединяет составы одного клуба (например, составы в медиа- и бренд-лиге).',
           'teams': teams}, open(f'{PROJ}/data/teams.json', 'w'), ensure_ascii=False, indent=1)
PLAYER_MERGE = [
    ['Власенко Александр', 'Власенко Александр к'], ['Проходов Сергей', 'Проходов Сергейм'], ['Никоноров Максим', 'Никаноров Максим'],
    ['Яковенко Андрей', 'Яковенко Андрей Евг'], ['Горелков Николай', 'Горелов Николай'], ['Горюшкин Станислав', 'Горошкин Станислав'],
    ['Михайлов Денис', 'Михалков Денис'], ['Колмаков Иван', 'Коломаков Иван'], ['Кононенко Евгений', 'Кононекно Евгений'],
    ['Федров Сергей', 'Федоров Сергей'], ['Мелихов Иван', 'Мелехов Иван'], ['Четвериков Артур', 'Четверяков Артур'],
    ['Папуця Андрей', 'Папуся Андрей'], ['Судья Александр', 'Суддя Александр'], ['Пашков Константин', 'Пашко Константин'],
    ['Аболымов Николай', 'Аболышов Николай'], ['Сорока Виктор', 'Сорона Виктор'], ['Христофьев Александр', 'Христоев Александр'],
    ['Товстокорый Вадим', 'Товстонорый Вадим'], ['Сериков Александр', 'Сериинов Александр'], ['Теплая Мария', 'Тепла Мария'],
    ['Наврось Роман', 'Навроз Роман'], ['Клевцов Андрей', 'Клевдов Андрей'], ['Печененко Антон', 'Печенко Антон'],
    ['Ерёмин Вячеслав', 'Ерёмин Вясеслав'], ['Дегтярь Вячеслав', 'Дегтярь Вячеслав Ал'], ['Загородний Руслан', 'Загородний Руслан о'],
    ['Рипа Андрей', 'Андрей Рипа Станислав'], ['Коваленко Александр', 'Коваленко Александр а'],
    ['Коваленко Александр (Наша команда)', 'Коваленко Александр в'], ['Гриценко Сергей (Ювентус)', 'Гриценко Сергей о'],
]
PLAYER_SPLIT = [
    {'name': 'Коваленко Александр', 'teams': ['Наша команда'], 'as': 'Коваленко Александр (Наша команда)'},
    {'name': 'Гриценко Сергей', 'teams': ['Ювентус'], 'as': 'Гриценко Сергей (Ювентус)'},
]
json.dump({'_comment': 'Игроки. Имя в протоколах сравнивается без учёта регистра и разницы е/ё. merge: [основное написание, вариант] — один человек. split: тёзки, которых различаем по команде (teams) или по матчам (match_ids).',
           'merge': PLAYER_MERGE, 'split': PLAYER_SPLIT}, open(f'{PROJ}/data/players.json', 'w'), ensure_ascii=False, indent=1)
json.dump({'seasons': order}, open(f'{PROJ}/data/seasons.json', 'w'), ensure_ascii=False, indent=1)
print({k: v for k, v in log.items() if not isinstance(v, list)}, len(order), 'seasons', len(teams), 'teams')
for sid in order:
    s = out_seasons[sid]
    print(sid, [(t['id'], t.get('divisions')) for t in s['tournaments']], len(s['matches']))
