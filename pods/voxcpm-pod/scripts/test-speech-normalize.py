#!/usr/bin/env python3
"""Golden and property tests for the spoken-text normalizer (plan 02).

PLAN_ROWS are the rows of the tables in docs/plans/20261001-audio-paradas-ui-backend/02-texto-hablado.md section 4.
EXTRA_ROWS are realistic sentences whose output was reviewed by hand before being frozen here.
"""
import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

POD = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(POD / "src"))
from utils.sanitize import sanitize_text
from utils.speech import SPEECH_VERSION, gate, normalize

PLAN_ROWS = {
    'es': [
        ('en 1876', 'en mil ochocientos setenta y seis'),
        ('el 6 de abril de 1392', 'el seis de abril de mil trescientos noventa y dos'),
        ('el 1 de mayo', 'el uno de mayo'),
        ('siglo XIV', 'siglo catorce'),
        ('siglos XIII y XIV', 'siglos trece y catorce'),
        ('siglos XIII, XIV y XV', 'siglos trece, catorce y quince'),
        ('siglo I a. C.', 'siglo primero antes de Cristo'),
        ('siglo X', 'siglo diez'),
        ('s. XV', 'siglo quince'),
        ('Jaime I', 'Jaime primero'),
        ('Felipe II', 'Felipe segundo'),
        ('Alfonso X', 'Alfonso décimo'),
        ('Alfonso XIII', 'Alfonso trece'),
        ('Luis XIV', 'Luis catorce'),
        ('1657-1658', 'de mil seiscientos cincuenta y siete a mil seiscientos cincuenta y ocho'),
        ('la guerra de 1657-1658', 'la guerra de mil seiscientos cincuenta y siete a mil seiscientos cincuenta y ocho'),
        ('entre 1392 y 1398', 'entre mil trescientos noventa y dos y mil trescientos noventa y ocho'),
        ('15.800 tubos', 'quince mil ochocientos tubos'),
        ('200 personas', 'doscientas personas'),
        ('21 torres', 'veintiuna torres'),
        ('1 iglesia', 'una iglesia'),
        ('3,5 km', 'tres coma cinco kilómetros'),
        ('52 m', 'cincuenta y dos metros'),
        ('45 %', 'cuarenta y cinco por ciento'),
        ('150.º aniversario', 'ciento cincuenta aniversario'),
        ('1.º', 'primero'),
        ('2.ª', 'segunda'),
        ('n.º 31', 'número treinta y uno'),
        ('número 31', 'número treinta y uno'),
        ('c. 1450', 'hacia mil cuatrocientos cincuenta'),
        ('ca. 1450', 'hacia mil cuatrocientos cincuenta'),
        ('a. C.', 'antes de Cristo'),
        ('d. C.', 'después de Cristo'),
        ('los años 20', 'los años veinte'),
    ],
    'en': [
        ('in 1876', 'in eighteen seventy-six'),
        ('in 1900', 'in nineteen hundred'),
        ('in 2000', 'in two thousand'),
        ('in 2014', 'in twenty fourteen'),
        ('in 1005', 'in ten oh five'),
        ('the 1870s', 'the eighteen seventies'),
        ('mid-1860s', 'mid eighteen sixties'),
        ('October 15, 1813', 'October fifteenth, eighteen thirteen'),
        ('15 October 1813', 'the fifteenth of October, eighteen thirteen'),
        ('Louis XIV', 'Louis the Fourteenth'),
        ('Napoleon I', 'Napoleon the First'),
        ('World War II', 'World War Two'),
        ('Pope Pius IX', 'Pope Pius the Ninth'),
        ('the 8th century', 'the eighth century'),
        ('148 B.C.', 'one hundred forty-eight B C'),
        ('A.D. 30', 'A D thirty'),
        ('1657-1658', 'sixteen fifty-seven to sixteen fifty-eight'),
        ('15,800', 'fifteen thousand eight hundred'),
        ('45%', 'forty-five percent'),
        ('15th USAAF', 'Fifteenth U S A A F'),
        ('St. Sebald', 'Saint Sebald'),
    ],
    'fr': [
        ('en 1776', 'en mille sept cent soixante-seize'),
        ('XIXe siècle', 'dix-neuvième siècle'),
        ('XIXᵉ siècle', 'dix-neuvième siècle'),
        ('Ier siècle', 'premier siècle'),
        ('Louis XIV', 'Louis quatorze'),
        ('Napoléon III', 'Napoléon trois'),
        ('François Ier', 'François premier'),
        ('VIIIe siècle av. J.-C.', 'huitième siècle avant Jésus-Christ'),
        ('apr. J.-C.', 'après Jésus-Christ'),
        ('15 800 tuyaux', 'quinze mille huit cents tuyaux'),
        ('45 %', 'quarante-cinq pour cent'),
        ('le 2e régiment', 'le deuxième régiment'),
        ('le 1er mai', 'le premier mai'),
        ('de 1855 à 1856', 'de mille huit cent cinquante-cinq à mille huit cent cinquante-six'),
        ('1855-1856', 'de mille huit cent cinquante-cinq à mille huit cent cinquante-six'),
        ('St Michel', 'Saint Michel'),
        ('Ste Anne', 'Sainte Anne'),
        ('n° 28', 'numéro vingt-huit'),
    ],
    'de': [
        ('1691', 'sechzehnhunderteinundneunzig'),
        ('2014', 'zweitausendvierzehn'),
        ('im 19. Jahrhundert', 'im neunzehnten Jahrhundert'),
        ('das 19. Jahrhundert', 'das neunzehnte Jahrhundert'),
        ('Ende des 16. Jahrhunderts', 'Ende des sechzehnten Jahrhunderts'),
        ('seit dem 25. März 1994', 'seit dem fünfundzwanzigsten März neunzehnhundertvierundneunzig'),
        ('am 3. Juni', 'am dritten Juni'),
        ('im 8. Jahrhundert v. Chr.', 'im achten Jahrhundert vor Christus'),
        ('n. Chr.', 'nach Christus'),
        ('1.665 Meter', 'eintausendsechshundertfünfundsechzig Meter'),
        ('45 %', 'fünfundvierzig Prozent'),
        ('St. Sebald', 'Sankt Sebald'),
        ('z. B.', 'zum Beispiel'),
        ('bzw.', 'beziehungsweise'),
        ('Nr. 5', 'Nummer fünf'),
        ('ca. 1450', 'circa vierzehnhundertfünfzig'),
    ],
    'it': [
        ('nel 1298', 'nel milleduecentonovantotto'),
        ('XIX secolo', 'diciannovesimo secolo'),
        ('secolo XIX', 'secolo diciannovesimo'),
        ('Luigi XIV', 'Luigi quattordicesimo'),
        ('Vittorio Emanuele II', 'Vittorio Emanuele secondo'),
        ('148 a.C.', 'centoquarantotto avanti Cristo'),
        ('30 d.C.', 'trenta dopo Cristo'),
        ('il 4 febbraio 1957', 'il quattro febbraio millenovecentocinquantasette'),
        ('il 1° maggio', 'il primo maggio'),
        ('15.800 canne', 'quindicimilaottocento canne'),
        ('45%', 'quarantacinque per cento'),
        ("anni '60", 'anni sessanta'),
        ('1657-1658', 'dal milleseicentocinquantasette al milleseicentocinquantotto'),
        ('S. Maria', 'Santa Maria'),
        ('Nel XVIII, la città', 'Nel diciottesimo, la città'),
    ],
}

