#!/usr/bin/env python3
"""
generate_corpus.py — Build a city corpus from Wikidata + Wikipedia.

Usage:
  python3 generate_corpus.py barcelona es
  python3 generate_corpus.py paris fr --limit 60

Output:
  corpora/{city}_corpus.json — list of { id, place, theme, text, source_url, lang, license, retrieved_at }
"""

import sys
import json
import time
import os
import hashlib
import argparse
import logging
from datetime import datetime, timezone
from urllib.parse import quote

logging.basicConfig(level=logging.INFO, format='[corpus] %(message)s')
logger = logging.getLogger(__name__)

# ── Wikidata SPARQL ──────────────────────────────────────────────────

WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"

SPARQL_TEMPLATE = """
SELECT ?item ?itemLabel ?wikipedia_es ?wikipedia_en ?wikipedia_fr ?wikipedia_de ?wikipedia_it
       (GROUP_CONCAT(DISTINCT ?instanceLabel; separator=", ") AS ?types)
       (SAMPLE(?architectLabel) AS ?architect)
       (SAMPLE(?inception) AS ?inception)
       (SAMPLE(?heritageLabel) AS ?heritage)
       (SAMPLE(?styleLabel) AS ?style)
WHERE {{
  ?item wdt:P31/wdt:P279* ?instance.
  VALUES ?instanceClass {{
    wd:Q4989906   # monument
    wd:Q41176     # building
    wd:Q16970     # church
    wd:Q33506     # museum
    wd:Q39614     # cemetery
    wd:Q811979    # architectural structure
    wd:Q24398318  # religious building
    wd:Q23413     # castle
    wd:Q1081138   # bridge
    wd:Q1329623   # cultural heritage
    wd:Q12271     # park
    wd:Q16917     # hospital
  }}.
  ?item wdt:P131* wd:{city_id}.  # located in or near the city

  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "{lang},en". }}
  OPTIONAL {{ ?item wdt:P84 ?architect. }}
  OPTIONAL {{ ?item wdt:P571 ?inception. }}
  OPTIONAL {{ ?item wdt:P1435 ?heritage. }}
  OPTIONAL {{ ?item wdt:P149 ?style. }}
  OPTIONAL {{ ?wikipedia_es schema:about ?item; schema:isPartOf <https://es.wikipedia.org/>. }}
  OPTIONAL {{ ?wikipedia_en schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>. }}
  OPTIONAL {{ ?wikipedia_fr schema:about ?item; schema:isPartOf <https://fr.wikipedia.org/>. }}
  OPTIONAL {{ ?wikipedia_de schema:about ?item; schema:isPartOf <https://de.wikipedia.org/>. }}
  OPTIONAL {{ ?wikipedia_it schema:about ?item; schema:isPartOf <https://it.wikipedia.org/>. }}
}}
GROUP BY ?item ?itemLabel ?wikipedia_es ?wikipedia_en ?wikipedia_fr ?wikipedia_de ?wikipedia_it
ORDER BY DESC(?sitelinks)
LIMIT {limit}
"""

CITY_WIKIDATA_IDS = {
    'madrid': 'Q2807',
    'barcelona': 'Q1492',
    'valencia': 'Q8818',
    'sevilla': 'Q8717',
    'paris': 'Q90',
    'london': 'Q84',
    'berlin': 'Q64',
    'roma': 'Q220',
    'amsterdam': 'Q727',
    'toledo': 'Q5836',
    'malaga': 'Q8851',
}

# ── Wikipedia API ────────────────────────────────────────────────────

