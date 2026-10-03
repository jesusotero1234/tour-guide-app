"""Shared machinery for the per-language speech normalizers.

The text a TTS reads must contain no digits, Roman numerals, abbreviations or symbols. Each language module
rewrites those into words with deterministic rules that only fire when the context is unambiguous. Anything
dubious is left untouched so that `gate` reports it and the (billable, guarded) LLM repair can resolve it.
"""
import re
from dataclasses import dataclass, field
from typing import Callable, Optional

_ROMAN_RE = re.compile(r"^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$")
_ROMAN_VALUES = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}

# Rulers, popes and other people numbered with Roman numerals (plan 02 section 4.7).
RULER_NAMES = """Luis Louis Luigi Ludwig Carlos Charles Carlo Karl Felipe Philippe Filippo Philipp Philip Fernando Ferdinand
Ferdinando Jaime Jacques Giacomo Jakob James Pedro Pierre Pietro Peter Alfonso Alphonse Enrique Henri Enrico Heinrich Henry
Federico Frédéric Friedrich Frederick Napoleón Napoléon Napoleone Napoleon Guillermo Guillaume Guglielmo Wilhelm William Juan
Jean Giovanni Johann John Pío Pie Pio Pius León Léon Leone Leo Benedicto Benoît Benedetto Benedikt Benedict Clemente Clément
Clemens Clement Gregorio Grégoire Gregor Gregory Inocencio Innocent Innocenzo Innozenz Urbano Urbain Urban Sixto Sixte Sisto
Sixtus Ruggero Roger Cosimo Cosme Emanuele Manuel Vittorio Victor Umberto Humbert Otto Otón Ottone Maximiliano Maximilien
Massimiliano Maximilian Francisco François Francesco Franz Francis Isabel Isabelle Isabella Elisabeth Elizabeth Ricardo
Richard Riccardo Eduardo Édouard Edoardo Eduard Edward Ramiro Sancho Martín Martin Martino Bonifacio Boniface Bonifatius
Paulo Paul Paolo Paulus Alejandro Alexandre Alessandro Alexander Rodolfo Rodolphe Rudolf Mastino Cangrande Lorenzo Federigo
Ranieri Corrado Konrad Conrad Lotario Lothaire Lothar Berengario Bérenger Ugo Hugues Teodorico Pepino Pépin Pipino Pippin
Lambert Clodoveo Clovis Childeberto Childebert Dagoberto Dagobert Sigismondo Sigismund Mattia Matthias Leopoldo Léopold
Leopold Gustavo Gustave Gustav Cristiano Christian Federica Margarita Marguerite Margherita Margarete Juana Jeanne Giovanna
Johanna María Marie Maria Mary Ana Anne Anna Catalina Catherine Caterina Katharina Victoria Vittoria Viktoria
George Georg Georges Jorge Giorgio Stephen Esteban Étienne Stefano Stephan Nicholas Nicolás Nicolas Nicola Nikolaus Michael Miguel
Michel Michele Joseph José Josef Giuseppe Albert Alberto Albrecht Elisabetta Ludovico Ludovic Arthur Arturo Thomas Tomás
Julio Julius Jules Giulio Pablo Eugenio Eugene Eugène Eugen Amedeo Amadeo Constantino Constantine Constantin Konstantin Costantino
Hermann Adolf Adolfo August Augusto Augustus Auguste Pascual Paschal Pascal Pasquale Paschalis Honorio Honorius Onorio Honoré Max
Valentiniano Valentinian Valentinien Celestino Celestine Célestin Coelestin Cölestin Gelasio Gelasius Gélase Tommaso Vitale
Ramón Raymond Raimund Raimon Ramon Jaume Abderramán Rahman Yusuf Niccolò Nicolò Emmanuel Emanuel Emmanuele Alfons Teodosio
Theodosius Théodose Justiniano Justinian Justinien Domenico Domingo Dominic Basilio Basil Basile Anastasio Anastasius Anastase
Sergio Sergius Stéphane Esteban Ladislao Ladislas László Wenzel Wenceslao Wenceslas Casimiro Casimir Kasimir Ottokar Przemysl
Boleslao Boleslaw Mieszko Vladimiro Vladimir Iván Ivan Pedro Fernán Teobaldo Thibaut Theobald Balduino Baudouin Baldwin Godofredo
Godefroi Gottfried Roberto Robert Roberto Guido Guy Guiseppe Marcelo Marcellus Marcel Silvestre Sylvestre Silvester Zacarías
Zacharias Zacharie Esteban Lucio Lucius Lucien Calixto Callixtus Calixte Adriano Hadrian Adrien Adrián Alexis Anacleto Anaclet
Bonifacio Evaristo Evariste Félix Felix Fabiano Fabian Fabien Gaio Gayo Hormisdas Ormisda Higinio Hyginus Hygin Ireneo
Leandro Liberio Liberius Linus Lino Marino Marinus Martín Telésforo Telesphorus Víctor Zósimo Zosimus Zosime""".split()


