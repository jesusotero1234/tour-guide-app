#!/usr/bin/env python3
"""
Auto-build a multi-level city enrichment corpus from Wikipedia REST API.
Produces a JSON corpus with level tags: poi / city / comarca / province / region.

Usage:
  python3 build_city_corpus.py Vilalba "Terra Chá" Lugo Galicia --lang es --output corpora/vilalba_corpus.json

No Wikidata SPARQL needed — pure Wikipedia REST API.
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
USER_AGENT = "tour-guide-app/1.0 (hermes-agent@nousresearch.com)"


def wikipedia_fetch(article_title: str, lang: str = "es") -> Optional[str]:
    """Fetch Wikipedia article extract via REST API."""
    params = {
        "action": "query",
        "format": "json",
        "titles": article_title,
        "prop": "extracts",
        "exintro": 0,  # full article
        "explaintext": 1,
        "exsectionformat": "plain",
    }
    url = f"{WIKIPEDIA_API.format(lang=lang)}?{urllib.parse.urlencode(params)}"
    
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        pages = data.get("query", {}).get("pages", {})
        for _, page in pages.items():
            extract = page.get("extract", "")
            if extract:
                return extract
        return None
    except Exception as e:
        print(f"  ⚠️  Wikipedia fetch failed for '{article_title}': {e}", file=sys.stderr)
        return None


def chunk_text(text: str, max_chars: int = 1500) -> list[str]:
    """Split long text into overlapping chunks at paragraph boundaries."""
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


def build_city_corpus(
    city: str,
    comarca: str,
    province: str,
    region: str,
    lang: str = "es",
    max_chars: int = 1500,
) -> list[dict]:
    """Build a multi-level corpus for a city."""
    entries = []
    
    targets = [
        (city, "city", f"Artículo de Wikipedia de {city}"),
        (comarca, "comarca", f"Artículo de Wikipedia de {comarca}"),
        (province, "province", f"Artículo de Wikipedia de la provincia de {province}"),
        (region, "region", f"Artículo de Wikipedia de {region}"),
    ]
    
    for title, level, desc in targets:
        print(f"  📥 Fetching: {title} (nivel: {level})...", file=sys.stderr)
        text = wikipedia_fetch(title, lang)
        if not text:
            print(f"     ⚠️  No article found, skipping", file=sys.stderr)
            continue
        
        paragraphs = text.split("\n")
        # Skip sections that are clearly metadata
        filtered = []
        skip_next = False
        for p in paragraphs:
            p = p.strip()
            if not p:
                continue
            # Skip reference/category lines
            if p.startswith("==") and any(kw in p.lower() for kw in 
                ["referencias", "bibliografía", "enlaces externos", "véase también",
                 "references", "bibliography", "external links", "see also"]):
                skip_next = True
                continue
            if skip_next:
                skip_next = False
                continue
            if len(p) > 40:  # Skip very short lines
                filtered.append(p)
        
        text = "\n".join(filtered)
        chunks = chunk_text(text, max_chars)
        
        for i, chunk in enumerate(chunks):
            suffix = f" (parte {i+1})" if len(chunks) > 1 else ""
            entries.append({
                "id": f"{city.lower().replace(' ', '_')}-{level}-{i+1:03d}",
                "place": title,
                "level": level,
                "theme": "general",
                "text": chunk,
                "source_url": f"https://{lang}.wikipedia.org/wiki/{urllib.parse.quote(title.replace(' ', '_'))}",
                "source": "wikipedia",
                "lang": lang,
                "retrieved_at": time.strftime("%Y-%m-%d"),
                "label": f"{desc}{suffix}",
            })
        
        print(f"     ✅ {len(chunks)} chunk(s)", file=sys.stderr)
        time.sleep(0.5)  # Be polite to the API
    
    return entries


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build multi-level city enrichment corpus")
    parser.add_argument("city", help="City name (e.g., Vilalba)")
    parser.add_argument("comarca", help="Comarca/region name (e.g., Terra Chá)")
    parser.add_argument("province", help="Province name (e.g., Lugo)")
    parser.add_argument("region", help="Autonomous community (e.g., Galicia)")
    parser.add_argument("--lang", default="es", help="Wikipedia language (default: es)")
    parser.add_argument("--output", "-o", required=True, help="Output JSON file")
    parser.add_argument("--max-chars", type=int, default=1500, help="Max chars per chunk")
    args = parser.parse_args()
    
    print(f"🔨 Building corpus for {args.city}, {args.comarca}, {args.province}, {args.region}", file=sys.stderr)
    
    entries = build_city_corpus(
        args.city, args.comarca, args.province, args.region,
        lang=args.lang, max_chars=args.max_chars
    )
    
    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)
    
    levels = {}
    for e in entries:
        lv = e["level"]
        levels[lv] = levels.get(lv, 0) + 1
    
    print(f"\n✅ Corpus built: {len(entries)} entries → {args.output}", file=sys.stderr)
    print(f"   Levels: {json.dumps(levels)}", file=sys.stderr)
