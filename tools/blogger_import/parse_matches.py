"""Разбор протоколов матчей из выгрузки блога media-soccer (Blogger)."""
import json, re, sys, collections

SRC, OUT, LOG = sys.argv[1], sys.argv[2], sys.argv[3]
P = json.load(open(SRC))

DASH = r'\s+[-–—]\s+'
HDR = re.compile(r'^(?P<h>.{2,45}?)' + DASH + r'(?P<a>.{2,45}?)\s*[-–—]\s*(?P<hs>\d+|[+\-–])\s*:\s*(?P<as>\d+|[+\-–])\s*(?P<extra>.*)$')
HDR2 = re.compile(r'^(?P<h>.{2,45}?)' + DASH + r'(?P<a>.{2,45}?)\s+(?P<hs>[+\-–])\s*:\s*(?P<as>[+\-–])\s*(?P<extra>.*)$')
DATE = re.compile(r'^(?P<d>\d\d)\.(?P<m>\d\d)\.(?P<y>\d{4})\.?\s*(?P<rest>.*)$')
GOAL_A = re.compile(r'^(?P<name>[^,()\d]+?(?:\s*\((?:мл|ст)\.?\))?)(?P<ann>\s*\((?:в свои ворота|автогол)\)|\s*[-–—]\s*(?:с\s+)?(?:пенальти|штрафно\w*|10-?метров\w*))?\s*,?\s*(?P<min>\d+)?\s*\(\s*(?P<x>\d+)\s*:\s*(?P<y>\d+)\s*\)\s*$')
GOAL_B = re.compile(r'^(?P<x>\d+)\s*:\s*(?P<y>\d+)\s*[-–]\s*(?P<name>[^,()]+?(?:\s*\((?:мл|ст)\.?\))?)(?P<ann>\s*\((?:в свои ворота|автогол)\)|\s*[-–—]\s*(?:с\s+)?(?:пенальти|штрафно\w*|10-?метров\w*))?\s*(?:,\s*(?P<min>\d+))?\s*$')
MISS = re.compile(r'^(?P<name>[А-ЯЁІЇЄA-Z][^,()]+?(?:\s*\((?:мл|ст)\.?\))?)\s*\((?P<team>[^()]*(?:\([^()]*\))?[^()]*)\)\s*,\s*(?P<min>\d+)?\s*(?:\((?P<how>[^()]+)\))?\s*$')
STAT = re.compile(r'^(Удары всего|Удары в створ|Штанги, перекладины|Угловые|Фолы)\s*:\s*(\d+)\s*[-–]\s*(\d+)')
STATKEY = {'Удары всего': 'shots', 'Удары в створ': 'on_target', 'Штанги, перекладины': 'woodwork', 'Угловые': 'corners', 'Фолы': 'fouls'}

COMP_PAT = [
    (re.compile(r'(?i)лига\s+чемпионов'), 'Лига Чемпионов'),
    (re.compile(r'(?i)кубок\s+лиги'), 'Кубок Лиги'),
    (re.compile(r'(?i)кубок\s+надежд'), 'Кубок Надежды'),
    (re.compile(r'(?i)золотая\s+середина'), 'Кубок «Золотая середина»'),
    (re.compile(r'(?i)кубок\s+ажи|кубки\s+ажи|^кубок'), 'Кубок АЖИ'),
]
LEAGUE = re.compile(r'^(Медиа|Бренд)-(лига|дивизион)\b', re.I)
GROUP = re.compile(r'^Группа\s*["“«]?\s*([A-DА-ГABCDВС])\s*["”»]?', re.I)
GMAP = {'А': 'A', 'В': 'B', 'С': 'C', 'Б': 'B', 'Г': 'D', 'Д': 'D'}


def comp_of(s):
    for rx, name in COMP_PAT:
        if rx.search(s):
            return name
    return None


def stage_hint(l):
    t = l.lower()
    if re.search(r'1/4 финала|четвертьфинал', t):
        return '1/4 финала'
    if re.search(r'1/2 финала|полуфинал', t):
        return '1/2 финала'
    m = re.search(r'за\s+(\d+)(?:-е)?\s*[-–]\s*(\d+)', t)
    if m:
        return f'За {m.group(1)}-{m.group(2)} места'
    m = re.search(r'за\s+(\d+)(?:-е|-ье)?\s+место', t)
    if m:
        return f'За {m.group(1)}-е место'
    if re.search(r'(^|[\s.,])финал(ы|ьн)?', t) and 'плей' not in t:
        return 'Финал'
    return None