def roman_to_int(token: str) -> Optional[int]:
    """Value of a canonical Roman numeral, or None when `token` is not one (or is empty)."""
    if not token or not _ROMAN_RE.match(token):
        return None
    total = 0
    for i, ch in enumerate(token):
        value = _ROMAN_VALUES[ch]
        total += -value if i + 1 < len(token) and _ROMAN_VALUES[token[i + 1]] > value else value
    return total


ROMAN_TOKEN = r"[IVXLCDM]+"
RULER_ALT = "|".join(sorted((re.escape(n) for n in set(RULER_NAMES)), key=len, reverse=True))


@dataclass
class Ctx:
    lang: str
    country: Optional[str] = None
    changes: list = field(default_factory=list)

    def sub(self, text: str, pattern, fn: Callable, flags: int = 0) -> str:
        """re.sub whose callback may return None to leave a match untouched; every real rewrite is recorded."""
        compiled = re.compile(pattern, flags) if isinstance(pattern, str) else pattern

        def repl(match):
            out = fn(match)
            if out is None:
                return match.group(0)
            if out != match.group(0):
                self.changes.append((match.group(0), out))
            return out
        return compiled.sub(repl, text)


# ---------------------------------------------------------------------------------------------------------
# Cleaning: what sanitize_text does for the legacy path, minus its English substitutions (km/m/St./Ave.) and
# the removal of a leading "1492." that would eat a year. A text that passes `gate` is a fixed point of
# sanitize_text, which render-tour.py asserts.
# ---------------------------------------------------------------------------------------------------------
def clean_text(text: str) -> str:
    import unicodedata
    out = text.replace("\r\n", "\n").replace("\r", "\n")
    out = re.sub(r"https?://\S+|www\.\S+", " ", out)
    out = re.sub(r"\[[^\]]*\]", " ", out)
    out = re.sub(r"\{[^\}]*\}", " ", out)
    out = "".join(ch for ch in out if ch == "\n" or (ord(ch) >= 32 and unicodedata.category(ch) not in {"So", "Cn", "Cc", "Cs"} or ch == "°"))
    out = re.sub(r"#+\s+(.*)", r"\1", out)
    out = re.sub(r"\*\*([^*]+)\*\*", r"\1", out)
    out = re.sub(r"\*([^*]+)\*", r"\1", out)
    out = re.sub(r"__([^_]+)__", r"\1", out)
    out = re.sub(r"_([^_]+)_", r"\1", out)
    out = re.sub(r"---+", "", out)
    out = re.sub(r"^\s*[\*\-•]\s+", "", out, flags=re.MULTILINE)
    out = re.sub(r"^\s*>\s+", "", out, flags=re.MULTILINE)
    out = re.sub(r"\n+", "\n\n", out)  # every production preset has singleNewlineParagraphs
    out = re.sub(r"[^\S\n]+", " ", out)
    out = re.sub(r"\n[^\S\n]+", "\n", out)
    out = re.sub(r"[^\S\n]+\n", "\n", out)
    return out.strip()


def tidy(text: str) -> str:
    """Repairs the punctuation artifacts that the rewrites can leave behind."""
    out = re.sub(r"[^\S\n]+", " ", text)
    out = re.sub(r" +([.,])", r"\1", out)
    out = re.sub(r",(\s*,)+", ",", out)
    out = re.sub(r",\s*([.!?;:])", r"\1", out)
    out = re.sub(r"(^|\n)\s*,\s*", r"\1", out)
    out = re.sub(r"[^\S\n]+\n", "\n", out)
    out = re.sub(r"\n[^\S\n]+", "\n", out)
    return out.strip()


