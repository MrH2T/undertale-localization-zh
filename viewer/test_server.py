"""Exercise saves against temporary files, never the user's study data."""
import unittest, tempfile, threading, json, urllib.request, urllib.error, copy
from pathlib import Path
import server, seed_samples

class SaveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory(); server.DATA=Path(cls.tmp.name)/'data';server.DATA.mkdir();server.BACKUP=Path(cls.tmp.name)/'backups'
        cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True);cls.thread.start()
        cls.base=f'http://127.0.0.1:{cls.http.server_port}'
    @classmethod
    def tearDownClass(cls): cls.http.shutdown();cls.http.server_close();cls.tmp.cleanup()
    def setUp(self):
        for n,p in seed_samples.PAGES.items(): (server.DATA/f'p{n:04}.json').write_text(json.dumps(p,ensure_ascii=False),encoding='utf-8')
    def request(self,path,body=None,token=server.TOKEN,origin=None):
        headers={'X-Study-Token':token,'Content-Type':'application/json'}
        if origin: headers['Origin']=origin
        req=urllib.request.Request(self.base+path,data=json.dumps(body).encode() if body is not None else None,headers=headers,method='PUT' if body is not None else 'GET')
        try:
            with urllib.request.urlopen(req) as r:return r.status,json.loads(r.read())
        except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
    def patch(self):
        p=server.read_page(60)
        return {'revision':p['revision'],'blocks':[{'id':b['id'],'text':b['translation']['text'],'layout':copy.deepcopy(b['layout'])} for b in p['blocks']]}
    def test_persistent_save_backup_and_source_unchanged(self):
        patch=self.patch();patch['blocks'][0]['text']='中文持久化检查';patch['blocks'][0]['layout']['font_size']=32
        code,result=self.request('/api/pages/60',patch);self.assertEqual(code,200)
        disk=server.read_page(60);self.assertEqual(disk['blocks'][0]['translation']['text'],'中文持久化检查');self.assertEqual(disk['revision'],1)
        self.assertEqual(disk['blocks'][0]['source'],seed_samples.PAGES[60]['blocks'][0]['source'])
        self.assertTrue(list(server.BACKUP.glob('p0060-r0-*.json')))
    def test_stale_revision_is_not_overwritten(self):
        p=self.patch();self.assertEqual(self.request('/api/pages/60',p)[0],200)
        p['blocks'][0]['text']='stale';self.assertEqual(self.request('/api/pages/60',p)[0],409)
        self.assertNotEqual(server.read_page(60)['blocks'][0]['translation']['text'],'stale')
    def test_invalid_layout_does_not_partially_write(self):
        p=self.patch();p['blocks'][0]['text']='must not save';p['blocks'][1]['layout']['bbox']=[.9,.1,.2,.5]
        self.assertEqual(self.request('/api/pages/60',p)[0],400)
        self.assertEqual(server.read_page(60)['revision'],0)
        self.assertNotEqual(server.read_page(60)['blocks'][0]['translation']['text'],'must not save')
    def test_unknown_token_and_foreign_origin_rejected(self):
        self.assertEqual(self.request('/api/pages/60',self.patch(),token='bad')[0],403)
        self.assertEqual(self.request('/api/pages/60',self.patch(),origin='https://example.com')[0],403)
    def test_arbitrary_files_unavailable(self):
        self.assertEqual(self.request('/private/content/glossary.json')[0],404)
        self.assertEqual(self.request('/../AGENTS.md')[0],404)

    def test_fonts_available_only_from_whitelist(self):
        for name in ('serif-sc','sans-sc','serif-jp','serif-latin','serif-latin-italic'):
            with urllib.request.urlopen(self.base+'/fonts/'+name+'.woff2') as response:
                self.assertEqual(response.headers.get_content_type(),'font/woff2')
                self.assertEqual(response.read(4),b'wOF2')
        self.assertEqual(self.request('/fonts/serif-sc.json')[0],404)
        self.assertEqual(self.request('/fonts/../../server.py')[0],404)
    def test_save_preserves_reviewed_typography(self):
        before=copy.deepcopy(server.read_page(60))
        self.assertEqual(self.request('/api/pages/60',self.patch())[0],200)
        after=server.read_page(60)
        self.assertEqual(before['reference_size'],after['reference_size'])
        self.assertEqual(before['typography'],after['typography'])
        for old,new in zip(before['blocks'],after['blocks']):
            self.assertEqual(old['source']['mask_bbox'],new['source']['mask_bbox'])
            self.assertEqual(old['layout'],new['layout'])
            self.assertEqual(old['calibration'],new['calibration'])

if __name__=='__main__': unittest.main(verbosity=2)
