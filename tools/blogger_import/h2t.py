import re,html
def lines(h):
    h=re.sub(r'(?is)<(script|style).*?</\1>','',h)
    if re.search(r'(?i)<(br|p|div)\b',h):
        h=re.sub(r'\s*\n\s*',' ',h)
    h=re.sub(r'(?i)</?(p|div|br|tr|h\d|li|table|tbody|ul|ol)\b[^>]*>','\n',h)
    h=re.sub(r'(?i)</t[dh]>',' | ',h)
    h=re.sub(r'<[^>]+>','',h); h=html.unescape(h)
    h=h.replace('\xa0',' ').replace('​','')
    out=[]
    for l in h.split('\n'):
        l=re.sub(r'[ \t]+',' ',l).strip()
        if l: out.append(l)
    return out
