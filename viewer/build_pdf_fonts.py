"""Freeze the locally bundled WOFF2 fonts for vector PDF output."""
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'.deps'))
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

def build():
    out=ROOT/'pdf-fonts';out.mkdir(exist_ok=True)
    for family,weights in [('serif-sc',[400,450,700]),('sans-sc',[400,450,700,750]),('serif-jp',[400]),('serif-latin',[400]),('serif-latin-italic',[400])]:
        for weight in weights:
            target=out/f'{family}-{weight}.ttf'
            f=TTFont(ROOT/'dist/fonts'/f'{family}.woff2')
            if 'fvar' in f:f=instantiateVariableFont(f,{'wght':weight},inplace=True)
            # ReportLab deduplicates faces by PostScript name. Frozen weights
            # need distinct names, or body and heading weights silently merge.
            name='Study'+''.join(x.title() for x in target.stem.split('-'))
            for platform,encoding,language in [(3,1,0x409),(1,0,0)]:
                for ident,value in [(1,name),(2,'Regular'),(4,name),(6,name),(16,name),(17,'Regular')]:f['name'].setName(value,ident,platform,encoding,language)
            f.flavor=None;f.save(target);f.close();print(target.name,flush=True)

if __name__=='__main__':build()
