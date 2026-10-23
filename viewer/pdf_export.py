"""PDF uses the viewer's measured glyph positions, never a second line-break engine."""
from pathlib import Path
import io, json, math, re, threading, sys
sys.path.insert(0,str(Path(__file__).resolve().parent/'.deps'))
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from PIL import Image
from pdf_notes import notes_for, page_links, appendix

FONT_DIR=Path(__file__).resolve().parent/'pdf-fonts'
FONT_FILES={f'{family}-{weight}':f'{family}-{weight}.ttf' for family,weights in [('serif-sc',[400,450,700]),('sans-sc',[400,450,700,750]),('serif-jp',[400]),('serif-latin',[400]),('serif-latin-italic',[400])] for weight in weights}
LOCK=threading.Lock()
def finite(value,lo,hi):return type(value) in (int,float) and math.isfinite(value) and lo<=value<=hi
def compact(text):return ''.join(text.split())
def validate_snapshot(snapshot,pages):
    if not isinstance(snapshot,dict) or snapshot.get('version')!=1:raise ValueError('invalid_pdf_snapshot')
    incoming=snapshot.get('pages')
    if not isinstance(incoming,list) or not 1<=len(incoming)<=len(pages):raise ValueError('invalid_pages')
    seen=set()
    for item in incoming:
        if not isinstance(item,dict):raise ValueError('invalid_page')
        n=item.get('number')
        if type(n)!=int or n not in pages or n in seen:raise ValueError('invalid_page')
        seen.add(n);page=pages[n];w,h=page['reference_size']
        if item.get('revision')!=page['revision']:raise ValueError('revision_conflict')
        blocks=item.get('blocks')
        if not isinstance(blocks,list) or len(blocks)!=len(page['blocks']):raise ValueError('invalid_blocks')
        indexed={b['id']:b for b in page['blocks']}
        if {b.get('id') for b in blocks if isinstance(b,dict)}!=set(indexed):raise ValueError('invalid_ids')
        for b in blocks:
            original=indexed[b['id']]
            if original['source'].get('quote_mark'):
                position=b.get('position')
                if not isinstance(position,list) or len(position)!=2 or not finite(position[0],0,w) or not finite(position[1],0,h) or abs(position[0]-original['layout']['bbox'][0]*w)>1:raise ValueError('invalid_quote_mark_position')
            if b.get('text')!=original['translation']['text']:raise ValueError('pdf_text_changed')
            if b.get('overflow') is not False:raise ValueError('pdf_overflow')
            runs=b.get('runs')
            if not isinstance(runs,list) or len(runs)>40000:raise ValueError('invalid_pdf_runs')
            joined=''
            for run in runs:
                if not isinstance(run,dict) or run.get('font') not in FONT_FILES:raise ValueError('invalid_pdf_font')
                t=run.get('text')
                if not isinstance(t,str) or len(t)>256:raise ValueError('invalid_pdf_text')
                decoration=run.get('decoration',False)
                if decoration and (original['kind']!='list' or t!='•'):raise ValueError('invalid_decoration')
                if not decoration:joined+=t
                if not finite(run.get('x'),-1,w+1) or not finite(run.get('y'),0,h+1) or not finite(run.get('size'),8,50):raise ValueError('invalid_pdf_position')
                if abs(run['size']-original['layout']['font_size']*(.85 if decoration else 1))>.02:raise ValueError('invalid_pdf_size')
                if not isinstance(run.get('color'),str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',run['color']):raise ValueError('invalid_pdf_color')
            if compact(joined)!=compact(original['translation']['text']):raise ValueError('pdf_missing_text')
    return incoming
def render_pdf(snapshot,pages,audit,include_annotations=True):
    incoming=validate_snapshot(snapshot,pages)
    with LOCK:
        used={r['font'] for p in incoming for b in p['blocks'] for r in b['runs']}
        if include_annotations and any(notes_for(pages[i['number']]) for i in incoming):used.update(['serif-sc-400','serif-jp-400','serif-latin-400','sans-sc-700'])
        for font in used:
            if font not in pdfmetrics.getRegisteredFontNames():pdfmetrics.registerFont(TTFont(font,str(FONT_DIR/FONT_FILES[font])))
        output=io.BytesIO();c=canvas.Canvas(output,pageCompression=1)
        c.setTitle('Undertale — private Chinese study draft')
        c.setAuthor('Private study project')
        c.setSubject('Editable translation draft. Source screenshots are preserved.')
        included={item['number'] for item in incoming}
        for item in incoming:
            n=item['number'];page=pages[n];rw,rh=page['reference_size']
            physical=page.get('physical_size_pt')
            if not physical:
                meta=json.loads((audit/f'p{n:04}'/'page.json').read_text(encoding='utf-8'))
                physical=[meta.get('width_pt',meta.get('width',rw*.507)),meta.get('height_pt',meta.get('height',710))]
            pw,ph=physical;c.setPageSize((pw,ph));sx,sy=pw/rw,ph/rh
            scan=str(audit/f'p{n:04}'/'embedded-00-Im0.jpg')
            if snapshot.get('include_original'):
                c.drawImage(scan,0,0,pw,ph);c.bookmarkPage(f'original-{n}');c.addOutlineEntry(f'{n} · 原文',f'original-{n}');c.showPage();c.setPageSize((pw,ph))
            c.drawImage(scan,0,0,pw,ph)
            for b in page['blocks']:
                x0,y0,x1,y1=b['source'].get('mask_bbox',b['source']['bbox'])
                c.setFillColor(HexColor(b['layout'].get('mask_color','#ffffff')))
                c.rect(x0*pw,(1-y1)*ph,(x1-x0)*pw,(y1-y0)*ph,stroke=0,fill=1)
                if b['source'].get('quote_mark'):
                    x0,y0,x1,y1=b['source']['quote_mark']['bbox']
                    c.rect(x0*pw,(1-y1)*ph,(x1-x0)*pw,(y1-y0)*ph,stroke=0,fill=1)
            from storage import validate_reconstruction
            validate_reconstruction(page)
            for s in [*page.get('erase_regions',[]),*page.get('vector_shapes',[])]:
                if s['type']=='rect':
                    x0,y0,x1,y1=s['bbox'];c.setFillColor(HexColor(s.get('fill','#ffffff')))
                    c.rect(x0*sx,ph-y1*sy,(x1-x0)*sx,(y1-y0)*sy,stroke=0,fill=1)
                elif s['type']=='line':
                    (x0,y0),(x1,y1)=s['points'];c.setStrokeColor(HexColor(s.get('stroke','#555555')));c.setLineWidth(s.get('stroke_width',1)*sy)
                    c.line(x0*sx,ph-y0*sy,x1*sx,ph-y1*sy)
            indexed={b['id']:b for b in page['blocks']};scan_pixels=None
            for b in item['blocks']:
                mark=indexed[b['id']]['source'].get('quote_mark')
                if mark:
                    if scan_pixels is None:scan_pixels=Image.open(scan).convert('RGB')
                    x0,y0,x1,y1=mark['bbox'];iw,ih=scan_pixels.size
                    crop=scan_pixels.crop((round(x0*iw),round(y0*ih),round(x1*iw),round(y1*ih)))
                    x,y=b['position'];dx,dy=mark['offset'];mw=(x1-x0)*rw;mh=(y1-y0)*rh
                    c.drawImage(ImageReader(crop),(x+dx)*sx,ph-(y+dy+mh)*sy,mw*sx,mh*sy)
                for run in b['runs']:
                    c.setFillColor(HexColor(run['color']));c.setFont(run['font'],run['size']*sy)
                    c.drawString(run['x']*sx,ph-run['y']*sy,run['text'],shaping=True)
            if include_annotations:page_links(c,page,item,pw,ph)
            c.bookmarkPage(f'translation-{n}')
            title=next((b['translation']['text'] for b in page['blocks'] if b['kind']=='heading'),page.get('title','译文'))
            c.addOutlineEntry(f'{n} · {title}',f'translation-{n}')
            for b in page['blocks']:
                target=b.get('structure',{}).get('target_pdf_page')
                if target in included:
                    x0,y0,x1,y1=b['layout']['bbox']
                    c.linkRect('',f'translation-{target}',(x0*pw,(1-y1)*ph,x1*pw,(1-y0)*ph),relative=0,thickness=0)
            c.showPage()
        if include_annotations:appendix(c,[pages[i['number']] for i in incoming],pages[incoming[0]['number']]['physical_size_pt'])
        c.save();return output.getvalue()
