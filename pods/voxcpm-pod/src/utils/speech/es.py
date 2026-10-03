"""Spanish speech normalization (plan 02 section 4.2)."""
import re

from num2words import num2words

from .common import ROMAN_TOKEN, RULER_ALT, Ctx, convert_year_pairs, expand_short_ranges, parentheses_to_commas, roman_to_int, saint_prefix, tidy
from .numbers import NumberSpec, convert_numbers

MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "setiembre",
          "octubre", "noviembre", "diciembre"]
FEMININE_NAMES = {"Isabel", "Juana", "Catalina", "María", "Ana", "Victoria", "Margarita", "Federica"}
_ORDINALS = ["", "primero", "segundo", "tercero", "cuarto", "quinto", "sexto", "séptimo", "octavo", "noveno", "décimo"]

_FEM = """torres personas obras piezas calles puertas naves paredes cruces luces veces flores mujeres noches clases fuentes
cumbres partes leyes imágenes columnas bóvedas capillas iglesias salas estatuas vidrieras campanas ventanas habitaciones
casas familias personas familias hectáreas millas leguas yardas toneladas vueltas veces tardes mañanas horas semanas
décadas docenas decenas centenas parejas guerras batallas ciudades villas aldeas plazas fachadas arcadas arcos""".split()
_FEM = set(_FEM) - {"arcos"}
_MASC_A = {"día", "días", "mapa", "mapas", "planeta", "planetas", "tema", "temas", "poeta", "poetas", "sistema",
           "sistemas", "idioma", "idiomas", "programa", "programas", "problema", "problemas", "clima", "dilema",
           "diploma", "drama", "dramas", "cometa", "papa", "papas", "esquema", "esquemas", "pirata", "piratas",
           "atleta", "atletas", "pianista", "colega", "colegas", "guía", "guías", "enigma", "enigmas"}
_MASC_ION = {"avión", "aviones", "camión", "camiones", "gorrión", "sarampión", "pepión"}
_MASC_OTHER = {"años", "metros", "kilómetros", "habitantes", "soldados", "hombres", "tubos", "visitantes", "turistas", "códices", "árboles",
               "pilares", "canales", "jardines", "puentes", "lugares", "reyes", "mártires", "cardenales", "capiteles", "ángeles", "huéspedes",
               "monjes", "nobles", "duques", "condes", "mercaderes", "peregrinos", "miles", "millones", "cientos", "miembros", "libros", "textos"}


def gender(word: str):
    w = word.lower().strip(".,;:!?»”)\"'")
    if not w:
        return None
    if w in _MASC_A or w in _MASC_ION or w in _MASC_OTHER or (w.endswith("ones") and not w.endswith("iones")):
        return "m"
    if w in _FEM or w.endswith(("ión", "iones", "dad", "dades", "tud", "tudes", "a", "as", "umbre", "umbres")):
        return "f"
    if w.endswith(("o", "os", "or", "ores", "án", "anes")):
        return "m"
    return None


def cardinal_words(n: int, g=None):
    """Cardinal in words. `g` is "m", "f" or None (bare number: "uno"). Returns None when the number needs a gender
    (it ends in 1 or has a hundreds group) and the next word does not give one."""
    words = num2words(n, lang="es")
    needs = bool(re.search(r"\buno\b|\w*uno\b|ientos\b|cientos\b", words)) or n % 10 == 1 and n % 100 != 11
    if g is None:
        return words if not needs else None
    words = re.sub(r"\bveintiuno\b", "veintiún" if g == "m" else "veintiuna", words)
    words = re.sub(r"\buno\b", "un" if g == "m" else "una", words)
    if g == "f":
        words = words.replace("ientos", "ientas")
    return words


def bare(n: int) -> str:
    return num2words(n, lang="es")


def _cardinal(n: int, nxt: str):
    words = cardinal_words(n, gender(nxt))
    # "1 de cada 3", "21 de ellos": the number stands alone, so the bare form is right ("uno", "veintiuno").
    if words is None and nxt.lower() == "de" and not re.search(r"ientos\b|cientos\b", bare(n)):
        return bare(n)
    return words


def year_words(n: int) -> str:
    return num2words(n, lang="es")


def ordinal(n: int, feminine: bool = False) -> str:
    word = _ORDINALS[n]
    return word[:-1] + "a" if feminine else word


