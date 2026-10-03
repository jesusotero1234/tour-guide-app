import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / 'editorial_runtime'))
import order_neutral as on


def kinds(text, lang, **kwargs):
    return [f['kind'] for f in on.find_order_references(text, lang, **kwargs)]


# (language, text that announces the next stop, text of the same length that does not)
NEXT = {
    'es': ("Se terminó en 1498. La siguiente parada es la Lonja.", "Se terminó en 1498. Aún hoy impresiona por su altura."),
    'en': ("It was finished in 1498. Next stop: the Exchange.", "It was finished in 1498. It still impresses by its height."),
    'fr': ("Elle fut achevée en 1498. Prochaine étape : la Bourse.", "Elle fut achevée en 1498. Elle impressionne encore par sa hauteur."),
    'de': ("Sie wurde 1498 vollendet. Die nächste Station ist die Börse.", "Sie wurde 1498 vollendet. Sie beeindruckt noch heute durch ihre Höhe."),
    'it': ("Fu finita nel 1498. La prossima tappa è la Borsa.", "Fu finita nel 1498. Colpisce ancora oggi per la sua altezza."),
}
FREE_VARIANTS = [  # the 17-31 % of real announcements that do not use the fixed formula, taken from the published catalogue
    ('es', "Continuamos en Plaza de la Virgen."), ('es', "Ahora vamos hacia la catedral."), ('en', "Let's head to the loggia."),
    ('fr', "Notre prochain arrêt est la basilique San Petronio."), ('fr', "Il nous reste la place."), ('de', "Wir gehen weiter zur Börse."),
    ('it', "Camminando verso l'Arena, tieni a mente una cosa."), ('it', "Quando proseguiremo, ci attende la Conciergerie."),
    ('en', "That relationship is the gateway to what comes next."),
]


class Announcements(unittest.TestCase):
    def test_formula_positive_and_negative_in_every_language(self):
        for lang, (yes, no) in NEXT.items():
            with self.subTest(lang=lang):
                self.assertEqual(kinds(yes, lang), ['NEXT_STOP'])
                self.assertEqual(kinds(no, lang), [])

    def test_free_variants_are_found(self):
        for lang, sentence in FREE_VARIANTS:
            with self.subTest(sentence=sentence):
                self.assertIn('NEXT_STOP', kinds("Un párrafo de historia. " + sentence, lang))

    def test_only_the_closing_sentences_count(self):
        body = "Aquí empieza la siguiente parada del proyecto de 1498. " + "Frase de contenido. " * 4 + "Cierre sin anuncio."
        self.assertEqual(kinds(body, 'es'), [])
        self.assertEqual(kinds("Contenido. Contenido. La siguiente parada es X. Cierre.", 'es'), ['NEXT_STOP'])      # second to last: inside the tail
        self.assertEqual(kinds("Contenido. Contenido. Contenido. La siguiente parada es X. Cierre.", 'es'), ['NEXT_STOP'])

    def test_naming_the_next_stop_in_the_last_sentence_is_an_announcement(self):
        text = "Fue palacio y cárcel. Desde aquí se ve la Plaza de la Virgen."
        self.assertEqual(kinds(text, 'es', next_name='Plaza de la Virgen'), ['NEXT_STOP'])
        self.assertEqual(kinds(text, 'es'), [])
        self.assertEqual(kinds("Se ve la Plaza de la Virgen desde aquí. Fue palacio y cárcel.", 'es', next_name='Plaza de la Virgen'), [])  # not the last sentence
        self.assertEqual(kinds(text, 'es', next_name='Plaza de la Vir'), [])                                                                    # whole words only


class OtherKinds(unittest.TestCase):
    def test_previous_stop(self):
        for lang, text in (('es', "Como vimos en la parada anterior, la muralla cayó."), ('en', "As we saw at the previous stop, the wall fell."),
                           ('fr', "Comme nous l'avons vu à l'étape précédente, le mur tomba."), ('de', "Wie wir gesehen haben, fiel die Mauer an der vorherigen Station."),
                           ('it', "Come abbiamo visto nella tappa precedente, il muro cadde.")):
            with self.subTest(lang=lang):
                self.assertIn('PREVIOUS_STOP', kinds(text + " Resto.", lang))
                self.assertEqual(kinds("El muro cayó en 1492.", lang), [])

    def test_previous_stop_is_looked_for_in_the_whole_body_not_only_the_end(self):
        self.assertEqual(kinds("Como vimos antes, cayó la muralla. " + "Contenido. " * 6, 'es'), ['PREVIOUS_STOP'])

    def test_finish_only_matters_in_the_last_stop(self):
        text = "La historia termina aquí. Terminamos aquí el recorrido."
        self.assertEqual(set(kinds(text, 'es', role='last_stop')), {'FINISH'})            # one finding per sentence that closes
        self.assertEqual(kinds(text, 'es', role='stop'), [])
        for lang, closing in (('en', "We end the walk here."), ('fr', "Nous terminons ici."), ('de', "Der Rundgang endet hier."), ('it', "Terminiamo qui.")):
            self.assertIn('FINISH', kinds("Fine. " + closing, lang, role='last_stop'))

    def test_introduction_start(self):
        for lang, text in (('es', "Bienvenidos a Valencia. Empezamos en las Torres de Serranos."), ('en', "Welcome. We begin at the gate."),
                           ('fr', "Bienvenue. Nous commençons à la porte."), ('de', "Willkommen. Wir beginnen am Tor."), ('it', "Benvenuti. Cominciamo dalla porta.")):
            with self.subTest(lang=lang):
                self.assertIn('START', kinds(text, lang, role='introduction'))
        self.assertEqual(kinds("Valencia nació en 138 a. C. como colonia romana.", 'es', role='introduction'), [])
        self.assertEqual(kinds("Prima di cominciare, pensa che la città è antica, poi guarda.", 'it', role='introduction'), [])   # "before starting" is not a start

    def test_an_ordered_enumeration_of_the_stops_is_a_start(self):
        self.assertIn('START', kinds("Veremos la ciudad. Primero, la puerta medieval; luego, el arco; después, la plaza.", 'es', role='introduction'))

    def test_introduction_that_leads_to_a_stop_is_an_announcement(self):
        self.assertIn('NEXT_STOP', kinds("Valencia es antigua. La primera parada nos espera.", 'es', role='introduction'))

    def test_findings_carry_the_sentence_index_and_the_match(self):
        found = on.find_order_references("Uno. Dos. La siguiente parada es X.", 'es', role='stop')
        self.assertEqual((found[0]['kind'], found[0]['sentence_index'], found[0]['match'].lower()), ('NEXT_STOP', 2, 'siguiente parada'))

    def test_invalid_role_and_language_are_handled(self):
        with self.assertRaises(ValueError):
            on.find_order_references("x", 'es', role='epilogue')
        self.assertEqual(kinds("La siguiente parada.", 'pt'), [])                       # unknown language: nothing to match


if __name__ == '__main__':
    unittest.main()
