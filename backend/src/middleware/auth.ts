import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';

export function validateApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.header('X-API-Key');
  
  if (!apiKey || !config.auth.apiKeys.includes(apiKey)) {
    return res.status(401).json({ 
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid API key provided'
      }
    });
  }
  
  next();
}
