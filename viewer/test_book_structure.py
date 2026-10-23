import copy, io, json, unittest
from pathlib import Path
from pypdf import PdfReader
import storage
from pdf_export import render_pdf
ROOT=Path(__file__).resolve().parents[1]
def page(n):return json.loads((ROOT/f'private/content/viewer/p{n:04}.json').read_text(encoding='utf-8'))
class BookStructureTests(unittest.TestCase):
    def test_old_bundle_preserves_new_footer_but_not_missing_body(self):
        old=page(91);data=storage.bundle([copy.deepcopy(old)],'book')
        data['pages'][0]['blocks']=[b for b in data['pages'][0]['blocks'] if b['kind']!='footer']
        self.assertEqual(storage.import_pages(data,{91:old},'book'),[old])
        data['pages'][0]['blocks'].pop(0)
        with self.assertRaises(ValueError):storage.import_pages(data,{91:old},'book')
    def test_special_pages_roundtrip_and_cannot_retarget_contents(self):
        pages={n:page(n) for n in [4,5,8,9]};data=storage.bundle(list(pages.values()),'book')
        self.assertEqual(storage.import_pages(data,pages,'book'),list(pages.values()))
        data['pages'][1]['blocks'][1]['structure']['target_pdf_page']=90
        with self.assertRaisesRegex(ValueError,'source_content_changed'):storage.import_pages(data,pages,'book')
    def test_pdf_links_only_to_included_pages_and_empty_art_exports(self):
        pages={n:page(n) for n in [5,8]}
        def snapshot(numbers):
            result=[]
            for n in numbers:
                p=pages[n];blocks=[]
                for b in p['blocks']:
                    runs=[{'text':c,'font':'sans-sc-700','x':40,'y':60,'size':b['layout']['font_size'],'color':'#eeeeee'} for c in b['translation']['text']]
                    blocks.append({'id':b['id'],'text':b['translation']['text'],'overflow':False,'runs':runs})
                result.append({'number':n,'revision':p['revision'],'blocks':blocks})
            return {'version':1,'pages':result}
        doc=PdfReader(io.BytesIO(render_pdf(snapshot([5,8]),pages,ROOT/'private/extracted/audit/samples',include_annotations=False)))
        self.assertEqual(len(doc.pages),2);self.assertEqual(len(doc.pages[0]['/Annots']),1)
        self.assertEqual(doc.pages[0]['/Annots'][0].get_object()['/Subtype'],'/Link')
        single=PdfReader(io.BytesIO(render_pdf(snapshot([5]),pages,ROOT/'private/extracted/audit/samples',include_annotations=False)))
        self.assertFalse(single.pages[0].get('/Annots'));self.assertIn('目录',single.outline[0].title)
