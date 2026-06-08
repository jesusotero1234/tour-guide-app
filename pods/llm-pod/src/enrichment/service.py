"""
EnrichmentService — singleton that loads SentenceTransformer once and manages
per-city turbovec indices for semantic search enrichment.

Usage:
  from enrichment.service import enrichment_service
  enrichment_service.initialize()
  results = enrichment_service.search("madrid", "Puerta del Sol history", k=3)
"""

import os
import json
import logging
import numpy as np
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Lazy imports to avoid loading heavy deps on module import
_sentence_transformer = None
_turbovec = None


def _get_st():
    global _sentence_transformer
    if _sentence_transformer is None:
        from sentence_transformers import SentenceTransformer
        _sentence_transformer = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
    return _sentence_transformer


def _get_turbovec():
    global _turbovec
    if _turbovec is None:
        import turbovec
        _turbovec = turbovec
    return _turbovec


class CityIndex:
    """Holds a turbovec index + corpus texts for one city."""

    def __init__(self, city: str, index_dir: str):
        self.city = city
        self.index_dir = index_dir
        self._index = None
        self._texts: List[dict] = []
        self._loaded = False

    def load(self):
        """Load index.npy and texts.json from disk."""
        if self._loaded:
            return

        index_path = os.path.join(self.index_dir, 'index.npy')
        texts_path = os.path.join(self.index_dir, 'texts.json')

        if not os.path.exists(index_path) or not os.path.exists(texts_path):
            raise FileNotFoundError(f"Index not found for {self.city} at {self.index_dir}")

        tv = _get_turbovec()
        vectors = np.load(index_path)
        with open(texts_path, 'r', encoding='utf-8') as f:
            self._texts = json.load(f)

        self._index = tv.TurboQuantIndex(dim=vectors.shape[1], bit_width=4)
        self._index.add(vectors.astype(np.float32))
        self._index.prepare()
        self._loaded = True
        logger.info(f"CityIndex loaded: {self.city} ({len(self._texts)} passages)")

    def search(self, query: str, k: int = 3) -> List[dict]:
        """Search the index and return relevant passages."""
        if not self._loaded:
            self.load()

        model = _get_st()
        query_vec = model.encode([query], normalize_embeddings=True).astype(np.float32)
        distances, indices = self._index.search(query_vec, k=min(k, len(self._texts)))

        results = []
        for i in range(len(indices[0])):
            idx = int(indices[0][i])
            dist = float(distances[0][i])
            similarity = 1.0 - dist
            if similarity > 0.35:
                entry = self._texts[idx]
                results.append({
                    'similarity': round(similarity, 4),
                    'text': entry['text'],
                    'place': entry.get('place', ''),
                    'theme': entry.get('theme', ''),
                })

        return results

    @property
    def passage_count(self) -> int:
        return len(self._texts)


class EnrichmentService:
    """Singleton service for semantic enrichment across cities."""

    def __init__(self):
        self._initialized = False
        self._indices: Dict[str, CityIndex] = {}
        self._index_base_dir: Optional[str] = None

    def initialize(self, index_base_dir: str):
        """Initialize the service with the base directory containing per-city index folders."""
        self._index_base_dir = index_base_dir
        # Pre-load the model (lazy, first search will trigger it)
        self._initialized = True
        logger.info(f"EnrichmentService initialized (base dir: {index_base_dir})")

    def _get_index_dir(self, city: str) -> str:
        """Resolve the index directory for a city."""
        city_key = city.lower().replace(' ', '_')
        return os.path.join(self._index_base_dir, f'{city_key}_index')

    def ensure_city_loaded(self, city: str) -> bool:
        """Load a city index if not already loaded. Returns True if available."""
        city_key = city.lower()
        if city_key in self._indices:
            return True

        index_dir = self._get_index_dir(city)
        try:
            idx = CityIndex(city_key, index_dir)
            idx.load()
            self._indices[city_key] = idx
            return True
        except FileNotFoundError:
            logger.warning(f"No enrichment index for city: {city}")
            return False
        except Exception as e:
            logger.error(f"Failed to load index for {city}: {e}")
            return False

    def search(self, city: str, query: str, k: int = 3) -> List[dict]:
        """Search for enriched context about a place in a city."""
        if not self._initialized:
            logger.warning("EnrichmentService not initialized")
            return []

        if not self.ensure_city_loaded(city):
            return []

        idx = self._indices[city.lower()]
        return idx.search(query, k=k)

    def get_loaded_cities(self) -> List[str]:
        """Return list of cities with loaded indices."""
        return list(self._indices.keys())

    @property
    def model_dimensions(self) -> int:
        return _get_st().get_embedding_dimension()


# Global singleton
enrichment_service = EnrichmentService()
