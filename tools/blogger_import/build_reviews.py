"""Обзоры туров из блога: авторские тексты с подписью автора, по сезонам."""
import json, re, sys, os, collections, html as H

SRC, PROJ = sys.argv[1], sys.argv[2]
posts = json.load(open(SRC))
SKIP_TITLE = re.compile(r'(?i)регистрац|расписани|жеребьевк|формат и|перенос|дозаявк|изменени|статистик|обновлен|прием заявок|^сезон|elite|пляжн|итоги жеребьевки|поддержка для|извинени')
NAME = re.compile(r'^([А-ЯЁ][а-яё]+)\s+([А-ЯЁ][А-ЯЁа-яё]+)$')
KNOWN = {'Bagrat': 'Баграт Гурджян', 'Sergey': 'Сергей Логачев', 'А.Котуков': 'Александр Котуков'}


def season_of(d):
    y, m = int(d[:4]), int(d[5:7])
    return f"{y}-{str(y + 1)[2:]}" if m >= 8 else f"{y - 1}-{str(y)[2:]}"


def norm_sig(s):
    m = NAME.match(s.strip())
    if not m:
        return None
    a, b = m.group(1), m.group(2)
    return a + ' ' + b[0] + b[1:].lower()


out = collections.defaultdict(list)
stats = collections.Counter()
for p in sorted(posts, key=lambda x: x['d']):
    if p['prot'] or p['words'] < 250 or SKIP_TITLE.search(p['t'] or ''):
        continue
    L = [l for l in p['L'] if l.strip()]
    text_lines = [l for l in L if '|' not in l]
    if len(text_lines) < 3:
        continue
    # подпись: строка-имя в конце или в начале; «от Баграта Гурджяна» в заголовке
    author = None
    for idx in list(range(len(L) - 1, max(-1, len(L) - 5), -1)) + [0, 1]:
        if 0 <= idx < len(L):
            s = norm_sig(L[idx])
            if s:
                author = s
                L = L[:idx] + L[idx + 1:]
                break
    if not author and re.search(r'от\s+Баграта\s+Гурджяна', p['t'] or ''):
        author = 'Баграт Гурджян'
    if author == 'Сергей Логачев' or author == 'Баграт Гурджян' or author == 'Александр Котуков':
        pass
    blog_account = p['author']
    if not author and blog_account in KNOWN:
        # учётная запись автора в блоге, но без подписи в тексте
        author_src = 'учётная запись в блоге'
        author = KNOWN[blog_account] if blog_account != 'Bagrat' else 'Баграт Гурджян'
    else:
        author_src = 'подпись в тексте' if author else None
    paras = []
    for l in L:
        if '|' in l:
            continue
        paras.append(l)
    sid = season_of(p['d'])
    rid = p['d'][:10] + '-' + str(len(out[sid]) + 1)
    out[sid].append({'id': rid, 'date': p['d'][:10], 'title': (p['t'] or '').strip() or 'Без названия', 'author': author,
                     'author_source': author_src, 'paras': paras})
    stats['author' if author else 'no_author'] += 1
os.makedirs(f'{PROJ}/data/reviews', exist_ok=True)
index = {}
for sid, items in out.items():
    json.dump({'season': sid, 'source': 'Блог media-soccer.org', 'reviews': items}, open(f'{PROJ}/data/reviews/{sid}.json', 'w'), ensure_ascii=False, indent=0)
    index[sid] = [{'id': r['id'], 'date': r['date'], 'title': r['title'], 'author': r['author']} for r in items]
json.dump(index, open(f'{PROJ}/data/reviews/index.json', 'w'), ensure_ascii=False, indent=0)
print(stats, {k: len(v) for k, v in sorted(out.items())})
print(collections.Counter(r['author'] for v in out.values() for r in v))
