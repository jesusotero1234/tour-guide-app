import axios, { AxiosError, AxiosInstance } from 'axios';
import { env } from '../config/env';
import logger from '../utils/logger';
import { TourPosition, TourPositionContext } from '../types/api';
import { narrativeFramer } from './narrative-framer';

// Basic prompt templates
const DESCRIPTION_PROMPT_TEMPLATE = `
You are a friendly tour guide speaking directly to visitors.
Create a natural, conversational narration about {place} in {city}, {country}.

Speak as if you're standing with your tour group at the location right now.
Use phrases like "As you can see", "Look at", "Notice", "In front of us".
Address visitors directly using "you" and include engaging questions.

Share interesting facts about the history, cultural significance, and unique features of {place} in a casual, flowing narrative.
Maintain a {detailLevel} level of detail while keeping a warm, {style} speaking tone.

IMPORTANT:
- Don't use ANY formatting like headers, bold text, bullet points, or section titles
- Don't use markdown or special characters like **, #, or ---
- Write ONLY as a continuous spoken narrative that would sound natural when read aloud
- Don't mention that you're an AI or include meta-instructions in your response
`;

const CONTEXT_PROMPT_TEMPLATE = `
Provide {contextType} context about {place} located in {city}, {country}.
Focus on information that would enrich a tourist's understanding and appreciation.
{timeframeInstruction}
`;

const TIPS_PROMPT_TEMPLATE = `
Provide practical tips for visiting {place} in {city}, {country}.
These tips should be useful for {audience} travelers and cover: {tipTypes}.
For each tip, include why it's important.
`;

/**
 * Client for interacting with the LLM Pod
 */
class LlmClient {
  private client: AxiosInstance;

