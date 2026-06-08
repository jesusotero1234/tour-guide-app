#!/usr/bin/env python3
"""
Persistent enrichment server — loads SentenceTransformer ONCE and serves
semantic search queries over HTTP. Communicates via JSON on stdin/stdout
or can be run as a standalone HTTP server.

Usage (HTTP mode):
  python3 enrichment_server.py --port 11435 --index-base-dir ./enrichment

Usage (stdin JSON mode — for Node child_process):
  python3 enrichment_server.py --mode stdio --index-base-dir ./enrichment

Environment:
  ENRICHMENT_INDEX_BASE_DIR — base directory containing {city}_index/ folders
"""

import sys
import os
import json
import argparse
import logging

logging.basicConfig(level=logging.INFO, format='[enrichment-server] %(message)s')
logger = logging.getLogger(__name__)

# ── Import heavy deps after args are parsed ──────────────────────────

def load_deps():
    global SentenceTransformer, np, turbovec
    from sentence_transformers import SentenceTransformer as ST
    import numpy as np_module
    import turbovec as tv
    SentenceTransformer = ST
    np = np_module
    turbovec = tv


class EnrichmentServer:
    """Persistent server that loads model once, caches city indices."""

    def __init__(self, index_base_dir: str):
        self.index_base_dir = index_base_dir
        self.model = None
        self.indices: dict[str, tuple] = {}  # city_key → (index, texts)

    def initialize(self):
        load_deps()
        logger.info(f"Loading model paraphrase-multilingual-MiniLM-L12-v2...")
        self.model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
        logger.info(f"Model loaded: {self.model.get_embedding_dimension()} dims")

    def _city_key(self, city: str) -> str:
        return city.lower().replace(' ', '_')

    def _city_index_dir(self, city: str) -> str:
        return os.path.join(self.index_base_dir, f'{self._city_key(city)}_index')

    def _load_city(self, city: str) -> bool:
        ck = self._city_key(city)
        if ck in self.indices:
            return True

        index_dir = self._city_index_dir(city)
        index_path = os.path.join(index_dir, 'index.npy')
        texts_path = os.path.join(index_dir, 'texts.json')

        if not os.path.exists(index_path) or not os.path.exists(texts_path):
            return False

        logger.info(f"Loading index: {city} ({index_dir})")
        vectors = np.load(index_path)
        with open(texts_path, 'r', encoding='utf-8') as f:
            texts = json.load(f)

        idx = turbovec.TurboQuantIndex(dim=vectors.shape[1], bit_width=4)
        idx.add(vectors.astype(np.float32))
        idx.prepare()

        self.indices[ck] = (idx, texts)
        logger.info(f"  {city}: {len(texts)} passages, {vectors.shape[1]} dims")
        return True

    def search(self, city: str, query: str, k: int = 3) -> list:
        if not self._load_city(city):
            return []

        idx, texts = self.indices[self._city_key(city)]
        query_vec = self.model.encode([query], normalize_embeddings=True).astype(np.float32)
        distances, indices = idx.search(query_vec, k=min(k, len(texts)))

        results = []
        for i in range(len(indices[0])):
            ti = int(indices[0][i])
            dist = float(distances[0][i])
            similarity = 1.0 - dist
            if similarity > 0.35:
                entry = texts[ti]
                results.append({
                    'similarity': round(similarity, 4),
                    'text': entry['text'],
                    'place': entry.get('place', ''),
                    'theme': entry.get('theme', ''),
                })
        return results

    def health(self) -> dict:
        return {
            'status': 'ok',
            'model': 'paraphrase-multilingual-MiniLM-L12-v2',
            'dimensions': int(self.model.get_embedding_dimension()),
            'loaded_cities': [c for c in self.indices],
            'index_base_dir': self.index_base_dir,
        }

    def handle_request(self, request: dict) -> dict:
        """Handle a single search request (stdio JSON mode)."""
        action = request.get('action', 'search')
        if action == 'search':
            results = self.search(
                request.get('city', ''),
                request.get('query', ''),
                request.get('k', 3)
            )
            return {'results': results}
        elif action == 'health':
            return self.health()
        else:
            return {'error': f'unknown action: {action}'}


def run_stdio(server: EnrichmentServer):
    """Read JSON requests from stdin, write JSON responses to stdout."""
    logger.info("Server ready (stdio mode). Send JSON requests.")
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
            response = server.handle_request(request)
            sys.stdout.write(json.dumps(response, ensure_ascii=False) + '\n')
            sys.stdout.flush()
        except json.JSONDecodeError as e:
            sys.stdout.write(json.dumps({'error': f'invalid json: {e}'}) + '\n')
            sys.stdout.flush()
        except Exception as e:
            logger.error(f"Request failed: {e}")
            sys.stdout.write(json.dumps({'error': str(e)}) + '\n')
            sys.stdout.flush()


def run_http(server: EnrichmentServer, port: int):
    """Run as a lightweight HTTP server."""
    from http.server import HTTPServer, BaseHTTPRequestHandler

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path == '/search':
                length = int(self.headers.get('Content-Length', 0))
                body = json.loads(self.rfile.read(length))
                response = server.handle_request(body)
                self._respond(200, response)
            else:
                self._respond(404, {'error': 'not found'})

        def do_GET(self):
            if self.path == '/health':
                self._respond(200, server.health())
            else:
                self._respond(404, {'error': 'not found'})

        def _respond(self, code, data):
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

        def log_message(self, fmt, *args):
            logger.info(f"HTTP {args[0]}")

    httpd = HTTPServer(('127.0.0.1', port), Handler)
    logger.info(f"HTTP server listening on :{port}")
    httpd.serve_forever()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Enrichment server')
    parser.add_argument('--mode', choices=['stdio', 'http'], default='stdio')
    parser.add_argument('--port', type=int, default=11435)
    parser.add_argument('--index-base-dir', default=os.environ.get('ENRICHMENT_INDEX_BASE_DIR', ''))
    args = parser.parse_args()

    if not args.index_base_dir:
        logger.error("--index-base-dir is required (or set ENRICHMENT_INDEX_BASE_DIR)")
        sys.exit(1)

    server = EnrichmentServer(args.index_base_dir)
    server.initialize()

    if args.mode == 'http':
        run_http(server, args.port)
    else:
        run_stdio(server)
