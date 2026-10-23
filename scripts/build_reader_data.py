"""Private, optional loading accelerator + reduced scan copies. Originals untouched.

The browser compares cached page blob IDs with the selected commit's Git tree.
Edits in GitHub are fetched directly when the accelerator is older: no workflow,
database migration, or regenerated index is required to see a new translation.
"""
from pathlib import Path
import argparse, json, subprocess
ROOT=Path(__file__).resolve().parents[1]

def build(images=False):
    entries=[]
    for path in sorted((ROOT/'private/content/viewer').glob('p[0-9][0-9][0-9][0-9].json')):
        relative=path.relative_to(ROOT).as_posix()
        blob=subprocess.check_output(['git','hash-object','--path='+relative,str(path)],cwd=ROOT,text=True).strip()
        entries.append({'path':relative,'blob':blob,'page':json.loads(path.read_text(encoding='utf-8'))})
    target=ROOT/'private/content/reader-index.json'
    target.write_text(json.dumps({'format':'private-reader-index','version':1,'entries':entries},ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8',newline='\n')
    print(f'Private page index: {len(entries)} pages, {target.stat().st_size/1024**2:.2f} MiB',flush=True)
    if not images:return
    from PIL import Image
    folder=ROOT/'private/reader/assets';folder.mkdir(parents=True,exist_ok=True)
    for i,entry in enumerate(entries):
        name=Path(entry['path']).stem
        source=ROOT/'private/extracted/audit/samples'/name/'embedded-00-Im0.jpg'
        output=folder/(name+'.jpg')
        if not output.exists():
            with Image.open(source) as image:
                image=image.convert('RGB');image.thumbnail((3000,2800),Image.Resampling.LANCZOS)
                image.save(output,'JPEG',quality=85,optimize=True,progressive=True,subsampling=0)
        if (i+1)%40==0:print(f'Private reading images: {i+1}/{len(entries)}',flush=True)
    print(f'Private images: {sum(p.stat().st_size for p in folder.glob("*.jpg"))/1024**2:.2f} MiB',flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--images',action='store_true');build(parser.parse_args().images)
