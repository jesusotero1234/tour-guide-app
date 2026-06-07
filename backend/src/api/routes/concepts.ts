import { Router } from 'express';
import { getAllCityConcepts, getCityConcepts } from '../controllers/concepts';

const router = Router();

router.get('/:city/concepts', getCityConcepts);
router.get('/:city/concepts/all', getAllCityConcepts);

export default router;
