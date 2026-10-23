"""Check durable page IDs, editable fields and cross-field references without rewriting data."""
from pathlib import Path
import json, math

ROOT = Path(__file__).resolve().parents[1]

def issues(page, filename):
    errors=[]
    def check(ok, message):
        if not ok: errors.append(f'{filename}: {message}')
    def number(value):
        return type(value) in (int,float) and math.isfinite(value)
    def box(value):
        return isinstance(value,list) and len(value)==4 and all(number(n) for n in value) and value[2]>value[0] and value[3]>value[1]
    check(page.get('pdf_page')==int(Path(filename).stem[1:]), 'pdf_page differs from filename')
    check(type(page.get('schema_version')) is int, 'missing schema_version')
    check(isinstance(page.get('title'),str), 'title must be text')
    size=page.get('reference_size',[])
    check(isinstance(size,list) and len(size)==2 and all(number(n) and n>0 for n in size), 'invalid reference_size')
    blocks=page.get('blocks')
    if not isinstance(blocks,list):return errors+[f'{filename}: blocks must be an array']
    ids=[b.get('id') for b in blocks]
    check(all(isinstance(i,str) and i for i in ids) and len(ids)==len(set(ids)), 'missing or duplicate block IDs')
    for block in blocks:
        label=block.get('id','?')
        check(isinstance(block.get('kind'),str), f'{label}: missing kind')
        for name in ['source','translation']:
            check(isinstance(block.get(name,{}).get('text'),str), f'{label}: missing {name}.text')
        for name in ['source','layout']:
            check(box(block.get(name,{}).get('bbox')), f'{label}: invalid {name}.bbox')
        layout=block.get('layout',{})
        for name in ['font_size','line_height']:
            check(number(layout.get(name)) and layout[name]>0, f'{label}: invalid {name}')
        if layout.get('flow_after'):check(layout['flow_after'] in ids and layout['flow_after']!=label, f'{label}: missing/self flow_after target')
        translation=block.get('translation',{});spans=translation.get('spans')
        check(isinstance(spans,list),f'{label}: missing translation.spans')
        length=len(translation.get('text','').encode('utf-16-le'))//2
        for span in spans or []:
            start,end=span.get('start'),span.get('end')
            check(type(start) is int and type(end) is int and 0<=start<end<=length,f'{label}: format range exceeds text')
    return errors

def main():
    errors=[];count=0;blocks=0
    for path in sorted((ROOT/'private/content/viewer').glob('p[0-9][0-9][0-9][0-9].json')):
        page=json.loads(path.read_text(encoding='utf-8'));errors.extend(issues(page,path.name));count+=1;blocks+=len(page.get('blocks',[]))
    if errors:raise SystemExit('\n'.join(errors))
    if not count:raise SystemExit('No page data found')
    print(f'Checked {count} pages / {blocks} blocks: IDs, text, geometry, format ranges and flow targets are valid.')

if __name__=='__main__':main()
