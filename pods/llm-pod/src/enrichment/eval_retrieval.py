#!/usr/bin/env python3
"""
eval_retrieval.py — Evaluate corpus retrieval quality against golden set.

Usage:
  python3 eval_retrieval.py madrid
  python3 eval_retrieval.py barcelona
  python3 eval_retrieval.py madrid --k 5
"""

import sys
import json
import os
import argparse
import logging
import numpy as np

logging.basicConfig(level=logging.INFO, format='[eval] %(message)s')
logger = logging.getLogger(__name__)

# Lazy imports
def load_deps():
    global SentenceTransformer, turbovec
    from sentence_transformers import SentenceTransformer as ST
    import turbovec as tv
    SentenceTransformer = ST
    turbovec = tv


def load_index(index_dir: str):
    """Load a turbovec index and its texts."""
    index_path = os.path.join(index_dir, 'index.npy')
    texts_path = os.path.join(index_dir, 'texts.json')

    with open(texts_path, 'r', encoding='utf-8') as f:
        texts = json.load(f)

    vectors = np.load(index_path)
    idx = turbovec.TurboQuantIndex(dim=vectors.shape[1], bit_width=4)
    idx.add(vectors.astype(np.float32))
    idx.prepare()

    return idx, texts


def evaluate_city(city: str, k: int = 5, golden_set_path: str = None,
                  index_base_dir: str = None) -> dict:
    """Evaluate retrieval metrics for a city against the golden set."""
    load_deps()

    # Paths
    base = index_base_dir or os.path.dirname(__file__)
    index_dir = os.path.join(base, f'{city}_index')
    golden_path = golden_set_path or os.path.join(base, 'golden_set.json')

    # Load golden set
    with open(golden_path, 'r', encoding='utf-8') as f:
        all_queries = json.load(f)

    city_queries = [q for q in all_queries if q['city'] == city]
    if not city_queries:
        logger.error(f"No golden queries for city: {city}")
        return {'error': f'no queries for {city}'}

    # Load index
    try:
        idx, texts = load_index(index_dir)
    except FileNotFoundError:
        logger.error(f"Index not found for {city} at {index_dir}")
        return {'error': f'index not found: {index_dir}'}

    # Load model
    model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')

    # Evaluate each query
    total_queries = 0
    reciprocal_ranks = []
    recall_at_k = 0
    total_with_expected = 0

    for q in city_queries:
        query_vec = model.encode([q['query']], normalize_embeddings=True).astype(np.float32)
        distances, indices = idx.search(query_vec, k=k)

        expected = q.get('expected_place', '')
        min_expected = q.get('min_relevant_passages', 0)

        # Check if any top-k result mentions the expected place
        found = False
        first_rank = None
        for rank, idx_i in enumerate(indices[0]):
            ti = int(idx_i)
            dist = float(distances[0][rank])
            sim = 1.0 - dist

            entry = texts[ti]
            place_name = entry.get('place', '')

            if expected and expected.lower() in place_name.lower():
                found = True
                if first_rank is None:
                    first_rank = rank + 1
                break

        # Recall
        if expected:
            total_with_expected += 1
            if found:
                recall_at_k += 1

        # MRR
        if first_rank is not None:
            reciprocal_ranks.append(1.0 / first_rank)
        elif expected:
            reciprocal_ranks.append(0.0)

        total_queries += 1

    recall = recall_at_k / max(total_with_expected, 1)
    mrr = sum(reciprocal_ranks) / max(len(reciprocal_ranks), 1)

    return {
        'city': city,
        'queries_evaluated': total_queries,
        'queries_with_expected': total_with_expected,
        'recall@{}'.format(k): round(recall, 4),
        'mrr': round(mrr, 4),
        'pass_recall': recall >= 0.7,
        'pass_mrr': mrr >= 0.5,
        'index_size': len(texts),
    }


def main():
    parser = argparse.ArgumentParser(description='Evaluate corpus retrieval quality')
    parser.add_argument('city', help='City to evaluate')
    parser.add_argument('--k', type=int, default=5, help='Top-k (default: 5)')
    parser.add_argument('--golden-set', default=None, help='Golden set path')
    parser.add_argument('--index-base-dir', default=None, help='Base directory for indices')
    args = parser.parse_args()

    result = evaluate_city(
        args.city,
        k=args.k,
        golden_set_path=args.golden_set,
        index_base_dir=args.index_base_dir,
    )

    print(json.dumps(result, indent=2, ensure_ascii=False))

    if result.get('pass_recall') and result.get('pass_mrr'):
        print(f"\n✅ {args.city}: recall={result['recall@5']}, MRR={result['mrr']} — PASSA")
    else:
        print(f"\n❌ {args.city}: recall={result.get('recall@5', 'N/A')}, MRR={result.get('mrr', 'N/A')} — NO PASSA")


if __name__ == '__main__':
    main()