def clean_name(n):
    n = re.sub(r'^\s*\d+\s*\.\s*', '', n)
    n = re.sub(r'\s+', ' ', n).strip(' .;,')
    n = re.sub(r'\(\s*мл\.?\s*\)', '(мл)', n)
    n = re.sub(r'\(\s*ст\.?\s*\)', '(ст)', n)
    return n


def parse_lineup(s):
    out = []
    pieces = []
    for part in re.split(r'[;]', s):
        part = re.sub(r'(\d+)\s*/\s*', r'\1.', part.strip())
        sub = re.match(r'^(.*?)\s*\(\s*((?:\d+\s*\.)?\s*[^,()]+?)\s*,\s*(\d+)\s*\)\s*$', part)
        if sub and not re.match(r'^(мл|ст)', sub.group(2)):
            pieces += [sub.group(1), sub.group(2)]  # замена (обычно вратаря) с минутой
        else:
            pieces += re.split(r'\s+(?=\d+\s*\.\s*[А-ЯЁІЇЄA-Z])', part)
    for part in pieces:
        part = part.strip()
        if not part:
            continue
        m = re.match(r'^(\d+)\s*\.\s*(.+)$', part)
        num, name = (m.group(1), m.group(2)) if m else (None, part)
        name = clean_name(name)
        if name and re.search(r'[А-Яа-яЁёІіЇїЄєA-Za-z]', name):
            out.append({'n': name, 'no': int(num) if num else None})
    return out


def parse_cards(s):
    out = []
    for part in s.split(';'):
        part = part.strip()
        if not part:
            continue
        m = re.match(r'^(?P<name>[^,(]+?(?:\s*\((?:мл|ст)\.?\))?)\s*(?:\((?P<team>[^()]*(?:\([^()]*\))?[^()]*)\))?\s*(?:,\s*(?P<min>\d+))?\s*(?P<note>\(.*\))?\s*$', part)
        if m:
            out.append({'n': clean_name(m.group('name')), 'team': (m.group('team') or '').strip() or None,
                        'min': int(m.group('min')) if m.group('min') else None, 'note': (m.group('note') or '').strip('() ') or None})
        else:
            out.append({'n': clean_name(part), 'team': None, 'min': None, 'note': None, 'raw': True})
    return out


def season_of(y, m):
    return f"{y}/{str(y + 1)[2:]}" if m >= 8 else f"{y - 1}/{str(y)[2:]}"


matches, log = [], collections.Counter()
skipped_titles = re.compile(r'(?i)Elite|пляжн')