def ruler_number(n: int, feminine: bool):
    """Rulers and popes: ordinal up to X, cardinal from XI."""
    return ordinal(n, feminine) if n <= 10 else num2words(n, lang="es")


SPEC = NumberSpec(
    lang="es", thousands_sep=r"\.", decimal_sep=",", point_word="coma", cardinal=_cardinal, year=year_words,
    year_context={"en", "de", "del", "desde", "hasta", "hacia", "entre", "año", "años", "el", "tras",
                  "antes", "después", "circa", "ca", "c", "durante", "para", "por", "al"},
    quantity_before={"unos", "unas", "aproximadamente", "casi", "cerca", "alrededor", "total", "más", "menos",
                     "unos", "tan"},
    count_words={"metros", "metro", "kilómetros", "kilómetro", "km", "m", "cm", "kg", "ha", "tubos", "personas",
                 "habitantes", "soldados", "hombres", "mujeres", "visitantes", "turistas", "fieles", "pasos",
                 "años", "euros", "pesetas", "ducados", "monedas", "piezas", "obras", "volúmenes", "libros",
                 "toneladas", "litros", "hectáreas", "kilos", "kilogramos", "peregrinos", "vecinos", "familias",
                 "casas", "edificios", "columnas", "tumbas", "escalones", "ejemplares", "palabras", "páginas"},
    label_before={"número", "numero"}, label_cardinal=bare, bare=bare,
    era_after=r"\s*(?:a|d)\.\s?(?:de\s+)?C\.", months=set(MONTHS))

_UNITS = {  # symbol -> (singular, plural, gender)
    "km": ("kilómetro", "kilómetros", "m"), "m²": ("metro cuadrado", "metros cuadrados", "m"), "m2": ("metro cuadrado", "metros cuadrados", "m"),
    "m": ("metro", "metros", "m"), "cm": ("centímetro", "centímetros", "m"), "mm": ("milímetro", "milímetros", "m"),
    "kg": ("kilo", "kilos", "m"), "g": ("gramo", "gramos", "m"), "ha": ("hectárea", "hectáreas", "f"),
    "km/h": ("kilómetro por hora", "kilómetros por hora", "m"), "km²": ("kilómetro cuadrado", "kilómetros cuadrados", "m"),
    "t": ("tonelada", "toneladas", "f"), "l": ("litro", "litros", "m"),
}
_UNIT_RE = re.compile(r"(?<![\w.,:/])(?P<num>\d{1,3}(?:\.\d{3})+|\d+)(?:,(?P<frac>\d+))?\s*(?P<unit>km/h|km²|m²|m2|km|cm|mm|kg|ha|g|t|l|m)(?![\w²/])")


def _units(text, ctx):
    def repl(m):
        digits = m.group("num").replace(".", "")
        symbol = m.group("unit")
        one, many, g = _UNITS[symbol]
        if m.group("frac") is not None:
            integer, frac = int(digits), m.group("frac")
            words = bare(integer) + " coma " + (bare(int(frac)) if len(frac) <= 2 and not frac.startswith("0") else " ".join(bare(int(d)) for d in frac))
            return f"{words} {many}"
        n = int(digits)
        words = cardinal_words(n, g)
        return f"{words} {one if n == 1 else many}" if words else None
    return ctx.sub(text, _UNIT_RE, repl)


def _percent(text, ctx):
    def repl(m):
        digits = m.group("num").replace(".", "")
        if m.group("frac") is not None:
            frac = m.group("frac")
            return f"{bare(int(digits))} coma {bare(int(frac)) if len(frac) <= 2 and not frac.startswith('0') else ' '.join(bare(int(d)) for d in frac)} por ciento"
        return f"{bare(int(digits))} por ciento"
    return ctx.sub(text, r"(?<![\w.,:/])(?P<num>\d{1,3}(?:\.\d{3})+|\d+)(?:,(?P<frac>\d+))?\s*%", repl)


