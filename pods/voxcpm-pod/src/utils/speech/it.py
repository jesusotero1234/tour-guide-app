"""Italian speech normalization (plan 02 section 4.6)."""
import re

from num2words import num2words

from .common import ROMAN_TOKEN, RULER_ALT, Ctx, convert_year_pairs, expand_short_ranges, roman_to_int, saint_prefix
from .numbers import NumberSpec, convert_numbers

MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"]
FEMININE_NAMES = {"Isabella", "Giovanna", "Margherita", "Caterina", "Vittoria", "Maria", "Anna", "Federica", "Elisabetta"}
_SAINT_F = {"Maria", "Anna", "Caterina", "Lucia", "Chiara", "Agnese", "Cecilia", "Margherita", "Giulia", "Barbara", "Teresa",
            "Croce", "Reparata", "Marta", "Monica", "Rita", "Orsola", "Trinita", "Trinità", "Sofia", "Francesca", "Elena"}
_SAINT_ELIDED = {"Ambrogio", "Antonio", "Agostino", "Eustorgio", "Apollinare", "Alessandro", "Andrea", "Egidio", "Ignazio",
                 "Eufemia", "Orso", "Ippolito", "Onofrio", "Eusebio", "Efisio"}
_SAINT_M = {"Marco", "Pietro", "Paolo", "Giovanni", "Lorenzo", "Michele", "Francesco", "Giorgio", "Zeno", "Gennaro", "Domenico",
            "Martino", "Carlo", "Luca", "Matteo", "Nicola", "Pantaleone", "Cataldo", "Stefano", "Gimignano", "Biagio", "Rocco",
            "Zanipolo", "Vitale", "Fedele", "Siro", "Benedetto", "Bernardo", "Bartolomeo", "Filippo", "Giacomo", "Giuseppe"}


def cardinal_words(n: int, _next: str = ""):
    return None if n == 1 else num2words(n, lang="it")      # "un", "uno", "una", "un'" depends on the noun


def year_words(n: int) -> str:
    return num2words(n, lang="it")


def ordinal_words(n: int, feminine: bool = False) -> str:
    word = num2words(n, lang="it", to="ordinal")
    return word[:-1] + "a" if feminine and word.endswith("o") else word


SPEC = NumberSpec(
    lang="it", thousands_sep=r"\.", decimal_sep=",", point_word="virgola", cardinal=cardinal_words, year=year_words,
    year_context={"nel", "dal", "al", "del", "anno", "il", "fino", "verso", "intorno", "dopo", "prima", "sino", "tra", "fra",
                  "dall", "nell", "circa", "ca", "c", "durante", "entro", "nello", "negli", "dallo"},
    quantity_before={"circa", "oltre", "quasi", "almeno", "totale", "più", "meno", "circa"},
    count_words={"metri", "metro", "chilometri", "km", "canne", "persone", "abitanti", "uomini", "donne", "soldati", "visitatori",
                 "turisti", "anni", "euro", "lire", "monete", "pezzi", "opere", "volumi", "libri", "gradini", "pietre", "case",
                 "edifici", "colonne", "tombe", "esemplari", "parole", "pagine", "famiglie", "pellegrini", "cittadini", "operai",
                 "prigionieri", "passeggeri", "navi", "cannoni", "mattoni", "chili", "litri", "ettari", "tonnellate", "fedeli",
                 "morti", "feriti", "vittime", "tubi"},
    label_before={"numero"}, label_cardinal=lambda n: num2words(n, lang="it"), bare=lambda n: num2words(n, lang="it"),
    era_after=r"\s*(?:a|d)\.\s?C\.", months=set(MONTHS))

_UNITS = {"km": ("chilometro", "chilometri"), "m²": ("metro quadrato", "metri quadrati"), "m2": ("metro quadrato", "metri quadrati"),
          "m": ("metro", "metri"), "cm": ("centimetro", "centimetri"), "mm": ("millimetro", "millimetri"),
          "kg": ("chilo", "chili"), "g": ("grammo", "grammi"), "ha": ("ettaro", "ettari"),
          "km/h": ("chilometro orario", "chilometri orari"), "km²": ("chilometro quadrato", "chilometri quadrati"),
          "t": ("tonnellata", "tonnellate"), "l": ("litro", "litri")}
_FEMININE_UNITS = {"t"}
_NUM = r"(?P<num>\d{1,3}(?:\.\d{3})+|\d+)(?:,(?P<frac>\d+))?"
_UNIT_RE = re.compile(r"(?<![\w.,:/])" + _NUM + r"\s*(?P<unit>km/h|km²|m²|m2|km|cm|mm|kg|ha|g|t|l|m)(?![\w²/])")


