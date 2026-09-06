import { prismaClient } from '../infrastructure/db/prismaClient';
import { PostgresGenerationJobRepository } from '../infrastructure/postgres/PostgresGenerationJobRepository';
import { PostgresTourRepository } from '../infrastructure/postgres/PostgresTourRepository';
import { GenerationJobService } from './GenerationJobService';
import { MultilingualTourGenerator } from './MultilingualTourGenerator';
import { PostgresTourBlueprintRepository } from '../infrastructure/postgres/PostgresTourBlueprintRepository';

const tourRepository = new PostgresTourRepository(prismaClient);

export const generationJobService = new GenerationJobService(
  new PostgresGenerationJobRepository(prismaClient),
  tourRepository,
  new MultilingualTourGenerator(tourRepository, new PostgresTourBlueprintRepository(prismaClient)),
);