EXTRA_ROWS = {
    'es': [
        ('Construida entre 1392 y 1398, la torre mide 52 m de altura.', 'Construida entre mil trescientos noventa y dos y mil trescientos noventa y ocho, la torre mide cincuenta y dos metros de altura.'),
        ('En 1492 los Reyes Católicos tomaron Granada.', 'En mil cuatrocientos noventa y dos los Reyes Católicos tomaron Granada.'),
        ('La catedral (siglo XIII) tiene 21 capillas.', 'La catedral, siglo trece, tiene veintiuna capillas.'),
        ('Fernando III el Santo conquistó Sevilla en 1248.', 'Fernando tercero el Santo conquistó Sevilla en mil doscientos cuarenta y ocho.'),
        ('Se reunieron 1.200 personas en el patio.', 'Se reunieron mil doscientas personas en el patio.'),
        ('Entre los siglos XIV y XV se levantó el claustro.', 'Entre los siglos catorce y quince se levantó el claustro.'),
        ('Hacia 1500 había 3 puertas.', 'Hacia mil quinientos había tres puertas.'),
        ('El rey Alfonso X murió en 1284.', 'El rey Alfonso décimo murió en mil doscientos ochenta y cuatro.'),
        ('Ocupa 2,5 hectáreas y tiene 300 columnas.', 'Ocupa dos coma cinco hectáreas y tiene trescientas columnas.'),
        ('Fue en el 476 d. C. cuando cayó Roma.', 'Fue en el cuatrocientos setenta y seis después de Cristo cuando cayó Roma.'),
        ('Medía 1,80 m y pesaba 70 kg.', 'Medía uno coma ochenta metros y pesaba setenta kilos.'),
        ('Visitamos el Palacio en el año 711.', 'Visitamos el Palacio en el año setecientos once.'),
        ('Pío XII fue papa durante la guerra de 1939-1945.', 'Pío doce fue papa durante la guerra de mil novecientos treinta y nueve a mil novecientos cuarenta y cinco.'),
        ('Isabel II reinó en el siglo XIX.', 'Isabel segunda reinó en el siglo diecinueve.'),
        ('En 2014 se restauró; hoy 1 de cada 3 visitantes vuelve.', 'En dos mil catorce se restauró; hoy uno de cada tres visitantes vuelve.'),
    ],
    'en': [
        ('Built between 1392 and 1398, the tower is 52 m tall.', 'Built between thirteen ninety-two and thirteen ninety-eight, the tower is fifty-two meters tall.'),
        ('In 1492 Columbus sailed; 300 men went with him.', 'In fourteen ninety-two Columbus sailed; three hundred men went with him.'),
        ('The cathedral (13th century) has 21 chapels.', 'The cathedral, thirteenth century, has twenty-one chapels.'),
        ('King Henry VIII ruled from 1509 to 1547.', 'King Henry the Eighth ruled from fifteen oh nine to fifteen forty-seven.'),
        ('About 1,200 people met in the square.', 'About one thousand two hundred people met in the square.'),
        ('It stands 2.5 km from the station.', 'It stands two point five kilometers from the station.'),
        ('In the 1920s and early 1930s it was rebuilt.', 'In the nineteen twenties and early nineteen thirties it was rebuilt.'),
        ('George III reigned for 60 years.', 'George the Third reigned for sixty years.'),
        ('She was born on 3 May 1901.', 'She was born on the third of May, nineteen oh one.'),
        ('Around 1500 there were 3 gates.', 'Around fifteen hundred there were three gates.'),
        ('The Treaty of 1648 ended the war.', 'The Treaty of sixteen forty-eight ended the war.'),
        ('In AD 476 Rome fell.', 'In A D four hundred seventy-six Rome fell.'),
        ('It was 20% larger than before.', 'It was twenty percent larger than before.'),
        ('I met John I think at noon.', 'I met John I think at noon.'),
        ('The 1st of May and 21st Street.', 'The first of May and twenty-first Street.'),
    ],
    'fr': [
        ('Construite entre 1392 et 1398, la tour mesure 52 m de haut.', 'Construite entre mille trois cent quatre-vingt-douze et mille trois cent quatre-vingt-dix-huit, la tour mesure cinquante-deux mètres de haut.'),
        ("En 1492, Christophe Colomb partit; 300 hommes l'accompagnaient.", "En mille quatre cent quatre-vingt-douze, Christophe Colomb partit; trois cents hommes l'accompagnaient."),
        ('La cathédrale (XIIIe siècle) compte 21 chapelles.', 'La cathédrale, treizième siècle, compte vingt et une chapelles.'),
        ('Louis XIV régna de 1643 à 1715.', 'Louis quatorze régna de mille six cent quarante-trois à mille sept cent quinze.'),
        ('Environ 1 200 personnes se sont réunies.', 'Environ mille deux cents personnes se sont réunies.'),
        ('Elle se trouve à 2,5 km de la gare.', 'Elle se trouve à deux virgule cinq kilomètres de la gare.'),
        ('Au XIXe et au XXe siècle, elle fut restaurée.', 'Au dix-neuvième et au vingtième siècle, elle fut restaurée.'),
        ('Henri IV fut assassiné le 14 mai 1610.', 'Henri quatre fut assassiné le quatorze mai mille six cent dix.'),
        ('Le Ier siècle av. J.-C. fut décisif.', 'Le premier siècle avant Jésus-Christ fut décisif.'),
        ('Vers 1500, il y avait 3 portes.', 'Vers mille cinq cents, il y avait trois portes.'),
        ('Le traité de 1648 mit fin à la guerre.', 'Le traité de mille six cent quarante-huit mit fin à la guerre.'),
        ("En l'an 1000, tout changea.", "En l'an mille, tout changea."),
        ('Elle est 20 % plus grande.', 'Elle est vingt pour cent plus grande.'),
        ('Le 1er janvier 1900 et le 2e étage, n° 5.', 'Le premier janvier mille neuf cents et le deuxième étage, numéro cinq.'),
        ('Sainte-Chapelle et St Pierre.', 'Sainte-Chapelle et Saint Pierre.'),
    ],
    'de': [
        ('Gebaut zwischen 1392 und 1398, ist der Turm 52 m hoch.', 'Gebaut zwischen dreizehnhundertzweiundneunzig und dreizehnhundertachtundneunzig, ist der Turm zweiundfünfzig Meter hoch.'),
        ('Im Jahr 1492 segelte Kolumbus; 300 Männer begleiteten ihn.', 'Im Jahr vierzehnhundertzweiundneunzig segelte Kolumbus; dreihundert Männer begleiteten ihn.'),
        ('Unter Karl V. wurde sie erweitert.', 'Unter Karl dem Fünften wurde sie erweitert.'),
        ('Etwa 1.200 Menschen trafen sich auf dem Platz.', 'Etwa eintausendzweihundert Menschen trafen sich auf dem Platz.'),
        ('Sie liegt 2,5 km vom Bahnhof entfernt.', 'Sie liegt zwei Komma fünf Kilometer vom Bahnhof entfernt.'),
        ('Im 18. und 19. Jahrhundert wurde sie umgebaut.', 'Im achtzehnten und neunzehnten Jahrhundert wurde sie umgebaut.'),
        ('Am 3. Oktober 1990 wurde Deutschland vereint.', 'Am dritten Oktober neunzehnhundertneunzig wurde Deutschland vereint.'),
        ('Um 1500 gab es 3 Tore.', 'Um fünfzehnhundert gab es drei Tore.'),
        ('Der Vertrag von 1648 beendete den Krieg.', 'Der Vertrag von sechzehnhundertachtundvierzig beendete den Krieg.'),
        ('Sie ist 20 % größer, z. B. im Chor.', 'Sie ist zwanzig Prozent größer, zum Beispiel im Chor.'),
        ('Das Haus Nr. 5 steht in der Kaiserstr. und der St. Lorenz Kirche.', 'Das Haus Nummer fünf steht in der Kaiserstr. und der Sankt Lorenz Kirche.'),
        ('Im 5. Jahrhundert n. Chr. fiel Rom.', 'Im fünften Jahrhundert nach Christus fiel Rom.'),
        ('Zur Zeit Ludwigs XIV. und für Karl V.', 'Zur Zeit Ludwigs des Vierzehnten und für Karl den Fünften.'),
    ],
    'it': [
        ('Costruita tra il 1392 e il 1398, la torre è alta 52 m.', 'Costruita tra il milletrecentonovantadue e il milletrecentonovantotto, la torre è alta cinquantadue metri.'),
        ('Nel 1492 Colombo salpò; 300 uomini lo accompagnavano.', 'Nel millequattrocentonovantadue Colombo salpò; trecento uomini lo accompagnavano.'),
        ('La cattedrale (XIII secolo) ha 21 cappelle.', 'La cattedrale, tredicesimo secolo, ha ventuno cappelle.'),
        ('Vittorio Emanuele III regnò dal 1900 al 1946.', 'Vittorio Emanuele terzo regnò dal millenovecento al millenovecentoquarantasei.'),
        ('Circa 1.200 persone si riunirono nella piazza.', 'Circa milleduecento persone si riunirono nella piazza.'),
        ('Dista 2,5 km dalla stazione.', 'Dista due virgola cinque chilometri dalla stazione.'),
        ('Nel XV e XVI secolo fu restaurata.', 'Nel quindicesimo e sedicesimo secolo fu restaurata.'),
        ('Giovanni XXIII fu papa nel 1958.', 'Giovanni ventitreesimo fu papa nel millenovecentocinquantotto.'),
        ('Il 2 giugno 1946 nacque la Repubblica.', 'Il due giugno millenovecentoquarantasei nacque la Repubblica.'),
        ("Verso il 1500 c'erano 3 porte.", "Verso il millecinquecento c'erano tre porte."),
        ('Il trattato del 1648 pose fine alla guerra.', 'Il trattato del milleseicentoquarantotto pose fine alla guerra.'),
        ('Nel IV secolo a.C. fu fondata.', 'Nel quarto secolo avanti Cristo fu fondata.'),
        ('È più grande del 20%.', 'È più grande del venti per cento.'),
        ('S. Marco, S. Ambrogio e S. Giovanni.', "San Marco, Sant'Ambrogio e San Giovanni."),
        ("Anni '70 e 3° piano.", 'Anni settanta e terzo piano.'),
    ],
}
ALL_ROWS = {lang: PLAN_ROWS[lang] + EXTRA_ROWS[lang] for lang in PLAN_ROWS}

