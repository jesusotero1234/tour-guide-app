import { spawn } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import { env } from '../config/env';
import { TTSRequest, TTSResponse, TTSErrorResponse } from '../types/api';
import logger from '../utils/logger';

export class KokoroService {
  /**
   * Sanitizes text to make it safe for inclusion in a Python script
   * Removes markdown formatting, handles special characters, and cleans up text
   */
  private sanitizeTextForPython(text: string): string {
    // Step 1: Remove markdown formatting
    let cleaned = text
      // Remove headers
      .replace(/#+\s+(.*)/g, '$1')
      // Remove bold/italic
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/\_\_([^_]+)\_\_/g, '$1')
      .replace(/\_([^_]+)\_/g, '$1')
      // Remove horizontal rules
      .replace(/---+/g, '')
      // Remove bullet points
      .replace(/^\s*[\*\-\•]\s+/gm, '')
      // Remove numbered list formatting
      .replace(/^\s*\d+[\.\)]\s+/gm, '')
      // Remove blockquotes
      .replace(/^\s*>\s+/gm, '');
    
    // Step 2: Remove any markdown links and replace with just the text
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
    
    // Step 3: Replace newlines with spaces in cases where it's not a paragraph break
    cleaned = cleaned.replace(/([^\n])\n([^\n])/g, '$1 $2');
    
    // Step 4: Normalize and clean whitespace
    cleaned = cleaned
      .replace(/\s+/g, ' ')
      .replace(/\n\s+/g, '\n')
      .trim();
    
    // Step 5: Remove any remaining special characters that might cause issues
    // We don't need to escape single quotes since we're using triple quotes in Python
    
    logger.debug('Sanitized text for TTS', { 
      originalLength: text.length, 
      cleanedLength: cleaned.length 
    });
    
    return cleaned;
  }

  async generateSpeech(request: TTSRequest): Promise<TTSResponse | TTSErrorResponse> {
    const {
      text,
      voice = 'af_sarah',
      speed = 1.0,
      format = 'wav'
    } = request;

    const timestamp = Date.now();
    const outputPath = path.join(env.audioCache, `${timestamp}.${format}`);
    
    try {
      await fs.ensureDir(env.audioCache);

      // Sanitize text for Python - remove markdown, escape special chars, and handle newlines
      const sanitizedText = this.sanitizeTextForPython(text);
      
      const script = `
import soundfile as sf
from kokoro_onnx import Kokoro

# Initialize TTS
tts = Kokoro(
    model_path='${path.join(env.modelsPath, env.modelFile)}',
    voices_path='${path.join(env.modelsPath, env.voicesFile)}'
)

# Generate speech
audio, sample_rate = tts.create(
    text="""${sanitizedText}""",
    voice='${voice}',
    speed=${speed},
    lang='${env.defaultLanguage}'
)

# Save audio
sf.write('${outputPath}', audio, sample_rate)
print('success')
`.trim();

      logger.debug('Generated Python script for TTS');

      const result = await new Promise<boolean>((resolve) => {
        const pythonProcess = spawn('python3', ['-c', script]);
        let error = '';

        pythonProcess.stderr.on('data', (data) => {
          error += data.toString();
        });

        pythonProcess.on('close', (code) => {
          if (code === 0 && fs.existsSync(outputPath)) {
            resolve(true);
          } else {
            logger.error('Python script execution failed', { error, code });
            resolve(false);
          }
        });
      });

      if (result) {
        // Read the generated audio file and convert to base64
        const audioBuffer = await fs.readFile(outputPath);
        const audioBase64 = audioBuffer.toString('base64');

        logger.info(`Generated audio file: ${outputPath}, size: ${audioBuffer.length} bytes`);

        return {
          success: true,
          audioUrl: `/audio/${path.basename(outputPath)}`,
          audioData: audioBase64,
          format
        };
      } else {
        return {
          success: false,
          error: 'Failed to generate audio'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export const kokoroService = new KokoroService();
