"""Print-safe note appendix and reciprocal links. Source text is always escaped."""
from xml.sax.saxutils import escape
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfdoc

FONT_CN='serif-sc-400';FONT_JA='serif-jp-400';FONT_EN='serif-latin-400'
KIND={'verbatim':'原语原句','romanization':'原书罗马字','author_gloss':'作者英文转述','editorial':'译者说明'}
def notes_for(page):
    return [(index+1,b,n) for index,b in enumerate(page['blocks']) for n in b.get('annotations',[])]
def key(page,n):return f'note-{page}-{n["id"]}'
def markup(text,language='mixed'):
    if language=='ja' and '：' in text:
        label,value=text.split('：',1)
        return markup(label+'：','mixed')+markup(value,language)
    result=[];previous=None;run=''
    for c in text:
        font=FONT_EN if ord(c)<0x250 and c!='\n' else FONT_JA if language=='ja' or '\u3040'<=c<='\u30ff' else FONT_CN
        if font!=previous and run:result.append(f'<font name="{previous}">{escape(run).replace(chr(10),"<br/>")}</font>');run=''
        previous=font;run+=c
    if run:result.append(f'<font name="{previous}">{escape(run).replace(chr(10),"<br/>")}</font>')
    return ''.join(result)
def page_links(c,page,item,pw,ph):
    rw,rh=page['reference_size'];sx,sy=pw/rw,ph/rh
    blocks={b['id']:b for b in item['blocks']};offsets={}
    for number,(index,b,n) in enumerate(notes_for(page),1):
        runs=blocks[b['id']]['runs'];first=min((r['y']-r['size'] for r in runs),default=b['layout']['bbox'][1]*rh)
        offset=offsets.get(b['id'],0);offsets[b['id']]=offset+1
        x=min(pw-13,b['layout']['bbox'][2]*pw+2);y=ph-(first+offset*23)*sy-8
        y=max(12,min(ph-12,y));c.setFillColor(HexColor('#33516b'));c.setFont(FONT_CN,7)
        label=str(number)+('!' if n['anchor']['status']=='orphan' else '')
        c.drawString(x,y,label);c.linkRect('',key(page['pdf_page'],n),(x,y-2,x+12,y+9),relative=0,thickness=0)
        # Standard text annotations are supplementary; the appendix is always printable.
        content='译注 '+str(number)+'\n'+'\n'.join(v for v in [n.get('gloss_zh'),n.get('note_zh')] if v)
        c.highlightAnnotation(content,Rect=(x,y-2,x+9,y+8),QuadPoints=[x,y+8,x+9,y+8,x,y-2,x+9,y-2],Color=[0.94,0.96,1],T=pdfdoc.PDFString('译注'))

def appendix(c,pages,physical):
    if not any(notes_for(p) for p in pages):return
    pw,ph=physical;margin=34;width=pw-2*margin;y=0;sheet=0
    style=ParagraphStyle('annotation',fontName=FONT_CN,fontSize=10,leading=15,wordWrap='CJK',splitLongWords=True,spaceAfter=5)
    def newpage():
        nonlocal y,sheet
        if sheet:c.showPage()
        sheet+=1;c.setPageSize((pw,ph));c.setFillColor(HexColor('#222222'));c.setFont('sans-sc-700',14)
        c.drawString(margin,ph-margin,'译注');c.setFont(FONT_CN,8);c.drawRightString(pw-margin,ph-margin,'私人学习 · 注释 '+str(sheet))
        c.setStrokeColor(HexColor('#aaaaaa'));c.line(margin,ph-margin-9,pw-margin,ph-margin-9);y=ph-margin-24
    def draw(text,language='mixed',heading=False):
        nonlocal y
        if not text:return
        if heading and y<100:newpage()
        paragraph=Paragraph(markup(text,language),style)
        while paragraph:
            _,height=paragraph.wrap(width,y-margin)
            if height<=y-margin:
                paragraph.drawOn(c,margin,y-height);y-=height+5;break
            parts=paragraph.split(width,y-margin)
            if not parts:newpage();continue
            first,*rest=parts;_,height=first.wrap(width,y-margin);first.drawOn(c,margin,y-height);y-=height+5
            paragraph=rest[0] if rest else None
            if paragraph:newpage()
    newpage();draw('正文旁的数字与下列译注对应。点击条目标题可返回书页；所有说明均可打印。')
    for page in pages:
        for number,(index,b,n) in enumerate(notes_for(page),1):
            lines=[(f'第 {page["pdf_page"]} 页 · 第 {index} 段 · 译注 {number}','mixed')]
            if n['anchor']['status']=='orphan':lines.append(('待重新关联：原关联文字已变化；本条未重新指向其他文字。','mixed'))
            if n['anchor']['quote']:lines.append(('关联文字：'+n['anchor']['quote'],'mixed'))
            for label,field,lang in [(KIND[n['source_kind']],'original',n['language']),('读音','reading','mixed'),('释义','gloss_zh','mixed'),('说明','note_zh','mixed'),('出处','source_ref','mixed')]:
                if n[field]:lines.append((label+'：'+n[field],lang))
            estimated=sum(Paragraph(markup(t,l),style).wrap(width,ph)[1]+5 for t,l in lines)+9
            if y<130 or (estimated<=ph-2*margin-24 and estimated>y-margin):newpage()
            dest=key(page['pdf_page'],n);c.bookmarkHorizontalAbsolute(dest,y)
            label=f'第 {page["pdf_page"]} 页 · 第 {index} 段 · 译注 {number}'
            start=y;draw(label,heading=True);c.linkRect('',f'translation-{page["pdf_page"]}',(margin,y,pw-margin,start+2),relative=0,thickness=0)
            if n['anchor']['status']=='orphan':draw('待重新关联：原关联文字已变化；本条未重新指向其他文字。')
            if n['anchor']['quote']:draw('关联文字：'+n['anchor']['quote'])
            if n['original']:draw(KIND[n['source_kind']]+'：'+n['original'],n['language'])
            if n['reading']:draw('读音：'+n['reading'])
            if n['gloss_zh']:draw('释义：'+n['gloss_zh'])
            if n['note_zh']:draw('说明：'+n['note_zh'])
            if n['source_ref']:draw('出处：'+n['source_ref'])
            if not any(n[k] for k in ('original','reading','gloss_zh','note_zh')):draw('尚未填写注释。')
            y-=9
    c.showPage()
