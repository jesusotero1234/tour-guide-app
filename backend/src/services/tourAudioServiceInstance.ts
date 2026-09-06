import { prismaClient } from '../infrastructure/db/prismaClient';
import { TourAudioService } from './TourAudioService';

export const tourAudioService = new TourAudioService(prismaClient);
