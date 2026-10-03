"""French speech normalization (plan 02 section 4.4)."""
import re

from num2words import num2words

from .common import ROMAN_TOKEN, RULER_ALT, Ctx, convert_year_pairs, expand_short_ranges, roman_to_int
from .numbers import NumberSpec, convert_numbers

MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
_ORD_SUFFIX = r"(?:ᵉʳ|ᵉ|ʳᵉ|ème|ère|er|re|e)"


_FEM_ENDINGS = ("e", "es", "ion", "ions", "té", "tés", "ée", "ées")
_MASC_NOUNS = {"hommes", "soldats", "visiteurs", "touristes", "ans", "euros", "francs", "mètres", "kilomètres", "habitants", "tuyaux",
               "bâtiments", "livres", "volumes", "pèlerins", "citoyens", "ouvriers", "prisonniers", "passagers", "navires", "canons", "morts", "blessés"}


def bare(n: int) -> str:
    """The number alone ("un", "vingt et un"): decimals, percentages, units, dates and labels."""
    return num2words(n, lang="fr")


def cardinal_words(n: int, nxt: str = ""):
    """Cardinal in words; numbers ending in 1 take un/une from the next noun, and stay unconverted when it is unknown."""
    words = num2words(n, lang="fr")
    if not re.search(r"\bun$", words) or n % 100 == 11:
        return words
    noun = nxt.lower().strip(".,;:!?»”)")
    if noun in _MASC_NOUNS:
        return words
    if noun.endswith(_FEM_ENDINGS) and noun not in ("tours", "mètres"):
        return words[:-2] + "une"
    return None


def year_words(n: int) -> str:
    return num2words(n, lang="fr")


def ordinal_words(n: int, feminine: bool = False) -> str:
    if n == 1:
        return "première" if feminine else "premier"
    return num2words(n, lang="fr", to="ordinal")


SPEC = NumberSpec(
    lang="fr", thousands_sep=r"[   ]", decimal_sep=",", point_word="virgule", cardinal=cardinal_words, year=year_words,
    year_context={"en", "de", "depuis", "vers", "jusqu'en", "an", "l'an", "dès", "entre", "au", "après", "avant",
                  "durant", "pendant", "circa", "ca", "c", "jusqu'à", "puis"},
    quantity_before={"environ", "près", "presque", "plus", "moins", "quelque", "quelque", "total"},
    count_words={"mètres", "mètre", "kilomètres", "kilomètre", "km", "tuyaux", "personnes", "habitants", "hommes", "femmes",
                 "soldats", "visiteurs", "touristes", "ans", "euros", "francs", "pièces", "œuvres", "oeuvres", "volumes", "livres",
                 "marches", "pierres", "maisons", "bâtiments", "colonnes", "tombes", "exemplaires", "mots", "pages", "familles",
                 "pèlerins", "citoyens", "ouvriers", "prisonniers", "passagers", "navires", "canons", "briques", "kilos",
                 "litres", "hectares", "tonnes", "fidèles", "morts", "blessés", "victimes"},
    label_before={"numéro"}, label_cardinal=lambda n: num2words(n, lang="fr"), bare=lambda n: num2words(n, lang="fr"), era_after=r"\s*(?:av|apr)\.\s?J\.-C", months=set(MONTHS))

_UNITS = {"km": ("kilomètre", "kilomètres"), "m²": ("mètre carré", "mètres carrés"), "m2": ("mètre carré", "mètres carrés"),
          "m": ("mètre", "mètres"), "cm": ("centimètre", "centimètres"), "mm": ("millimètre", "millimètres"),
          "kg": ("kilo", "kilos"), "g": ("gramme", "grammes"), "ha": ("hectare", "hectares"),
          "km/h": ("kilomètre par heure", "kilomètres par heure"), "km²": ("kilomètre carré", "kilomètres carrés"),
          "t": ("tonne", "tonnes"), "l": ("litre", "litres")}
