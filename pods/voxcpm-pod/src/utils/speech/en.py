"""English speech normalization (plan 02 section 4.3)."""
import re

from num2words import num2words

from .common import ROMAN_TOKEN, RULER_ALT, Ctx, convert_year_pairs, english_pronoun_i, expand_short_ranges, roman_to_int, sentence_start
from .numbers import NumberSpec, convert_numbers

MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]
_MONTH_RE = "|".join(MONTHS)


def cardinal_words(n: int, _next: str = "") -> str:
    return num2words(n, lang="en").replace(",", "").replace(" and ", " ")


def ordinal_words(n: int) -> str:
    return num2words(n, lang="en", to="ordinal")


def year_words(n: int) -> str:
    """1876 -> eighteen seventy-six, 1900 -> nineteen hundred, 1905 -> nineteen oh five, 2014 -> twenty fourteen."""
    if n < 1000 or n % 1000 == 0:
        return cardinal_words(n)
    if 2000 < n < 2010:
        return f"two thousand {cardinal_words(n - 2000)}"
    high, low = divmod(n, 100)
    if low == 0:
        return f"{cardinal_words(high)} hundred"
    if low < 10:
        return f"{cardinal_words(high)} oh {cardinal_words(low)}"
    return f"{cardinal_words(high)} {cardinal_words(low)}"


SPEC = NumberSpec(
    lang="en", thousands_sep=r",", decimal_sep=".", point_word="point", cardinal=cardinal_words, year=year_words,
    year_context={"in", "since", "until", "by", "from", "around", "during", "year", "of", "before", "after", "circa",
                  "c", "ca", "till", "late", "early", "mid", "d", "ad", "about"},
    quantity_before={"about", "approximately", "almost", "nearly", "over", "than", "some", "roughly", "total"},
    count_words={"meters", "metres", "meter", "kilometers", "km", "feet", "foot", "miles", "tons", "tonnes", "people",
                 "inhabitants", "residents", "soldiers", "men", "women", "visitors", "tourists", "pipes", "years",
                 "euros", "dollars", "pounds", "coins", "pieces", "works", "volumes", "books", "steps", "stones",
                 "houses", "buildings", "columns", "tombs", "copies", "words", "pages", "families", "pilgrims",
                 "citizens", "workers", "prisoners", "inmates", "passengers", "ships", "cannons", "guns", "bricks",
                 "kilograms", "liters", "acres", "hectares", "square", "cubic"},
    label_before={"number"}, label_cardinal=cardinal_words, bare=cardinal_words,
    era_after=r"\s*(?:B\.C\.|BC\b|B C\b|A\.D\.|AD\b|A D\b)", months=set(m.lower() for m in MONTHS))

_UNITS = {"km": ("kilometer", "kilometers"), "m²": ("square meter", "square meters"), "m2": ("square meter", "square meters"),
          "m": ("meter", "meters"), "cm": ("centimeter", "centimeters"), "mm": ("millimeter", "millimeters"),
          "kg": ("kilogram", "kilograms"), "g": ("gram", "grams"), "ha": ("hectare", "hectares"),
          "km/h": ("kilometer per hour", "kilometers per hour"), "km²": ("square kilometer", "square kilometers"),
          "t": ("ton", "tons"), "l": ("liter", "liters"), "ft": ("foot", "feet"), "mi": ("mile", "miles")}
_UNIT_RE = re.compile(r"(?<![\w.,:/])(?P<num>\d{1,3}(?:,\d{3})+|\d+)(?:\.(?P<frac>\d+))?\s*(?P<unit>km/h|km²|m²|m2|km|cm|mm|kg|ha|ft|mi|g|t|l|m)(?![\w²/])")


def _decimal(int_part: int, frac: str) -> str:
    fraction = cardinal_words(int(frac)) if len(frac) <= 2 and not frac.startswith("0") else " ".join(cardinal_words(int(d)) for d in frac)
    return f"{cardinal_words(int_part)} point {fraction}"


def _units(text, ctx):
    def repl(m):
        n = int(m.group("num").replace(",", ""))
        one, many = _UNITS[m.group("unit")]
        if m.group("frac") is not None:
            return f"{_decimal(n, m.group('frac'))} {many}"
        return f"{cardinal_words(n)} {one if n == 1 else many}"
    return ctx.sub(text, _UNIT_RE, repl)


def _percent(text, ctx):
    def repl(m):
        n = int(m.group("num").replace(",", ""))
        body = _decimal(n, m.group("frac")) if m.group("frac") is not None else cardinal_words(n)
        return f"{body} percent"
    return ctx.sub(text, r"(?<![\w.,:/])(?P<num>\d{1,3}(?:,\d{3})+|\d+)(?:\.(?P<frac>\d+))?\s*%", repl)


