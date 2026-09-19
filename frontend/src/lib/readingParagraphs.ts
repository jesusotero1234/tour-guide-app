/** Display-only paragraph breaks: narration text and audio versions remain intact. */
export function readingParagraphs(text: string, thematic: boolean): string[] {
  return text.split(/\n\s*\n/).filter(paragraph => paragraph.trim()).flatMap(paragraph => {
    if (!thematic || paragraph.length <= 600) return [paragraph];
    const sentences = new Intl.Segmenter('es', { granularity: 'sentence' }).segment(paragraph);
    const paragraphs: string[] = [];
    let current = '';
    for (const { segment } of sentences) {
      if (current.length >= 300 && current.length + segment.length > 550) {
        paragraphs.push(current.trim());
        current = '';
      }
      current += segment;
    }
    if (current.trim()) paragraphs.push(current.trim());
    return paragraphs;
  });
}
