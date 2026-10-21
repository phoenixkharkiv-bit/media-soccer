"""Чтение файлов программы «Футбольные чемпионаты» (.fbl). Формат восстановлен по файлу 2015/16, бренд-лига."""
import struct, datetime, sys, json, re


def pstr(d, o, maxlen=40):
    L = d[o]
    if L == 0 or L > maxlen:
        return None
    try:
        t = d[o + 1:o + 1 + L].decode('cp1251')
    except UnicodeDecodeError:
        return None
    if not re.fullmatch(r"[0-9A-Za-zА-Яа-яЁёІіЇїЄєҐґ\-\.\(\)'\" _/,]+", t):
        return None
    return t


def read(path):
    d = open(path, 'rb').read()
    out = {'title': pstr(d, 1, 60)}
    nteams = struct.unpack('<H', d[0x34:0x36])[0]
    # команды: записи начинаются после заголовка; ищем последовательность [id 2][len][name]
    teams = {}
    o = 0x7c
    # первая команда: id=0 у len-байта 0x7f
    o = 0x7e
    for k in range(nteams):
        tid = struct.unpack('<H', d[o - 2:o])[0]
        teams[tid] = pstr(d, o, 30)
        o += 0x27  # 39 байт
    out['teams'] = teams
    # матчи: запись 122 байта; [id 2][4 байта][дата 4]...
    matches = []
    o = 0x193
    while 730000 < struct.unpack('<I', d[o:o + 4])[0] < 740000:
        r = d[o - 6:o + 116]
        mid = struct.unpack('<H', r[0:2])[0]
        dt = datetime.date.fromordinal(struct.unpack('<I', r[6:10])[0]).isoformat()
        att = struct.unpack('<I', r[10:14])[0]
        ref = struct.unpack('<H', r[14:16])[0]
        h, a = struct.unpack('<HH', r[17:21])
        hs, as_ = r[21], r[22]
        tail = r[88:122]
        rnd = tail[15]
        st = tail[20:30]
        matches.append({'mid': mid, 'date': dt, 'att': att, 'ref_id': ref, 'h': h, 'a': a, 'hs': hs, 'as': as_, 'round': rnd,
                        'raw_tail': tail.hex(),
                        'stats': {'corners': [st[0], st[1]], 'fouls': [st[2], st[3]], 'shots': [st[4], st[5]], 'on_target': [st[6], st[7]], 'woodwork': [st[8], st[9]]}})
        o += 122
    out['matches'] = matches
    mids = {m['mid'] for m in matches}
    # события (голы): запись 30 байт после матчей
    ev = []
    o += 6 - 6  # o указывает на дату следующей записи; события начинаются с id
    o = o - 6 + 6
    # найти начало: id события 4 байта, затем матч
    o = matches_end = o - 6 + 2
    # поиск первой записи события: [eid u32][mid u16][team u16][opp u16][pid u16]
    s = matches_end
    while s < matches_end + 64:
        eid, mid, tm, op = struct.unpack('<IHHH', d[s:s + 10])
        if 0 < eid < 100000 and mid in mids and tm in teams and op in teams and tm != op:
            break
        s += 1
    o = s
    while True:
        eid, mid, tm, op, pid = struct.unpack('<IHHHH', d[o:o + 12])
        if mid not in mids or tm not in teams:
            break
        ev.append({'eid': eid, 'mid': mid, 'team': tm, 'opp': op, 'pid': pid, 'min': d[o + 22], 'raw': d[o + 12:o + 30].hex()})
        o += 30
    out['events'] = ev
    out['_events_end'] = o
    # игроки: [id 2][00 00][len][name 30][team 2]...[номер 1] = 49 байт
    m = None
    for mm in re.finditer(rb'[\x04-\x1e][\xc0-\xff]', d[o:]):
        p = o + mm.start()
        nm = pstr(d, p, 30)
        if nm and ' ' in nm and pstr(d, p + 49, 30):
            m = p
            break
    players = {}
    p = m
    while p and pstr(d, p, 30):
        pid = struct.unpack('<H', d[p - 4:p - 2])[0]
        players[pid] = {'name': pstr(d, p, 30), 'team': struct.unpack('<h', d[p + 31:p + 33])[0], 'num': d[p + 44]}
        p += 49
    out['players'] = players
    out['_players_end'] = p
    # составы: блоки 454 байта [mid][team] + 25 записей по 18 байт
    lineups = []
    q = p - 8
    mt = {m['mid']: (m['h'], m['a']) for m in matches}

    def ok(x):
        mid, tm = struct.unpack('<HH', d[x:x + 4])
        if mid not in mt or tm not in mt[mid]:
            return False
        pid = struct.unpack('<H', d[x + 4:x + 6])[0]
        return pid in players or not any(d[x + 4:x + 22])

    while q < p + 400 and not (ok(q) and any(d[q + 4:q + 22])):
        q += 1
    while q + 454 <= len(d):
        if not ok(q):
            for dlt in (2, -2, 1, -1, 4, -4, 6, -6):
                if ok(q + dlt):
                    q += dlt
                    break
            else:
                break
        mid, tm = struct.unpack('<HH', d[q:q + 4])
        ents = []
        for k in range(25):
            e = d[q + 4 + 18 * k:q + 22 + 18 * k]
            if not any(e):
                break
            pid = struct.unpack('<H', e[:2])[0]
            ents.append({'pid': pid, 'mins': e[5], 'yc': e[7], 'num': e[11], 'yc_min': e[16], 'raw': e[2:].hex()})
        lineups.append({'mid': mid, 'team': tm, 'players': ents})
        q += 454
    out['lineups'] = lineups
    out['_lineups_end'] = q
    # судьи/стадионы — строки после составов
    out['strings_after'] = []
    for mm in re.finditer(rb'[\x04-\x28][\xc0-\xff]', d[q:]):
        pp = q + mm.start()
        s_ = pstr(d, pp, 40)
        if s_ and re.fullmatch(r"[А-ЯЁа-яё\- \.\"']+", s_) and len(s_) == d[pp]:
            out['strings_after'].append((pp, s_))
    return out


if __name__ == '__main__':
    r = read(sys.argv[1])
    print(r['title'], r['teams'])
    print('matches', len(r['matches']), 'events', len(r['events']), 'players', len(r['players']), 'lineups', len(r['lineups']))
    print(r['strings_after'][:20])
