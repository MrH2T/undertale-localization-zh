"""Small page catalogs and glyph subsets for the static reader; original fonts are untouched."""
from pathlib import Path
import hashlib, json, sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'viewer/.deps'))

def write_json(path,value):
    path.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8',newline='\n')

def build(output):
    from fontTools.ttLib import TTFont
    from fontTools.subset import Options, Subsetter
    characters=set(chr(c) for c in range(32,127));characters.update('“”‘’—…，。！？：；、（）《》「」•▲▼')
    for index in sorted((output/'data/versions').glob('*/index.json')):
        data=json.loads(index.read_text(encoding='utf-8'));summaries=[];search=[]
        for page in data['pages']:
            blocks=page['blocks'];characters.update(page['title'])
            summaries.append({'pdf_page':page['pdf_page'],'title':page['title'],'page_role':page.get('page_role',''),
                              'chapter':page.get('page_role')=='chapter' or any(b['layout'].get('style')=='chapter-heading' for b in blocks)})
            search.append({'pdf_page':page['pdf_page'],'title':page['title'],'blocks':[
                {'id':b['id'],'source':{'text':b['source']['text']},'translation':{'text':b['translation']['text']}} for b in blocks]})
            for block in blocks:
                characters.update(block['source']['text']);characters.update(block['translation']['text'])
        write_json(index.with_name('manifest.json'),{'format':2,'sha':data['sha'],'pages':summaries,'images':data['images']})
        write_json(index.with_name('search.json'),{'sha':data['sha'],'pages':search})
    unicodes=sorted(map(ord,characters));assets={};folder=output/'fonts';folder.mkdir(exist_ok=True)
    cache_path=folder/'subsets.json'
    cache=json.loads(cache_path.read_text(encoding='utf-8')) if cache_path.exists() else {}
    for name in ['serif-sc','sans-sc','serif-jp']:
        source=ROOT/'viewer/dist/fonts'/(name+'.woff2');target=folder/('web-'+name+'.woff2')
        digest=hashlib.sha256(source.read_bytes()+json.dumps(unicodes).encode()+b'subset-v1').hexdigest()
        if cache.get(name,{}).get('source')==digest and target.exists():
            assets[name]=cache[name];continue
        font=TTFont(source);original_cmap=font.getBestCmap();expected=set(unicodes)&original_cmap.keys()
        widths={cp:font['hmtx'][original_cmap[cp]] for cp in expected}
        metrics=(font['head'].unitsPerEm,font['hhea'].ascent,font['hhea'].descent,font['hhea'].lineGap)
        options=Options();options.layout_features=['*'];options.name_IDs=['*'];options.glyph_names=True
        subset=Subsetter(options=options);subset.populate(unicodes=unicodes);subset.subset(font)
        # Derived web font names do not reuse the source fonts' reserved family names.
        family='ReaderSubset'+name.replace('-','').title()
        for record in list(font['name'].names):
            if record.nameID in [1,4,6,16]:font['name'].setName(family,record.nameID,record.platformID,record.platEncID,record.langID)
        font.flavor='woff2';font.save(target);font.close()
        reduced=TTFont(target);cmap=reduced.getBestCmap()
        assert expected<=cmap.keys(),'Font subset lost used characters'
        assert all(reduced['hmtx'][cmap[cp]]==widths[cp] for cp in expected),'Font subset changed glyph advances'
        assert metrics==(reduced['head'].unitsPerEm,reduced['hhea'].ascent,reduced['hhea'].descent,reduced['hhea'].lineGap)
        reduced.close()
        assets[name]={'source':digest,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'glyph_characters':len(expected),'bytes':target.stat().st_size}
        print(f'{name}: {source.stat().st_size:,} -> {target.stat().st_size:,} bytes; glyph coverage and metrics verified',flush=True)
    write_json(cache_path,assets)
    return assets
