from pathlib import Path
import json, subprocess, hashlib, time, argparse
from pypdf import PdfReader
from PIL import Image, ImageOps, ImageDraw
import pdfplumber

parser = argparse.ArgumentParser(description='Extract PDF text, image metadata and review samples locally.')
parser.add_argument('--source', type=Path, default=Path(r'D:/Downloads/Legends of Localization Book 3 Undertale (Clyde Mandelin) (Z-Library).pdf'))
parser.add_argument('--out', type=Path, default=Path(__file__).resolve().parent / 'pdf-audit')
parser.add_argument('--poppler-dir', type=Path, default=Path(r'C:/Users/admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin'))
args = parser.parse_args()
SOURCE, OUT, POP = args.source, args.out, args.poppler_dir
OUT.mkdir(parents=True, exist_ok=True)
(OUT/'text').mkdir(exist_ok=True)
(OUT/'samples').mkdir(exist_ok=True)
reader = PdfReader(SOURCE)
source_sha256 = hashlib.file_digest(SOURCE.open('rb'), 'sha256').hexdigest()
if (OUT/'inventory.json').exists():
    previous = json.loads((OUT/'inventory.json').read_text(encoding='utf-8'))
    if previous.get('sha256') != source_sha256:
        raise SystemExit('Source hash changed. Use a new output directory.')
inventory = []
for i, page in enumerate(reader.pages, 1):
    cached = OUT/'text'/f'p{i:04}.txt'
    text = cached.read_text(encoding='utf-8') if cached.exists() and (OUT/'inventory.json').exists() else (page.extract_text() or '')
    (OUT/'text'/f'p{i:04}.txt').write_text(text, encoding='utf-8')
    inventory.append({'pdf_page': i, 'width_pt': float(page.mediabox.width), 'height_pt': float(page.mediabox.height), 'text_chars': len(text), 'replacement_chars': text.count('\ufffd')})
    if i % 50 == 0:
        print('Text checked:', i, flush=True)
image_inventory = []
for number, page in enumerate(reader.pages, 1):
    resources=page.get('/Resources', {}).get_object()
    xobjects=resources.get('/XObject', {}).get_object() if '/XObject' in resources else {}
    for name, ref in xobjects.items():
        ob=ref.get_object()
        if ob.get('/Subtype') == '/Image':
            image_inventory.append({'pdf_page':number,'name':str(name),'width':ob.get('/Width'),'height':ob.get('/Height'),'filter':str(ob.get('/Filter')),'color_space':str(ob.get('/ColorSpace')),'bits':ob.get('/BitsPerComponent')})
(OUT/'image-inventory.json').write_text(json.dumps(image_inventory,indent=2),encoding='utf-8')
summary = {'source_path': str(SOURCE), 'source_bytes': SOURCE.stat().st_size, 'sha256': source_sha256, 'page_count': len(reader.pages), 'metadata': {str(k):str(v) for k,v in reader.metadata.items()}, 'empty_text_pages': [p['pdf_page'] for p in inventory if p['text_chars']==0], 'pages': inventory}
(OUT/'inventory.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
samples = [1, 4, 5, 6, 10, 30, 60, 100, 140, 180, 220, 260]
with pdfplumber.open(SOURCE) as pdf:
    for number in samples:
        page = pdf.pages[number-1]
        sample = OUT/'samples'/f'p{number:04}'
        sample.mkdir(exist_ok=True)
        (sample/'words.json').write_text(json.dumps(page.extract_words(),ensure_ascii=False,indent=2),encoding='utf-8')
        (sample/'images.json').write_text(json.dumps([{k:v for k,v in im.items() if k!='stream'} for im in page.images],ensure_ascii=False,indent=2,default=str),encoding='utf-8')
        if number in [4,60,140,220]:
            for j, im in enumerate(reader.pages[number-1].images):
                (sample/f'embedded-{j:02}-{im.name}').write_bytes(im.data)
        subprocess.run([str(POP/'pdftoppm.exe'), '-f',str(number),'-l',str(number),'-singlefile','-scale-to','1400','-png',str(SOURCE),str(sample/'page')],check=True,capture_output=True)
        print('Rendered:', number, flush=True)
contact = Image.new('RGB', (1200, 4*470), '#dddddd')
draw=ImageDraw.Draw(contact)
for index, number in enumerate(samples):
    im=Image.open(OUT/'samples'/f'p{number:04}'/'page.png')
    im.thumbnail((390,440))
    x=(index%3)*400+(400-im.width)//2; y=(index//3)*470+25
    contact.paste(im,(x,y)); draw.text(((index%3)*400+15,(index//3)*470+6),f'PDF page {number}',fill='black')
contact.save(OUT/'contact.png')
print(json.dumps({k:v for k,v in summary.items() if k!='pages'},ensure_ascii=False),flush=True)
