"""Versioned, lossless page bundles. Imported data cannot replace source scans/OCR."""
from pathlib import Path
import copy, json, math, os, secrets
from datetime import datetime, timezone

FORMAT='undertale-study'
VERSION=2
from annotations import validate_notes
LAYOUT_KEYS={'bbox','font_size','line_height','font_weight','background','text_align','style','break_after','column_gap','keep_phrases','color','mask_color','resize_anchor','snap_to_guides','auto_height','flow_after','gap_before','limit_bottom'}
def number(x,lo,hi):return type(x) in (int,float) and math.isfinite(x) and lo<=x<=hi
def validate_spans(text,spans):
    if not isinstance(spans,list) or len(spans)>2000:raise ValueError('invalid_spans')
    length=len(text.encode('utf-16-le'))//2
    boundaries={0};offset=0
    for c in text:offset+=len(c.encode('utf-16-le'))//2;boundaries.add(offset)
    previous=0
    for s in spans:
        if not isinstance(s,dict) or set(s)-{'start','end','italic','lang'}:raise ValueError('invalid_span')
        start,end=s.get('start'),s.get('end')
        if type(start)!=int or type(end)!=int or start not in boundaries or end not in boundaries or not previous<=start<end<=length:raise ValueError('invalid_span_range')
        if 'italic' in s and type(s['italic'])!=bool:raise ValueError('invalid_italic')
        if s.get('lang','zh-Hans') not in ('zh-Hans','en','ja'):raise ValueError('invalid_language')
        previous=end
    return copy.deepcopy(spans)
def validate_layout(layout):
    if not isinstance(layout,dict) or set(layout)-LAYOUT_KEYS:raise ValueError('invalid_layout')
    bbox=layout.get('bbox')
    if not isinstance(bbox,list) or len(bbox)!=4 or not all(number(x,0,1) for x in bbox):raise ValueError('invalid_bbox')
    if bbox[2]-bbox[0]<.01 or bbox[3]-bbox[1]<.005:raise ValueError('invalid_bbox_order')
    if not number(layout.get('font_size'),8,50):raise ValueError('invalid_font')
    if not number(layout.get('line_height'),1,2.5):raise ValueError('invalid_line_height')
    if 'font_weight' in layout and layout['font_weight'] not in (400,450,700,750):raise ValueError('invalid_weight')
    if layout.get('text_align','left') not in ('left','center','right','justify'):raise ValueError('invalid_alignment')
    import re
    for key in ('color','mask_color','background'):
        if key in layout and layout[key]!='transparent' and not re.fullmatch(r'#[0-9a-fA-F]{6}',layout[key]):raise ValueError('invalid_color')
    if 'column_gap' in layout and not number(layout['column_gap'],0,200):raise ValueError('invalid_gap')
    if 'style' in layout and layout['style']!='chapter-heading':raise ValueError('invalid_style')
    if 'break_after' in layout and (not isinstance(layout['break_after'],str) or len(layout['break_after'])>1000):raise ValueError('invalid_break')
    phrases=layout.get('keep_phrases',[])
    if not isinstance(phrases,list) or len(phrases)>100 or any(not isinstance(x,str) or not 0<len(x)<=200 for x in phrases):raise ValueError('invalid_phrases')
    if layout.get('resize_anchor','left') not in ('left','center','right'):raise ValueError('invalid_anchor')
    for key in ('snap_to_guides','auto_height'):
        if key in layout and type(layout[key])!=bool:raise ValueError('invalid_layout_flag')
    if 'flow_after' in layout and (not isinstance(layout['flow_after'],str) or len(layout['flow_after'])>100 or not layout.get('auto_height')):raise ValueError('invalid_flow')
    if 'gap_before' in layout and not number(layout['gap_before'],0,100):raise ValueError('invalid_paragraph_gap')
    if 'limit_bottom' in layout and not number(layout['limit_bottom'],0,1):raise ValueError('invalid_flow_limit')
    return copy.deepcopy(layout)
