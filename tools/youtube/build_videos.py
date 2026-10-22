"""Видео с YouTube-канала турнира -> data/videos.json.

Берёт страницу «Видео» канала (без ключа API YouTube показывает ~30 последних роликов),
находит в названии дату и команды и привязывает ролик к матчу из data/seasons/*.json.
Уже найденные ролики не теряются: новые добавляются к существующему файлу.

Запуск из корня проекта:  python3 tools/youtube/build_videos.py
Можно передать сохранённую страницу канала:  python3 tools/youtube/build_videos.py page.html
"""
import glob
import json
import re
import sys
import urllib.request

CHANNEL = 'https://www.youtube.com/@%D0%A7%D0%B5%D0%BC%D0%BF%D0%B8%D0%BE%D0%BD%D0%B0%D1%82%D0%90%D0%96%D0%98%D0%BF%D0%BE%D1%84%D1%83%D1%82%D0%B7%D0%B0%D0%BB%D1%83-%D0%BC2%D0%BF/videos'
OUT = 'data/videos.json'


def page():
    if len(sys.argv) > 1:
        return open(sys.argv[1], encoding='utf-8').read()
    req = urllib.request.Request(CHANNEL, headers={'User-Agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/126 Safari/537.36', 'Accept-Language': 'uk,ru;q=0.8'})
    return urllib.request.urlopen(req, timeout=30).read().decode('utf-8')


def norm(s):
    return re.sub(r'[^a-zа-яіїєґ0-9]', '', s.lower().replace('ё', 'е'))


def main():
    html = page()
    videos = re.findall(r'"contentId":"([\w-]{11})".*?"lockupMetadataViewModel":\{"title":\{"content":"(.*?)"\}', html)
    matches = {}
    for f in glob.glob('data/seasons/*.json'):
        for m in json.load(open(f, encoding='utf-8'))['matches']:
            matches.setdefault(m['date'], []).append(m)
    try:
        out = json.load(open(OUT, encoding='utf-8'))
    except FileNotFoundError:
        out = {'_comment': 'Видео YouTube-канала турнира по матчам. Создаётся tools/youtube/build_videos.py.', 'matches': {}, 'unmatched': []}
    known = {v['id'] for lst in out['matches'].values() for v in lst} | {v['id'] for v in out['unmatched']}
    added = 0
    for vid, title in videos:
        title = json.loads('"' + title + '"')
        if vid in known:
            continue
        d = re.search(r'(\d{2})[.\s](\d{2})[.\s](\d{4})\s*$', title)
        hit = None
        if d:
            date = f'{d.group(3)}-{d.group(2)}-{d.group(1)}'
            t = norm(title)
            cands = [m for m in matches.get(date, []) if norm(m['home']) in t and norm(m['away']) in t]
            if len(cands) == 1:
                hit = cands[0]
        rec = {'id': vid, 'title': title, 'kind': 'review' if 'обзор' in title.lower() else 'full'}
        if hit:
            out['matches'].setdefault(hit['id'], []).append(rec)
        else:
            out['unmatched'].append(rec)
        added += 1
    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'роликов на странице: {len(videos)}, новых: {added}, матчей с видео: {len(out["matches"])}, не привязано: {len(out["unmatched"])}')
    for v in out['unmatched']:
        print('  не привязано:', v['title'])


main()