# Rules added while tuning against the published corpus: (language, tour country, source, expected). Outputs reviewed by hand.
CORPUS_RULE_ROWS = [
    ('es', None, 'del 21 al 24 de agosto', 'del veintiuno al veinticuatro de agosto'),
    ('es', None, 'en 848 y 864', 'en ochocientos cuarenta y ocho y ochocientos sesenta y cuatro'),
    ('es', None, 'a comienzos del XIII.', 'a comienzos del siglo trece.'),
    ('es', None, 'en 1644-45', 'en mil seiscientos cuarenta y cuatro a mil seiscientos cuarenta y cinco'),
    ('es', None, 'el puente Henri-IV', 'el puente Henri cuarto'),
    ('es', None, 'a las 17:30', 'a las diecisiete treinta'),
    ('es', 'DE', 'el St.-Pauli-Elbtunnel', 'el Sankt-Pauli-Elbtunnel'),
    ('es', None, 'en la Königstraße 27', 'en la Königstraße veintisiete'),
    ('es', None, 'en 6.800. El campo', 'en seis mil ochocientos. El campo'),
    ('en', None, 'In AD 476', 'In A D four hundred seventy-six'),
    ('en', None, 'at 5:30 p.m.', 'at five thirty P M'),
    ('en', None, 'George III reigned', 'George the Third reigned'),
    ('en', None, 'in 1644-45', 'in sixteen forty-four to sixteen forty-five'),
    ('en', None, 'between 800 and 900', 'between eight hundred and nine hundred'),
    ('fr', None, 'au XIXe et au XXe siècle', 'au dix-neuvième et au vingtième siècle'),
    ('fr', None, '21 chapelles', 'vingt et une chapelles'),
    ('fr', None, 'à 17h30', 'à dix-sept heures trente'),
    ('fr', None, '1 200 personnes', 'mille deux cents personnes'),
    ('de', None, 'vom 16. bis zum 19. Jahrhundert', 'vom sechzehnten bis zum neunzehnten Jahrhundert'),
    ('de', None, 'der Doge Pietro I Orseolo', 'der Doge Pietro der Erste Orseolo'),
    ('de', None, 'in den 1870er Jahren', 'in den achtzehnhundertsiebziger Jahren'),
    ('de', None, 'um 17:30 Uhr', 'um siebzehn Uhr dreißig'),
    ('de', None, 'Unter Karl V. wurde', 'Unter Karl dem Fünften wurde'),
    ('de', None, 'in der Eberhardstraße 61. Er', 'in der Eberhardstraße einundsechzig. Er'),
    ('de', None, 'Ende des 12. und Anfang des 13. Jahrhunderts', 'Ende des zwölften und Anfang des dreizehnten Jahrhunderts'),
    ('de', None, 'als König Karl V. der Weise', 'als König Karl der Fünfte der Weise'),
    ('de', None, 'vom 21. bis 24. August', 'vom einundzwanzigsten bis vierundzwanzigsten August'),
    ('it', None, 'tra il XVII e il XVIII secolo', 'tra il diciassettesimo e il diciottesimo secolo'),
    ('it', 'DE', 'St. Sebald', 'Sankt Sebald'),
    ('it', None, 'alle 17:30', 'alle diciassette e trenta'),
    ('it', None, 'dal XIII al XV secolo', 'dal tredicesimo al quindicesimo secolo'),
]


