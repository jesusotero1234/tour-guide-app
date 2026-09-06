import { Request, Response } from 'express';
import { GenerationJob } from '../../domain/entities/GenerationJob';
import { generationJobService } from '../../services/generationJobServiceInstance';
import { tourAudioService } from '../../services/tourAudioServiceInstance';
import { TourAudioError } from '../../services/TourAudioService';
import { GenerationJobResponse, TourRequest } from '../../types/api';

function toResponse(job: GenerationJob): GenerationJobResponse {
  return {
    id: job.id,
    status: job.status,
    step: job.step,
    progress: job.progress,
    result: job.result,
    ...(job.errorCode && job.errorMessage ? {
      error: {
        code: job.errorCode,
        message: job.errorMessage,
        details: job.errorDetails,
      },
    } : {}),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export async function createGenerationJob(req: Request, res: Response) {
  try {
    const job = await tourAudioService.withTextGeneration(() => generationJobService.create(req.body as TourRequest));
    return res.status(job.status === 'completed' ? 200 : 202).json(toResponse(job));
  } catch (error) {
    if (error instanceof TourAudioError) {
      return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof Error) {
      if (error.message.startsWith('DESTINATION_REVIEW_REQUIRED')) {
        return res.status(422).json({
          error: {
            code: 'DESTINATION_REVIEW_REQUIRED',
            message: 'Choose a city and country that identify one destination.',
          },
        });
      }
      if (error.message.startsWith('UNSUPPORTED_TOUR')) {
        return res.status(400).json({
          error: {
            code: 'UNSUPPORTED_TOUR_REQUEST',
            message: error.message,
          },
        });
      }
    }
    console.error('Failed to create generation job:', error);
    return res.status(500).json({
      error: { code: 'GENERATION_JOB_CREATE_ERROR', message: 'Failed to start tour generation' },
    });
  }
}

export async function getGenerationJob(req: Request, res: Response) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
    return res.status(400).json({ error: { code: 'INVALID_GENERATION_JOB_ID', message: 'Invalid generation job identifier' } });
  }
  try {
    const job = await generationJobService.get(req.params.id);
    if (!job) {
      return res.status(404).json({
        error: { code: 'GENERATION_JOB_NOT_FOUND', message: 'Generation job not found' },
      });
    }
    return res.json(toResponse(job));
  } catch (error) {
    console.error('Failed to retrieve generation job:', error);
    return res.status(500).json({
      error: { code: 'GENERATION_JOB_RETRIEVAL_ERROR', message: 'Failed to retrieve generation job' },
    });
  }
}
