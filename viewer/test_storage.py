import unittest, copy, json, tempfile
from pathlib import Path
from unittest.mock import patch
import storage

class StorageTests(unittest.TestCase):
    def setUp(self):
        root=Path(__file__).resolve().parents[1]
        self.pages={n:json.loads((root/f'private/content/viewer/p{n:04}.json').read_text(encoding='utf-8')) for n in (90,93)}
        self.sha='book';self.bundle=storage.bundle(list(self.pages.values()),self.sha)
    def test_lossless_text_format_and_layout_roundtrip(self):
        parsed=json.loads(json.dumps(self.bundle,ensure_ascii=False))
        loaded=storage.import_pages(parsed,self.pages,self.sha)
        self.assertEqual(loaded,list(self.pages.values()))
    def test_wrong_book_source_and_duplicate_ids_are_rejected(self):
        cases=[]
        x=copy.deepcopy(self.bundle);x['book']['source_sha256']='other';cases.append(x)
        x=copy.deepcopy(self.bundle);x['pages'][0]['blocks'][0]['source']['text']='changed';cases.append(x)
        x=copy.deepcopy(self.bundle);x['pages'][0]['blocks'][1]['id']=x['pages'][0]['blocks'][0]['id'];cases.append(x)
        x=copy.deepcopy(self.bundle);x['pages'][0]['image_url']='file:///secret';cases.append(x)
        x=copy.deepcopy(self.bundle);x['version']=999;cases.append(x)
        for data in cases:
            with self.assertRaises(ValueError):storage.import_pages(data,self.pages,self.sha)
    def test_stale_import_does_not_overwrite_newer_edit(self):
        expected={str(n):p['revision'] for n,p in self.pages.items()};self.pages[93]['revision']+=1
        with self.assertRaisesRegex(ValueError,'revision_conflict'):storage.import_pages(self.bundle,self.pages,self.sha,expected)
    def test_unicode_spans_do_not_split_surrogates_or_overlap(self):
        text='中😀word';self.assertEqual(storage.validate_spans(text,[{'start':3,'end':7,'italic':True}])[0]['start'],3)
        for spans in [[{'start':2,'end':7}],[{'start':3,'end':7},{'start':4,'end':5}],[{'start':3,'end':999}]]:
            with self.assertRaises(ValueError):storage.validate_spans(text,spans)
    def test_multi_page_commit_and_crash_recovery(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp)/'pages';directory.mkdir();backup=Path(tmp)/'backups'
            for n,p in self.pages.items():(directory/f'p{n:04}.json').write_text(json.dumps(p),encoding='utf-8')
            updated=copy.deepcopy(list(self.pages.values()));updated[0]['blocks'][0]['translation']['text']='修改'
            name=storage.commit_pages(updated,directory,backup)
            self.assertEqual(json.loads((directory/'p0090.json').read_text(encoding='utf-8'))['blocks'][0]['translation']['text'],'修改')
            journal=backup/name/'transaction.json';data=json.loads(journal.read_text());data['status']='pending';journal.write_text(json.dumps(data))
            storage.recover(directory,backup)
            self.assertEqual(json.loads((directory/'p0090.json').read_text(encoding='utf-8')),self.pages[90])
    def test_failed_multi_page_write_rolls_back_earlier_pages(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp)/'pages';directory.mkdir();backup=Path(tmp)/'backups'
            for n,p in self.pages.items():(directory/f'p{n:04}.json').write_text(json.dumps(p),encoding='utf-8')
            real=storage.atomic_bytes;failed=False
            def write(path,data):
                nonlocal failed
                if path==directory/'p0093.json' and not failed:failed=True;raise OSError('disk failure')
                return real(path,data)
            updated=copy.deepcopy(list(self.pages.values()));updated[0]['blocks'][0]['translation']['text']='must roll back'
            with patch.object(storage,'atomic_bytes',write):
                with self.assertRaises(OSError):storage.commit_pages(updated,directory,backup)
            for n,p in self.pages.items():self.assertEqual(json.loads((directory/f'p{n:04}.json').read_text(encoding='utf-8')),p)

if __name__=='__main__':unittest.main(verbosity=2)
