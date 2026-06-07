import express, { Request, Response } from 'express';
import { kokoroService } from '../services/kokoro';
import { TTSRequest } from '../types/api';
import logger from '../utils/logger';

const router = express.Router();

// Simple audio generation endpoint
router.post('/audio', async (req: Request<{}, {}, TTSRequest>, res: Response) => {
  logger.info(`TTS audio endpoint called with text length: ${req.body.text?.length || 0}, language: ${req.body.language || 'default'}`);
  try {
    const result = await kokoroService.generateSpeech(req.body);
    if (result.success) {
      // Return just the URL for easy access with updated path
      // Make sure we use the correct URL structure with the /tts prefix when needed
      logger.info(`TTS audio generated successfully: ${result.audioUrl}, data size: ${result.audioData?.length || 0} bytes`);
      res.send(`http://localhost:3005${result.audioUrl}`);
    } else {
      logger.error(`TTS audio generation failed: ${result.error}`);
      res.status(500).send(result.error);
    }
  } catch (error) {
    logger.error(`TTS audio endpoint error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    res.status(500).send(error instanceof Error ? error.message : 'Unknown error');
  }
});

// Maintain original JSON endpoint for compatibility
router.post('/generate', async (req: Request<{}, {}, TTSRequest>, res: Response) => {
  logger.info(`TTS generate endpoint called with text length: ${req.body.text?.length || 0}, language: ${req.body.language || 'default'}`);
  try {
    const result = await kokoroService.generateSpeech(req.body);
    logger.info(`TTS generation completed: ${result.success ? 'success' : 'failed'}`);
    
    // Handle success case
    if (result.success) {
      logger.info(`Generated audio with ${result.audioData.length} bytes of base64 data`);
    }
    
    res.json(result);
  } catch (error) {
    logger.error(`TTS generate endpoint error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