def _int(raw: str) -> int:
    return int(raw.replace(".", ""))


def _words(n: int) -> str:
    return num2words(n, lang="it")


def _decimal(n: int, frac: str) -> str:
    fraction = _words(int(frac)) if len(frac) <= 2 and not frac.startswith("0") else " ".join(_words(int(d)) for d in frac)
    return f"{_words(n)} virgola {fraction}"


def _units(text, ctx):
    def repl(m):
        n = _int(m.group("num"))
        one, many = _UNITS[m.group("unit")]
        if m.group("frac") is not None:
            return f"{_decimal(n, m.group('frac'))} {many}"
        if n == 1:
            return f"{'una' if m.group('unit') in _FEMININE_UNITS else 'un'} {one}"
        return f"{_words(n)} {many}"
    return ctx.sub(text, _UNIT_RE, repl)


def _percent(text, ctx):
    def repl(m):
        n = _int(m.group("num"))
        return (_decimal(n, m.group("frac")) if m.group("frac") is not None else _words(n)) + " per cento"
    return ctx.sub(text, r"(?<![\w.,:/])" + _NUM + r"\s*%", repl)


def _centuries(text, ctx):
    roman = ROMAN_TOKEN
    listing = roman + r"(?:\s*(?:,|e|o|-|–|—)\s*" + roman + r")*"
    pattern = (r"(?<![\w])(?P<pre>(?:nel|dal|al|del|il|nei|dai|ai|dei|il)\s+)?(?:(?P<before>" + listing + r")\s+(?P<word1>secol[oi])\b"
               r"|(?P<word2>[Ss]ecol[oi]|[Ss]ec\.)\s+(?P<after>" + listing + r")\b)(?P<era>\s+(?:a|d)\.\s?C\.)?")

    def convert(chunk):
        out = []
        for i, part in enumerate(re.split(r"(\s*(?:,|e|o|-|–|—)\s*)", chunk)):
            if i % 2:
                out.append(" a " if re.fullmatch(r"\s*[-–—]\s*", part) else part)
                continue
            v = roman_to_int(part)
            if v is None:
                return None
            out.append(ordinal_words(v))
        return "".join(out)

    def repl(m):
        pre = m.group("pre") or ""
        era = ""
        if m.group("era"):
            era = " avanti Cristo" if m.group("era").strip().startswith("a") else " dopo Cristo"
        if m.group("before"):
            words = convert(m.group("before"))
            return None if words is None else f"{pre}{words} {m.group('word1')}{era}"
        words = convert(m.group("after"))
        word = "secolo" if m.group("word2").lower().startswith("sec") and m.group("word2").endswith(".") else m.group("word2")
        return None if words is None else f"{pre}{word} {words}{era}"
    text = ctx.sub(text, pattern, repl)

    # "Nel XVIII, la città...", "dal XIII al XV secolo", "tra il XVII e il XVIII": after an article or preposition, a Roman
    # numeral is a century (its word, secolo, is often implied). A capitalised word after it ("il XX Settembre") is not.
    def bare(m):
        v = roman_to_int(m.group("rn"))
        if v is None or v > 21 or re.match(r"\s+[A-ZÀ-ÖØ-Þ]", text[m.end():m.end() + 4]):
            return None
        return f"{m.group('pre')}{ordinal_words(v)}"
    return ctx.sub(text, r"\b(?P<pre>(?:[Ii]l|[Ll]'|[Dd]al|[Dd]all'|[Aa]l|[Aa]ll'|[Dd]el|[Dd]ell'|[Nn]el|[Nn]ell'|[Dd]ei|[Nn]ei|[Dd]ai|[Aa]i)\s*)(?P<rn>" + ROMAN_TOKEN + r")\b", bare)


def _rulers(text, ctx):
    def repl(m):
        v = roman_to_int(m.group("rn"))
        if v is None:
            return None
        return f"{m.group('name')} {ordinal_words(v, feminine=m.group('name') in FEMININE_NAMES)}"
    return ctx.sub(text, r"(?<![\w])(?P<name>" + RULER_ALT + r")[\s-]+(?P<rn>" + ROMAN_TOKEN + r")\b(?!\.\s?[a-zàèéìòù])", repl)


