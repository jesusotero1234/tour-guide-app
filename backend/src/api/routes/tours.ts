import { Router } from 'express';
import { generateTour, generateTourFromConcept, getTour, listTours } from '../controllers/tours';
import { validateConceptTourRequest, validateTourRequest } from '../middleware/validation';

const router = Router();

// List tours (with optional filtering)
router.get('/', listTours);

// Generate a new tour
router.post('/generate', validateTourRequest, generateTour);
router.post('/generate-from-concept', validateConceptTourRequest, generateTourFromConcept);

// Get an existing tour
router.get('/:id', getTour);

export default router;
