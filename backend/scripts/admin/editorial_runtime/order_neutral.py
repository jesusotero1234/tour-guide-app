"""Detects the references to the order of the stops in a narration (plan 03 section 5.2).

A stop must be understandable in any order: it must not announce the next stop, refer to the previous one, close the walk,
and the introduction must not say where the visitor starts. The batch pipeline uses the detector as a review check and the
neutralisation of already published tours uses it as the success criterion of every edit.
"""
import re
from typing import Optional

KINDS = ("NEXT_STOP", "PREVIOUS_STOP", "FINISH", "START")

# Announcements of what comes next live in the last sentences of a stop (measured on the published catalogue).
TAIL_SENTENCES = 2

PATTERNS = {
    "NEXT_STOP": {
        "es": [r"siguiente parada", r"pr[óo]xima parada", r"nuestra siguiente", r"nos espera", r"seguimos hacia", r"continuamos (?:en|hacia)",
               r"ahora vamos (?:hacia|a)", r"vamos (?:ahora )?hacia", r"nos dirigimos (?:ahora )?(?:a|hacia)", r"a continuaci[óo]n(?:,)? (?:visitamos|llegamos|veremos)",
               r"camino de(?:l| la| el)?\b", r"el paseo contin[úu]a", r"pasamos de .{3,80} a ", r"seguiremos", r"dejamos .{0,40} para (?:ir|caminar|llegar)"],
        "en": [r"next stop", r"we(?:'ll| will)? (?:now )?head (?:to|toward|towards|for|on)", r"awaits us", r"we continue (?:to|toward|towards|with)", r"further on, the tour",
               r"we still have", r"our next (?:stop|destination)", r"next, we (?:visit|walk|go|head)",
               r"let(?:'|’)s (?:head|go|walk|move)", r"on the way to", r"what comes next", r"we move on", r"moving on", r"we go from .{3,80} to ", r"the walk continues"],
        "fr": [r"prochaine (?:[ée]tape|halte)", r"nous attend", r"nous continuons vers", r"il nous reste", r"le parcours nous m[èe]nera", r"nous nous dirigeons", r"nous poursuivons", r"(?:notre )?prochain arr[êe]t", r"allons (?:vers|[àa]|au|aux)", r"en chemin vers", r"sur le chemin de",
               r"la promenade continue", r"nous passons de .{3,80} [àa] ", r"l(?:'|’)[ée]tape suivante", r"[ée]tape suivante"],
        "de": [r"n[äa]chste[nr]? (?:Station|Halt)", r"erwartet uns", r"weiter (?:zu|zur|zum|nach)", r"f[üu]hrt uns der Rundgang", r"es bleibt uns", r"wir gehen weiter", r"wir setzen .{0,30} fort", r"auf dem Weg (?:zu|zur|zum|nach)", r"gehen wir (?:zu|zur|zum|nach)", r"wir gehen (?:zu|zur|zum|nach|von)",
               r"was als N[äa]chstes kommt", r"was kommt", r"der Spaziergang geht weiter"],
        "it": [r"prossima (?:tappa|fermata)", r"ci aspetta", r"proseguiamo", r"camminando verso", r"ci dirigiamo", r"la nostra prossima", r"andiamo verso", r"ci attende", r"quando proseguiremo", r"ci\s+aspetta", r"ci\s+attende", r"ci\s+aspetter[àa]",
               r"ci\s+attender[àa]", r"ci\s+accompagner[àa]", r"ci\s+porter[àa]", r"ci\s+condurr[àa]", r"ci\s+spostiamo", r"ci\s+spostiamo",
               r"ci\s+sposteremo", r"ci\s+accoglie", r"ci\s+accogliere", r"ci\s+offre", r"ci\s+offrir[àa]", r"ci\s+riceve", r"ci\s+riceverà", r"il percorso prosegue", r"passiamo da .{3,80} a ",
               r"ci\s+aspettano", r"ci\s+attendono", r"tappa successiva", r"ci\s*\w*\s+a ci[òo] che viene", r"ci[òo] che viene"],
    },
    "PREVIOUS_STOP": {
        "es": [r"parada anterior", r"como (?:ya )?(?:vimos|hemos visto)", r"acabamos de (?:ver|dejar)", r"venimos de", r"antes (?:visitamos|vimos)"],
        "en": [r"previous stop", r"as we (?:saw|have seen)", r"what we saw at", r"we have just (?:seen|left)", r"back at the (?:last|previous)"],
        "fr": [r"[ée]tape pr[ée]c[ée]dente", r"comme nous l'avons vu", r"nous venons de (?:voir|quitter)"],
        "de": [r"vorherigen Station", r"wie wir gesehen haben", r"wir kommen von", r"soeben (?:gesehen|verlassen)"],
        "it": [r"tappa precedente", r"come abbiamo visto", r"abbiamo appena (?:visto|lasciato)", r"veniamo da"],
    },
    "FINISH": {
        "es": [r"terminamos", r"termina (?:aqu[ií]|el recorrido|nuestro)", r"final del recorrido", r"llegas al final", r"[úu]ltima parada", r"concluye(?:mos)? (?:el|nuestro)"],
        "en": [r"we end", r"ends here", r"end of (?:the|our) (?:tour|walk)", r"final stop", r"last stop", r"our walk (?:ends|concludes)"],
        "fr": [r"nous terminons", r"se termine ici", r"fin de (?:la|notre) (?:visite|promenade|balade|parcours)", r"derni[èe]re [ée]tape"],
        "de": [r"endet hier", r"Ende (?:des|unseres) (?:Rundgangs|Spaziergangs)", r"letzte Station", r"unser Rundgang endet"],
        "it": [r"terminiamo", r"finisce qui", r"fine del (?:percorso|giro)", r"concludiamo", r"ultima tappa"],
    },
    "START": {
        "es": [r"donde empezamos", r"empezamos (?:en|por)", r"nuestra primera parada", r"comenzamos", r"primera parada", r"nuestro punto de partida"],
        "en": [r"we (?:start|begin)", r"our first stop", r"first stop", r"starting point"],
        "fr": [r"nous commen[çc]ons", r"premi[èe]re [ée]tape", r"commen[çc]ons", r"point de d[ée]part"],
        "de": [r"wir beginnen", r"erste Station", r"beginnen wir", r"Ausgangspunkt"],
        "it": [r"cominciamo", r"iniziamo", r"partiamo", r"prima tappa", r"punto di partenza"],
    },
}