  constructor() {
    console.log('Initializing LLM client with URL:', env.llmPodUrl);
    
    this.client = axios.create({
      baseURL: env.llmPodUrl,
      timeout: 30000, // 30 second timeout
      headers: {
        'Content-Type': 'application/json'
      },
      // Add validation function to handle any status codes properly
      validateStatus: (status) => true // Don't throw on any status code
    });
    
    // Add request interceptor for logging
    this.client.interceptors.request.use(config => {
      logger.debug(`Sending request to LLM pod: ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });
    
    // Add response interceptor for better error handling
    this.client.interceptors.response.use(
      response => {
        // Handle success
        if (response.status >= 200 && response.status < 300) {
          return response;
        } else {
          // Handle error responses but don't throw
          logger.error(`LLM pod responded with status ${response.status}:`, response.data);
          return Promise.reject(new Error(`LLM pod error: ${response.status} ${response.statusText}`));
        }
      },
      error => {
        // Handle network errors
        if (error.code === 'ECONNREFUSED' || error.code === 'ECONNABORTED') {
          logger.error(`Connection to LLM pod failed: ${error.message}. Using URL: ${env.llmPodUrl}`);
          return Promise.reject(new Error(`Connection to LLM pod failed: ${error.message}`));
        }
        
        return Promise.reject(error);
      }
    );
  }

  /**
   * Generate a place description using the LLM Pod
   */
  async generateDescription(
    place: string,
    city: string,
    country: string,
    options: {
      language?: string;
      detailLevel?: string;
      style?: string;
      category?: string;
      tags?: string[];
      tourContext?: TourPositionContext;
    } = {}
  ): Promise<string> {
    const {
      language = 'en',
      detailLevel = 'standard',
      style = 'informative',
      tourContext
    } = options;

    // Build basic context from tags and category
    let additionalContext = '';
    if (options.category) {
      additionalContext += `It is a ${options.category}. `;
    }
    
    if (options.tags && options.tags.length > 0) {
      additionalContext += `Associated tags: ${options.tags.join(', ')}. `;
    }
    
    // --- PHASE 1: Generate core description ---
    
    // Prepare the base prompt
    const basePrompt = DESCRIPTION_PROMPT_TEMPLATE
      .replace('{place}', place)
      .replace('{city}', city)
      .replace('{country}', country)
      .replace('{detailLevel}', detailLevel)
      .replace('{style}', style);
      
    const fullPrompt = basePrompt + (additionalContext ? `\nAdditional context: ${additionalContext}` : '');
    
    try {
      logger.debug('Sending description prompt to LLM Pod:', { place, city });
      
      // Use the dedicated text generation endpoint
      const response = await this.client.post('/generate/text', {
        prompt: fullPrompt,
        temperature: 0.7,
        maxTokens: detailLevel === 'brief' ? 300 : detailLevel === 'detailed' ? 800 : 500,
        language
      });

      logger.debug('Description generated for:', { place, city });
      const coreDescription = response.data.result;
      
      // --- PHASE 2: Apply narrative framing if tour context exists ---
      if (tourContext) {
        logger.debug('Applying narrative framing for position:', tourContext.position);
        return narrativeFramer.frameWithNarrative(
          coreDescription, 
          place, 
          city, 
          tourContext
        );
      }
      
      // Return the core description if no tour context
      return coreDescription;
      
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error('Error generating description:', {
        place,
        status: axiosError.response?.status,
        message: axiosError.message,
      });
      
      throw new Error(`Failed to generate description: ${axiosError.message}`);
    }
  }

  /**
   * Generate historical or cultural context for a place
   */
  async generateContext(
    place: string,
    city: string,
    country: string,
    contextType: string,
    options: {
      language?: string;
      timeframe?: string;
      tourContext?: TourPositionContext;
    } = {}
  ): Promise<string> {
    const { language = 'en', timeframe, tourContext } = options;
    
    // Add timeframe instruction if specified
    const timeframeInstruction = timeframe 
      ? `Focus on the ${timeframe} period.` 
      : '';
      
    // Prepare the base prompt
    let prompt = CONTEXT_PROMPT_TEMPLATE
      .replace('{place}', place)
      .replace('{city}', city)
      .replace('{country}', country)
      .replace('{contextType}', contextType)
      .replace('{timeframeInstruction}', timeframeInstruction);
    
    try {
      logger.debug('Sending context prompt to LLM Pod:', { place, contextType });
      
      // --- PHASE 1: Generate core context ---
      const response = await this.client.post('/generate/text', {
        prompt,
        temperature: 0.7,
        maxTokens: 700,
        language
      });

      logger.debug('Context generated for:', { place, contextType });
      const coreContext = response.data.result;
      
      // --- PHASE 2: Apply narrative framing if tour context exists ---
      if (tourContext) {
        logger.debug('Applying narrative framing for context, position:', tourContext.position);
        return narrativeFramer.frameWithNarrative(
          coreContext, 
          place, 
          city, 
          tourContext
        );
      }
      
      // Return the core context if no tour context
      return coreContext;
      
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error('Error generating context:', {
        place,
        contextType,
        status: axiosError.response?.status,
        message: axiosError.message,
      });
      
      throw new Error(`Failed to generate context: ${axiosError.message}`);
    }
  }

  /**
   * Generate visitor tips for a place
   */
  async generateTips(
    place: string,
    city: string,
    country: string,
    options: {
      language?: string;
      audience?: string;
      tipTypes?: string[];
      tourContext?: TourPositionContext;
    } = {}
  ): Promise<string[]> {
    const { 
      language = 'en',
      audience = 'general',
      tipTypes = ['visiting', 'practical', 'cultural'],
      tourContext
    } = options;
    
    // Prepare the basic prompt
    let prompt = TIPS_PROMPT_TEMPLATE
      .replace('{place}', place)
      .replace('{city}', city)
      .replace('{country}', country)
      .replace('{audience}', audience)
      .replace('{tipTypes}', tipTypes.join(', '));
    
    try {
      logger.debug('Sending tips prompt to LLM Pod:', { place, tipTypes });
      
      // --- PHASE 1: Generate core tips ---
      const response = await this.client.post('/generate/text', {
        prompt,
        temperature: 0.7,
        maxTokens: 600,
        language
      });

      // Parse the response into separate tips
      const tipsText = response.data.result;
      const tips = this.parseTips(tipsText);
      logger.debug('Tips generated for:', { place, tipCount: tips.length });
      
      // Note: Narrative framing for tips is a bit different since they're returned as an array
      // We could consider adding position-specific tips in the future
      
      return tips;
      
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error('Error generating tips:', {
        place,
        status: axiosError.response?.status,
        message: axiosError.message,
      });
      
      throw new Error(`Failed to generate tips: ${axiosError.message}`);
    }
  }

  /**
   * Parse LLM response into separate tips
   */
  private parseTips(text: string): string[] {
    // Split by common tip delimiters like numbers, dashes, etc.
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    const tips: string[] = [];
    
    let currentTip = '';
    
    for (const line of lines) {
      // Check if line starts a new tip
      const startOfTip = line.match(/^(\d+[\.\):-]|\-|\*|\•)/);
      
      if (startOfTip && currentTip) {
        // Save the previous tip
        tips.push(currentTip.trim());
        currentTip = line;
      } else if (startOfTip) {
        // First tip
        currentTip = line;
      } else if (currentTip) {
        // Continue the current tip
        currentTip += ' ' + line;
      }
    }
    
    // Add the last tip
    if (currentTip) {
      tips.push(currentTip.trim());
    }
    
    // If parsing failed, just split by sentences
    if (tips.length === 0) {
      return text.split(/[.!?]/).filter(s => s.trim().length > 0).map(s => s.trim() + '.');
    }
    
    return tips;
  }
}

export const llmClient = new LlmClient();
