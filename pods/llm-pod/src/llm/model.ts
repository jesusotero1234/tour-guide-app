import axios, { AxiosError } from 'axios';
import { env } from '../config/env';
import { LLMResponse } from '../types/api';

type JsonSchema = Record<string, unknown>;

interface ModelOptions {
  prompt: string;
  temperature?: number;
  max_tokens?: number;
  stop?: string[];
  num_predict?: number;
  model?: string;
  format?: 'json' | JsonSchema;
  repeat_penalty?: number;
}

interface OllamaRequest {
  model: string;
  prompt: string;
  stream: false;
  format?: 'json' | JsonSchema;
  options: {
    temperature: number;
    num_predict: number;
    stop: string[];
    repeat_penalty?: number;
  };
}

interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  done_reason?: string;
  eval_count?: number;
}

interface OllamaError {
  error: string;
}

interface ChatOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  max_tokens?: number;
  model?: string;
  think?: boolean;
  format?: 'json' | JsonSchema;
  num_ctx?: number;
  seed?: number;
}

interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  stream: false;
  think: boolean;
  format?: 'json' | JsonSchema;
  options: {
    temperature: number;
    num_predict: number;
    num_ctx?: number;
    seed?: number;
  };
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  done_reason?: string;
  eval_count?: number;
}

function logModelEvent(event: string, fields: Record<string, unknown>): void {
  console.log('[llm-model]', JSON.stringify({ event, ...fields }));
}

class Model {
  private baseUrl: string;
  private model: string;

  constructor() {
    this.baseUrl = env.ollamaHost;
    this.model = env.ollamaModel;
  }

  async complete(options: ModelOptions): Promise<LLMResponse> {
    try {
      const ollamaRequest: OllamaRequest = {
        model: options.model || this.model,
        prompt: options.prompt,
        stream: false,
        ...(options.format ? { format: options.format } : {}),
        options: {
          temperature: options.temperature || 0.2,
          num_predict: options.max_tokens || 1000,
          stop: options.stop || ['```'],
          ...(options.repeat_penalty !== undefined ? { repeat_penalty: options.repeat_penalty } : {})
        }
      };

      const startedAt = Date.now();

      const response = await axios.post<OllamaResponse>(
        `${this.baseUrl}/api/generate`,
        ollamaRequest,
        { timeout: 180000 }
      );
      const durationMs = Date.now() - startedAt;

      const metadata = {
        model: ollamaRequest.model,
        temperature: ollamaRequest.options.temperature,
        num_predict: ollamaRequest.options.num_predict,
        format: typeof ollamaRequest.format === 'string' ? ollamaRequest.format : 'json-schema',
        durationMs,
        done_reason: response.data?.done_reason,
        eval_count: response.data?.eval_count,
      };
      logModelEvent('complete-response', metadata);

      if (!response.data?.response) {
        return {
          success: false,
          content: '',
          error: 'Empty response from Ollama',
          metadata
        };
      }

      const content = response.data.response.trim();
      return {
        success: true,
        content,
        metadata
      };

    } catch (error) {
      console.error('\n=== LLM Error ===');
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<OllamaError>;
        console.error('[llm-model]', JSON.stringify({ event: 'complete-error', error: axiosError.response?.data?.error || axiosError.message }));
        return {
          success: false,
          content: '',
          error: `Ollama API error: ${axiosError.response?.data?.error || axiosError.message}`
        };
      }

      return {
        success: false,
        content: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async generateTourPlaces(prompt: string): Promise<LLMResponse> {
    return this.complete({
      prompt,
      temperature: 0.7,
      max_tokens: 2000,
      stop: ['```']
    });
  }

  async translatePlaceName(prompt: string): Promise<LLMResponse> {
    return this.complete({
      prompt,
      temperature: 0.3,
      max_tokens: 1000,
      stop: ['```']
    });
  
  }

  async chat(options: ChatOptions): Promise<LLMResponse> {
    try {
      const chatRequest: OllamaChatRequest = {
        model: options.model || this.model,
        messages: [
          { role: 'system', content: options.systemPrompt },
          { role: 'user', content: options.userPrompt }
        ],
        stream: false,
        think: options.think ?? true,
        ...(options.format ? { format: options.format } : {}),
        options: {
          temperature: options.temperature ?? 0.4,
          num_predict: options.max_tokens ?? 600,
          ...(options.num_ctx ? { num_ctx: options.num_ctx } : {}),
          ...(options.seed !== undefined ? { seed: options.seed } : {}),
        }
      };

      const startedAt = Date.now();

      const response = await axios.post<OllamaChatResponse>(
        `${this.baseUrl}/api/chat`,
        chatRequest,
        { timeout: 180000 }
      );
      const durationMs = Date.now() - startedAt;

      const metadata = {
        model: chatRequest.model,
        temperature: chatRequest.options.temperature,
        num_predict: chatRequest.options.num_predict,
        num_ctx: chatRequest.options.num_ctx,
        seed: chatRequest.options.seed,
        format: typeof chatRequest.format === 'string' ? chatRequest.format : 'json-schema',
        think: chatRequest.think,
        durationMs,
        done_reason: response.data?.done_reason,
        eval_count: response.data?.eval_count,
      };
      logModelEvent('chat-response', metadata);

      const content = response.data?.message?.content?.trim();
      if (!content) {
        return {
          success: false,
          content: '',
          error: 'Empty chat response from Ollama',
          metadata
        };
      }

      return { success: true, content, metadata };

    } catch (error) {
      console.error('\n=== LLM Chat Error ===');
      if (axios.isAxiosError(error)) {
        const axiosErr = error as AxiosError<OllamaError>;
        console.error('[llm-model]', JSON.stringify({ event: 'chat-error', error: axiosErr.response?.data?.error || axiosErr.message }));
        return {
          success: false,
          content: '',
          error: `Ollama chat error: ${axiosErr.response?.data?.error || axiosErr.message}`
        };
      }
      return {
        success: false,
        content: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export const model = new Model();
