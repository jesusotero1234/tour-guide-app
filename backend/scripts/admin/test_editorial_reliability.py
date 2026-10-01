import copy
import json
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).parent/'editorial_runtime'))
import citations
import contracts

FIXTURES=Path(__file__).parent/'fixtures/reliability'
class CitationTests(unittest.TestCase):
    def test_marseille_original_objection_survives(self):
        fixture=json.loads((FIXTURES/'marseille-teacher.json').read_text())
        original=copy.deepcopy(fixture['response'])
        response=copy.deepcopy(original)
        audit=citations.normalize_response(response,fixture['case'])
        self.assertEqual(contracts.validate_teacher(response,fixture['case']),(True,[]))
        self.assertEqual(response['pieces'][0]['decision'],'ADJUST')
        self.assertEqual(response['pieces'][0]['factualConcerns'][0]['problem'],original['pieces'][0]['factualConcerns'][0]['problem'])
        self.assertTrue(any('Observatoire' in a['before'] and a['links'] for a in audit))
        self.assertEqual(fixture['response'],original)
    def test_span_is_literal_and_links_recorded(self):
        source="dans l'[Observatoire de Marseille](https://example.org/a(b))\n."
        result=citations.resolve("l’Observatoire de Marseille.",source)
        self.assertEqual(source[result['sourceStart']:result['sourceEnd']],result['after'])
        self.assertEqual(result['links'][0]['url'],'https://example.org/a(b)')
    def test_invented_numbers_negation_order_wrong_passage_rejected(self):
        source='Il a ouvert en 1864. Il ne se trouve pas dans le palais.'
        for quote in ['Il a ouvert en 1865.','Il se trouve dans le palais.','dans le palais ... ouvert en 1864','un observatoire différent']:
            with self.subTest(quote=quote),self.assertRaises(ValueError): citations.resolve(quote,source)
    def test_ambiguous_fragments_rejected(self):
        with self.assertRaises(ValueError): citations.resolve('ancien ... palais','ancien palais, ancien palais')
    def test_no_paragraph_substitution(self):
        piece={'pieceId':'Q1','paragraphs':[{'paragraphId':'p01','text':'Le palais date de 1864.'}]}
        for field in ['protect','changes','factualConcerns','issues','lostUsefulDetails']:
            obj={'pieces':[{'pieceId':'Q1',field:[{'paragraphId':'p01','quote':'Le palais date de 1900.'}]}]}
            with self.subTest(field=field),self.assertRaisesRegex(ValueError,field): citations.normalize_response(obj,{'pieces':[piece]})
    def test_frozen_spanish_teacher(self):
        f=json.loads((FIXTURES/'sevilla-teacher.json').read_text())
        citations.normalize_response(f['response'],f['case'])
        self.assertEqual(contracts.validate_teacher(f['response'],f['case']),(True,[]))

class BudgetTests(unittest.TestCase):
    def test_shared_folders_uncertain_and_restart_do_not_reset_limit(self):
        import tempfile
        import budget
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            payload={'model':'deepseek-v4-flash','messages':[{'role':'user','content':'a'*200000}], 'max_tokens':32768}
            keys=[]
            for n in range(4): keys.append(budget.reserve(root,root/f'recovery-{n}/attempt-1.json',payload))
            budget.settle(root,keys[0],{'entry':{'status':'TRANSPORT_ERROR'},'body':None})
            self.assertEqual(json.loads((root/'editorial-budget.json').read_text())['requests'][keys[0]]['status'],'uncertain')
            with self.assertRaises(budget.BudgetError): budget.reserve(root,root/'fresh-directory/attempt-1.json',payload)
            with self.assertRaises(budget.BudgetError): budget.reserve(root,keys[0],payload)
    def test_actual_usage_releases_only_unused_exposure(self):
        import tempfile
        import budget
        with tempfile.TemporaryDirectory() as d:
            p={'model':'deepseek-v4-flash','messages':[], 'max_tokens':32768}
            key=budget.reserve(d,Path(d)/'attempt.json',p)
            budget.settle(d,key,{'entry':{'status':'HTTP_OK'},'body':{'usage':{'prompt_tokens':100,'completion_tokens':100}}})
            row=json.loads((Path(d)/'editorial-budget.json').read_text())['requests'][key]
            self.assertAlmostEqual(row['chargedUpperBoundUsd'],.00015)
    def test_unknown_price_refused(self):
        import tempfile
        import budget
        with tempfile.TemporaryDirectory() as d, self.assertRaises(budget.BudgetError):
            budget.reserve(d,Path(d)/'call',{'model':'unknown','messages':[],'max_tokens':1})

class FrozenRomeTests(unittest.TestCase):
    def test_real_review_omissions_resolve_to_same_passage(self):
        f=json.loads((FIXTURES/'roma-evidence.json').read_text())
        passages={p['passageId']:p['quote'] for p in f['evidence']['passages']}
        for issue in f['issues']:
            for item in issue['evidence']:
                span=citations.resolve(item['quote'],passages[item['passageId']])
                self.assertIn(span['after'],passages[item['passageId']])
