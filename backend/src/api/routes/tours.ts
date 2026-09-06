import { Router } from 'express';
import { generateTour, generateTourFromConcept, getTour, getWalkingRoute, listTours } from '../controllers/tours';
import { createTourAudio, getTourAudio, playTourAudio } from '../controllers/tourAudio';
import { validateConceptTourRequest, validateTourRequest, validateCodexTourRequest } from '../middleware/validation';
import { createGenerationJob, getGenerationJob } from '../controllers/generationJobs';

const router = Router();

// List tours (with optional filtering)
router.get('/', listTours);
router.get('/generation-capabilities', (_req, res) => {
  const { enabledTourLanguages } = require('../../services/tourReadiness/TourLanguage') as typeof import('../../services/tourReadiness/TourLanguage');
  res.json({ languages: enabledTourLanguages(), themes: ['history'], durations: [60, 120, 180, 240] });
});

// Persistent text-only generation. Keep before /:id so "generation-jobs" is not treated as a tour id.
router.post('/generation-jobs', validateTourRequest, validateCodexTourRequest, createGenerationJob);
router.get('/generation-jobs/:id', getGenerationJob);

// Generate a new tour
router.post('/generate', validateTourRequest, generateTour);
router.post('/generate-from-concept', validateConceptTourRequest, generateTourFromConcept);

// Tour audio endpoints
router.post('/:id/audio', createTourAudio);
router.get('/:id/audio', getTourAudio);
router.get('/:id/audio/:placeId', playTourAudio);

// Get an existing tour
router.get('/:id/walking-route', getWalkingRoute);
router.get('/:id', getTour);

export default router;