def parentheses_to_commas(text: str) -> str:
    """"(x)" becomes ", x,": in controllable-cloning mode a chunk that starts with "(" is read as a style prompt."""
    def repl(m):
        inner = m.group(1).strip()
        return ", " + inner + "," if inner else " "
    out = re.sub(r"\s*\(([^()]*)\)", repl, text)
    return out.replace("(", ", ").replace(")", ",")


def neighbors(text: str, start: int, end: int):
    """(previous word as written, next word as written) around text[start:end]; punctuation counts as a boundary."""
    before = re.search(r"([^\W\d_][\w'’\-.]*)\s*$", text[max(0, start - 40):start])
    after = re.match(r"\s*([^\W\d_][\w'’\-]*)", text[end:end + 40])
    return (before.group(1) if before else ""), (after.group(1) if after else "")


def sentence_start(text: str, pos: int) -> bool:
    """True when the word that begins at `pos` opens a sentence or paragraph."""
    return bool(re.search(r"(^|[.!?]['\"»”)]*\s+|\n)$", text[max(0, pos - 6):pos])) or pos == 0


def previous_word_span(text: str, pos: int):
    m = re.search(r"([^\W\d_][\w'’\-]*)\s+$", text[:pos])
    return (m.start(1), m.group(1)) if m else (None, "")


def decimal_words(int_part: int, frac: str, cardinal, point_word: str) -> str:
    """"3,5" -> "three point five". Up to two fractional digits are read as one number, longer ones digit by digit."""
    if len(frac) <= 2 and not frac.startswith("0"):
        fraction = cardinal(int(frac))
    else:
        fraction = " ".join(cardinal(int(d)) for d in frac)
    return f"{cardinal(int_part)} {point_word} {fraction}"


_PRONOUN_VERBS = ("think thought believe believed guess guessed suppose supposed know knew met saw see remember wonder said say "
                  "feel felt hope hoped imagine am will would can could shall should must do did have").split()


def english_pronoun_i(after: str) -> bool:
    """"John I think...": an "I" right after a first name followed by a verb of thought or state is the pronoun."""
    m = re.match(r"\s*(?:'(?:m|ll|d|ve)\b|(\w+))", after)
    return bool(m and (m.group(1) is None or m.group(1).lower() in _PRONOUN_VERBS))


def convert_year_pairs(text: str, ctx: Ctx, patterns, year) -> str:
    """"between 800 and 900", "von 1500 bis 1600": both numbers are years. Each pattern has named groups a and b."""
    def repl(m):
        a, b = int(m.group("a")), int(m.group("b"))
        if not (100 <= a <= 2099 and 100 <= b <= 2099):
            return None
        whole = m.group(0)
        return whole[:m.start("a") - m.start()] + year(a) + whole[m.end("a") - m.start():m.start("b") - m.start()] + year(b) + whole[m.end("b") - m.start():]
    for pattern in patterns:
        text = ctx.sub(text, pattern, repl, re.IGNORECASE)
    return text


def expand_short_ranges(text: str, ctx: Ctx) -> str:
    """"1644-45" and "1865/67" are ranges of years whose second year lost its century: write it out in full."""
    def repl(m):
        a, b = int(m.group("a")), int(m.group("b"))
        end = a // 100 * 100 + b
        return f"{m.group('a')}-{end}" if 1000 <= a <= 2099 and end > a else None
    return ctx.sub(text, r"(?<![\w.,:/])(?P<a>\d{4})\s*[-–—/]\s*(?P<b>\d{2})(?![\d\w])", repl)


def saint_prefix(country):
    """How "St." reads in a tour of that country: Sankt in German-speaking lands, Saint in France and the English-speaking world."""
    if country in ("DE", "AT", "CH", "LI"):
        return "Sankt"
    if country in ("FR", "BE", "LU", "MC", "GB", "IE", "US", "CA", "AU", "NZ"):
        return "Saint"
    return None
