import { prismaClient } from '../infrastructure/db/prismaClient';
import { PostgresGenerationJobRepository } from '../infrastructure/postgres/PostgresGenerationJobRepository';
import { PostgresTourRepository } from '../infrastructure/postgres/PostgresTourRepository';
import { GenerationJobService } from './GenerationJobService';
import { orchestrationService } from './orchestrationService';

export const generationJobService = new GenerationJobService(
  new PostgresGenerationJobRepository(prismaClient),
  new PostgresTourRepository(prismaClient),
  orchestrationService,
);
