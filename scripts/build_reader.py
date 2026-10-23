"""Build the public reader from an explicit allowlist. Never copy study data."""
from pathlib import Path
import argparse, hashlib, json, shutil

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_FILES = ('index.html', 'reader.css', 'reader.js', 'github-data.js')
FONT_FILES = ('serif-sc.woff2','sans-sc.woff2','serif-jp.woff2','serif-latin.woff2',
              'serif-latin-italic.woff2','serif-sc-OFL.txt','sans-sc-OFL.txt',
              'serif-jp-OFL.txt','SourceSerif4-LICENSE.txt')

RENDER_WRAPPER = r'''
function render(page,{mode,masks,overlay,onSelect}){
  masks.replaceChildren();overlay.replaceChildren();
  for(const [i,b] of page.blocks.entries()){
    if(mode==='source'){
      const hit=el('button','source-hit');hit.id='source-'+b.id;hit.dataset.block=b.id;
      applyBox(hit,b.source.bbox,page);hit.setAttribute('aria-label','第 '+(i+1)+' 段：'+b.source.text.slice(0,60));hit.addEventListener('click',()=>onSelect(b.id));overlay.append(hit);continue;
    }
    const mask=el('div','source-mask');applyBox(mask,b.source.mask_bbox||b.source.bbox,page);mask.style.background=b.layout.mask_color||'#fff';masks.append(mask);
    if(b.source.quote_mark){const iconMask=el('div','source-mask');applyBox(iconMask,b.source.quote_mark.bbox,page);iconMask.style.background=b.layout.mask_color||'#fff';masks.append(iconMask);}
    const box=makeTranslation(b,page);box.id='translation-'+b.id;box.tabIndex=0;
    box.addEventListener('click',()=>{if(!getSelection()?.toString())onSelect(b.id);});
    box.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();onSelect(b.id);}});overlay.append(box);
  }
  if(mode==='source')return;
  if(page.erase_regions?.length||page.vector_shapes?.length){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),[w,h]=page.reference_size;
    svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.setAttribute('width',w);svg.setAttribute('height',h);svg.style.cssText='position:absolute;inset:0;pointer-events:none';
    for(const s of [...(page.erase_regions||[]),...(page.vector_shapes||[])]){
      if(!['rect','line'].includes(s.type))continue;
      const shape=document.createElementNS(ns,s.type);
      if(s.type==='rect'){const [x0,y0,x1,y1]=s.bbox;for(const [k,v] of Object.entries({x:x0,y:y0,width:x1-x0,height:y1-y0,fill:s.fill||'#fff'}))shape.setAttribute(k,v);}
      else{const [[x1,y1],[x2,y2]]=s.points;for(const [k,v] of Object.entries({x1,y1,x2,y2,stroke:s.stroke||'#555','stroke-width':s.stroke_width||1}))shape.setAttribute(k,v);}
      svg.append(shape);
    }
    masks.append(svg);
  }
  arrangeBoxes(overlay,page);renderQuoteMarks(overlay,page);
}
window.BookRenderer={render,formattedInline};
})();
'''

def build(output):
    output=output.resolve()
    if output == ROOT or output == ROOT/'site':
        raise ValueError('Build output must be separate from source')
    output.mkdir(parents=True,exist_ok=True)
    allowed=set(PUBLIC_FILES)|{'renderer.js','composition.js','book.css','.nojekyll','build-manifest.json'}|{'fonts/'+name for name in FONT_FILES}
    unexpected=[p.relative_to(output).as_posix() for p in output.rglob('*') if p.is_file() and '.git' not in p.relative_to(output).parts and p.relative_to(output).as_posix() not in allowed]
    if unexpected:raise ValueError('Unexpected files in public output: '+repr(unexpected))
    for name in PUBLIC_FILES: shutil.copyfile(ROOT/'site'/name,output/name)
    app=(ROOT/'viewer/dist/app.js').read_text(encoding='utf-8')
    shared=app[app.index('function applyBox('):app.index('function renderPage(')]
    shared=shared.replace('page=state.page','page')
    if 'state.' in shared: raise ValueError('Renderer unexpectedly depends on editor state')
    prefix="// Generated from the local viewer; run scripts/build_reader.py to refresh.\n(function(){\n'use strict';\nconst params=new URLSearchParams();\nfunction el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}\n"
    (output/'renderer.js').write_text(prefix+shared+RENDER_WRAPPER,encoding='utf-8',newline='\n')
    shutil.copyfile(ROOT/'viewer/dist/composition.js',output/'composition.js')
    css=(ROOT/'viewer/dist/style.css').read_text(encoding='utf-8').replace('/fonts/','./fonts/')
    (output/'book.css').write_text(css,encoding='utf-8',newline='\n')
    (output/'fonts').mkdir(exist_ok=True)
    for name in FONT_FILES: shutil.copyfile(ROOT/'viewer/dist/fonts'/name,output/'fonts'/name)
    (output/'.nojekyll').touch()
    manifest={p.relative_to(output).as_posix():hashlib.sha256(p.read_bytes()).hexdigest()
              for p in output.rglob('*') if p.is_file() and '.git' not in p.parts and p.name!='build-manifest.json'}
    (output/'build-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    print(f'Public reader: {len(manifest)} files, {sum((output/p).stat().st_size for p in manifest)/1024**2:.2f} MiB')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True)
    build(parser.parse_args().output)
