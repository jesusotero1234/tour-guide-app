import { Router } from 'express';
import { getFlexiblePassOptions, listFlexiblePassCities, quoteFlexiblePass } from '../controllers/passes';

const router = Router();

router.get('/flexible/cities', listFlexiblePassCities);
router.get('/flexible/options', getFlexiblePassOptions);
router.post('/flexible/quote', quoteFlexiblePass);

export default router;
