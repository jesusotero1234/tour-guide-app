import 'dotenv/config';
import { config } from './config/env';
import logger from './utils/logger';
import { pilotEnabled } from './config/pilot';
import { createApp } from './app';

const app = createApp();

// Start server
app.listen(config.port, process.env.BIND_HOST || '127.0.0.1', () => {
  logger.info(`Server running on port ${config.port} in ${config.env} mode`);
  // The production pilot only serves reviewed content; never resume generation jobs (and never load their services).
  if (pilotEnabled()) return;
  const { generationJobService } = require('./services/generationJobServiceInstance') as typeof import('./services/generationJobServiceInstance');
  void generationJobService.resumePending().catch((error) => {
    logger.error('Failed to resume pending generation jobs', { error });
  });
  const recoveryInterval = setInterval(() => {
    void generationJobService.resumePending().catch((error) => {
      logger.error('Failed to resume pending generation jobs during recovery', { error });
    });
  }, 30000);
  recoveryInterval.unref();
});

export default app;