def validate_reconstruction(page):
    import re
    w,h=page['reference_size']
    def color(value):return isinstance(value,str) and re.fullmatch(r'#[0-9a-fA-F]{6}',value)
    for b in page.get('blocks',[]):
        mark=b.get('source',{}).get('quote_mark')
        if mark is None:continue
        if b.get('kind')!='quote' or not isinstance(mark,dict) or set(mark)!={'bbox','offset'}:raise ValueError('invalid_quote_mark')
        box=mark['bbox'];offset=mark['offset']
        if not isinstance(box,list) or len(box)!=4 or not all(number(v,0,1) for v in box) or not 0<box[2]-box[0]<.08 or not 0<box[3]-box[1]<.05:raise ValueError('invalid_quote_mark_bbox')
        if not isinstance(offset,list) or len(offset)!=2 or not number(offset[0],-120,-1) or not number(offset[1],-20,50):raise ValueError('invalid_quote_mark_offset')
    for key in ('erase_regions','vector_shapes'):
        values=page.get(key,[])
        if not isinstance(values,list) or len(values)>1000:raise ValueError('invalid_reconstruction')
        for s in values:
            if not isinstance(s,dict):raise ValueError('invalid_reconstruction')
            if s.get('type')=='rect':
                box=s.get('bbox')
                if set(s)-{'type','bbox','fill'} or not isinstance(box,list) or len(box)!=4 or not all(number(v,0,h if i%2 else w) for i,v in enumerate(box)) or box[2]<=box[0] or box[3]<=box[1] or not color(s.get('fill','#ffffff')):raise ValueError('invalid_reconstruction_rect')
            elif key=='vector_shapes' and s.get('type')=='line':
                pts=s.get('points')
                if set(s)-{'type','points','stroke','stroke_width'} or not isinstance(pts,list) or len(pts)!=2 or any(not isinstance(p,list) or len(p)!=2 or not number(p[0],0,w) or not number(p[1],0,h) for p in pts) or not color(s.get('stroke','#555555')) or not number(s.get('stroke_width',1),.1,10):raise ValueError('invalid_reconstruction_line')
            else:raise ValueError('invalid_reconstruction_type')

def patch_page(old,incoming):
    validate_reconstruction(old)
    if not isinstance(incoming,dict) or incoming.get('revision')!=old['revision']:raise ValueError('revision_conflict')
    blocks=incoming.get('blocks')
    if not isinstance(blocks,list) or len(blocks)!=len(old['blocks']):raise ValueError('invalid_blocks')
    if any(not isinstance(b,dict) for b in blocks):raise ValueError('invalid_blocks')
    if {b.get('id') for b in blocks}!={b['id'] for b in old['blocks']}:raise ValueError('invalid_ids')
    result=copy.deepcopy(old);indexed={b['id']:b for b in result['blocks']}
    for b in blocks:
        text=b.get('text')
        if not isinstance(text,str) or len(text)>20000 or '\x00' in text:raise ValueError('invalid_text')
        target=indexed[b['id']];layout=validate_layout(b.get('layout'))
        if layout.get('font_weight')==750 and target['kind'] not in ('heading','subheading'):raise ValueError('invalid_weight_for_body')
        spans=validate_spans(text,b.get('spans',target['translation'].get('spans',[]) if text==target['translation']['text'] else []))
        if text!=target['translation']['text'] or spans!=target['translation'].get('spans',[]):target['translation']['status']='draft'
        target['translation']['text']=text
        if 'spans' in b or 'spans' in target['translation']:target['translation']['spans']=spans
        target['layout']=layout
        if 'annotations' in b or 'annotations' in target:
            target['annotations']=validate_notes(b.get('annotations',target.get('annotations',[])),text)
            result['schema_version']=3
    for b in result['blocks']:
        seen={b['id']};parent=b['layout'].get('flow_after')
        while parent:
            if parent not in indexed or parent in seen:raise ValueError('invalid_flow_chain')
            seen.add(parent);parent=indexed[parent]['layout'].get('flow_after')
    return result

def bundle(pages,source_sha256):
    return {'format':FORMAT,'version':VERSION,'created_at':datetime.now(timezone.utc).isoformat(),'book':{'source_sha256':source_sha256},'pages':copy.deepcopy(pages)}
