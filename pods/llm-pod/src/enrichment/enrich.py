#!/usr/bin/env python3
"""
Madrid Knowledge Base — semantic search enrichment for tour narration.

Uses turbovec (TurboQuant) for vector indexing and
paraphrase-multilingual-MiniLM-L12-v2 for embeddings.

Usage:
  python3 enrich.py build <corpus.json> <index_output_dir>
  python3 enrich.py search <index_dir> "<query>" [--k 3] [--language es]
"""

import json
import sys
import os
import numpy as np

def load_model():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')

def load_index(index_dir: str):
    import turbovec
    index_path = os.path.join(index_dir, 'index.npy')
    texts_path = os.path.join(index_dir, 'texts.json')

    if not os.path.exists(index_path) or not os.path.exists(texts_path):
        raise FileNotFoundError(f"Index not found in {index_dir}")

    vectors = np.load(index_path)
    with open(texts_path, 'r', encoding='utf-8') as f:
        texts = json.load(f)

    index = turbovec.TurboQuantIndex(dim=vectors.shape[1], bit_width=4)
    index.add(vectors.astype(np.float32))
    index.prepare()

    return index, texts

def build_index(corpus_path: str, output_dir: str):
    """Build a turbovec index from a JSON corpus file."""
    model = load_model()

    with open(corpus_path, 'r', encoding='utf-8') as f:
        corpus = json.load(f)

    texts = []
    for entry in corpus:
        # Each entry: { "id": str, "text": str, "place": str, "theme": str }
        texts.append(entry['text'])

    print(f"Embedding {len(texts)} passages...", file=sys.stderr)
    embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=True)

    import turbovec
    index = turbovec.TurboQuantIndex(dim=embeddings.shape[1], bit_width=4)
    index.add(embeddings.astype(np.float32))
    index.prepare()

    os.makedirs(output_dir, exist_ok=True)
    np.save(os.path.join(output_dir, 'index.npy'), embeddings)
    with open(os.path.join(output_dir, 'texts.json'), 'w', encoding='utf-8') as f:
        json.dump(corpus, f, ensure_ascii=False, indent=2)

    print(f"Index built: {len(texts)} passages, saved to {output_dir}", file=sys.stderr)

def search_index(index_dir: str, query: str, k: int = 3):
    """Search the index for passages relevant to the query."""
    model = load_model()
    index, corpus = load_index(index_dir)

    query_embedding = model.encode([query], normalize_embeddings=True).astype(np.float32)
    distances, indices = index.search(query_embedding, k=k)

    results = []
    for i in range(len(indices[0])):
        idx = int(indices[0][i])
        dist = float(distances[0][i])
        similarity = 1.0 - dist
        if similarity > 0.25:  # Minimum relevance threshold
            results.append({
                'similarity': round(similarity, 4),
                'text': corpus[idx]['text'],
                'place': corpus[idx].get('place', ''),
                'theme': corpus[idx].get('theme', ''),
                'level': corpus[idx].get('level', 'poi'),
            })

    return results

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: enrich.py <build|search> ...", file=sys.stderr)
        sys.exit(1)

    command = sys.argv[1]

    if command == 'build':
        if len(sys.argv) < 4:
            print("Usage: enrich.py build <corpus.json> <output_dir>", file=sys.stderr)
            sys.exit(1)
        build_index(sys.argv[2], sys.argv[3])

    elif command == 'search':
        if len(sys.argv) < 4:
            print("Usage: enrich.py search <index_dir> <query> [--k 3]", file=sys.stderr)
            sys.exit(1)

        index_dir = sys.argv[2]
        query = sys.argv[3]
        k = 3

        # Parse optional --k argument
        args = sys.argv[4:]
        for i, arg in enumerate(args):
            if arg == '--k' and i + 1 < len(args):
                k = int(args[i + 1])

        results = search_index(index_dir, query, k=k)
        print(json.dumps(results, ensure_ascii=False, indent=2))

    else:
        print(f"Unknown command: {command}", file=sys.stderr)
        sys.exit(1)
