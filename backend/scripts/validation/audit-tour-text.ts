import { readFileSync } from 'fs';
import { Tour } from '../../src/domain/entities/Tour';
import { auditTourText, buildTourIntroduction, buildTourNarrativePlan } from '../../src/services/narrative/TourTextQuality';

const tourPath = process.argv[2];
if (!tourPath) throw new Error('Usage: npm run quality:audit:text -- <tour.json>');

const raw = JSON.parse(readFileSync(tourPath, 'utf8')) as Tour | { tour: Tour };
const tour = 'tour' in raw ? raw.tour : raw;
const plan = tour.metadata?.narrativePlan || buildTourNarrativePlan({
  city: tour.city,
  theme: tour.theme,
  language: tour.language,
  placeNames: tour.places.map((place) => place.name),
});
const introduction = tour.introduction || buildTourIntroduction({
  city: tour.city,
  theme: tour.theme,
  language: tour.language,
  durationMinutes: tour.durationMinutes,
  firstStopName: tour.places[0]?.name || tour.city,
  plan,
});
const result = auditTourText({ introduction, language: tour.language, places: tour.places });

console.log(JSON.stringify({ introduction, plan, audit: result }, null, 2));
process.exitCode = result.passed ? 0 : 1;
