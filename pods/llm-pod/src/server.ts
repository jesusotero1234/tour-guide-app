import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import generationRoutes from './routes/generation';
import translationRoutes from './routes/translation';
import textRoutes from './routes/text';
import narrativeRoutes from './routes/narrative';
import narrativeLongRoutes from './routes/narrativeLong';
import enrichmentRoutes from './routes/enrichment';

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMaxRequests,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later'
    }
  }
});

app.use(limiter);

// Routes
app.use('/generate', generationRoutes);
app.use('/generate', textRoutes);
app.use('/translate', translationRoutes);
app.use('/narrative', narrativeRoutes);
app.use('/narrative', narrativeLongRoutes);
app.use('/enrichment', enrichmentRoutes);

// Health check endpoint
app.get('/health', (_, res) => {
  res.json({
    status: 'ok',
    env: env.env,
    model: env.ollamaModel,
    narrativeModel: env.narrativeModel
  });
});

const port = env.port;
app.listen(port, () => {
  console.log(`LLM Pod running on port ${port}`);
  console.log(`Environment: ${env.env}`);
  console.log(`Using model: ${env.ollamaModel}`);
  console.log(`Narrative model: ${env.narrativeModel}`);
  
  // List available endpoints
  console.log('\nAvailable endpoints:');
  console.log('GET  /health');
  console.log('POST /generate/places');
  console.log('POST /generate/text');
  console.log('POST /translate/places');
  console.log('POST /narrative/stop');
  console.log('POST /narrative/stop/long');
});