def _dates(text, ctx):
    pattern = r"(?<![\w.,:/])(?P<d>\d{1,2})(?P<mark>[°º])?\s+(?P<m>" + "|".join(MONTHS) + r")\b(?:\s+(?P<y>\d{3,4})\b)?"

    def repl(m):
        day = int(m.group("d"))
        if not 1 <= day <= 31:
            return None
        out = f"{'primo' if day == 1 else _words(day)} {m.group('m')}"
        if m.group("y"):
            out += f" {year_words(int(m.group('y')))}"
        return out
    return ctx.sub(text, pattern, repl, re.IGNORECASE)


def _ordinals(text, ctx):
    text = ctx.sub(text, r"(?<![\w.,:/])(?P<n>\d{1,3})(?P<mark>[°º]|ª)", lambda m: ordinal_words(int(m.group("n")), feminine=m.group("mark") == "ª"))
    return ctx.sub(text, r"\b[Nn]\.\s?(?P<n>\d+)|\b[Nn]º\s*(?P<n2>\d+)",
                   lambda m: "numero " + _words(int(m.group("n") or m.group("n2"))))


def _decades(text, ctx):
    def repl(m):
        n = int(m.group("n"))
        return m.group("pre") + _words(n) if n % 10 == 0 and 10 <= n <= 90 else None
    return ctx.sub(text, r"(?P<pre>\banni\s+)['’]?(?P<n>\d{2})(?!\d|\w)", repl, re.IGNORECASE)


def _ranges(text, ctx):
    def repl(m):
        a, b = int(m.group("a")), int(m.group("b"))
        if not (100 <= a <= 2099 and 100 <= b <= 2099 and a < b):
            return None
        wa, wb = year_words(a), year_words(b)
        pre = (m.group("pre") or "").strip().lower()
        if not pre:
            return f"dal {wa} al {wb}"
        if pre in ("dal", "dall'", "dagli"):
            return f"{m.group('pre')}{wa} al {wb}"
        if pre in ("tra", "fra"):
            return f"{m.group('pre')}{wa} e {wb}"
        return None
    return ctx.sub(text, r"(?P<pre>\b(?:dal|dall'|dagli|tra|fra|nel|nell'|negli)\s+)?(?<![\w.,:/])(?P<a>\d{3,4})\s*[-–—]\s*(?P<b>\d{3,4})(?![\w])", repl, re.IGNORECASE)


def _foreign_saints(text, ctx):
    prefix = saint_prefix(ctx.country)
    if not prefix:
        return text
    return ctx.sub(text, r"\bSt\.(?P<sep>[-\s]+)(?=[A-ZÀ-Ö])", lambda m: prefix + m.group("sep"))


def _times(text, ctx):
    def repl(m):
        h, mi = int(m.group("h")), int(m.group("m"))
        if h > 24 or mi > 59:
            return None
        return _words(h) + (f" e {_words(mi)}" if mi else "")
    return ctx.sub(text, r"(?<![\w.,:/])(?P<h>\d{1,2}):(?P<m>\d{2})(?![\d\w])", repl)


def _saints(text, ctx):
    def repl(m):
        name = m.group("name")
        if name in _SAINT_F:
            return "Santa " + name
        if name in _SAINT_ELIDED:
            return "Sant'" + name
        if name in _SAINT_M:
            return "San " + name
        return None
    return ctx.sub(text, r"\bS\.\s+(?P<name>[A-ZÀ-Ö][\wà-ÿ]+)", repl)


def _eras(text, ctx):
    text = ctx.sub(text, r"\ba\.\s?C\.", lambda m: "avanti Cristo")
    return ctx.sub(text, r"\bd\.\s?C\.", lambda m: "dopo Cristo")


def normalize(text: str, ctx: Ctx) -> str:
    text = expand_short_ranges(text, ctx)
    text = _times(text, ctx)
    text = _centuries(text, ctx)
    text = _rulers(text, ctx)
    text = _dates(text, ctx)
    text = _ordinals(text, ctx)
    text = _decades(text, ctx)
    text = convert_year_pairs(text, ctx, [r"\b(?:tra|fra)\s+(?:il\s+)?(?P<a>\d{3,4})\s+e\s+(?:il\s+)?(?P<b>\d{3,4})\b", r"\b(?:dal|da)\s+(?P<a>\d{3,4})\s+(?:al|a)\s+(?P<b>\d{3,4})\b"], year_words)
    text = _ranges(text, ctx)
    text = _percent(text, ctx)
    text = _units(text, ctx)
    text = convert_numbers(text, ctx, SPEC)
    text = _saints(text, ctx)
    text = _foreign_saints(text, ctx)
    text = _eras(text, ctx)
    return text