for post in P:
    L = post['L']
    title = post['t'] or ''
    if skipped_titles.search(title) or skipped_titles.search(' '.join(L[:2])):
        log['skip_post_external'] += 1
        continue
    t_comp = comp_of(title)
    ctx = {'comp': t_comp or 'Чемпионат', 'div': None, 'stage': None}
    i = 0
    cur = None
    goal_mode = False
    while i < len(L):
        l = L[i]
        nxt = L[i + 1] if i + 1 < len(L) else ''
        m = HDR.match(l) or HDR2.match(l)
        if m and DATE.match(nxt):
            d = m.groupdict()
            dm = DATE.match(nxt)
            rest = [x.strip() for x in dm.group('rest').split('.') if x.strip()]
            stage = rest[0] if rest else None
            att = None
            venue = None
            for r in rest[1:]:
                a = re.match(r'^(\d+)\s+зрител', r)
                if a:
                    att = int(a.group(1))
                elif r.lower().startswith(('стадион', 'спорткомплекс', 'ск ')):
                    venue = re.sub(r'^Стадион\s+', '', r)
            y, mo, dd = int(dm.group('y')), int(dm.group('m')), int(dm.group('d'))
            extra = d['extra'] or ''
            pens = None
            pm = re.search(r'(?i)по пенальти\s*[-–:]?\s*(\d+)\s*:\s*(\d+)', extra)
            if pm:
                pens = [int(pm.group(1)), int(pm.group(2))]
            tech = None
            hs, as_ = d['hs'], d['as']
            if not hs.isdigit() or not as_.isdigit():
                tech = (hs.replace('–', '-'), as_.replace('–', '-'))
                hs = as_ = None
            else:
                hs, as_ = int(hs), int(as_)
            comp = ctx['comp']
            stage_raw = stage
            if comp != 'Чемпионат' and ctx['stage'] and (not stage or re.match(r'^\d+ тур$', stage) or stage == 'Харьков'):
                stage = ctx['stage']
            cur = {
                'src': post['d'][:10] + ' ' + title, 'season': season_of(y, mo), 'date': f"{y:04d}-{mo:02d}-{dd:02d}",
                'comp': comp, 'div': ctx['div'], 'stage': stage, 'stage_raw': stage_raw,
                'home': clean_name(d['h']), 'away': clean_name(d['a']), 'hs': hs, 'as': as_,
                'tech': list(tech) if tech else None, 'pens': pens, 'score_note': extra.strip() or None,
                'venue': venue, 'att': att, 'ref': None, 'goals': [], 'lineups': {'home': [], 'away': []},
                'yc': [], 'rc': [], 'missed_pens': None, 'stats': {},
                'tech_result': bool(re.search(r'(?i)техническ', nxt)) or bool(tech),
            }
            matches.append(cur)
            goal_mode = False
            i += 2
            continue
        # заголовки разделов
        if len(l) < 60 and ':' not in l and not DATE.match(l):
            c = comp_of(l)
            lg = LEAGUE.match(l)
            gp = GROUP.match(l)
            sh = stage_hint(l)
            if lg:
                ctx['div'] = lg.group(1).capitalize() + '-лига'
                if ctx['comp'] != 'Чемпионат' and not t_comp:
                    ctx['comp'] = 'Чемпионат'
                cur = None
            elif gp:
                g = gp.group(1).upper()
                ctx['div'] = 'Группа ' + GMAP.get(g, g)
                cur = None
            elif c and len(l) < 60:
                ctx['comp'] = c
                ctx['div'] = None
                ctx['stage'] = sh
                cur = None
            elif sh:
                ctx['div'] = None
                ctx['stage'] = sh
                cur = None
        if cur is None:
            i += 1
            continue
        # строки внутри протокола
        if l.startswith('Судья'):
            cur['ref'] = clean_name(l.split(':', 1)[1]) if ':' in l else None
            goal_mode = False
        elif re.match(r'(?i)^(послематчевые пенальти|серия пенальти)',l):
            goal_mode = False
            cur['shootout'] = []
            j = i + 1
            while j < len(L) and re.match(r'^\d+\s*:\s*\d+\s*[-–]', L[j]):
                cur['shootout'].append(re.sub(r'^\d+\s*:\s*\d+\s*[-–]\s*', '', L[j]).strip()); j += 1
            i = j
            continue
        elif l.startswith('Голы'):
            goal_mode = True
            tail = l.split(':', 1)[1].strip() if ':' in l else ''
            if tail:
                L.insert(i + 1, tail)
        elif goal_mode and (GOAL_A.match(l) or GOAL_B.match(l)):
            g = (GOAL_A.match(l) or GOAL_B.match(l)).groupdict()
            ann = (g['ann'] or '').lower()
            cur['goals'].append({'n': clean_name(g['name']), 'min': int(g['min']) if g['min'] else None,
                                 'x': int(g['x']), 'y': int(g['y']),
                                 'og': 'свои' in ann or 'автогол' in ann, 'pen': 'пенальти' in ann, 'free': 'штраф' in ann or 'метров' in ann})
        elif ':' in l and (l.split(':', 1)[0].strip() in (cur['home'], cur['away']) or
                           clean_name(l.split(':', 1)[0]) in (cur['home'], cur['away'])):
            team = clean_name(l.split(':', 1)[0])
            side = 'home' if team == cur['home'] else 'away'
            if cur['lineups'][side] and team == cur['home'] == cur['away']:
                side = 'away'
            cur['lineups'][side] = parse_lineup(l.split(':', 1)[1])
            goal_mode = False
        elif l.startswith('Предупреждени'):
            cur['yc'] += parse_cards(l.split(':', 1)[1] if ':' in l else '')
            goal_mode = False
        elif l.startswith('Удалени'):
            cur['rc'] += parse_cards(l.split(':', 1)[1] if ':' in l else '')
            goal_mode = False
        elif l.startswith('Незабит'):
            goal_mode = False
            cur.setdefault('missed', [])
            items = []
            tail = l.split(':', 1)[1].strip() if ':' in l else ''
            if tail:
                items += [x.strip() for x in tail.split(';') if x.strip()]
            j = i + 1
            while j < len(L) and MISS.match(L[j]):
                items.append(L[j]); j += 1
            for it in items:
                mm = MISS.match(it)
                if mm:
                    cur['missed'].append({'n': clean_name(mm.group('name')), 'team': mm.group('team').strip(), 'min': int(mm.group('min')) if mm.group('min') else None, 'how': (mm.group('how') or '').strip() or None})
            i = j
            continue
        elif ':' in l and re.match(r'^[^:;]{2,45}:\s*(\d+\s*\.\s*)?[А-ЯЁІЇЄA-Z][^:]*;', l) and not l.startswith(('Голы', 'Судья', 'Предупр', 'Удален', 'Незабит')):
            cur.setdefault('_labels', []).append((clean_name(l.split(':', 1)[0]), l.split(':', 1)[1]))
            goal_mode = False
        elif STAT.match(l):
            sm = STAT.match(l)
            cur['stats'][STATKEY[sm.group(1)]] = [int(sm.group(2)), int(sm.group(3))]
            goal_mode = False
            if sm.group(1) == 'Фолы':
                cur = None
        elif goal_mode:
            log['unparsed_goal_line'] += 1
            log.setdefault('ex_goal', [])
        i += 1

