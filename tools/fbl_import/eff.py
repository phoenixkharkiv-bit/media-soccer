"""Чтение экспорта программы «Футбольные чемпионаты» (*.eff) в понятный вид.

Формат разобран по 22 файлам архива (2003–2011). Кодировка cp1251, строки в стиле Pascal:
байт длины и буфер фиксированного размера (после длины в буфере остаётся мусор от прежних значений).

Заголовок, 28 байт: u32 метка, u32 матчей (n), u32 голов (g), u32 незабитых пенальти (a),
u32 ударов в сериях пенальти (b), два u32 нуля.

1. Матчи, n записей по 300 байт (последняя в файле короче на 12 байт):
   @0 дата (u32, порядковый день, datetime.date.fromordinal), @4 зрители (u32),
   @8 судья str[31], @0x28 хозяева str[31], @0x47 гости str[31], @0x66 / @0x67 счёт,
   @0xd1 стадия плей-офф (4 — 1/4, 3 — 1/2, 2 — за 3-е место, 1 — финал, 0 — нет),
   @0xd2 тур, @0xd4 была серия пенальти (1), @0xd5 город str[31], @0xf4 место str[31],
   @0x113 статистика, пары (хозяева, гости): угловые, фолы, удары, в створ, штанги; 255 — нет данных.
2. Составы: по 2 блока на матч (хозяева, гости), блок — 25 мест по 72 байта.
   Место: 4 байта хвоста предыдущего места, затем @4 игрок str[31], @36 сыграно минут,
   @38 предупреждение, @40 удаление, @43 кем заменён str[28].
   Минута предупреждения лежит в байте 2 следующего места (то есть @74 от начала места).
3. Голы, g записей по 164 байта; перед каждой записью u16 — номер матча (с нуля):
   @0 команда, которой засчитан гол, str[31], @31 соперник, @62 автор, @93 голевой пас,
   автор «Технический гол» — так программа записывает технический результат;
   @155 минута, флаги @156 пенальти, @157 автогол, @158 «штрафной» (так эти голы подписаны в блоге,
   проверено по сезону 2010/11), @159 ни разу не встречается.
4. Незабитые пенальти, a записей по 98 байт: @0 номер матча (u16, с нуля), @2 игрок str[31],
   @33 его команда, @64 соперник, @95 минута, @96 исход (1 — вратарь, 2 — штанга, 3 — мимо).
5. Серии пенальти (в кубках), b записей по 97 байт: @0 номер матча (u16), @2 номер удара,
   @3 команда str[31], @34 соперник str[31], @65 результат (0 — забит, иначе как в п. 4),
   @66 игрок str[31].

Запуск: python3 eff.py файл.eff > файл.json
"""
import struct, datetime, sys, json

STAGE = {4: '1/4 финала', 3: '1/2 финала', 2: 'За 3-е место', 1: 'Финал'}
MISS = {0: 'забит', 1: 'вратарь', 2: 'штанга', 3: 'мимо'}


