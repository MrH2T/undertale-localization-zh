import unittest, copy, json, io, re
from pathlib import Path
from pypdf import PdfReader
import storage
from annotations import anchor_at, validate_notes, resolve
from pdf_export import render_pdf

ROOT=Path(__file__).resolve().parents[1]
def entry(text='A word B'):
    return dict(id='n1',anchor=anchor_at(text,'word'),original='word',reading='',gloss_zh='词语',note_zh='中文说明 <原语> & 释义',language='en',source_kind='verbatim',role='term',source_ref='第 60 页',status='draft')
class AnnotationTests(unittest.TestCase):
    def test_anchor_unicode_moves_and_does_not_rebind_deleted_or_ambiguous_text(self):
        a=anchor_at('😀前 word 后','word');self.assertEqual(a['start'],4)
        self.assertEqual(resolve('增加 😀前 word 后',a)['start'],7)
        orphan=resolve('word 在另一处 word',anchor_at('原来 word 在这','word'))
        self.assertEqual(orphan['status'],'orphan')
        self.assertEqual(resolve('现在 word 只出现一次',orphan)['status'],'orphan')
        self.assertEqual(resolve('删去目标',a)['status'],'orphan')
    def test_notes_roundtrip_and_legacy_import_preserves_notes(self):
        p=json.loads((ROOT/'private/content/viewer/p0140.json').read_text(encoding='utf-8'));pages={140:p}
        n=entry();n['anchor']=anchor_at(p['blocks'][2]['translation']['text'],'COOL DUDE');n['original']='COOL DUDE'
        p['blocks'][2]['annotations']=[n]
        package=storage.bundle([p],'book');loaded=storage.import_pages(json.loads(json.dumps(package)),pages,'book')[0]
        self.assertEqual(loaded,p)
        old=copy.deepcopy(package);old['version']=1
        for b in old['pages'][0]['blocks']:b.pop('annotations',None)
        self.assertEqual(storage.import_pages(old,pages,'book')[0],p)
        new=copy.deepcopy(package);new['pages'][0]['blocks'][2]['annotations'][0]['note_zh']='修改后的注释'
        self.assertEqual(storage.import_pages(new,pages,'book')[0]['blocks'][2]['annotations'][0]['note_zh'],'修改后的注释')
        new['pages'][0]['blocks'][2]['annotations']=[]
        self.assertEqual(storage.import_pages(new,pages,'book')[0]['blocks'][2]['annotations'],[])
    def test_validation_and_source_protection(self):
        for mutate in [lambda n:n.update(language='xx'),lambda n:n.update(source_kind='guessed'),lambda n:n.update(id='../../x'),lambda n:n.update(note_zh='x'*12001),lambda n:n['anchor'].update(start=-1)]:
            n=entry();mutate(n)
            with self.assertRaises(ValueError):validate_notes([n],'A word B')
        with self.assertRaises(ValueError):validate_notes([entry(),entry()],'A word B')
        n=entry();n['note_zh']='<script>alert(1)</script>';self.assertEqual(validate_notes([n],'A word B')[0]['note_zh'],n['note_zh'])
    def test_pdf_notes_are_printable_paginate_and_link(self):
        n=entry('');n['anchor']=anchor_at('','');n['original']='イカした こうげき';n['language']='ja'
        n['note_zh']='起始注释。'+('中文说明与可打印内容。'*500)+'末尾注释。'
        page={'pdf_page':60,'revision':1,'reference_size':[600,800],'physical_size_pt':[300,400],'blocks':[{'id':'b1','kind':'paragraph','source':{'bbox':[.1,.1,.8,.2]},'translation':{'text':''},'layout':{'bbox':[.1,.1,.8,.2],'font_size':20},'annotations':[n]}]}
        snapshot={'version':1,'pages':[{'number':60,'revision':1,'blocks':[{'id':'b1','text':'','overflow':False,'runs':[]}]}]}
        pdf=PdfReader(io.BytesIO(render_pdf(snapshot,{60:page},ROOT/'private/extracted/audit/samples')))
        self.assertGreater(len(pdf.pages),3)
        text=''.join(re.sub(r'^译注私人学习·注释\d+','', ''.join(p.extract_text().split())) for p in pdf.pages[1:])
        self.assertIn('起始注释。',text);self.assertIn('末尾注释。',text);self.assertIn('イカしたこうげき',text)
        self.assertEqual(text.count('中文说明与可打印内容。'),500)
        self.assertTrue(any(a.get_object().get('/Subtype')=='/Link' for a in pdf.pages[0]['/Annots']))
        self.assertTrue(any(a.get_object().get('/Subtype')=='/Highlight' for a in pdf.pages[0]['/Annots']))
        plain=PdfReader(io.BytesIO(render_pdf(snapshot,{60:page},ROOT/'private/extracted/audit/samples',include_annotations=False)))
        self.assertEqual(len(plain.pages),1)
        self.assertNotIn('/Annots',plain.pages[0])

if __name__=='__main__':unittest.main()
