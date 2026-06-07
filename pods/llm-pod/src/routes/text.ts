import express from 'express';
import { model } from '../llm/model';

const router = express.Router();

/**
 * Generic text generation endpoint
 * 
 * POST /generate/text
 */
router.post('/text', async (req, res) => {
  try {
    // Log raw request first
    console.log('\n=== Raw Text Generation Request ===');
    console.log('Body:', req.body);

    const { 
      prompt, 
      temperature = 0.7, 
      maxTokens = 500, 
      language = 'en',
      stop = ['```']
    } = req.body;

    if (!prompt) {
      return res.status(400).json({
        error: {
          message: 'Missing required field: prompt',
          details: 'The prompt field is required for text generation'
        }
      });
    }

    console.log('\n=== Text Generation Request ===');
    console.log('Prompt:', prompt);
    console.log('Parameters:', { temperature, maxTokens, language });

    const response = await model.complete({
      prompt,
      temperature,
      max_tokens: maxTokens,
      stop
    });

    console.log('\n=== LLM Response ===');
    console.log(response);

    if (!response.success || !response.content) {
      throw new Error(response.error || 'Failed to generate text');
    }

    // Clean and return the generated text
    const content = response.content.trim();
    console.log('\n=== Generated Text ===');
    console.log('Content:', content);

    res.json({ result: content });

  } catch (error) {
    console.error('Text generation error:', error);
    res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        details: error
      }
    });
  }
});

export default router;
