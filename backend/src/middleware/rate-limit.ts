import rateLimit from 'express-rate-limit';
import { Request, RequestHandler } from 'express';
import { config } from '../config/env';

const rateLimitOptions = {
  windowMs: config.auth.rateLimit.windowMs,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later.'
    }
  },
  standardHeaders: true,
  legacyHeaders: false
};

const normalLimiter = rateLimit({
  ...rateLimitOptions,
  max: config.auth.rateLimit.max
});

const progressLimiter = rateLimit({
  ...rateLimitOptions,
  max: Math.max(600, config.auth.rateLimit.max)
});

const isProgressPolling = (req: Request): boolean =>
  req.method === 'GET' && req.baseUrl === '/api/v1/tours' && /^\/(?:generation-jobs\/[^/]+|[^/]+\/audio)\/?$/.test(req.path);

export const apiLimiter: RequestHandler = (req, res, next) => {
  const limiter = isProgressPolling(req) ? progressLimiter : normalLimiter;
  limiter(req, res, next);
};
