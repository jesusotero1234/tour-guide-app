#!/usr/bin/env python3
"""
Coordinate-first city enrichment corpus builder.
Uses Wikipedia geosearch to find relevant articles near a city — no
hardcoded administrative hierarchies. Works for any country.

Usage:
  python3 build_city_corpus.py Vilalba --lang es --output corpora/vilalba_corpus.json
  python3 build_city_corpus.py "Rothenburg ob der Tauber" --lang de --output corpora/rothenburg_corpus.json

Architecture:
  1. Geocode city → (lat, lon)
  2. Wikipedia geosearch: articles within radius km
  3. Fetch extracts, rank by relevance, chunk
  4. Output JSON corpus with level tags (city / nearby / regional)
"""

import json
import sys
import os
import argparse
import urllib.request
import urllib.parse
import time
from typing import Optional

WIKIPEDIA_API = "https://{lang}.wikipedia.org/w/api.php"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "tour-guide-app/1.0 (hermes-agent@nousresearch.com)"


# ── Geocoding ───────────────────────────────────────────────────────

def geocode(city: str, country: str = "") -> Optional[tuple[float, float]]:
    """Geocode a city name to (lat, lon) using Nominatim."""
    params = {
        "q": f"{city}, {country}" if country else city,
        "format": "json",
        "limit": 1,
    }
    url = f"{NOMINATIM_URL}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read())
        if data:
            return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception as e:
        print(f"  ⚠️  Geocode failed: {e}", file=sys.stderr)
    return None


# ── Wikipedia API ───────────────────────────────────────────────────

def wikipedia_fetch(article_title: str, lang: str = "es") -> Optional[str]:
    """Fetch Wikipedia article extract via REST API."""
    params = {
        "action": "query",
        "format": "json",
        "titles": article_title,
        "prop": "extracts",
        "exintro": 0,
        "explaintext": 1,
        "exsectionformat": "plain",
        "redirects": 1,
    }
    url = f"{WIKIPEDIA_API.format(lang=lang)}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        pages = data.get("query", {}).get("pages", {})
        for _, page in pages.items():
            extract = page.get("extract", "")
            if extract and len(extract) > 40:
                return extract
        return None
    except Exception as e:
        print(f"  ⚠️  Fetch failed for '{article_title}': {e}", file=sys.stderr)
        return None


def wikipedia_geosearch(lat: float, lon: float, radius: int, lang: str, limit: int = 15) -> list[dict]:
    """Find Wikipedia articles near (lat, lon) within radius meters."""
    params = {
        "action": "query",
        "format": "json",
        "list": "geosearch",
        "gscoord": f"{lat}|{lon}",
        "gsradius": radius,
        "gslimit": limit,
    }
    url = f"{WIKIPEDIA_API.format(lang=lang)}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read())
        return data.get("query", {}).get("geosearch", [])
    except Exception as e:
        print(f"  ⚠️  Geosearch failed: {e}", file=sys.stderr)
        return []


# ── Text processing ─────────────────────────────────────────────────

def chunk_text(text: str, max_chars: int = 1500) -> list[str]:
    """Split long text into chunks at paragraph boundaries."""
    paragraphs = text.split("\n")
    chunks = []
    current = ""
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if len(current) + len(para) > max_chars and current:
            chunks.append(current.strip())
            current = para
        else:
            current = f"{current}\n{para}" if current else para
    if current.strip():
        chunks.append(current.strip())
    return chunks


def filter_article_text(text: str) -> str:
    """Remove metadata sections from Wikipedia article text."""
    paragraphs = text.split("\n")
    filtered = []
    skip_next = False
    for p in paragraphs:
        p = p.strip()
        if not p:
            continue
        if p.startswith("==") and any(kw in p.lower() for kw in
            ["referencias", "bibliografía", "enlaces externos", "véase también",
             "references", "bibliography", "external links", "see also",
             "referenzen", "literatur", "weblinks", "siehe auch",
             "références", "bibliographie", "liens externes", "voir aussi"]):
            skip_next = True
            continue
        if skip_next:
            skip_next = False
            continue
        if len(p) > 40:
            filtered.append(p)
    return "\n".join(filtered)


# ── Relevance scoring ──────────────────────────────────────────────