def _centuries(text, ctx):
    roman = r"(?:" + ROMAN_TOKEN + r")"
    listing = roman + r"(?:\s*(?:,|y|e|o|-|–|—|al|a)\s*" + roman + r")*"
    pattern = r"\b(?P<word>[Ss]iglos?|[Ss]s?\.)\s*(?P<list>" + listing + r")\b(?P<era>\s*(?:a|d)\.\s?(?:de\s+)?C\.)?"

    def repl(m):
        parts = re.split(r"(\s*(?:,|y|e|o|-|–|—|al|a)\s*)", m.group("list"))
        out = []
        for i, part in enumerate(parts):
            if i % 2:
                out.append(re.sub(r"^\s*-\s*$|^\s*[–—]\s*$", " a ", part) if re.fullmatch(r"\s*[-–—]\s*", part) else part)
                continue
            v = roman_to_int(part)
            if v is None:
                return None
            out.append("primero" if v == 1 else num2words(v, lang="es"))
        word = m.group("word")
        base = ("Siglo" if word[0] == "S" else "siglo") + ("s" if word.lower().startswith("siglos") or word.lower() == "ss." else "")
        era = ""
        if m.group("era"):
            era = " antes de Cristo" if m.group("era").strip().startswith("a") else " después de Cristo"
        return f"{base} {''.join(out)}{era}"
    return ctx.sub(text, pattern, repl)


def _rulers(text, ctx):
    def repl(m):
        v = roman_to_int(m.group("rn"))
        if v is None:
            return None
        return f"{m.group('name')} {ruler_number(v, m.group('name') in FEMININE_NAMES)}"
    return ctx.sub(text, r"(?<![\w])(?P<name>" + RULER_ALT + r")[\s-]+(?P<rn>" + ROMAN_TOKEN + r")\b(?!\.\s?[a-záéíóúñ])", repl)


def _bare_centuries(text, ctx):
    """"en el XIX", "a comienzos del XIII": the century without the word siglo. A capitalised word after the numeral
    ("el XX Juegos", "la XVII Olimpiada") means it is something else and is left for the gate."""
    def repl(m):
        v = roman_to_int(m.group("rn"))
        if v is None or v > 21 or re.match(r"\s+[A-ZÀ-ÖØ-Þ]", text[m.end():m.end() + 4]):
            return None
        return f"{m.group('art')} siglo {'primero' if v == 1 else num2words(v, lang='es')}"
    return ctx.sub(text, r"\b(?P<art>[Ee]l|[Dd]el|[Aa]l)\s+(?P<rn>" + ROMAN_TOKEN + r")\b", repl)


def _dates(text, ctx):
    pattern = r"(?<![\w.,:/])(?P<d>\d{1,2})\s+de\s+(?P<m>" + "|".join(MONTHS) + r")\b(?:\s+de\s+(?P<y>\d{3,4})\b)?"

    def repl(m):
        day = int(m.group("d"))
        if not 1 <= day <= 31:
            return None
        out = f"{'uno' if day == 1 else cardinal_words(day, None)} de {m.group('m')}"
        if m.group("y"):
            out += f" de {year_words(int(m.group('y')))}"
        return out
    return ctx.sub(text, pattern, repl, re.IGNORECASE)


def _day_ranges(text, ctx):
    """"del 21 al 24 de agosto", "del 1 al 2 de agosto de 1793"."""
    months = "|".join(MONTHS)

    def repl(m):
        a, b = int(m.group("a")), int(m.group("b"))
        if not (1 <= a <= 31 and 1 <= b <= 31):
            return None
        first = "uno" if a == 1 else bare(a)
        out = f"{m.group('pre')}{first} {m.group('c')} {'uno' if b == 1 else bare(b)} de {m.group('m')}"
        return out + (f" de {year_words(int(m.group('y')))}" if m.group("y") else "")
    return ctx.sub(text, r"(?P<pre>\b(?:del|desde el|entre el)\s+)(?P<a>\d{1,2})\s+(?P<c>al|hasta el|y el)\s+(?P<b>\d{1,2})\s+de\s+(?P<m>" + months + r")\b(?:\s+de\s+(?P<y>\d{3,4})\b)?", repl, re.IGNORECASE)


