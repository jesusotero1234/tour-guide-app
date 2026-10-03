import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { resolve } from 'path';
import { validateApiKey } from './middleware/auth';
import { apiLimiter } from './middleware/rate-limit';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import logger from './utils/logger';
import { pilotEnabled } from './config/pilot';
import { createPilotRouter } from './api/routes/pilot';
import { prismaClient } from './infrastructure/db/prismaClient';
import { PostgresTourRepository } from './infrastructure/postgres/PostgresTourRepository';
import { PostgresTourBlueprintRepository } from './infrastructure/postgres/PostgresTourBlueprintRepository';
import { tourAudioService } from './services/tourAudioServiceInstance';
import { PostgresWalkingLegsStore } from './infrastructure/postgres/PostgresWalkingLegsStore';
import { pilotLaunchReady } from './config/pilotLaunch';

/** Builds the HTTP app without listening, so tests can mount it on an ephemeral port. */
export function createApp() {
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
      logger.info('HTTP request', {
        method: req.method,
        statusCode: res.statusCode,
        duration,
      });
    });

    next();
  });

  // Serve locally stored audio files
  if (!pilotEnabled()) app.use('/audio', validateApiKey, express.static(audioStoragePath));

  // API routes
  app.use('/api/v1/pilot', apiLimiter, createPilotRouter(new PostgresTourRepository(prismaClient), new PostgresTourBlueprintRepository(prismaClient), tourAudioService,
    pilotLaunchReady, new PostgresWalkingLegsStore(prismaClient)));

  if (!pilotEnabled()) {
    // Generation API for local staff tools. It is required lazily on purpose: these modules build heavy
    // singletons (OrchestrationService, ConceptDiscoveryService) that the read-only production pilot never
    // uses, and loading them costs memory the backend cannot spare (docs/operations/nomuvia-catalogo-lento-20261001.md).
    const tourRoutes = (require('./api/routes/tours') as typeof import('./api/routes/tours')).default;
    const conceptRoutes = (require('./api/routes/concepts') as typeof import('./api/routes/concepts')).default;
    const passRoutes = (require('./api/routes/passes') as typeof import('./api/routes/passes')).default;
    app.use('/api/v1/tours', apiLimiter, validateApiKey, tourRoutes);
    app.use('/api/v1/cities', apiLimiter, validateApiKey, conceptRoutes);
    app.use('/api/v1/passes', apiLimiter, validateApiKey, passRoutes);
  }

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Apply error handler middleware
  app.use(errorHandler);

  // Apply 404 handler - must be after all routes
  app.use(notFoundHandler);

  return app;
}
