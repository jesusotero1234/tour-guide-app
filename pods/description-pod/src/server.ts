import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env, isProduction } from './config/env';
import logger from './utils/logger';
import descriptionRoutes from './routes/description';

// Initialize Express app
const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });
  
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'description-pod',
    time: new Date().toISOString()
  });
});

// Routes
app.use('/generate', descriptionRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.path}`
    }
  });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: isProduction 
        ? 'An unexpected error occurred' 
        : `${err.name}: ${err.message}`,
      details: isProduction ? undefined : err.stack
    }
  });
});

// Start server
const PORT = env.port;
app.listen(PORT, () => {
  logger.info(`Description Pod server running on port ${PORT}`);
  logger.info(`Environment: ${env.nodeEnv}`);
  
  // Display available routes
  logger.info('Available routes:');
  logger.info('GET  /health');
  logger.info('POST /generate/description');
  logger.info('POST /generate/context');
  logger.info('POST /generate/tips');
});

// Handle unexpected errors
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
});

export default app;