class GoldenTests(unittest.TestCase):
    def test_at_least_25_cases_per_language(self):
        for lang, rows in ALL_ROWS.items():
            self.assertGreaterEqual(len(rows), 25, lang)

    def test_exact_output(self):
        for lang, rows in ALL_ROWS.items():
            for source, expected in rows:
                with self.subTest(lang=lang, source=source):
                    result = normalize(source, lang)
                    self.assertEqual(result.spoken, expected)
                    self.assertEqual(result.violations, [], f"{source!r} -> {result.spoken!r}")

    def test_rules_added_from_the_corpus(self):
        for lang, country, source, expected in CORPUS_RULE_ROWS:
            with self.subTest(lang=lang, source=source):
                result = normalize(source, lang, country)
                self.assertEqual(result.spoken, expected)
                self.assertEqual(result.violations, [])

    def test_saints_depend_on_the_country_of_the_tour(self):
        self.assertEqual(normalize("St. Sebald", "es", "DE").spoken, "Sankt Sebald")
        self.assertEqual(normalize("St. Michel", "es", "FR").spoken, "Saint Michel")
        self.assertIn("St.", normalize("St. Sebald", "es").spoken)       # unknown country: left for the gate
        self.assertEqual([v.kind for v in normalize("St. Sebald", "es").violations], ["ABBR"])

    def test_idempotent_and_a_fixed_point_of_sanitize(self):
        for lang, rows in ALL_ROWS.items():
            for source, _ in rows:
                with self.subTest(lang=lang, source=source):
                    spoken = normalize(source, lang).spoken
                    self.assertEqual(normalize(spoken, lang).spoken, spoken)
                    self.assertEqual(sanitize_text(spoken), spoken)

    def test_no_english_unit_substitutions_in_other_languages(self):
        for lang in ("es", "fr", "de", "it"):
            spoken = normalize("Mide 52 m y 3 km. Calle St. Michel.", lang, "FR").spoken
            for word in ("meters", "kilometers", "Saint ", "Avenue"):
                self.assertNotIn(word, spoken.replace("Saint Michel", ""), lang)