_NUM = r"(?P<num>\d{1,3}(?:[   ]\d{3})+|\d+)(?:,(?P<frac>\d+))?"
_UNIT_RE = re.compile(r"(?<![\w.,:/])" + _NUM + r"[   ]*(?P<unit>km/h|km²|m²|m2|km|cm|mm|kg|ha|g|t|l|m)(?![\w²/])")


def _int(raw: str) -> int:
    return int(re.sub(r"\D", "", raw))


def _decimal(n: int, frac: str) -> str:
    fraction = bare(int(frac)) if len(frac) <= 2 and not frac.startswith("0") else " ".join(bare(int(d)) for d in frac)
    return f"{bare(n)} virgule {fraction}"


def _units(text, ctx):
    def repl(m):
        n = _int(m.group("num"))
        one, many = _UNITS[m.group("unit")]
        if m.group("frac") is not None:
            return f"{_decimal(n, m.group('frac'))} {many}"
        return f"{bare(n)} {one if n in (0, 1) else many}"
    return ctx.sub(text, _UNIT_RE, repl)


def _percent(text, ctx):
    def repl(m):
        n = _int(m.group("num"))
        return (_decimal(n, m.group("frac")) if m.group("frac") is not None else bare(n)) + " pour cent"
    return ctx.sub(text, r"(?<![\w.,:/])" + _NUM + r"[   ]*%", repl)


def _centuries(text, ctx):
    roman = r"(?:" + ROMAN_TOKEN + r")" + _ORD_SUFFIX + r"?"
    listing = roman + r"(?:\s*(?:,|et|ou|-|–|—|à)\s*(?:(?:au|aux|le|du|les)\s+)?" + roman + r")*"
    pattern = r"(?<![\w])(?P<list>" + listing + r")(?P<gap>\s+)(?P<word>siècles?)\b(?P<era>\s+(?:av|apr)\.\s?J\.-C\.?)?"

    def repl(m):
        out = []
        for i, part in enumerate(re.split(r"(\s*(?:,|et|ou|-|–|—|à)\s*(?:(?:au|aux|le|du|les)\s+)?)", m.group("list"))):
            if i % 2:
                out.append(" à " if re.fullmatch(r"\s*[-–—]\s*", part) else part)
                continue
            token = re.match(r"(" + ROMAN_TOKEN + r")(" + _ORD_SUFFIX + r")?$", part)
            v = roman_to_int(token.group(1)) if token else None
            if v is None:
                return None
            out.append(ordinal_words(v, feminine=token.group(2) in ("re", "ère", "ʳᵉ") and v == 1))
        era = ""
        if m.group("era"):
            era = " avant Jésus-Christ" if m.group("era").strip().startswith("av") else " après Jésus-Christ"
        return f"{''.join(out)}{m.group('gap')}{m.group('word')}{era}"
    return ctx.sub(text, pattern, repl)


def _rulers(text, ctx):
    def repl(m):
        v = roman_to_int(m.group("rn"))
        if v is None:
            return None
        suffix = m.group("sfx")
        if v == 1 or suffix in ("er", "ᵉʳ", "re", "ʳᵉ"):
            return f"{m.group('name')} {'première' if suffix in ('re', 'ʳᵉ') else 'premier'}"
        return f"{m.group('name')} {bare(v)}"
    return ctx.sub(text, r"(?<![\w])(?P<name>" + RULER_ALT + r")\s+(?P<rn>" + ROMAN_TOKEN + r")(?P<sfx>er|ᵉʳ|re|ʳᵉ)?\b(?!\.\s?[a-zàâçéèêëîïôûù])", repl)