def wikipedia_extract(title: str, lang: str = 'es') -> str | None:
    """Fetch Wikipedia extract for a page title."""
    url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{quote(title)}"
    try:
        import urllib.request
        req = urllib.request.Request(url, headers={'User-Agent': 'TourGuideApp/1.0'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
            return data.get('extract', '')
    except Exception as e:
        logger.debug(f"  Wikipedia failed for {title}: {e}")
        return None


def get_wikipedia_url(title: str, lang: str = 'es') -> str:
    """Get the Wikipedia URL for a page."""
    encoded = quote(title.replace(' ', '_'))
    return f"https://{lang}.wikipedia.org/wiki/{encoded}"


# ── Wikidata claim to narrative ──────────────────────────────────────

def claims_to_text(item: dict) -> str:
    """Convert Wikidata structured data to a short narrative paragraph."""
    parts = []
    name = item.get('itemLabel', {}).get('value', '')
    types = item.get('types', {}).get('value', '')

    if types:
        parts.append(f"{name} es clasificado como: {types}.")

    architect = item.get('architect', {}).get('value', '')
    if architect:
        parts.append(f"Arquitecto: {architect}.")

    inception = item.get('inception', {}).get('value', '')
    if inception:
        year = inception.split('-')[0] if '-' in inception else inception
        parts.append(f"Fecha de origen: {year}.")

    heritage = item.get('heritage', {}).get('value', '')
    if heritage:
        parts.append(f"Patrimonio: {heritage}.")

    style = item.get('style', {}).get('value', '')
    if style:
        parts.append(f"Estilo arquitectónico: {style}.")

    return ' '.join(parts) if parts else ''


# ── Dedup ────────────────────────────────────────────────────────────

def deduplicate_entries(entries: list[dict], model=None, threshold: float = 0.92) -> list[dict]:
    """Remove entries with cosine similarity ≥ threshold."""
    if len(entries) <= 1:
        return entries

    if model is None:
        # Lazy load sentence-transformers
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')

    import numpy as np

    texts = [e['text'] for e in entries]
    embeddings = model.encode(texts, normalize_embeddings=True).astype(np.float32)

    keep = []
    kept_embeddings = []

    for i, (entry, emb) in enumerate(zip(entries, embeddings)):
        is_dup = False
        for kept_emb in kept_embeddings:
            sim = float(np.dot(emb, kept_emb))
            if sim >= threshold:
                is_dup = True
                break

        if not is_dup:
            keep.append(entry)
            kept_embeddings.append(emb)

    removed = len(entries) - len(keep)
    if removed > 0:
        logger.info(f"  Dedup: removed {removed} duplicate entries (threshold {threshold})")

    return keep


# ── Theme detection ───────────────────────────────────────────────────

def detect_theme(name: str, types: str, text: str) -> str:
    """Detect the most likely tour theme for this entry."""
    combined = f"{name} {types} {text}".lower()
    if any(w in combined for w in ['museo', 'museum', 'arte', 'art', 'pintura', 'galería', 'gallery']):
        return 'art'
    if any(w in combined for w in ['iglesia', 'church', 'catedral', 'cathedral', 'basílica', 'monasterio', 'templo', 'religioso', 'religious']):
        return 'religious'
    if any(w in combined for w in ['parque', 'park', 'jardín', 'garden', 'botánico', 'botanic']):
        return 'nature'
    return 'history'


# ── Main ──────────────────────────────────────────────────────────────

def fetch_wikidata(city: str, lang: str, limit: int = 50) -> list[dict]:
    """Fetch POI data from Wikidata SPARQL."""
    city_id = CITY_WIKIDATA_IDS.get(city.lower())
    if not city_id:
        raise ValueError(f"Unknown city: {city}. Known: {list(CITY_WIKIDATA_IDS.keys())}")

    query = SPARQL_TEMPLATE.format(city_id=city_id, lang=lang, limit=limit)
    logger.info(f"Querying Wikidata for {city} (limit {limit})...")

    import urllib.request
    url = f"{WIKIDATA_SPARQL}?format=json&query={quote(query)}"
    req = urllib.request.Request(url, headers={'User-Agent': 'TourGuideApp/1.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())

    results = []
    for binding in data.get('results', {}).get('bindings', []):
        results.append({k: v for k, v in binding.items()})

    logger.info(f"  Found {len(results)} Wikidata entries")
    return results


def build_corpus(city: str, lang: str = 'es', limit: int = 50, output_dir: str = None) -> list[dict]:
    """Build a corpus for a city from Wikidata + Wikipedia."""
    items = fetch_wikidata(city, lang, limit)

    corpus = []
    for item in items:
        name = item.get('itemLabel', {}).get('value', '')
        if not name:
            continue

        # Get Wikipedia extracts
        wiki_title = None
        for l in [lang, 'en']:
            key = f'wikipedia_{l}'
            if key in item:
                wiki_title = item[key]['value'].split('/')[-1].replace('_', ' ')
                break

        wiki_text = ''
        source_url = ''
        if wiki_title:
            wiki_text = wikipedia_extract(wiki_title, lang) or wikipedia_extract(wiki_title, 'en') or ''
            source_url = get_wikipedia_url(wiki_title, lang)

        # Wikidata structured narrative
        wikidata_text = claims_to_text(item)

        # Combine into rich text
        full_text = wikidata_text
        if wiki_text:
            full_text += '\n\n' + wiki_text

        if len(full_text.strip()) < 50:
            continue  # Skip entries with too little text

        types_str = item.get('types', {}).get('value', '')
        theme = detect_theme(name, types_str, full_text)

        entry_id = hashlib.md5(name.encode()).hexdigest()[:8]

        corpus.append({
            'id': f"{city}-{entry_id}",
            'place': name,
            'theme': theme,
            'text': full_text.strip(),
            'source_url': source_url,
            'source': 'wikidata+{0}'.format('wikipedia' if wiki_text else 'wikidata'),
            'lang': lang,
            'license': 'CC BY-SA 4.0' if wiki_text else 'CC0',
            'retrieved_at': datetime.now(timezone.utc).isoformat(),
        })

    logger.info(f"  Generated {len(corpus)} corpus entries (before dedup)")

    return corpus


def main():
    parser = argparse.ArgumentParser(description='Generate city corpus from Wikidata + Wikipedia')
    parser.add_argument('city', help='City name (e.g., barcelona, madrid)')
    parser.add_argument('lang', nargs='?', default='es', help='Language for Wikipedia (default: es)')
    parser.add_argument('--limit', type=int, default=50, help='Max Wikidata entries (default: 50)')
    parser.add_argument('--no-dedup', action='store_true', help='Skip deduplication')
    parser.add_argument('--output-dir', default=None, help='Output directory (default: corpora/)')
    parser.add_argument('--dedup-threshold', type=float, default=0.92, help='Dedup cosine threshold (default: 0.92)')
    args = parser.parse_args()

    city = args.city.lower()
    lang = args.lang

    # Build corpus
    corpus = build_corpus(city, lang, args.limit)

    # Dedup
    if not args.no_dedup and len(corpus) > 1:
        corpus = deduplicate_entries(corpus, threshold=args.dedup_threshold)

    # Save
    output_dir = args.output_dir or os.path.join(os.path.dirname(__file__), 'corpora')
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, f'{city}_corpus.json')

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(corpus, f, ensure_ascii=False, indent=2)

    logger.info(f"Saved {len(corpus)} entries to {output_path}")
    print(f"\n✓ {city}_corpus.json: {len(corpus)} entries")


if __name__ == '__main__':
    main()
