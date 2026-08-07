import { Router } from 'express';
import { generateTour, generateTourFromConcept, getTour, listTours } from '../controllers/tours';
import { validateConceptTourRequest, validateTourRequest } from '../middleware/validation';
import { createGenerationJob, getGenerationJob } from '../controllers/generationJobs';

const router = Router();

// List tours (with optional filtering)
router.get('/', listTours);

// Persistent text-only generation. Keep before /:id so "generation-jobs" is not treated as a tour id.
router.post('/generation-jobs', validateTourRequest, createGenerationJob);
router.get('/generation-jobs/:id', getGenerationJob);

// Generate a new tour
router.post('/generate', validateTourRequest, generateTour);
router.post('/generate-from-concept', validateConceptTourRequest, generateTourFromConcept);

// Get an existing tour
router.get('/:id', getTour);

export default router;
