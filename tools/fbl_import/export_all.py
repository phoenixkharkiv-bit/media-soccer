"""Перевод всех файлов *.eff из папки в читаемый вид.

Запуск: python3 export_all.py папка_с_eff папка_результата
В результате:
  all.json        всё в одном файле: список турниров со всеми матчами
  fbl.sqlite      то же самое одной базой SQLite (таблицы как в csv/)
  json/<файл>.json  по турниру на файл
  csv/*.csv       общие таблицы (UTF-8 с BOM, открываются в Excel)
  index.json      список файлов
"""
import sys, os, json, csv, glob, sqlite3
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from eff import read_raw

# к какому сезону и турниру относится файл (предложение; названия турниров как на сайте)
FILES = {
    '2003': ('2003', 'Чемпионат АЖИ 2003'),
    '2003-2004': ('2003/04', 'Чемпионат АЖИ'),
    'cup_2004': ('2003/04', 'Кубок АЖИ'),
    '2004-2005': ('2004/05', 'Открытый Чемпионат АЖИ'),
    '2005-2006': ('2005/06', 'Чемпионат АЖИ'),
    '2006-2007': ('2006/07', 'Чемпионат АЖИ'),
    '2007': ('2007', 'Чемпионат АЖИ 2007'),
    '2007-2008_m': ('2007/08', 'Медиа-лига'),
    '2007-2008_b': ('2007/08', 'Бренд-лига'),
    'cup_2007-2008': ('2007/08', 'Кубок АЖИ'),
    'champions_2008': ('2007/08', 'Лига Чемпионов'),
    'hope_2008': ('2007/08', 'Кубок Надежды'),
    'league_cup_2008': ('2007/08', 'Кубок Лиги'),
    '2008-2009': ('2008/09', 'Чемпионат АЖИ'),
    'cup_2009': ('2008/09', 'Кубок АЖИ'),
    'hope_2009': ('2008/09', 'Кубок Надежды'),
    '2009-2010': ('2009/10', 'Чемпионат АЖИ'),
    'cup_2010': ('2009/10', 'Кубок АЖИ'),
    'hope_2010': ('2009/10', 'Кубок Надежды'),
    '2010-2011': ('2010/11', 'Чемпионат АЖИ'),
    'cup_2011': ('2010/11', 'Кубок АЖИ'),
    'hope_2011': ('2010/11', 'Кубок Надежды'),
}
KIND = {None: '', 'penalty': 'пенальти', 'own_goal': 'автогол', 'shtrafnoy': '10-метровый', 'technical': 'технический',
        'flag159': 'неизвестная отметка'}


def main(src, out):
    os.makedirs(f'{out}/json', exist_ok=True)
    os.makedirs(f'{out}/csv', exist_ok=True)
    tables = {k: [] for k in ('matches', 'goals', 'lineups', 'cards', 'missed_pens', 'shootouts')}
    index = []
    raws = []
    order = list(FILES)
    for path in sorted(glob.glob(f'{src}/*.eff'), key=lambda p: (order.index(os.path.basename(p)[:-4]) if os.path.basename(p)[:-4] in order else 99, p)):
        key = os.path.basename(path)[:-4]
        season, tour = FILES.get(key, ('?', '?'))
        raw = read_raw(path)
        raw['season'], raw['tournament'] = season, tour
        json.dump(raw, open(f'{out}/json/{key}.json', 'w'), ensure_ascii=False, indent=1)
        raws.append(raw)
        ms = raw['matches']
        index.append({'file': key + '.eff', 'season': season, 'tournament': tour, 'from': ms[0]['date'], 'to': ms[-1]['date'],
                      'teams': sorted({m['home'] for m in ms} | {m['away'] for m in ms}), **raw['counts'], 'notes': raw['notes']})
        for m in ms:
            mid = f'{key}-{m["n"] + 1:03d}'
            base = {'file': key, 'season': season, 'tournament': tour, 'match_id': mid}
            st = m['stats']
            tables['matches'].append({**base, 'date': m['date'], 'round': m['round'], 'stage': m['stage'] or '',
                                      'home': m['home'], 'away': m['away'], 'home_goals': m['score'][0], 'away_goals': m['score'][1],
                                      'shootout': 'да' if m['shootout'] else '', 'technical': 'да' if m['technical'] else '', 'referee': m['referee'] or '', 'attendance': m['attendance'] or '',
                                      'venue': m['venue'] or '', 'city': m['city'] or '',
                                      **{f'{k}_{s}': '' if st[k][i] is None else st[k][i] for k in st for i, s in ((0, 'home'), (1, 'away'))}})
            for g in m['goals']:
                tables['goals'].append({**base, 'date': m['date'], 'minute': g['minute'] or '', 'player': g['player'], 'team': g['team'],
                                        'opponent': m['away'] if g['side'] == 'home' else m['home'], 'kind': KIND[g['kind']], 'assist': g['assist'] or ''})
            for side in ('home', 'away'):
                team = m[side]
                for p in m['lineups'][side]:
                    tables['lineups'].append({**base, 'date': m['date'], 'team': team, 'player': p['player'], 'minutes': p['minutes'] or '',
                                              'replaced_by': p['replaced_by'] or ''})
                    if p['yellow']:
                        tables['cards'].append({**base, 'date': m['date'], 'team': team, 'player': p['player'], 'card': 'жёлтая', 'minute': p['yellow_min'] or ''})
                    if p['red']:
                        tables['cards'].append({**base, 'date': m['date'], 'team': team, 'player': p['player'], 'card': 'красная', 'minute': ''})
            for p in m['missed_pens']:
                tables['missed_pens'].append({**base, 'date': m['date'], 'minute': p['minute'] or '', 'player': p['player'], 'team': p['team'], 'outcome': p['outcome']})
            for p in m['shootout_kicks']:
                tables['shootouts'].append({**base, 'date': m['date'], 'kick': p['kick'], 'team': p['team'], 'player': p['player'], 'result': p['result']})
    for name, rows in tables.items():
        with open(f'{out}/csv/{name}.csv', 'w', newline='', encoding='utf-8-sig') as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
    json.dump(index, open(f'{out}/index.json', 'w'), ensure_ascii=False, indent=1)
    json.dump({'about': 'Архив программы «Футбольные чемпионаты», 2003–2011. Описание — в README.md.',
               'tournaments': raws}, open(f'{out}/all.json', 'w'), ensure_ascii=False)
    db = f'{out}/fbl.sqlite'
    if os.path.exists(db):
        os.remove(db)
    con = sqlite3.connect(db)
    for name, rows in tables.items():
        cols = list(rows[0].keys())
        con.execute(f'CREATE TABLE {name} ({", ".join(cols)})')
        con.executemany(f'INSERT INTO {name} VALUES ({", ".join("?" * len(cols))})', [[r[c] for c in cols] for r in rows])
    con.execute('CREATE TABLE files (file, season, tournament, date_from, date_to, matches, goals)')
    con.executemany('INSERT INTO files VALUES (?,?,?,?,?,?,?)',
                    [(i['file'], i['season'], i['tournament'], i['from'], i['to'], i['matches'], i['goals']) for i in index])
    con.commit()
    con.close()
    return index, {k: len(v) for k, v in tables.items()}


if __name__ == '__main__':
    idx, counts = main(sys.argv[1], sys.argv[2])
    print(len(idx), 'файлов', counts)