# Articles to skip — too generic or not useful for tour context
SKIP_WORDS = {
    # Transport (stations, lines, highways, airports)
    "estación", "estacion", "station", "bahnhof", "gare", "stazione",
    "aeropuerto", "airport", "flughafen", "aéroport", "aeroporto",
    "línea", "linea", "line", "linie", "ligne",
    "autovía", "autovia", "autopista", "highway", "autobahn", "autoroute", "autostrada",
    # Water features
    "río", "rio", "river", "fluss", "rivière", "fiume",
    "arroyo", "stream", "bach", "ruisseau", "ruscello",
    # Mills (very common in rural areas, not tour-relevant)
    "mühle", "muehle", "muhle", "mill", "molino", "moulin", "watermill",
    "molen", "mlyn", "młyn", "myly", "moinho",
    # Sports venues
    "estadio", "stadium", "stadion", "stade", "stadio",
    "polideportivo", "sportzentrum", "sports centre",
    # Generic infrastructure
    "cementerio", "cemetery", "friedhof", "cimetière", "cimitero",
    "aparcamiento", "parking", "parkplatz", "parking lot",
    "gasolinera", "gas station", "tankstelle",
    "polígono", "poligono", "industrial", "industriepark",
}

CULTURAL_KEYWORDS = [
    # ES
    "iglesia", "catedral", "castillo", "museo", "plaza", "palacio",
    "monasterio", "convento", "torre", "muralla", "puente", "pazo",
    "historia", "patrimonio", "monumento", "basílica", "ermita",
    "ayuntamiento", "mercado", "universidad", "biblioteca", "teatro",
    # EN
    "church", "cathedral", "castle", "museum", "square", "palace",
    "monastery", "convent", "tower", "wall", "bridge", "manor",
    "history", "heritage", "monument", "basilica", "chapel",
    "town hall", "market", "university", "library", "theatre", "theater",
    # DE
    "kirche", "dom", "schloss", "museum", "platz", "palast",
    "kloster", "turm", "mauer", "brücke", "herrenhaus",
    "geschichte", "denkmal", "basilika", "kapelle",
    "rathaus", "markt", "universität", "bibliothek", "theater",
    # FR
    "église", "eglise", "cathédrale", "cathedrale", "château", "chateau",
    "musée", "musee", "place", "palais",
    "monastère", "monastere", "tour", "pont", "histoire", "patrimoine", "basilique",
    "mairie", "marché", "marche", "université", "universite", "bibliothèque", "theatre",
]


def score_article(article: dict, distance: float) -> float:
    """Score an article for relevance to tour context. Higher = better.
    Type/entity weight > distance after ~500m."""
    title = article.get("title", "").lower()
    # Normalize: remove punctuation for matching
    title_clean = title.replace("-", " ").replace("_", " ")
    score = 0.0
    
    # Distance: strong bonus for <500m, gentle decay beyond
    if distance < 500:
        score += 5
    elif distance < 2000:
        score += 2
    else:
        score += max(0, 1 - distance / 10000)
    
    # Penalize skip words (check both as whole words and substrings in compounds)
    title_words = set(title_clean.split())
    for skip_word in SKIP_WORDS:
        if skip_word in title_words or f" {skip_word} " in f" {title_clean} ":
            score -= 30
    
    # Boost cultural keywords (check against full title, handling compounds)
    for kw in CULTURAL_KEYWORDS:
        if kw in title_clean:
            score += 8
            break  # one category boost is enough
    
    # Penalize very short titles (likely stubs or disambiguation pages)
    if len(title) < 10:
        score -= 10
    
    return score


# ── Adaptive radius ─────────────────────────────────────────────────

def adaptive_radius(article_count: int, current_radius: int) -> int:
    """Choose next radius. Cap at Wikipedia max (10000m)."""
    if article_count >= 8: return current_radius
    if article_count >= 3: return min(current_radius * 2, 10000)
    return min(current_radius * 3, 10000)


# ── Main corpus builder ─────────────────────────────────────────────