def import_pages(data,current,source_sha256,expected=None):
    if not isinstance(data,dict) or data.get('format')!=FORMAT or data.get('version') not in (1,VERSION):raise ValueError('unsupported_format')
    if data.get('book',{}).get('source_sha256')!=source_sha256:raise ValueError('different_book')
    incoming=data.get('pages')
    if not isinstance(incoming,list) or not 1<=len(incoming)<=len(current):raise ValueError('invalid_pages')
    seen=set();result=[]
    for page in incoming:
        if not isinstance(page,dict):raise ValueError('invalid_page')
        n=page.get('pdf_page')
        if type(n)!=int or n not in current or n in seen:raise ValueError('unknown_or_duplicate_page')
        seen.add(n);old=current[n]
        if expected is not None and expected.get(str(n))!=old['revision']:raise ValueError('revision_conflict')
        if page.get('schema_version') not in (1,2,3):raise ValueError('unsupported_page_version')
        for key in ('reference_size','image_url','image_sha256','physical_size_pt','raw_ocr_ref'):
            if page.get(key)!=old.get(key):raise ValueError('source_metadata_changed')
        validate_reconstruction(page)
        for key in ('erase_regions','vector_shapes'):
            if page.get(key,[])!=old.get(key,[]):raise ValueError('reconstruction_metadata_changed')
        blocks=page.get('blocks')
        if not isinstance(blocks,list):raise ValueError('invalid_blocks')
        # Older saved bundles predate editable running footers. Preserve those additions.
        ids=[b.get('id') for b in blocks if isinstance(b,dict)]
        if len(ids)!=len(blocks) or len(set(ids))!=len(ids):raise ValueError('invalid_ids')
        missing=[b for b in old['blocks'] if b['id'] not in ids]
        if any(b.get('structure',{}).get('role')!='running-footer' for b in missing):raise ValueError('invalid_blocks')
        indexed={b['id']:b for b in old['blocks']};patches=[]
        for b in blocks:
            if not isinstance(b,dict) or b.get('id') not in indexed:raise ValueError('invalid_ids')
            original=indexed[b['id']]
            expected_source=copy.deepcopy(original['source'])
            if 'quote_mark' not in b.get('source',{}):expected_source.pop('quote_mark',None)
            if b.get('source')!=expected_source or b.get('kind')!=original['kind'] or b.get('structure')!=original.get('structure'):raise ValueError('source_content_changed')
            if data.get('version')==2 and 'annotations' not in b:raise ValueError('missing_annotations')
            t=b.get('translation',{})
            patches.append({'id':b['id'],'text':t.get('text'),'spans':t.get('spans',[]),'layout':b.get('layout'),**({'annotations':b.get('annotations',[])} if data.get('version')==2 else {})})
        patches.extend({'id':b['id'],'text':b['translation']['text'],'spans':b['translation'].get('spans',[]),'layout':b['layout'],'annotations':b.get('annotations',[])} for b in missing)
        result.append(patch_page(old,{'revision':old['revision'],'blocks':patches}))
    return result
def atomic_bytes(path,data):
    temp=path.with_name(path.name+'.'+secrets.token_hex(6)+'.tmp')
    try:
        with temp.open('wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
        os.replace(temp,path)
    finally:
        if temp.exists():temp.unlink()
def commit_pages(pages,directory,backup):
    backup.mkdir(parents=True,exist_ok=True)
    txn=backup/('import-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+secrets.token_hex(4));txn.mkdir()
    names=[f'p{p["pdf_page"]:04}.json' for p in pages]
    for name in names:(txn/name).write_bytes((directory/name).read_bytes())
    journal=txn/'transaction.json';atomic_bytes(journal,json.dumps({'status':'pending','files':names}).encode())
    try:
        for p,name in zip(pages,names):
            p['revision']+=1;p['updated_at']=datetime.now(timezone.utc).isoformat()
            atomic_bytes(directory/name,(json.dumps(p,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
        atomic_bytes(journal,json.dumps({'status':'committed','files':names}).encode())
    except OSError:
        for name in names:atomic_bytes(directory/name,(txn/name).read_bytes())
        atomic_bytes(journal,json.dumps({'status':'rolled_back','files':names}).encode())
        raise
    return txn.name
def recover(directory,backup):
    import re
    for path in backup.glob('import-*/transaction.json'):
        item=json.loads(path.read_text())
        if item.get('status')!='pending':continue
        for name in item['files']:
            if not re.fullmatch(r'p\d{4}\.json',name):raise RuntimeError('invalid_transaction')
            atomic_bytes(directory/name,(path.parent/name).read_bytes())
        atomic_bytes(path,json.dumps({**item,'status':'recovered'}).encode())