class ResidueTests(unittest.TestCase):
    """The normalizer never guesses: ambiguous text keeps its digits so that the gate reports it."""

    def test_numbers_inside_names_and_codes_are_left_alone(self):
        for lang, text in (("es", "Via Roma 3"), ("it", "Via Roma 3"), ("es", "El código A1248 y 1492B"), ("fr", "Le code 12.1492"), ("en", "Terminal 2 and Room 4")):
            with self.subTest(text=text):
                result = normalize(text, lang)
                self.assertTrue(re.search(r"\d", result.spoken), result.spoken)
                self.assertTrue(any(v.kind == "DIGIT" for v in result.violations))

    def test_english_pronoun_is_not_a_roman_numeral(self):
        result = normalize("I met John I think at noon.", "en")
        self.assertEqual(result.spoken, "I met John I think at noon.")
        self.assertEqual(result.violations, [])
        self.assertEqual(normalize("Napoleon I was crowned.", "en").spoken, "Napoleon the First was crowned.")
        self.assertEqual(normalize("Napoleon I was crowned.", "en").violations, [])

    def test_gender_is_never_guessed(self):
        self.assertTrue(re.search(r"\d", normalize("Hay 21 sepulturas y 200 xyzzys.", "es").spoken))
        self.assertIn("veintiuna sepulturas", normalize("Hay 21 sepulturas.", "es").spoken)

    def test_german_declension_needs_a_known_article(self):
        for text in ("Dann sah er Ludwig XIV. dort.", "Ende 19. Jahrhundert.", "Die 5. Station."):
            with self.subTest(text=text):
                self.assertTrue(normalize(text, "de").violations)

    def test_german_ruler_that_opens_a_sentence_is_nominative(self):
        self.assertEqual(normalize("Friedrich II. regierte.", "de").spoken, "Friedrich der Zweite regierte.")
        self.assertEqual(normalize("Papst Leo XIII. erhob sie.", "de").spoken, "Papst Leo der Dreizehnte erhob sie.")

    def test_year_versus_quantity(self):
        self.assertEqual(normalize("1691", "de").spoken, "sechzehnhunderteinundneunzig")
        self.assertEqual(normalize("1665 Meter", "de").spoken, "eintausendsechshundertfünfundsechzig Meter")
        self.assertEqual(normalize("Um 1500 Einwohner", "de").spoken, "Um eintausendfünfhundert Einwohner")