def _dates(text, ctx):
    def month_day(m):
        day = int(m.group("d"))
        if not 1 <= day <= 31:
            return None
        out = f"{m.group('m')} {ordinal_words(day)}"
        if m.group("y"):
            out += f", {year_words(int(m.group('y')))}"
        return out
    text = ctx.sub(text, r"\b(?P<m>" + _MONTH_RE + r")\s+(?P<d>\d{1,2})(?:st|nd|rd|th)?(?!\d)(?:,?\s+(?P<y>\d{3,4})(?!\d))?", month_day)

    pattern = re.compile(r"(?<![\w.,:/])(?P<the>[Tt]he\s+)?(?P<d>\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(?P<m>" + _MONTH_RE + r")\b(?:,?\s+(?P<y>\d{3,4})(?!\d))?")

    def day_month(m):
        day = int(m.group("d"))
        if not 1 <= day <= 31:
            return None
        out = (m.group("the") or "the ") + f"{ordinal_words(day)} of {m.group('m')}"
        if m.group("y"):
            out += f", {year_words(int(m.group('y')))}"
        return out
    return ctx.sub(text, pattern, day_month)


def _decades(text, ctx):
    def repl(m):
        n = int(m.group("n"))
        words = year_words(n)
        plural = re.sub(r"y$", "ies", words) if words.endswith("y") else words + "s"
        return (m.group("pre") or "").replace("-", " ") + plural
    return ctx.sub(text, r"(?<![\w.,:/])(?P<pre>(?:mid|early|late)-)?(?P<n>\d{3}0)['’]?s\b", repl)


def _ordinal_suffix(text, ctx):
    def repl(m):
        n = int(m.group("n"))
        word = ordinal_words(n)
        return word[0].upper() + word[1:] if sentence_start(text, m.start()) else word
    return ctx.sub(text, r"(?<![\w.,:/])(?P<n>\d{1,3})(?:st|nd|rd|th)\b", repl)


def _rulers(text, ctx):
    def repl(m):
        v = roman_to_int(m.group("rn"))
        if v is None:
            return None
        if v == 1 and english_pronoun_i(text[m.end():m.end() + 16]):
            return None                                   # "John I think": the pronoun, not a ruler
        return f"{m.group('name')} the {ordinal_words(v).capitalize()}"
    return ctx.sub(text, r"(?<![\w])(?P<name>" + RULER_ALT + r")\s+(?P<rn>" + ROMAN_TOKEN + r")\b", repl)


def _wars(text, ctx):
    def repl(m):
        return "World War " + {1: "One", 2: "Two"}[roman_to_int(m.group("rn"))]
    return ctx.sub(text, r"\bWorld War (?P<rn>I{1,2})\b", repl)


def _circa(text, ctx):
    def repl(m):
        n = int(m.group("n"))
        return "circa " + year_words(n) if 100 <= n <= 2099 else None
    return ctx.sub(text, r"\b(?:c\.|ca\.|circa)\s*(?P<n>\d{3,4})(?!\w)", repl)


def _ranges(text, ctx):
    def repl(m):
        a, b = int(m.group("a")), int(m.group("b"))
        if 100 <= a <= 2099 and 100 <= b <= 2099:
            return f"{year_words(a)} to {year_words(b)}"
        return f"{cardinal_words(a)} to {cardinal_words(b)}" if a < b else None
    return ctx.sub(text, r"(?<![\w.,:/])(?P<a>\d{1,4})\s*[-–—]\s*(?P<b>\d{1,4})(?![\w])", repl)


def _eras(text, ctx):
    text = ctx.sub(text, r"\bB\.C\.", lambda m: "B C")
    text = ctx.sub(text, r"\bA\.D\.|\bAD(?=\s+\d)", lambda m: "A D")
    text = ctx.sub(text, r"(?<=\d )BC\b", lambda m: "B C")
    text = ctx.sub(text, r"\bNo\.\s*(?P<n>\d+)", lambda m: "number " + cardinal_words(int(m.group("n"))))
    return ctx.sub(text, r"\bSt\.(?P<sep>[-\s]+)(?=[A-Z])", lambda m: "Saint" + m.group("sep"))


def _times(text, ctx):
    def repl(m):
        h, mi = int(m.group("h")), int(m.group("m"))
        if h > 24 or mi > 59:
            return None
        return cardinal_words(h) + (" o'clock" if mi == 0 else f" oh {cardinal_words(mi)}" if mi < 10 else f" {cardinal_words(mi)}")
    text = ctx.sub(text, r"(?<![\w.,:/])(?P<h>\d{1,2}):(?P<m>\d{2})(?![\d\w])", repl)
    return ctx.sub(text, r"\b(?P<x>[ap])\.m\.", lambda m: m.group("x").upper() + " M")


def normalize(text: str, ctx: Ctx) -> str:
    text = expand_short_ranges(text, ctx)
    text = _times(text, ctx)
    text = _wars(text, ctx)
    text = _dates(text, ctx)
    text = _rulers(text, ctx)
    text = _ordinal_suffix(text, ctx)
    text = _decades(text, ctx)
    text = _circa(text, ctx)
    text = _ranges(text, ctx)
    text = _percent(text, ctx)
    text = _units(text, ctx)
    text = _eras(text, ctx)
    text = convert_year_pairs(text, ctx, [r"\bbetween\s+(?P<a>\d{3,4})\s+and\s+(?P<b>\d{3,4})\b", r"\bfrom\s+(?P<a>\d{3,4})\s+(?:to|until|till)\s+(?P<b>\d{3,4})\b"], year_words)
    text = convert_numbers(text, ctx, SPEC)
    return text