def _dates(text, ctx):
    pattern = r"(?<![\w.,:/])(?P<d>\d{1,2})(?P<sfx>er|ᵉʳ|e)?\s+(?P<m>" + "|".join(MONTHS) + r")\b(?:\s+(?P<y>\d{3,4})\b)?"

    def repl(m):
        day = int(m.group("d"))
        if not 1 <= day <= 31:
            return None
        out = f"{'premier' if day == 1 else bare(day)} {m.group('m')}"
        if m.group("y"):
            out += f" {year_words(int(m.group('y')))}"
        return out
    return ctx.sub(text, pattern, repl, re.IGNORECASE)


def _ordinals(text, ctx):
    def repl(m):
        n, sfx = int(m.group("n")), m.group("sfx")
        return ordinal_words(n, feminine=sfx in ("re", "ère", "ʳᵉ"))
    text = ctx.sub(text, r"(?<![\w.,:/])(?P<n>\d{1,3})(?P<sfx>ᵉʳ|ʳᵉ|er|re|ère|ème|ᵉ|e)\b", repl)
    return ctx.sub(text, r"\b[Nn]°\s*(?P<n>\d+)", lambda m: "numéro " + bare(int(m.group("n"))))


def _ranges(text, ctx):
    def repl(m):
        a, b = int(m.group("a")), int(m.group("b"))
        pre = m.group("pre") or ""
        if 100 <= a <= 2099 and 100 <= b <= 2099:
            wa, wb = year_words(a), year_words(b)
        elif a < b:
            wa, wb = bare(a), bare(b)
        else:
            return None
        if pre.strip().lower() == "entre":
            return f"{pre}{wa} et {wb}"
        if pre:                                         # de, depuis, en, pendant...: the preposition is already there
            return f"{pre}{wa} à {wb}"
        return f"de {wa} à {wb}"
    return ctx.sub(text, r"(?P<pre>\b(?:de|depuis|du|entre|en|pendant|durant|vers|dès|jusqu'en|après|avant)\s+)?(?<![\w.,:/])(?P<a>\d{1,4})\s*[-–—]\s*(?P<b>\d{1,4})(?![\w])", repl, re.IGNORECASE)


def _saints(text, ctx):
    text = ctx.sub(text, r"\bSte\.?(?=[-\s]+[A-ZÀ-Ö])", lambda m: "Sainte")
    return ctx.sub(text, r"\bSt\.?(?=[-\s]+[A-ZÀ-Ö])", lambda m: "Saint")


def _times(text, ctx):
    def repl(m):
        h, mi = int(m.group("h")), int(m.group("m") or 0)
        if h > 24 or mi > 59:
            return None
        return f"{bare(h)} heure{'s' if h > 1 else ''}" + (f" {bare(mi)}" if mi else "")
    return ctx.sub(text, r"(?<![\w.,:/])(?P<h>\d{1,2})(?:\s?h\s?|:)(?P<m>\d{2})(?![\d\w])", repl)


def _eras(text, ctx):
    text = ctx.sub(text, r"\bav\.\s?J\.-C\.?", lambda m: "avant Jésus-Christ")
    return ctx.sub(text, r"\bapr\.\s?J\.-C\.?", lambda m: "après Jésus-Christ")


def normalize(text: str, ctx: Ctx) -> str:
    text = expand_short_ranges(text, ctx)
    text = _times(text, ctx)
    text = _dates(text, ctx)
    text = _centuries(text, ctx)
    text = _rulers(text, ctx)
    text = _ordinals(text, ctx)
    text = convert_year_pairs(text, ctx, [r"\bentre\s+(?P<a>\d{3,4})\s+et\s+(?P<b>\d{3,4})\b", r"\b(?:de|depuis)\s+(?P<a>\d{3,4})\s+(?:à|jusqu'à|jusqu'en)\s+(?P<b>\d{3,4})\b"], year_words)
    text = _ranges(text, ctx)
    text = _percent(text, ctx)
    text = _units(text, ctx)
    text = convert_numbers(text, ctx, SPEC)
    text = _saints(text, ctx)
    text = _eras(text, ctx)
    return text
