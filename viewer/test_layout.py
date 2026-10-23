import unittest,json,copy
from pathlib import Path
import storage
class FlowTests(unittest.TestCase):
    def setUp(self):
        self.page=json.loads((Path(__file__).resolve().parents[1]/'private/content/viewer/p0094.json').read_text(encoding='utf-8'))
        self.patch={'revision':self.page['revision'],'blocks':[{'id':b['id'],'text':b['translation']['text'],'spans':b['translation']['spans'],'layout':copy.deepcopy(b['layout'])} for b in self.page['blocks']]}
    def test_flow_and_anchor_survive_roundtrip(self):
        self.patch['blocks'][1]['layout']['resize_anchor']='right'
        loaded=storage.patch_page(self.page,self.patch)
        self.assertEqual(loaded['blocks'][1]['layout']['resize_anchor'],'right')
        self.assertEqual(loaded['blocks'][3]['layout']['flow_after'],'p0094-b003')
        self.assertEqual(loaded['blocks'][3]['layout']['gap_before'],12)
    def test_cycles_and_unknown_flow_parents_rejected(self):
        for target in ['missing','p0094-b003','p0094-b005']:
            p=copy.deepcopy(self.patch);p['blocks'][2]['layout']['flow_after']=target
            with self.assertRaisesRegex(ValueError,'invalid_flow_chain'):storage.patch_page(self.page,p)
