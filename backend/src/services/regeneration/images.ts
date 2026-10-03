import { createHash } from 'crypto';
import type { TourImage, TourImageSet } from '../../domain/entities/TourImage';
import { splitImageParagraphs } from '../ContextualTourImages';

export interface ImageMove { imageId: string; from: number; to: number; method: 'exact' | 'similar' | 'nearest' | 'first'; score: number }

const tokens = (text: string) => new Set(text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[\p{L}\p{N}]{3,}/gu) ?? []);
function jaccard(a: string, b: string): number {
  const x = tokens(a), y = tokens(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return shared / (x.size + y.size - shared);
}

export const SIMILAR_THRESHOLD = 0.6;

/**
 * Re-binds the photos of a stop to the paragraphs of its new description (plan 04 section 8.1). The backend requires
 * tourImages.sourceText to equal the description, and the player hides every photo whose paragraph text no longer matches,
 * which would also remove the tour cover. So no photo is left without a paragraph: exact text, then the most similar paragraph
 * (Jaccard >= 0.6), then the nearest one, then the first. The last two are reported for human review.
 */
export function reassignImages(images: TourImageSet | undefined, newDescription: string): { images: TourImageSet | undefined; moves: ImageMove[] } {
  if (!images) return { images, moves: [] };
  const paragraphs = splitImageParagraphs(newDescription);
  const moves: ImageMove[] = [];
  if (!paragraphs.length) return { images: { ...images, sourceText: newDescription, images: [] }, moves };
  const moved: TourImage[] = images.images.map(image => {
    const wanted = image.paragraphText ?? '';
    let to = paragraphs.indexOf(wanted), method: ImageMove['method'] = 'exact', score = 1;
    if (to < 0) {
      const scores = paragraphs.map(p => jaccard(wanted, p));
      score = Math.max(...scores);
      to = scores.indexOf(score);
      method = score >= SIMILAR_THRESHOLD ? 'similar' : score > 0 ? 'nearest' : 'first';
      if (score === 0) to = 0;
    }
    const text = paragraphs[to];
    moves.push({ imageId: image.id, from: image.paragraphIndex, to, method, score: Math.round(score * 1000) / 1000 });
    return { ...image, paragraphIndex: to, paragraphText: text, paragraphId: createHash('sha256').update(text + ':' + to).digest('hex') };
  });
  return { images: { ...images, sourceText: newDescription, images: moved }, moves };
}