def _ranges(text, ctx):
    def repl(m):
        a, b = int(m.group("a")), int(m.group("b"))
        if a >= b and not (100 <= a <= 2099):
            return None
        if 100 <= a <= 2099 and 100 <= b <= 2099:
            wa, wb = year_words(a), year_words(b)
        else:
            wa, wb = cardinal_words(a, None), cardinal_words(b, None)
            if wa is None or wb is None:
                return None
        before = m.group("pre").lower().strip() if m.group("pre") else ""
        if before == "entre":
            return f"{m.group('pre')}{wa} y {wb}"
        if before:                                      # de, desde, en, durante...: the preposition is already there
            return f"{m.group('pre')}{wa} a {wb}"
        return f"de {wa} a {wb}"
    return ctx.sub(text, r"(?P<pre>\b(?:entre|desde|de|en|durante|hacia|hasta|tras|para|por|sobre|bajo|ante)\s+)?(?<![\w.,:/])(?P<a>\d{1,4})\s*[-–—]\s*(?P<b>\d{1,4})(?![\w])", repl, re.IGNORECASE)


def _ordinals(text, ctx):
    def repl(m):
        n, mark = int(m.group("n")), m.group("mark")
        feminine = mark in ("ª",) or mark.endswith("ª")
        if mark.endswith("er"):
            return {1: "primer", 3: "tercer"}.get(n)
        if n <= 10:
            return ordinal(n, feminine)
        return cardinal_words(n, "f" if feminine else "m")
    text = ctx.sub(text, r"(?<![\w.,:/])(?P<n>\d{1,3})(?:\.\s?)?(?P<mark>[ºª°]|\.?er\b)", repl)
    return ctx.sub(text, r"\b(?:[Nn]\.\s?º|[Nn]º|[Nn]úm\.|[Nn]um\.)\s*(?P<n>\d+)",
                   lambda m: "número " + bare(int(m.group("n"))))


def _decades(text, ctx):
    def repl(m):
        n = int(m.group("n"))
        if n % 10 or not 10 <= n <= 90:
            return None
        return m.group("pre") + num2words(n, lang="es")
    return ctx.sub(text, r"(?P<pre>\b(?:años|década de los|décadas de los)\s+)(?P<n>\d{2})(?!\d|\w)", repl, re.IGNORECASE)


def _circa(text, ctx):
    def repl(m):
        n = int(m.group("n"))
        return "hacia " + year_words(n) if 100 <= n <= 2099 else None
    return ctx.sub(text, r"\b(?:[Cc]a?\.|[Cc]irca)\s*(?P<n>\d{3,4})(?!\w)", repl)


def _saints(text, ctx):
    prefix = saint_prefix(ctx.country)
    if not prefix:
        return text
    return ctx.sub(text, r"\bSt\.(?P<sep>[-\s]+)(?=[A-ZÀ-ÖØ-Þ])", lambda m: prefix + m.group("sep"))


def _times(text, ctx):
    def repl(m):
        h, mi = int(m.group("h")), int(m.group("m"))
        if h > 24 or mi > 59:
            return None
        return bare(h) + (" horas" if mi == 0 else f" cero {bare(mi)}" if mi < 10 else f" {bare(mi)}")
    return ctx.sub(text, r"(?<![\w.,:/])(?P<h>\d{1,2}):(?P<m>\d{2})(?![\d\w])", repl)


def _eras(text, ctx):
    text = ctx.sub(text, r"\ba\.\s?(?:de\s+)?C\.", lambda m: "antes de Cristo")
    return ctx.sub(text, r"\bd\.\s?(?:de\s+)?C\.", lambda m: "después de Cristo")


def normalize(text: str, ctx: Ctx) -> str:
    text = expand_short_ranges(text, ctx)
    text = _times(text, ctx)
    text = _day_ranges(text, ctx)
    text = _dates(text, ctx)
    text = _centuries(text, ctx)
    text = _bare_centuries(text, ctx)
    text = _rulers(text, ctx)
    text = _circa(text, ctx)
    text = _ordinals(text, ctx)
    text = _decades(text, ctx)
    text = convert_year_pairs(text, ctx, [r"\bentre\s+(?P<a>\d{3,4})\s+y\s+(?P<b>\d{3,4})\b", r"\b(?:de|desde)\s+(?P<a>\d{3,4})\s+(?:a|hasta)\s+(?P<b>\d{3,4})\b"], year_words)
    text = _ranges(text, ctx)
    text = _percent(text, ctx)
    text = _units(text, ctx)
    text = convert_numbers(text, ctx, SPEC)
    text = _saints(text, ctx)
    text = _eras(text, ctx)
    return text
