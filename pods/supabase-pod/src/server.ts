import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env';
import tourRoutes from './routes/tours';
import audioRoutes from './routes/audio';
import placesRoutes from './routes/places';
import logger from './utils/logger';

// Create Express server
const app = express();

// Apply middleware
app.use(helmet());
app.use(cors({
  origin: config.corsOrigin
}));
app.use(express.json({ limit: '50mb' }));  // Support larger payload for audio uploads

// API routes
app.use('/tours', tourRoutes);
app.use('/audio', audioRoutes);
app.use('/places', placesRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err });
  
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: err.message || String(err)
    }
  });
});

// Start server
const port = config.port;
app.listen(port, () => {
  logger.info(`Supabase Integration Pod server started on port ${port}`);
  logger.info(`Environment: ${config.nodeEnv}`);
});

// Handle shutdown gracefully
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

export default app;
