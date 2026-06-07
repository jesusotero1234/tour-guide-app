import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { resolve } from 'path';
import { config } from './config/env';
import { validateApiKey } from './middleware/auth';
import { apiLimiter } from './middleware/rate-limit';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import logger from './utils/logger';


const app = express();
const audioStoragePath = resolve(process.env.AUDIO_STORAGE_PATH || './data/audio');

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(`${req.method} ${req.path}`, { 
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      ip: req.ip
    });
  });
  
  next();
});

// Import tour routes
import tourRoutes from './api/routes/tours';
import conceptRoutes from './api/routes/concepts';
import passRoutes from './api/routes/passes';

// Serve locally stored audio files
app.use('/audio', express.static(audioStoragePath));

// API routes
app.use('/api/v1/tours', apiLimiter, validateApiKey, tourRoutes);
app.use('/api/v1/cities', apiLimiter, validateApiKey, conceptRoutes);
app.use('/api/v1/passes', apiLimiter, validateApiKey, passRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Apply error handler middleware
app.use(errorHandler);

// Apply 404 handler - must be after all routes
app.use(notFoundHandler);

// Start server
app.listen(config.port, () => {
  logger.info(`Server running on port ${config.port} in ${config.env} mode`);
});

export default app;
