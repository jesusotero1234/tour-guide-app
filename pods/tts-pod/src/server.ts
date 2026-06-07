import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import ttsRoutes from './routes/tts';
import logger from './utils/logger';

const app = express();

// Basic middleware
app.use(cors());
app.use(express.json());
app.use('/audio', express.static(env.audioCache));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP request', {
      method: req.method,
      path: req.path,
      params: req.params,
      query: req.query,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
  });
  next();
});

// Health check
app.get('/health', (_req: express.Request, res: express.Response) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.nodeEnv
  });
});

// TTS routes with proper prefix
app.use('/tts', ttsRoutes);

// Backward compatibility - redirect root routes to maintain compatibility
// This ensures any existing clients using the old endpoints will still work
app.post('/generate', (req, res) => {
  res.redirect(307, '/tts/generate'); // 307 preserves the HTTP method and body
});

app.post('/audio', (req, res) => {
  res.redirect(307, '/tts/audio');
});

// Print startup message
const startupMessage = `
TTS Service Started
------------------
Port:        ${env.port}
Environment: ${env.nodeEnv}
Models:      ${env.modelsPath}
Cache:       ${env.audioCache}
------------------
`;

// Start server
app.listen(env.port, () => {
  console.log(startupMessage);
});
