import express from 'express';
import { 
  DescriptionRequest, 
  DescriptionResponse, 
  ContextRequest,
  ContextResponse,
  TipsRequest, 
  TipsResponse, 
  ApiResponse,
  Tip 
} from '../types/api';
import { 
  validateDescriptionRequest, 
  validateContextRequest, 
  validateTipsRequest 
} from '../middleware/validation';
import { llmClient } from '../services/llm-client';
import { cacheService } from '../utils/cache';
import logger from '../utils/logger';

const router = express.Router();

/**
 * Generate a description for a place
 * 
 * POST /generate/description
 */
router.post(
  '/description',
  validateDescriptionRequest,
  async (req, res) => {
    const { place, language = 'en', detailLevel = 'standard', style = 'informative', tourContext } = req.body;
    const { name, city, country, category, tags } = place;

    try {
      // Generate cache key
      const cacheKey = cacheService.generateKey('description', { 
        name, 
        city, 
        country, 
        language,
        detailLevel,
        style,
        tourContext
      });

      // Check cache first
      const cachedResult = cacheService.get<DescriptionResponse>(cacheKey);
      if (cachedResult) {
        return res.json({
          success: true,
          data: cachedResult
        });
      }

      // Generate description
      const description = await llmClient.generateDescription(
        name,
        city,
        country,
        { language, detailLevel, style, category, tags, tourContext }
      );

      // Calculate simple metadata
      const wordCount = description.split(/\s+/).length;
      const keyTopics = extractKeyTopics(description);

      // Prepare response
      const response: DescriptionResponse = {
        description,
        language,
        metadata: {
          wordCount,
          keyTopics
        }
      };

      // Cache the result
      cacheService.set(cacheKey, response);

      return res.json({
        success: true,
        data: response
      });
    } catch (error) {
      logger.error('Error generating description:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'CONTENT_ERROR',
          message: 'Failed to generate description',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }
);

/**
 * Generate historical or cultural context for a place
 * 
 * POST /context
 */
router.post(
  '/context',
  validateContextRequest,
  async (req, res) => {
    const { place, contextType, language = 'en', timeframe, tourContext } = req.body;
    const { name, city, country } = place;

    try {
      // Generate cache key
      const cacheKey = cacheService.generateKey('context', { 
        name, 
        city, 
        country, 
        language,
        contextType,
        timeframe,
        tourContext
      });

      // Check cache first
      const cachedResult = cacheService.get<ContextResponse>(cacheKey);
      if (cachedResult) {
        return res.json({
          success: true,
          data: cachedResult
        });
      }

      // Generate context
      const context = await llmClient.generateContext(
        name,
        city,
        country,
        contextType,
        { language, timeframe, tourContext }
      );

      // Calculate simple metadata
      const wordCount = context.split(/\s+/).length;
      const keyFacts = extractKeyFacts(context);

      // Prepare response
      const response: ContextResponse = {
        context,
        language,
        type: contextType,
        metadata: {
          wordCount,
          timeframe,
          keyFacts
        }
      };

      // Cache the result
      cacheService.set(cacheKey, response);

      return res.json({
        success: true,
        data: response
      });
    } catch (error) {
      logger.error('Error generating context:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'CONTENT_ERROR',
          message: 'Failed to generate context',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }
);

/**
 * Generate visitor tips for a place
 * 
 * POST /tips
 */
router.post(
  '/tips',
  validateTipsRequest,
  async (req, res) => {
    const { place, language = 'en', audience = 'general', tipTypes = ['visiting', 'practical', 'cultural'], tourContext } = req.body;
    const { name, city, country } = place;

    try {
      // Generate cache key
      const cacheKey = cacheService.generateKey('tips', { 
        name, 
        city, 
        country, 
        language,
        audience,
        tipTypes,
        tourContext
      });

      // Check cache first
      const cachedResult = cacheService.get<TipsResponse>(cacheKey);
      if (cachedResult) {
        return res.json({
          success: true,
          data: cachedResult
        });
      }

      // Generate tips
      const rawTips = await llmClient.generateTips(
        name,
        city,
        country,
        { language, audience, tipTypes, tourContext }
      );

      // Process and format the tips
      const tips: Tip[] = rawTips.map((content, index) => {
        // Simple heuristic to determine tip type based on content
        let type: Tip['type'] = 'practical';
        let importance = 5;
        
        if (content.toLowerCase().includes('photo') || content.toLowerCase().includes('picture')) {
          type = 'photography';
          importance = 4;
        } else if (content.toLowerCase().includes('time') || content.toLowerCase().includes('hour')) {
          type = 'timing';
          importance = 7;
        } else if (content.toLowerCase().includes('custom') || content.toLowerCase().includes('tradition')) {
          type = 'cultural';
          importance = 6;
        } else if (content.toLowerCase().includes('secret') || content.toLowerCase().includes('local')) {
          type = 'insider';
          importance = 8;
        }
        
        // Adjust importance based on position
        if (index === 0) importance = Math.min(importance + 2, 10);
        
        return { content, type, importance };
      });

      // Prepare response
      const response: TipsResponse = {
        tips,
        language
      };

      // Cache the result
      cacheService.set(cacheKey, response);

      return res.json({
        success: true,
        data: response
      });
    } catch (error) {
      logger.error('Error generating tips:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'CONTENT_ERROR',
          message: 'Failed to generate tips',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    }
  }
);

/**
 * Simple utility function to extract key topics from text
 */
function extractKeyTopics(text: string): string[] {
  // For simplicity, extract capitalized phrases and common tourist terms
  const topics = new Set<string>();
  
  // Look for capitalized sequential words
  const capitalizedPhrases = text.match(/([A-Z][a-z]+\s?)+/g) || [];
  capitalizedPhrases.forEach(phrase => {
    if (phrase.trim().length > 3) {
      topics.add(phrase.trim());
    }
  });
  
  // Look for common tourist terms
  const touristTerms = [
    'architecture', 'history', 'culture', 'art', 
    'museum', 'gallery', 'palace', 'cathedral',
    'church', 'square', 'garden', 'park'
  ];
  
  for (const term of touristTerms) {
    if (text.toLowerCase().includes(term)) {
      // Get the surrounding context
      const index = text.toLowerCase().indexOf(term);
      const start = Math.max(0, index - 10);
      const end = Math.min(text.length, index + term.length + 10);
      const context = text.substring(start, end);
      
      // Look for noun phrases containing the term
      const regex = new RegExp(`\\b\\w+\\s+${term}\\b|\\b${term}\\s+\\w+\\b`, 'i');
      const match = context.match(regex);
      
      if (match) {
        topics.add(match[0]);
      } else {
        topics.add(term);
      }
    }
  }
  
  // Convert set to array and limit to 5 topics
  return Array.from(topics).slice(0, 5);
}

/**
 * Simple utility function to extract key facts from context
 */
function extractKeyFacts(text: string): string[] {
  const sentences = text
    .split(/[.!?]/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  // Look for fact-like sentences (dates, significant events, etc.)
  const factSentences = sentences.filter(s => 
    /\b\d{4}\b/.test(s) ||                     // Contains a year
    /\b(built|constructed|designed|founded)\b/i.test(s) || // Construction terms
    /\b(king|queen|emperor|architect)\b/i.test(s)    // Notable figures
  );
  
  // If we found enough fact sentences, use them; otherwise use first sentences
  if (factSentences.length >= 3) {
    return factSentences.slice(0, 3).map(s => s + '.');
  } else {
    // Add the first sentences as backup
    const additionalFacts = sentences
      .filter(s => !factSentences.includes(s))
      .slice(0, 3 - factSentences.length);
    
    return [...factSentences, ...additionalFacts].map(s => s + '.');
  }
}

export default router;