# разрешение неоднозначных заголовков по меткам составов
for m in matches:
    labs = m.pop('_labels', [])
    if not labs:
        continue
    names = [x[0] for x in labs]
    hdr = m['home'] + ' - ' + m['away']
    if len(labs) == 2 and names[0] + ' - ' + names[1] == hdr:
        m['home'], m['away'] = names
        m['lineups'] = {'home': parse_lineup(labs[0][1]), 'away': parse_lineup(labs[1][1])}
        log['header_resolved'] += 1
    else:
        for nm, txt in labs:
            side = 'home' if not m['lineups']['home'] else 'away'
            if not m['lineups'][side]:
                m['lineups'][side] = parse_lineup(txt)
                m.setdefault('label_mismatch', []).append(nm)
        log['label_mismatch'] += 1

# дубликаты: один матч в нескольких постах — берём самый полный
def richness(m):
    return len(m['goals']) * 3 + len(m['lineups']['home']) + len(m['lineups']['away']) + len(m['stats']) + (1 if m['ref'] else 0)

by = collections.OrderedDict()
for m in matches:
    k = (m['date'], m['home'], m['away'])
    if k not in by or richness(m) > richness(by[k]):
        if k in by:
            log['dup_replaced'] += 1
        by[k] = m
    else:
        log['dup_dropped'] += 1
final = list(by.values())

# сезоны: летние матчи (июнь-август) — проверка
for m in final:
    mo = int(m['date'][5:7])
    if mo in (7, 8):
        log['summer_match'] += 1

# проверка голов против счёта
bad = []
for m in final:
    if m['hs'] is None:
        continue
    if m['goals']:
        last = m['goals'][-1]
        if (last['x'], last['y']) != (m['hs'], m['as']) or len(m['goals']) != m['hs'] + m['as']:
            bad.append(m)
    elif m['hs'] + m['as'] > 0:
        log['no_goals_listed'] += 1
log['score_goal_mismatch'] = len(bad)
log['matches'] = len(final)

json.dump(final, open(OUT, 'w'), ensure_ascii=False)
with open(LOG, 'w') as f:
    f.write(json.dumps({k: v for k, v in log.items() if not isinstance(v, list)}, ensure_ascii=False, indent=1) + '\n')
    for m in bad[:60]:
        f.write(f"{m['src']} | {m['date']} {m['home']} - {m['away']} {m['hs']}:{m['as']} goals={len(m['goals'])} last={m['goals'][-1] if m['goals'] else None}\n")
print(open(LOG).read()[:3000])
