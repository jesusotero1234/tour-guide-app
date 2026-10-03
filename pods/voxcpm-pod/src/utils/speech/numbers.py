"""Language-independent conversion of the numbers that remain after dates, centuries and rulers are done."""
import re
from dataclasses import dataclass, field
from typing import Callable, Optional

from .common import Ctx, decimal_words, neighbors, sentence_start


STREET_SUFFIXES = ("straße", "strasse", "str.", "allee", "platz", "weg", "gasse", "ring", "damm", "ufer", "chaussee",
                   "promenade", "boulevard", "avenue", "rue", "calle", "via", "viale", "piazza", "corso", "plaza", "street",
                   "road", "avenida", "paseo")


@dataclass
class NumberSpec:
    lang: str
    thousands_sep: str                 # regex matching one separator between digit groups
    decimal_sep: str                   # single character
    point_word: str                    # "coma", "virgule", "Komma", "virgola", "point"
    cardinal: Callable[[int, str], Optional[str]]   # (n, next_word) -> words, or None when unsure
    year: Callable[[int], str]
    year_context: set = field(default_factory=set)       # words that make a 3-4 digit number a year
    quantity_before: set = field(default_factory=set)    # words that make a 4 digit number a quantity
    count_words: set = field(default_factory=set)        # words after which a 4 digit number is a quantity
    label_before: set = field(default_factory=set)       # "número 31": read the bare cardinal
    label_cardinal: Optional[Callable[[int], str]] = None
    bare: Optional[Callable[[int], str]] = None          # the number alone: "uno", "un", "eins" (decimals, labels)
    era_after: str = r"(?!x)x"                            # text right after the number that proves it is a year
    year_range: tuple = (1100, 2099)
    # words that name a month: a number right after one is part of a date, handled before
    months: set = field(default_factory=set)
    # German writes ordinals as "3. Station": a 1-2 digit number followed by ". " and a word is left for the gate
    ordinal_dot: bool = False
    name_guard: bool = True             # German capitalises every noun, so a capitalised word says nothing about names


def _build(spec: NumberSpec) -> re.Pattern:
    sep, dec = spec.thousands_sep, re.escape(spec.decimal_sep)
    return re.compile(
        r"(?<![\w.,:/])(?<!\w-)(?P<int>\d{1,3}(?:" + sep + r"\d{3})+|\d+)(?:" + dec + r"(?P<frac>\d+))?(?!\w)(?!:\d)(?![.,]\d)")


def convert_numbers(text: str, ctx: Ctx, spec: NumberSpec) -> str:
    pattern = _build(spec)
    era = re.compile(spec.era_after)

    def repl(m: re.Match) -> Optional[str]:
        raw, frac = m.group("int"), m.group("frac")
        digits = re.sub(r"\D", "", raw)
        grouped = digits != raw
        if len(digits) > 9 or (len(digits) > 1 and digits.startswith("0") and not grouped):
            return None                                 # phone numbers, codes
        n = int(digits)
        prev, nxt = neighbors(text, m.start(), m.end())
        if frac is not None:
            if grouped:
                return None
            out = decimal_words(n, frac, spec.bare or (lambda x: spec.cardinal(x, "") or str(x)), spec.point_word)
            return out if "".join(ch for ch in out if ch.isdigit()) == "" else None
        noun_absent = re.match(r"\s*(?:[.,;:)!?»”]|$)", text[m.end():m.end() + 3]) is not None
        if grouped:
            return spec.cardinal(n, nxt) or (spec.bare(n) if noun_absent and spec.bare else None)
        # A capitalised word right before the number, mid-sentence, makes it part of a name or address
        # ("Via Roma 3", "Terminal 2"): leave it for the gate.
        pword = re.search(r"(\S+)\s+$", text[:m.start()])
        lowered = pword.group(1).lower().strip(".,;:") if pword else ""
        if pword and lowered.endswith(STREET_SUFFIXES) and pword.group(1)[:1].isupper() and spec.bare:
            return spec.bare(n)                         # house number: "Königstraße 27", "Plaza 25 de Mayo"
        if spec.ordinal_dot and len(digits) <= 2 and not grouped and frac is None and re.match(r"\.\s+\S", text[m.end():m.end() + 3]):
            return None                                 # German "3. Station": an ordinal whose article decides the ending
        year_like = len(digits) == 4 and spec.year_range[0] <= n <= spec.year_range[1]
        if spec.name_guard and not year_like and pword and pword.group(1)[:1].isupper() and not pword.group(1)[-1] in ".,;:" \
                and lowered not in spec.months and lowered not in spec.year_context and lowered not in spec.label_before \
                and not sentence_start(text, m.start() - len(pword.group(0))):
            return None
        p, nx = prev.lower().strip(".,"), nxt.lower()
        if p in spec.label_before and spec.label_cardinal:
            return spec.label_cardinal(n)
        if len(digits) == 4 and p in spec.quantity_before and nx not in spec.year_context:
            return spec.cardinal(n, nxt)
        after = text[m.end():m.end() + 14]
        # "en 848 y 864", "347 o 348": a number chained to a year by a conjunction is a year as well
        chained = re.search(r"(\d{3,4})\s+(?:y|e|o|u|and|or|et|ou|und|oder)\s+(?:el\s+|le\s+|il\s+|der\s+)?$", text[:m.start()])
        chained_year = bool(chained) and 100 <= int(chained.group(1)) <= 2099 and 100 <= n <= 2099 and nx not in spec.count_words
        is_year = nx not in spec.count_words and (
            spec.year_range[0] <= n <= spec.year_range[1] and len(digits) == 4
            or 100 <= n <= 2099 and (p in spec.year_context or bool(era.match(after)) or chained_year))
        if len(digits) <= 4 and is_year and 100 <= n <= 2099:
            return spec.year(n)
        return spec.cardinal(n, nxt) or (spec.bare(n) if noun_absent and spec.bare else None)

    return ctx.sub(text, pattern, repl)
