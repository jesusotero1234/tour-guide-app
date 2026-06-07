import rateLimit from 'express-rate-limit';
import { config } from '../config/env';

export const apiLimiter = rateLimit({
  windowMs: config.auth.rateLimit.windowMs,
  max: config.auth.rateLimit.max,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
});
