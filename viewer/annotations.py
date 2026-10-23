"""Validated editable annotations; quote anchors never silently attach ambiguously."""
import copy, re

FIELDS={'id','anchor','original','reading','gloss_zh','note_zh','language','source_kind','role','source_ref','status'}
KINDS=('verbatim','romanization','author_gloss','editorial')
ROLES=('language_example','version_comparison','term','explanation')
def u16(s): return len(s.encode('utf-16-le'))//2
def anchor_at(text,quote,start=None):
    if not quote:return {'quote':'','prefix':'','suffix':'','start':0,'end':0,'status':'attached'}
    i=text.find(quote) if start is None else start
    if i<0: return {'quote':quote,'prefix':'','suffix':'','start':0,'end':u16(quote),'status':'orphan'}
    return {'quote':quote,'prefix':text[max(0,i-24):i],'suffix':text[i+len(quote):i+len(quote)+24],'start':u16(text[:i]),'end':u16(text[:i+len(quote)]),'status':'attached'}
def resolve(text,a):
    q=a['quote']
    if not q:return anchor_at(text,'')
    positions=[];i=0
    while True:
        i=text.find(q,i)
        if i<0:break
        positions.append(i);i+=1
    exact=[i for i in positions if (not a['prefix'] or text[:i].endswith(a['prefix'])) and (not a['suffix'] or text[i+len(q):].startswith(a['suffix']))]
    # Preserve an existing orphan until the user explicitly re-associates it.
    if a.get('status')=='orphan':return {**a,'status':'orphan'}
    candidates=exact if len(exact)==1 else positions
    if len(candidates)==1:return anchor_at(text,q,candidates[0])
    return {**a,'status':'orphan'}
def validate_notes(value,text):
    if not isinstance(value,list) or len(value)>100:raise ValueError('invalid_annotations')
    result=[];ids=set()
    for note in value:
        if not isinstance(note,dict) or set(note)-FIELDS:raise ValueError('invalid_annotation')
        item=copy.deepcopy(note);ident=item.get('id')
        if not isinstance(ident,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',ident) or ident in ids:raise ValueError('invalid_annotation_id')
        ids.add(ident)
        for k,limit in [('original',2000),('reading',1000),('gloss_zh',2000),('note_zh',12000),('source_ref',2000)]:
            if not isinstance(item.get(k,''),str) or len(item.get(k,''))>limit or '\0' in item.get(k,''):raise ValueError('invalid_annotation_text')
            item.setdefault(k,'')
        if item.get('language') not in ('en','ja','zh-Hans','mixed'):raise ValueError('invalid_annotation_language')
        if item.get('source_kind') not in KINDS or item.get('role') not in ROLES:raise ValueError('invalid_annotation_kind')
        if item.get('status') not in ('draft','reviewed'):raise ValueError('invalid_annotation_status')
        a=item.get('anchor')
        if not isinstance(a,dict) or set(a)!={'quote','prefix','suffix','start','end','status'}:raise ValueError('invalid_annotation_anchor')
        for k,limit in [('quote',4000),('prefix',100),('suffix',100)]:
            if not isinstance(a[k],str) or len(a[k])>limit or '\0' in a[k]:raise ValueError('invalid_annotation_anchor')
        if a['status'] not in ('attached','orphan') or any(type(a[k])!=int or a[k]<0 or a[k]>40000 for k in ('start','end')) or a['end']<a['start']:raise ValueError('invalid_annotation_anchor')
        item['anchor']=resolve(text,a);result.append(item)
    return result
