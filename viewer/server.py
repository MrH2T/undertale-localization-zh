"""Loopback-only study viewer with durable atomic saves and vector PDF export."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit
from datetime import datetime, timezone
import argparse, json, secrets, threading, os, mimetypes, math, re, io
from pypdf import PdfReader
import storage
from pdf_export import render_pdf

ROOT = Path(__file__).resolve().parents[1]
STATIC = Path(__file__).resolve().parent/'dist'
DATA = ROOT/'private/content/viewer'
AUDIT = ROOT/'private/extracted/audit/samples'
BACKUP = ROOT/'private/backups/viewer'
PAGES = [60, *range(90,100), 140,220]
ANNOTATIONS_ENABLED = False
EXPORTS=ROOT/'private/exports'
BOOK_HASH=json.loads((ROOT/'private/source/manifest.json').read_text(encoding='utf-8'))['sha256']
def page_numbers(): return sorted(int(p.stem[1:]) for p in DATA.glob('p[0-9][0-9][0-9][0-9].json'))
TOKEN = secrets.token_urlsafe(32)
LOCK = threading.Lock()

def read_page(n):
    return json.loads((DATA/f'p{n:04}.json').read_text(encoding='utf-8'))

validate_patch=storage.patch_page

class Handler(BaseHTTPRequestHandler):
    server_version='LocalStudy/2.0'
    def log_message(self,fmt,*args): print(fmt%args,flush=True)
    def allowed_host(self):
        return self.headers.get('Host') in [f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}']
    def send(self,status,data,kind='application/json; charset=utf-8',filename=None):
        if not isinstance(data,bytes): data=json.dumps(data,ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type',kind)
        if filename:self.send_header('Content-Disposition','attachment; filename="'+filename+'"')
        self.send_header('Content-Length',str(len(data)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'")
        self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        if not self.allowed_host(): return self.send(403,{'error':'invalid_host'})
        path=urlsplit(self.path).path
        if path=='/api/health': return self.send(200,{'app':'undertale-study-viewer','version':1})
        if path=='/api/bootstrap':
            return self.send(200,{'token':TOKEN,'features':{'annotations':ANNOTATIONS_ENABLED},'pages':[{'number':n,'title':read_page(n)['title'],'subtitle':read_page(n)['subtitle'],'blocks':len(read_page(n)['blocks'])} for n in page_numbers()]})
        if path=='/api/glossary': return self.send(200,json.loads((ROOT/'private/content/glossary.json').read_text(encoding='utf-8')))
        if path in {f'/fonts/{name}.woff2' for name in ['serif-sc','sans-sc','serif-jp','serif-latin','serif-latin-italic']}:
            return self.send(200,(STATIC/'fonts'/path.rsplit('/',1)[1]).read_bytes(),'font/woff2')
        for n in page_numbers():
            if path==f'/api/pages/{n}': return self.send(200,read_page(n))
            if path==f'/assets/p{n:04}.jpg':
                return self.send(200,(AUDIT/f'p{n:04}'/'embedded-00-Im0.jpg').read_bytes(),'image/jpeg')
        match=re.fullmatch(r'/exports/([a-f0-9]{24})\.pdf',path)
        if match:
            target=EXPORTS/(match[1]+'.pdf')
            if target.exists():return self.send(200,target.read_bytes(),'application/pdf','undertale-study.pdf')
        name={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/composition.js':'composition.js','/files.js':'files.js','/notes.js':'notes.js','/layout.js':'layout.js','/notes-demo.html':'notes-demo.html','/notes-demo.css':'notes-demo.css','/notes-demo.js':'notes-demo.js','/style.css':'style.css'}.get(path)
        if name:
            content=(STATIC/name).read_bytes()
            kind={'html':'text/html; charset=utf-8','js':'text/javascript; charset=utf-8','css':'text/css; charset=utf-8'}[name.rsplit('.',1)[1]]
            return self.send(200,content,kind)
        return self.send(404,{'error':'not_found'})
    def do_POST(self):
        if not self.allowed_host() or self.headers.get('X-Study-Token')!=TOKEN:return self.send(403,{'error':'invalid_session'})
        origin=self.headers.get('Origin')
        if origin and origin not in [f'http://localhost:{self.server.server_port}',f'http://127.0.0.1:{self.server.server_port}']:return self.send(403,{'error':'invalid_origin'})
        path=urlsplit(self.path).path
        if path not in ('/api/bundle','/api/import-preview','/api/import','/api/pdf'):return self.send(404,{'error':'not_found'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            limit=128*1024*1024 if path=='/api/pdf' else 16000000
            if not 0<size<=limit:return self.send(413,{'error':'invalid_length'})
            incoming=json.loads(self.rfile.read(size))
            if not isinstance(incoming,dict):raise ValueError('invalid_body')
            with LOCK:
                current={n:read_page(n) for n in page_numbers()}
                if path=='/api/bundle':
                    numbers=incoming.get('pages')
                    if not isinstance(numbers,list) or not numbers or len(numbers)!=len(set(numbers)) or any(type(n)!=int or n not in current for n in numbers):raise ValueError('invalid_pages')
                    return self.send(200,storage.bundle([current[n] for n in numbers],BOOK_HASH))
                if path in ('/api/import-preview','/api/import'):
                    expected=incoming.get('expected_revisions') if path=='/api/import' else None
                    if path=='/api/import' and not isinstance(expected,dict):raise ValueError('missing_revisions')
                    updated=storage.import_pages(incoming.get('bundle'),current,BOOK_HASH,expected)
                    if path=='/api/import-preview':return self.send(200,{'pages':[p['pdf_page'] for p in updated],'blocks':sum(len(p['blocks']) for p in updated),'annotations':sum(len(b.get('annotations',[])) for p in updated for b in p['blocks']),'expected_revisions':{str(p['pdf_page']):p['revision'] for p in updated}})
                    backup=storage.commit_pages(updated,DATA,BACKUP)
                    return self.send(200,{'pages':[p['pdf_page'] for p in updated],'backup':backup})
                if path=='/api/pdf':
                    pdf=render_pdf(incoming,current,AUDIT,include_annotations=ANNOTATIONS_ENABLED)
                    EXPORTS.mkdir(exist_ok=True,parents=True);key=secrets.token_hex(12)
                    storage.atomic_bytes(EXPORTS/(key+'.pdf'),pdf)
                    storage.atomic_bytes(EXPORTS/(key+'.layout.json'),json.dumps(incoming,ensure_ascii=False).encode('utf-8'))
                    return self.send(200,{'url':'/exports/'+key+'.pdf','pages':len(PdfReader(io.BytesIO(pdf)).pages),'bytes':len(pdf)})
        except (ValueError,TypeError,KeyError,UnicodeError) as e:
            err=str(e);return self.send(409 if err=='revision_conflict' else 400,{'error':err})
        except OSError as e:
            print('File operation failed:',type(e).__name__,flush=True);return self.send(500,{'error':'file_operation_failed'})
    def do_PUT(self):
        if not self.allowed_host() or self.headers.get('X-Study-Token')!=TOKEN: return self.send(403,{'error':'invalid_session'})
        origin=self.headers.get('Origin')
        if origin and origin not in [f'http://localhost:{self.server.server_port}',f'http://127.0.0.1:{self.server.server_port}']: return self.send(403,{'error':'invalid_origin'})
        path=urlsplit(self.path).path
        valid={f'/api/pages/{n}':n for n in page_numbers()}
        if path not in valid: return self.send(404,{'error':'not_found'})
        try: size=int(self.headers.get('Content-Length','0'))
        except ValueError: return self.send(400,{'error':'invalid_length'})
        if not 0<size<=1000000: return self.send(413,{'error':'invalid_length'})
        try: patch=json.loads(self.rfile.read(size))
        except (ValueError,UnicodeError): return self.send(400,{'error':'invalid_json'})
        n=valid[path]
        with LOCK:
            old=read_page(n)
            try: updated=validate_patch(old,patch)
            except (ValueError,TypeError,KeyError) as e:
                err=str(e); return self.send(409 if err=='revision_conflict' else 400,{'error':err,'revision':old['revision']})
            updated['revision']+=1
            updated['updated_at']=datetime.now(timezone.utc).isoformat()
            target=DATA/f'p{n:04}.json'
            BACKUP.mkdir(parents=True,exist_ok=True)
            backup=BACKUP/f'p{n:04}-r{updated["revision"]-1}-{secrets.token_hex(4)}.json'
            temp=target.with_suffix('.tmp')
            try:
                backup.write_bytes(target.read_bytes())
                with temp.open('w',encoding='utf-8') as f:
                    json.dump(updated,f,ensure_ascii=False,indent=2); f.write('\n'); f.flush(); os.fsync(f.fileno())
                os.replace(temp,target)
            except OSError:
                return self.send(500,{'error':'save_failed'})
            return self.send(200,{'revision':updated['revision'],'updated_at':updated['updated_at']})

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--port',type=int,default=8767); args=parser.parse_args()
    storage.recover(DATA,BACKUP)
    for n in page_numbers(): read_page(n)
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(f'Local: http://127.0.0.1:{server.server_port}',flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