# An enumeration in visiting order: "primero ..., luego ..., después ...".
ORDERED_LIST = {
    "es": r"\bprimero\s*[,:]?\s.{0,200}\b(?:luego|despu[ée]s|a continuaci[óo]n)\b",
    "en": r"\bfirst\s*[,:]\s.{0,200}\b(?:then|next|after that)\b",
    "fr": r"\bd'abord\s*[,:]?\s.{0,200}\b(?:puis|ensuite)\b",
    "de": r"\bzuerst\s*[,:]?\s.{0,200}\b(?:dann|danach|anschlie[ßs]end)\b",
    "it": r"\bprima\s*[,:]\s.{0,200}\b(?:poi|dopo|quindi)\b",
}

SCOPE = {"NEXT_STOP": "tail", "PREVIOUS_STOP": "all", "FINISH": "tail", "START": "all"}
ROLES = {"stop": ("NEXT_STOP", "PREVIOUS_STOP"), "last_stop": ("PREVIOUS_STOP", "FINISH"), "introduction": ("START", "NEXT_STOP")}


def sentences(text: str) -> list:
    """(start, end) of every sentence; paragraph breaks also separate sentences."""
    spans, start = [], 0
    for m in re.finditer(r"(?<=[.!?…])\s+|\n+", text):
        if m.start() > start:
            spans.append((start, m.start()))
        start = m.end()
    if start < len(text):
        spans.append((start, len(text)))
    return spans


def find_order_references(text: str, lang: str, *, stop_names: Optional[list] = None, role: str = "stop",
                          next_name: Optional[str] = None) -> list:
    """[{kind, sentence_index, match}]. `next_name` is the stop that follows in the published order: naming it in the last
    sentence is an announcement even without any of the usual phrases."""
    if role not in ROLES:
        raise ValueError("role must be stop, last_stop or introduction")
    spans = sentences(text)
    tail_from = max(0, len(spans) - TAIL_SENTENCES)
    findings = []
    for kind in ROLES[role]:
        compiled = [re.compile(p, re.IGNORECASE) for p in PATTERNS[kind].get(lang, [])]
        for index, (start, end) in enumerate(spans):
            if SCOPE[kind] == "tail" and index < tail_from and role != "introduction":
                continue
            sentence = text[start:end]
            for pattern in compiled:
                m = pattern.search(sentence)
                if m:
                    findings.append({"kind": kind, "sentence_index": index, "match": m.group(0)})
                    break
    if role == "introduction" and lang in ORDERED_LIST:
        m = re.search(ORDERED_LIST[lang], text, re.IGNORECASE | re.DOTALL)
        if m:
            findings.append({"kind": "START", "sentence_index": 0, "match": m.group(0)[:60]})
    if next_name and role == "stop" and spans:
        last = text[spans[-1][0]:spans[-1][1]]
        if re.search(r"(?<!\w)" + re.escape(next_name.strip()) + r"(?!\w)", last, re.IGNORECASE):
            findings.append({"kind": "NEXT_STOP", "sentence_index": len(spans) - 1, "match": next_name.strip()})
    unique = {}
    for f in findings:                      # one finding per kind and sentence: the first (formula) wins over the name of the stop
        unique.setdefault((f["kind"], f["sentence_index"]), f)
    return sorted(unique.values(), key=lambda f: (f["sentence_index"], f["kind"]))