def build_city_corpus(
    city: str,
    lang: str = "es",
    country: str = "",
    max_chars: int = 1500,
    max_articles: int = 8,
) -> list[dict]:
    """Build enrichment corpus for any city using coordinate-first approach."""
    entries = []
    
    # 1. Geocode
    print(f"📍 Geocoding: {city}...", file=sys.stderr)
    coords = geocode(city, country)
    if not coords:
        print("  ❌ Could not geocode city", file=sys.stderr)
        return entries
    lat, lon = coords
    print(f"   → {lat:.4f}, {lon:.4f}", file=sys.stderr)
    
    # 2. Fetch city article first (level: city)
    print(f"  📥 City article: {city}", file=sys.stderr)
    city_text = wikipedia_fetch(city, lang)
    if city_text:
        filtered = filter_article_text(city_text)
        chunks = chunk_text(filtered, max_chars)
        for i, chunk in enumerate(chunks):
            entries.append({
                "id": f"{city.lower().replace(' ', '_')}-city-{i+1:03d}",
                "place": city,
                "level": "city",
                "theme": "general",
                "text": chunk,
                "source_url": f"https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(city.replace(' ', '_'))}",
                "source": "wikipedia",
                "lang": lang,
                "retrieved_at": time.strftime("%Y-%m-%d"),
            })
        print(f"     ✅ {len(chunks)} chunk(s)", file=sys.stderr)
    else:
        print(f"     ⚠️  No article found", file=sys.stderr)
    
    # 3. Geosearch nearby articles
    # Large cities: fetch more candidates, score all, pick best
    gslimit = 50  # fetch many, score will filter
    radius = 5000
    all_articles = []
    
    for attempt in range(3):
        articles = wikipedia_geosearch(lat, lon, radius, lang, limit=gslimit)
        if articles and len(articles) >= 3:
            all_articles = articles
            break
        new_radius = adaptive_radius(len(articles) if articles else 0, radius)
        if new_radius == radius:
            all_articles = articles or []
            break
        radius = new_radius
        print(f"  🔍 Expanding search to {radius}m...", file=sys.stderr)
        time.sleep(0.5)
    
    if all_articles:
        print(f"  📍 Found {len(all_articles)} nearby articles", file=sys.stderr)
    else:
        print(f"  ⚠️  No nearby articles found", file=sys.stderr)
    
    # 4. Score, rank, and filter
    scored = []
    for a in all_articles:
        title = a.get("title", "")
        dist = a.get("dist", 99999)
        if title.lower().strip() == city.lower().strip():
            continue  # skip self (already fetched as city)
        s = score_article(a, dist)
        if s > -10:  # filter out noise
            scored.append((s, a))
    
    scored.sort(key=lambda x: -x[0])  # highest score first
    
    # 5. Fetch top articles
    fetched = 0
    for score, article in scored[:max_articles]:
        title = article["title"]
        dist = article.get("dist", 0)
        print(f"  📥 [{score:.0f}] {title} ({dist:.0f}m)...", file=sys.stderr)
        
        text = wikipedia_fetch(title, lang)
        if not text:
            continue
        
        filtered = filter_article_text(text)
        chunks = chunk_text(filtered, max_chars)
        
        for i, chunk in enumerate(chunks):
            entries.append({
                "id": f"{city.lower().replace(' ', '_')}-nearby-{fetched+1:03d}-{i+1:02d}",
                "place": title,
                "level": "city",  # nearby articles are city-level context
                "theme": "general",
                "text": chunk,
                "distance_m": int(dist),
                "relevance_score": int(score),
                "source_url": f"https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(title.replace(' ', '_'))}",
                "source": "wikipedia",
                "lang": lang,
                "retrieved_at": time.strftime("%Y-%m-%d"),
            })
        
        fetched += 1
        print(f"     ✅ {len(chunks)} chunk(s)", file=sys.stderr)
        time.sleep(0.5)
    
    return entries


# ── CLI ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Coordinate-first city enrichment corpus builder",
        epilog="Example: python3 build_city_corpus.py Vilalba --lang es -o corpora/vilalba_corpus.json"
    )
    parser.add_argument("city", help="City name")
    parser.add_argument("--lang", "-l", default="es", help="Wikipedia language (default: es)")
    parser.add_argument("--country", "-c", default="", help="Country hint for geocoding")
    parser.add_argument("--output", "-o", required=True, help="Output JSON file")
    parser.add_argument("--max-chars", type=int, default=1500, help="Max chars per chunk")
    parser.add_argument("--max-articles", type=int, default=8, help="Max nearby articles to fetch")
    args = parser.parse_args()
    
    print(f"🔨 Building corpus for {args.city} (lang={args.lang})", file=sys.stderr)
    
    entries = build_city_corpus(
        args.city,
        lang=args.lang,
        country=args.country,
        max_chars=args.max_chars,
        max_articles=args.max_articles,
    )
    
    if entries:
        os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(entries, f, ensure_ascii=False, indent=2)
        
        levels = {}
        for e in entries:
            lv = e.get("level", "city")
            levels[lv] = levels.get(lv, 0) + 1
        
        print(f"\n✅ Corpus built: {len(entries)} entries → {args.output}", file=sys.stderr)
        print(f"   Levels: {json.dumps(levels)}", file=sys.stderr)
    else:
        print("\n❌ No articles found. Try a different language or city name.", file=sys.stderr)
        sys.exit(1)