class GateTests(unittest.TestCase):
    def kinds(self, text, lang="es", allow=()):
        return [v.kind for v in gate(text, lang, allow)]

    def test_every_kind_has_a_positive_and_a_negative_case(self):
        cases = {
            "DIGIT": ("Llegó en 1248.", "Llegó en mil doscientos cuarenta y ocho."),
            "ROMAN": ("Jaime I y el siglo XIV.", "Jaime primero y el siglo catorce."),
            "ABBR": ("Siglo I a. C.", "Siglo primero antes de Cristo."),
            "SYMBOL": ("Un 45% más.", "Un cuarenta y cinco por ciento más."),
            "BRACKET": ("Una nota (importante).", "Una nota, importante."),
            "URL": ("Véase https://example.org hoy.", "Véase la web hoy."),
        }
        for kind, (bad, good) in cases.items():
            with self.subTest(kind=kind):
                self.assertIn(kind, self.kinds(bad))
                self.assertNotIn(kind, self.kinds(good))

    def test_abbreviations_of_every_language(self):
        for lang, text in (("es", "n.º 5"), ("fr", "av. J.-C."), ("de", "z. B."), ("it", "a.C."), ("en", "B.C.")):
            with self.subTest(lang=lang):
                self.assertIn("ABBR", self.kinds(text, lang))

    def test_symbols_beyond_percent(self):
        for text in ("20 °", "m²", "5 €", "A & B", "a/b", "§ 3", "x²"):
            self.assertIn("SYMBOL", self.kinds(text), text)

    def test_roman_allow_list_and_acronyms(self):
        self.assertEqual(self.kinds("Un CD de música MIDI."), [])            # global allow list
        self.assertEqual(self.kinds("Un MIX raro.", allow=("MIX",)), [])
        self.assertIn("ROMAN", self.kinds("El XIV."))
        self.assertEqual(self.kinds("La UNESCO y la USAAF."), [])            # acronyms warn, never block

    def test_single_letter_roman_after_century_word_and_ruler(self):
        self.assertIn("ROMAN", self.kinds("siglo V"))
        self.assertIn("ROMAN", self.kinds("Luis X"))
        self.assertNotIn("ROMAN", self.kinds("el x del problema"))

    def test_violations_carry_positions_and_sentence_index(self):
        found = gate("Hola. Llegó en 1248. Fin.", "es")
        self.assertEqual([(v.kind, v.match, v.sentence_index) for v in found][:1], [("DIGIT", "1", 1)])
        self.assertEqual("Hola. Llegó en 1248. Fin."[found[0].start:found[0].end], "1")


