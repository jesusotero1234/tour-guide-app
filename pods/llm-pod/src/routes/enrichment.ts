/**
 * POST /enrichment/search  +  GET /enrichment/health
 *
 * Enrichment route for the llm-pod. Two modes:
 *   1. PERSISTENT (recommended): enrichment_server.py running as sidecar on :11435
 *   2. FALLBACK: spawn `enrich.py search` per request
 *
 * Set ENRICHMENT_SERVICE_URL to configure the persistent server URL.
 * Set ENRICHMENT_INDEX_BASE_DIR for index discovery.
 */
import express from 'express';
import { spawn } from 'child_process';
import axios from 'axios';
import path from 'path';
import fs from 'fs';

const router = express.Router();

const ENRICHMENT_SCRIPT = path.resolve(
  process.env.ENRICHMENT_SCRIPT_PATH || path.join(__dirname, '../../enrichment/enrich.py')
);
const INDEX_BASE_DIR = process.env.ENRICHMENT_INDEX_BASE_DIR
  || path.resolve(__dirname, '../../enrichment');
const VENV_PYTHON = process.env.ENRICHMENT_PYTHON || 'python3';
const SERVICE_URL = process.env.ENRICHMENT_SERVICE_URL || 'http://127.0.0.1:11435';

let serviceAvailable: boolean | null = null;

async function checkServiceHealth(): Promise<boolean> {
  if (serviceAvailable !== null) return serviceAvailable;
  try {
    const resp = await axios.get(`${SERVICE_URL}/health`, { timeout: 2000 });
    serviceAvailable = resp.data?.status === 'ok';
    if (serviceAvailable) {
      console.log(`[enrichment] Persistent service ready: ${resp.data?.model}, ${resp.data?.loaded_cities?.length || 0} cities`);
    }
  } catch {
    serviceAvailable = false;
    console.warn('[enrichment] Persistent service not available, using fallback spawn mode');
  }
  return serviceAvailable;
}

async function searchViaService(city: string, query: string, k: number): Promise<any[]> {
  try {
    const resp = await axios.post(`${SERVICE_URL}/search`, { city, query, k }, { timeout: 5000 });
    return resp.data?.results || [];
  } catch {
    return [];
  }
}

function searchViaSpawn(city: string, query: string, k: number): Promise<any[]> {
  const cityKey = city.toLowerCase().replace(/\s+/g, '_');
  const indexDir = path.join(INDEX_BASE_DIR, `${cityKey}_index`);

  return new Promise((resolve) => {
    const child = spawn(VENV_PYTHON, [
      ENRICHMENT_SCRIPT, 'search', indexDir, query, '--k', String(k)
    ], {
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      child.kill();
      resolve([]);
    }, 12000);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        console.warn(`[enrichment] spawn failed (exit ${code}): ${stderr.slice(0, 200)}`);
        return resolve([]);
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve([]);
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      console.warn(`[enrichment] spawn error: ${err.message}`);
      resolve([]);
    });
  });
}

interface EnrichmentRequest {
  city: string;
  query: string;
  k?: number;
  language?: string;
}

// ── Routes ──────────────────────────────────────────────────────────────

router.post('/search', async (req, res) => {
  try {
    const { city, query, k = 3 }: EnrichmentRequest = req.body;
    if (!city || !query) {
      return res.status(400).json({ error: 'city and query are required' });
    }

    let results: any[];
    if (await checkServiceHealth()) {
      results = await searchViaService(city, query, k);
    } else {
      results = await searchViaSpawn(city, query, k);
    }

    res.json({ results });
  } catch (error) {
    console.error('[enrichment] unexpected error:', error);
    res.json({ results: [] });
  }
});

router.get('/health', async (_req, res) => {
  const cityDirs = fs.existsSync(INDEX_BASE_DIR)
    ? fs.readdirSync(INDEX_BASE_DIR).filter(d => d.endsWith('_index'))
    : [];

  if (await checkServiceHealth()) {
    try {
      const healthResp = await axios.get(`${SERVICE_URL}/health`, { timeout: 2000 });
      return res.json({
        ...healthResp.data,
        available_cities: cityDirs.map(d => d.replace('_index', '')),
        mode: 'persistent',
      });
    } catch { /* fall through to fallback mode */ }
  }

  res.json({
    status: 'ok',
    mode: 'fallback',
    available_cities: cityDirs.map(d => d.replace('_index', '')),
    index_base_dir: INDEX_BASE_DIR,
  });
});

export default router;
