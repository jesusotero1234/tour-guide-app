import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import verificationRoutes from './routes/verification';

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
app.use('/verify', verificationRoutes);

// Health check endpoint
app.get('/health', (_, res) => {
  res.json({
    status: 'ok',
    env: env.env,
    osmApi: env.osmApiUrl
  });
});

const port = env.port;
app.listen(port, () => {
  console.log(`Verification Pod running on port ${port}`);
  console.log(`Environment: ${env.env}`);
  console.log(`Using OSM API: ${env.osmApiUrl}`);
});
