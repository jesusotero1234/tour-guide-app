"""German speech normalization (plan 02 section 4.5).

German writes ordinals with a dot ("19.", "XIV.") and declines them: the ending depends on the article in front,
so a number is converted only when that article is one of the unambiguous ones. Anything else is left for the gate.
"""
import re

from num2words import num2words

from .common import ROMAN_TOKEN, RULER_ALT, Ctx, convert_year_pairs, expand_short_ranges, roman_to_int, sentence_start
from .numbers import NumberSpec, convert_numbers

MONTHS = ["Januar", "Jänner", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"]
# Article or contraction in front of the ordinal -> ending of the ordinal.
_ENDING = {w: "n" for w in "im am vom zum beim dem den des einem eines diesem jenem zur aus seinem unserem".split()}
_ENDING.update({w: "e" for w in "der die das ins".split()})
_DATIVE = {"unter", "mit", "von", "bei", "zu", "nach", "aus", "seit"}
_ACCUSATIVE = {"für", "durch", "gegen", "ohne", "um"}
_TITLES = "König|Kaiser|Papst|Herzog|Kurfürst|Graf|Fürst|Königin|Kaiserin|Zar|Sultan|Erzherzog|Markgraf|Landgraf|Pfalzgraf|Prinz|Doge|Dogen|Bischof|Erzbischof|Abt|Ritter|Pharao|Khan"
_ADJ_N = {"frühen", "späten", "mittleren", "hohen", "ausgehenden", "beginnenden", "vorigen", "letzten", "jenen", "diesen", "folgenden", "selben", "gleichen"}
_ADJ_E = {"frühe", "späte", "hohe", "letzte", "diese", "jene"}


def cardinal_words(n: int, _next: str = ""):
    words = num2words(n, lang="de")
    return None if words.endswith("eins") else words      # "ein"/"eine"/"eins" depends on the noun


def year_words(n: int) -> str:
    return num2words(n, lang="de", to="year") if n >= 1100 else num2words(n, lang="de")


def ordinal(n: int, ending: str) -> str:
    base = num2words(n, lang="de", to="ordinal")          # "neunzehnte"
    return base + ("n" if ending == "n" else "")


SPEC = NumberSpec(
    lang="de", thousands_sep=r"\.", decimal_sep=",", point_word="Komma", cardinal=cardinal_words, year=year_words,
    year_context={"im", "seit", "bis", "um", "ab", "jahr", "jahre", "jahres", "jahren", "von", "in", "nach", "vor", "aus",
                  "ca", "circa", "zwischen", "während", "bereits", "erst", "noch", "gegen", "anno", "bei", "zu",
                  *[m.lower() for m in MONTHS]},
    quantity_before={"etwa", "rund", "circa", "ungefähr", "fast", "über", "mehr", "weniger", "insgesamt", "knapp"},
    count_words={"meter", "kilometer", "einwohner", "menschen", "personen", "pfeifen", "jahre", "jahren", "euro", "soldaten",
                 "männer", "frauen", "besucher", "touristen", "stufen", "steine", "häuser", "gebäude", "säulen", "gräber",
                 "exemplare", "wörter", "seiten", "familien", "pilger", "bürger", "arbeiter", "gefangene", "passagiere",
                 "schiffe", "kanonen", "ziegel", "kilogramm", "liter", "hektar", "tonnen", "gläubige", "tote", "verletzte",
                 "opfer", "werke", "bände", "bücher", "münzen", "stück", "quadratmeter", "fuß", "mark", "taler", "gulden"},
    label_before={"nummer"}, label_cardinal=lambda n: num2words(n, lang="de"), bare=lambda n: num2words(n, lang="de"),
    era_after=r"\s*(?:v|n)\.\s?Chr\.", months={m.lower() for m in MONTHS}, ordinal_dot=True, name_guard=False)

_UNITS = {"km": ("Kilometer", "Kilometer"), "m²": ("Quadratmeter", "Quadratmeter"), "m2": ("Quadratmeter", "Quadratmeter"),
          "m": ("Meter", "Meter"), "cm": ("Zentimeter", "Zentimeter"), "mm": ("Millimeter", "Millimeter"),
          "kg": ("Kilogramm", "Kilogramm"), "g": ("Gramm", "Gramm"), "ha": ("Hektar", "Hektar"),
          "km/h": ("Kilometer pro Stunde", "Kilometer pro Stunde"), "km²": ("Quadratkilometer", "Quadratkilometer"),
          "t": ("Tonne", "Tonnen"), "l": ("Liter", "Liter")}
_FEMININE_UNITS = {"t"}
_NUM = r"(?P<num>\d{1,3}(?:\.\d{3})+|\d+)(?:,(?P<frac>\d+))?"
_UNIT_RE = re.compile(r"(?<![\w.,:/])" + _NUM + r"\s*(?P<unit>km/h|km²|m²|m2|km|cm|mm|kg|ha|g|t|l|m)(?![\w²/])")


def _int(raw: str) -> int:
    return int(raw.replace(".", ""))


def _decimal(n: int, frac: str) -> str:
    base = num2words(n, lang="de")
    fraction = num2words(int(frac), lang="de") if len(frac) <= 2 and not frac.startswith("0") else " ".join(num2words(int(d), lang="de") for d in frac)
    return f"{base} Komma {fraction}"


def _units(text, ctx):
    def repl(m):
        n = _int(m.group("num"))
        one, many = _UNITS[m.group("unit")]
        if m.group("frac") is not None:
            return f"{_decimal(n, m.group('frac'))} {many}"
        if n == 1:
            return f"{'eine' if m.group('unit') in _FEMININE_UNITS else 'ein'} {one}"
        return f"{num2words(n, lang='de')} {many}"
    return ctx.sub(text, _UNIT_RE, repl)


def _percent(text, ctx):
    def repl(m):
        n = _int(m.group("num"))
        return (_decimal(n, m.group("frac")) if m.group("frac") is not None else num2words(n, lang="de").replace("eins", "ein") if n == 1 else num2words(n, lang="de")) + " Prozent"
    return ctx.sub(text, r"(?<![\w.,:/])" + _NUM + r"\s*%", repl)


def _prev_word(text: str, pos: int) -> str:
    m = re.search(r"([^\W\d_]+)\s+$", text[:pos])
    return m.group(1).lower() if m else ""


def _ending_before(text: str, pos: int):
    """Ending of an ordinal from the article or adjective in front of it: "n" (im, dem, des, späten), "e" (das, die, der), or None."""
    prev = _prev_word(text, pos)
    return _ENDING.get(prev) or ("n" if prev in _ADJ_N else "e" if prev in _ADJ_E else None)


_ORD = r"\d{1,2}\."
_CONNECTOR = r"(?:und|bis|oder|sowie)(?:\s+(?:zum|zur|dem|den|das|die|des|ins|im|am|vom))?"
_LIST = _ORD + r"(?:\s*[–-]\s*" + _ORD + r"|(?:\s*,\s*" + _ORD + r")+)?(?:\s+" + _CONNECTOR + r"\s+" + _ORD + r")?"


def _centuries(text, ctx):
    def apart(m):
        """"Ende des 12. und Anfang des 13. Jahrhunderts", "des 16. und dem Beginn des 17. Jahrhunderts": each ordinal
        takes its ending from its own article."""
        first = _ending_before(text, m.start())
        mid = m.group("mid").split()
        second = _ENDING.get(mid[-1].lower()) if mid else None
        a, b = int(m.group("a")), int(m.group("b"))
        if first is None or second is None or not (1 <= a <= 21 and 1 <= b <= 21):
            return None
        return f"{ordinal(a, first)} {m.group('c')} {m.group('mid')}{ordinal(b, second)} {m.group('w')}"
    text = ctx.sub(text, r"(?<![\w.,:/])(?P<a>\d{1,2})\.\s+(?P<c>und|oder)\s+(?P<mid>(?:[^\W\d_]+\s+){1,3})(?P<b>\d{1,2})\.\s+(?P<w>Jahrhunderts?)\b", apart)

    def listed(m):
        ending = _ending_before(text, m.start())
        numbers = [int(x) for x in re.findall(r"\d{1,2}", m.group("list"))]
        if ending is None or any(not 1 <= n <= 21 for n in numbers):
            return None
        out = re.sub(r"(\d{1,2})\.", lambda x: ordinal(int(x.group(1)), ending), m.group("list"))
        out = re.sub(r"\s*[–-]\s*", " bis ", out)
        out += f" {m.group('w')}"
        if m.group("era"):
            out += " vor Christus" if m.group("era").strip().startswith("v") else " nach Christus"
        return out
    return ctx.sub(text, r"(?<![\w.,:/])(?P<list>" + _LIST + r")\s+(?P<w>Jahrhunderts?)\b(?P<era>\s+(?:v|n)\.\s?Chr\.)?", listed)


def _dates(text, ctx):
    months = "|".join(MONTHS)

    def span(m):                                        # "vom 21. bis 24. August", "vom 12. auf den 13. Februar"
        a, b = int(m.group("a")), int(m.group("b"))
        if not (1 <= a <= 31 and 1 <= b <= 31):
            return None
        out = f"{m.group('pre')} {ordinal(a, 'n')} {m.group('c')} {ordinal(b, 'n')} {m.group('m')}"
        return out + (f" {year_words(int(m.group('y')))}" if m.group("y") else "")
    text = ctx.sub(text, r"(?<![\w.,:/])(?P<pre>(?i:vom|zwischen dem|des|am|dem))\s+(?P<a>\d{1,2})\.\s+(?P<c>(?:bis(?: zum)?|auf den|und(?: dem| den)?))\s+(?P<b>\d{1,2})\.\s+(?P<m>" + months + r")\b(?:\s+(?P<y>\d{3,4})\b)?", span)

    def single(m):
        ending = _ending_before(text, m.start())
        day = int(m.group("d"))
        if ending is None or not 1 <= day <= 31:
            return None
        out = f"{ordinal(day, ending)} {m.group('m')}"
        return out + (f" {year_words(int(m.group('y')))}" if m.group("y") else "")
    return ctx.sub(text, r"(?<![\w.,:/])(?P<d>\d{1,2})\.\s*(?P<m>" + months + r")\b(?:\s+(?P<y>\d{3,4})\b)?", single)


_GOV_DATIVE = {"dem", "vom", "zum", "beim", "im", "am", "von", "mit", "bei", "zu", "nach", "aus", "seit", "unter", "seinem", "ihrem", "unserem"}
_GOV_ACCUSATIVE = {"den", "für", "durch", "gegen", "ohne", "um", "seinen", "ihren", "unseren", "einen"}
_CONJUNCTIONS = {"und", "oder", "dass", "nachdem", "weil", "da", "wenn", "doch", "aber", "sowie", "sondern", "denn"}
_PRETERITES = {"ließ", "erhob", "trat", "nahm", "gab", "kam", "ging", "schrieb", "fand", "starb", "hielt", "blieb", "wurde", "war",
               "bat", "zog", "sah", "rief", "lag", "schuf", "griff"}
_TITLE_WORDS = set(_TITLES.split("|"))
_GOVERNORS = {"des", "der"} | _GOV_DATIVE | _GOV_ACCUSATIVE


def _ruler_case(text: str, pos: int):
    """Case of the noun phrase that ends in a numbered ruler, from the word that governs it: ("des", "n") genitive,
    ("dem", "n") dative, ("den", "n") accusative, ("der", "e") nominative. Capitalised words between the governor and the
    name (titles, "Namen", first names) are skipped. None when it cannot be told: the gate then reports it."""
    tokens = list(re.finditer(r"\S+", text[:pos]))
    i, hops = len(tokens) - 1, 0
    while i >= 0 and hops < 4:
        token = tokens[i].group(0)
        word = token.lower().strip(",;:")
        if word in _GOVERNORS or word in _CONJUNCTIONS or word == "als":
            break
        if token[-1] in ".!?":
            return ("der", "e")                           # a sentence ended just before: the subject
        if token[0].isupper() and token[-1] not in ",;:":
            i, hops = i - 1, hops + 1                     # title, "Namen", first name: look further back
            continue
        break
    if i < 0:
        return ("der", "e")                               # the noun phrase opens the text
    token = tokens[i].group(0)
    skipped = [m.group(0) for m in tokens[i + 1:]]
    if token[-1] in ".!?":
        return ("der", "e")
    if token[-1] in ",;:":
        return None
    word = token.lower()
    if word == "des":
        return ("des", "n")
    if word in _GOV_DATIVE:
        return ("dem", "n")
    if word in _GOV_ACCUSATIVE:
        return ("den", "n")
    if word == "als" or word in _CONJUNCTIONS:
        return ("der", "e")
    if word == "der" and any(s in _TITLE_WORDS for s in skipped):
        return ("der", "e")                               # "der Doge Pietro I."
    if token.islower() and (word.endswith(("te", "ete")) or word in _PRETERITES) and word not in ("erste", "zweite", "dritte", "letzte", "nächste", "späte"):
        return ("der", "e")                               # verb-second: "ließ Kurfürst Maximilian I. ..."
    return None


def _rulers(text, ctx):
    pattern = r"(?P<name>" + RULER_ALT + r")(?P<gen>s)?\s+(?P<rn>" + ROMAN_TOKEN + r")(?P<dot>\.)?(?=\W|$)"

    def repl(m):
        v = roman_to_int(m.group("rn"))
        if v is None or v > 20:
            return None
        if m.group("gen"):
            article, ending = "des", "n"
        else:
            case = _ruler_case(text, m.start())
            if case is None:
                return None
            article, ending = case
        word = ordinal(v, ending)
        word = word[0].upper() + word[1:]
        after = text[m.end():m.end() + 3]
        end_of_sentence = bool(m.group("dot")) and (after == "" or re.match(r"\s*$|\s*\n|\s+[A-ZÄÖÜ]", after) is not None)
        return f"{m.group('name')}{m.group('gen') or ''} {article} {word}" + ("." if end_of_sentence else "")
    return ctx.sub(text, pattern, repl)


def _decades(text, ctx):
    return ctx.sub(text, r"(?<![\w.,:/])(?P<n>\d{3}0)er\b", lambda m: year_words(int(m.group("n"))) + "er")


def _times(text, ctx):
    def repl(m):
        h, mi = int(m.group("h")), int(m.group("m"))
        if h > 24 or mi > 59:
            return None
        return f"{num2words(h, lang='de')} Uhr" + (f" {num2words(mi, lang='de')}" if mi else "")
    text = ctx.sub(text, r"(?<![\w.,:/])(?P<h>\d{1,2})[:.](?P<m>\d{2})\s*Uhr\b", repl)
    return ctx.sub(text, r"(?<![\w.,:/])(?P<h>\d{1,2}):(?P<m>\d{2})(?![\d\w])", repl)


def _ranges(text, ctx):
    def repl(m):
        a, b = int(m.group("a")), int(m.group("b"))
        if 100 <= a <= 2099 and 100 <= b <= 2099:
            wa, wb = year_words(a), year_words(b)
        elif a < b:
            wa, wb = num2words(a, lang="de"), num2words(b, lang="de")
        else:
            return None
        return f"{m.group('pre') or ''}{wa} {'und' if (m.group('pre') or '').strip().lower() == 'zwischen' else 'bis'} {wb}"
    return ctx.sub(text, r"(?P<pre>\bzwischen\s+)?(?<![\w.,:/])(?P<a>\d{1,4})\s*[-–—]\s*(?P<b>\d{1,4})(?![\w])", repl, re.IGNORECASE)


def _abbreviations(text, ctx):
    def keep_period(m, word):
        after = text[m.end():m.end() + 3]
        return word + ("." if after == "" or re.match(r"\s*$|\s*\n|\s+[A-ZÄÖÜ]", after) else "")
    text = ctx.sub(text, r"\bz\.\s?B\.", lambda m: "zum Beispiel")
    text = ctx.sub(text, r"\bd\.\s?h\.", lambda m: "das heißt")
    text = ctx.sub(text, r"\bu\.\s?a\.", lambda m: "unter anderem")
    text = ctx.sub(text, r"\busw\.", lambda m: keep_period(m, "und so weiter"))
    text = ctx.sub(text, r"\bbzw\.", lambda m: "beziehungsweise")
    text = ctx.sub(text, r"\bv\.\s?Chr\.", lambda m: "vor Christus")
    text = ctx.sub(text, r"\bn\.\s?Chr\.", lambda m: "nach Christus")
    text = ctx.sub(text, r"\bNr\.\s*(?P<n>\d+)", lambda m: "Nummer " + num2words(int(m.group("n")), lang="de"))
    text = ctx.sub(text, r"\b(?:ca\.|circa)\s*(?P<n>\d{3,4})(?!\w)",
                   lambda m: "circa " + year_words(int(m.group("n"))) if 100 <= int(m.group("n")) <= 2099 else None)
    text = ctx.sub(text, r"\bSt\.(?P<sep>[-\s]+)(?=[A-ZÄÖÜ])", lambda m: "Sankt" + m.group("sep"))
    return ctx.sub(text, r"\bStr\.", lambda m: "Straße")


def normalize(text: str, ctx: Ctx) -> str:
    text = expand_short_ranges(text, ctx)
    text = _centuries(text, ctx)
    text = _dates(text, ctx)
    text = _rulers(text, ctx)
    text = _decades(text, ctx)
    text = _times(text, ctx)
    text = _abbreviations(text, ctx)
    text = convert_year_pairs(text, ctx, [r"\bzwischen\s+(?P<a>\d{3,4})\s+und\s+(?P<b>\d{3,4})\b", r"\bvon\s+(?P<a>\d{3,4})\s+bis\s+(?P<b>\d{3,4})\b"], year_words)
    text = _ranges(text, ctx)
    text = _percent(text, ctx)
    text = _units(text, ctx)
    text = convert_numbers(text, ctx, SPEC)
    return text