class LexiconAndVersionTests(unittest.TestCase):
    def test_lexicon_respelling_is_whole_word(self):
        path = POD / "src/utils/speech/lexicon/es.json"
        original = path.read_text(encoding="utf-8")
        try:
            path.write_text(json.dumps({"Louvre": "Luvra"}), encoding="utf-8")
            self.assertEqual(normalize("El Louvre y el Louvres.", "es").spoken, "El Luvra y el Louvres.")
        finally:
            path.write_text(original, encoding="utf-8")

    def test_version_and_unsupported_language(self):
        self.assertEqual(SPEECH_VERSION, "speech-1")
        with self.assertRaises(ValueError):
            normalize("Hola", "pt")

    def test_changes_are_recorded_in_order(self):
        result = normalize("Jaime I vivió en 1248.", "es")
        self.assertEqual(result.changes, [("Jaime I", "Jaime primero"), ("1248", "mil doscientos cuarenta y ocho")])

    def test_parentheses_become_commas_and_markup_is_removed(self):
        self.assertEqual(normalize("Fue (según dicen) un **gran** rey [1].", "es").spoken, "Fue, según dicen, un gran rey.")


class CliTests(unittest.TestCase):
    def run_cli(self, *args, payload):
        return subprocess.run([sys.executable, str(POD / "scripts/speech-normalize.py"), *args], input=json.dumps(payload),
                              capture_output=True, text=True)

    def test_normalizes_a_batch_and_reports_violations(self):
        payload = {"pieces": [{"pieceId": "a", "text": "Jaime I, en 1248."}, {"pieceId": "b", "text": "Via Roma 3"}]}
        result = self.run_cli("--lang", "es", "--country", "ES", payload=payload)
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertEqual(data["speechVersion"], SPEECH_VERSION)
        self.assertEqual(data["pieces"][0]["spokenText"], "Jaime primero, en mil doscientos cuarenta y ocho.")
        self.assertEqual(data["pieces"][0]["violations"], [])
        self.assertEqual(data["pieces"][1]["violations"][0]["kind"], "DIGIT")

    def test_check_mode_exits_one_on_violations(self):
        clean = {"pieces": [{"pieceId": "a", "spokenText": "Hola mundo."}]}
        dirty = {"pieces": [{"pieceId": "a", "spokenText": "Hola 3."}]}
        self.assertEqual(self.run_cli("--check", "--lang", "es", payload=clean).returncode, 0)
        self.assertEqual(self.run_cli("--check", "--lang", "es", payload=dirty).returncode, 1)

    def test_bad_input_fails_clearly(self):
        self.assertNotEqual(self.run_cli("--lang", "pt", payload={"pieces": []}).returncode, 0)


if __name__ == "__main__":
    unittest.main()
