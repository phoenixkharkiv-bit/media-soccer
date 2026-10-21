import xml.etree.ElementTree as E, json, sys, re, html
ns={'a':'http://www.w3.org/2005/Atom','b':'http://schemas.google.com/blogger/2018'}
r=E.parse(sys.argv[1]).getroot()
out=[]
for e in r.findall('a:entry',ns):
    t=e.find('b:type',ns).text; st=e.find('b:status',ns).text
    if t not in('POST','PAGE'): continue
    c=e.find('a:content',ns); c=c.text or '' if c is not None else ''
    d={'type':t,'status':st,'title':(e.find('a:title',ns).text or ''),
       'published':(e.findtext('a:published',default='',namespaces=ns)),
       'updated':e.findtext('a:updated',default='',namespaces=ns),
       'tags':[x.get('term') for x in e.findall('a:category',ns)],
       'filename':e.findtext('b:filename',default='',namespaces=ns),
       'html':c}
    out.append(d)
json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False)
print(len(out))
