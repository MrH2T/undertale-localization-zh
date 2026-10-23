"""Publish only user-authorized page JSON and reading JPGs from committed versions.

This does not export the source PDF, original scans, backups, or private Git history.
Run build_reader.py afterward to rebuild the code and complete checksum manifest.
"""
from pathlib import Path
import argparse, json, subprocess, re

ROOT=Path(__file__).resolve().parents[1]
PAGE=re.compile(r'private/content/viewer/(p[0-9]{4}\.json)$')
IMAGE=re.compile(r'private/reader/assets/(p[0-9]{4}\.jpg)$')

def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT)
def write_json(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8',newline='\n')

def build(output,refs):
    settings=json.loads((ROOT/'project-settings.json').read_text(encoding='utf-8'))
    if not settings.get('public_book_content_allowed'):raise SystemExit('Public book export requires recorded user authorization.')
    output=output.resolve()
    if output==ROOT or output.is_relative_to(ROOT/'private'):raise SystemExit('Use a separate public repository directory.')
    catalog_path=output/'data/catalog.json'
    catalog=json.loads(catalog_path.read_text(encoding='utf-8')) if catalog_path.exists() else {'version':1,'versions':[]}
    for ref in refs:
        sha=git('rev-parse','--verify',ref+'^{commit}').decode().strip()
        date=git('show','-s','--format=%cI',sha).decode().strip()
        entries=[]
        for row in git('ls-tree','-rz',sha).split(b'\0'):
            if not row:continue
            meta,path=row.split(b'\t',1);mode,kind,blob=meta.decode().split();path=path.decode()
            if kind=='blob' and (PAGE.fullmatch(path) or IMAGE.fullmatch(path)):entries.append((path,blob))
        folder=output/'data/versions'/sha;pages=[];images={}
        # A single Git process streams exactly the allowlisted objects.
        process=subprocess.Popen(['git','cat-file','--batch'],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE)
        try:
            for path,blob in entries:
                page_match=PAGE.fullmatch(path);image_match=IMAGE.fullmatch(path)
                if image_match:
                    images['images/'+image_match[1]]=blob
                    target=output/'data/images'/(blob+'.jpg')
                    if target.exists():continue
                else:target=folder/'pages'/page_match[1]
                process.stdin.write((blob+'\n').encode());process.stdin.flush()
                header=process.stdout.readline().decode().split()
                if len(header)!=3 or header[1]!='blob':raise ValueError('Git object could not be read')
                data=process.stdout.read(int(header[2]));process.stdout.read(1)
                target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
                if page_match:
                    page=json.loads(data)
                    if page['pdf_page']!=int(page_match[1][1:5]):raise ValueError('Page number differs from filename')
                    pages.append(page)
            if not pages:raise ValueError('No page data in '+ref)
        finally:
            process.stdin.close();process.wait()
        pages.sort(key=lambda p:p['pdf_page'])
        write_json(folder/'index.json',{'version':1,'sha':sha,'pages':pages,'images':images})
        catalog['versions']=[v for v in catalog['versions'] if v['ref']!=ref]
        catalog['versions'].append({'ref':ref,'sha':sha,'date':date,'pages':len(pages)})
        print(f'{ref}: {len(pages)} pages, {len(images)} images, {sha[:7]}',flush=True)
    catalog['versions'].sort(key=lambda v:(v['ref']!='main',v['ref']))
    write_json(catalog_path,catalog)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);parser.add_argument('--refs',nargs='+',default=['main','reader-v1']);args=parser.parse_args();build(args.output,args.refs)