def read_raw(path):
    d = open(path, 'rb').read()

    def ps(o):
        n = d[o]
        return d[o + 1:o + 1 + n].decode('cp1251').strip() if 0 < n <= 30 else ''

    n, g, a, b = struct.unpack('<4I', d[4:20])
    M0, MR, LB, LS, GR = 0x1c, 300, 1800, 72, 164
    L0 = M0 + n * MR - 12
    G0 = L0 + n * 2 * LB + 6
    P0 = G0 + g * GR - 2
    S0 = P0 + a * 98

    matches = []
    for k in range(n):
        o = M0 + k * MR
        r = d[o:o + MR]
        st = [None if v == 255 else v for v in r[0x113:0x11d]]
        m = {
            'n': k,
            'date': datetime.date.fromordinal(struct.unpack('<I', r[0:4])[0]).isoformat(),
            'round': r[0xd2],
            'stage': STAGE.get(r[0xd1]),
            'home': ps(o + 0x28), 'away': ps(o + 0x47),
            'score': [r[0x66], r[0x67]],
            'shootout': bool(r[0xd4]), 'technical': False,
            'referee': ps(o + 8) or None,
            'attendance': struct.unpack('<I', r[4:8])[0] or None,
            'city': ps(o + 0xd5) or None, 'venue': ps(o + 0xf4) or None,
            'stats': {'corners': [st[0], st[1]], 'fouls': [st[2], st[3]], 'shots': [st[4], st[5]],
                      'on_target': [st[6], st[7]], 'woodwork': [st[8], st[9]]},
            'lineups': {'home': [], 'away': []}, 'goals': [], 'missed_pens': [], 'shootout_kicks': [],
        }
        for bi, side in ((0, 'home'), (1, 'away')):
            base = L0 + (2 * k + bi) * LB
            for s in range(25):
                so = base + s * LS
                name = ps(so + 4)
                if not name:
                    continue
                m['lineups'][side].append({
                    'player': name, 'minutes': d[so + 36] or None,
                    'yellow': bool(d[so + 38]), 'yellow_min': (d[so + LS + 2] or None) if d[so + 38] else None,
                    'red': bool(d[so + 40]),
                    'replaced_by': ps(so + 43) or None,
                })
        matches.append(m)

    notes = []
    for i in range(g):
        o = G0 + i * GR
        mi = struct.unpack('<H', d[o - 2:o])[0]
        team, opp = ps(o), ps(o + 31)
        m = matches[mi] if mi < n else None
        if not m or {team, opp} != {m['home'], m['away']}:
            # номер матча устарел (матчи переставляли в программе): ищем по паре команд
            cands = [x for x in matches if {team, opp} == {x['home'], x['away']}
                     and len(x['goals']) < sum(x['score'])]
            if not cands:
                raise ValueError(f'гол {i}: не найден матч {team} — {opp}')
            m = min(cands, key=lambda x: abs(x['n'] - mi))
            notes.append(f'гол {i} ({team} — {opp}) записан к матчу {mi}, отнесён к матчу {m["n"]}')
        kind = 'own_goal' if d[o + 157] else 'penalty' if d[o + 156] else 'shtrafnoy' if d[o + 158] \
            else 'flag159' if d[o + 159] else None
        if ps(o + 62) == 'Технический гол':
            kind = 'technical'
            m['technical'] = True
        m['goals'].append({'team': team, 'side': 'home' if team == m['home'] else 'away',
                           'player': ps(o + 62), 'assist': ps(o + 93) or None,
                           'minute': d[o + 155] or None, 'kind': kind})
    for k in range(a):
        o = P0 + k * 98
        mi = struct.unpack('<H', d[o:o + 2])[0]
        matches[mi]['missed_pens'].append({'player': ps(o + 2), 'team': ps(o + 33), 'minute': d[o + 95] or None,
                                           'outcome': MISS.get(d[o + 96], d[o + 96])})
    for k in range(b):
        o = S0 + k * 97
        mi = struct.unpack('<H', d[o:o + 2])[0]
        matches[mi]['shootout_kicks'].append({'kick': d[o + 2], 'team': ps(o + 3), 'player': ps(o + 66),
                                              'result': MISS.get(d[o + 65], d[o + 65])})
    for m in matches:
        if len(m['goals']) != sum(m['score']):
            raise ValueError(f'матч {m["n"]}: голов {len(m["goals"])}, а счёт {m["score"]}')
        # программа хранит голы по командам, а не по ходу матча
        m['goals'].sort(key=lambda x: x['minute'] if x['minute'] is not None else 99)
    return {'file': path.rsplit('/', 1)[-1], 'notes': notes, 'counts': {'matches': n, 'goals': g, 'missed_pens': a, 'shootout_kicks': b},
            'matches': matches}


if __name__ == '__main__':
    json.dump(read_raw(sys.argv[1]), sys.stdout, ensure_ascii=False, indent=1)
