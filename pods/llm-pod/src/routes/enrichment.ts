/**
 * POST /enrichment/search
 *
 * Calls the Python EnrichmentService to search for enriched context
 * about a place in a specific city's knowledge base index.
 */
import express from 'express';
import { spawn } from 'child_process';
import path from 'path';

const router = express.Router();

const ENRICHMENT_SCRIPT = path.resolve(__dirname, '../../enrichment/enrich.py');
const INDEX_BASE_DIR = path.resolve(__dirname, '../../enrichment');
const VENV_PYTHON = process.env.ENRICHMENT_PYTHON || 'python3';

interface EnrichmentRequest {
  city: string;
  query: string;
  k?: number;
  language?: string;
}

interface EnrichmentResult {
  similarity: number;
  text: string;
  place: string;
  theme: string;
}

/**
 * For now, delegates to enrich.py search (child_process).
 * Future: replace with in-process EnrichmentService singleton when
 * the llm-pod migrates to a Python-capable runtime or adds a sidecar.
 */
router.post('/search', async (req, res) => {
  try {
    const { city, query, k = 3 }: EnrichmentRequest = req.body;

    if (!city || !query) {
      return res.status(400).json({ error: 'city and query are required' });
    }

    const cityKey = city.toLowerCase().replace(/\s+/g, '_');
    const indexDir = path.join(INDEX_BASE_DIR, `${cityKey}_index`);

    const args = [ENRICHMENT_SCRIPT, 'search', indexDir, query, '--k', String(k)];

    const child = spawn(VENV_PYTHON, args, {
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      timeout: 10000,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      if (code !== 0) {
        console.warn(`[enrichment] search failed for ${city}: ${stderr}`);
        return res.json({ results: [] });
      }

      try {
        const results: EnrichmentResult[] = JSON.parse(stdout);
        res.json({ results });
      } catch {
        res.json({ results: [] });
      }
    });

    child.on('error', (err) => {
      console.warn(`[enrichment] spawn failed for ${city}: ${err.message}`);
      res.json({ results: [] });
    });

  } catch (error) {
    console.error('[enrichment] unexpected error:', error);
    res.json({ results: [] });
  }
});

export default router;
