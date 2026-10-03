import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { relative } from 'path';
import { stopsInOrder } from '../legsPlan';
import { placeName, type ManifestTour, type TourRendered } from '../plan';
import { manifestOf, selectTours, type Ctx } from './context';
import type { CueFile, NeutralFile, SpeechFile } from './prepare';

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export type DiffOp = { op: 'same' | 'del' | 'add'; text: string };

/** Word diff (longest common subsequence). Whitespace is kept with the words so that the result joins back to the text. */
export function wordDiff(before: string, after: string): DiffOp[] {
  const a = before.match(/\S+\s*/g) ?? [], b = after.match(/\S+\s*/g) ?? [];
  const key = (s: string) => s.trim();
  const n = a.length, m = b.length;
  const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i][j] = key(a[i]) === key(b[j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const ops: DiffOp[] = [];
  let i = 0, j = 0;
  const push = (op: DiffOp['op'], text: string) => { const last = ops[ops.length - 1]; if (last?.op === op) last.text += text; else ops.push({ op, text }); };
  while (i < n && j < m) {
    if (key(a[i]) === key(b[j])) { push('same', a[i].length >= b[j].length ? a[i] : b[j]); i++; j++; }
    else if (table[i + 1][j] >= table[i][j + 1]) push('del', a[i++]);
    else push('add', b[j++]);
  }
  while (i < n) push('del', a[i++]);
  while (j < m) push('add', b[j++]);
  return ops;
}

export const diffHtml = (before: string, after: string) => wordDiff(before, after).map(({ op, text }) =>
  op === 'same' ? escapeHtml(text) : `<${op === 'del' ? 'del' : 'ins'}>${escapeHtml(text)}</${op === 'del' ? 'del' : 'ins'}>`).join('');

const STYLE = `body{font:15px/1.5 system-ui,sans-serif;max-width:60rem;margin:1rem auto;padding:0 1rem;color:#1c1c1c;background:#fff}
@media(prefers-color-scheme:dark){body{background:#151515;color:#e8e8e8}}
details{border:1px solid #8884;border-radius:8px;margin:.6rem 0;padding:.4rem .8rem}summary{cursor:pointer;font-weight:600}
del{background:#f8d7da;color:#842029;text-decoration:line-through}ins{background:#d1e7dd;color:#0f5132;text-decoration:none}
.spoken{background:#8881;padding:.5rem;border-radius:6px;white-space:pre-wrap}.tag{font-size:.8rem;padding:.1rem .4rem;border-radius:4px;background:#ffc10733}
.bad{background:#dc354533}.row{margin:.8rem 0}audio{width:100%}h3{margin:.8rem 0 .2rem}#filters{position:sticky;top:0;background:inherit;padding:.5rem 0}`;

/**
 * Plan 04 section 6: one static page with, per tour, the original against the body (word diff), the spoken text with the
 * changes of the normalizer, the link clips and, after the render, a player. It writes nothing but this page: the approval is the user's.
 */
export function reviewPackPhase(ctx: Ctx) {
  const { stage, deps } = ctx;
  stage.require('review-pack');
  const tours = selectTours(ctx, { includeExcluded: true });
  const excluded = stage.state().excluded;
  const html: string[] = [];
  let llm = 0, manual = 0;
  for (const tour of tours) {
    const neutral = stage.readOr<NeutralFile | null>(null, 'neutral', tour.tourId + '.json');
    const speech = stage.readOr<SpeechFile | null>(null, 'speech', tour.tourId + '.json');
    const cues = stage.readOr<CueFile | null>(null, 'cues', tour.tourId + '.json');
    if (!neutral || !speech) continue;
    const rendered = stage.readOr<TourRendered | null>(null, 'render', tour.tourId + '.json');
    const repaired = speech.pieces.some(p => p.status === 'repaired'), needsManual = speech.pieces.some(p => p.status === 'needs_manual') || !!excluded[tour.tourId];
    llm += repaired ? 1 : 0; manual += needsManual ? 1 : 0;
    html.push(tourHtml(ctx, tour, neutral, speech, cues, rendered, { repaired, needsManual, reason: excluded[tour.tourId]?.reason }));
  }
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Catalog regeneration review</title><style>${STYLE}</style></head><body>
<h1>Catalog regeneration review</h1><p>${tours.length} tours. <ins>added</ins> and <del>removed</del> words are changes to the text; the grey boxes are what is spoken. Nothing is approved until you write it in <code>approvals.json</code>.</p>
<div id="filters"><label>Language <select id="f-lang"><option value="">all</option>${[...new Set(tours.map(t => t.language))].sort().map(l => `<option>${l}</option>`).join('')}</select></label>
<label>City <select id="f-city"><option value="">all</option>${[...new Set(tours.map(t => t.city))].sort().map(c => `<option>${escapeHtml(c)}</option>`).join('')}</select></label>
<label><input type="checkbox" id="f-llm"> repaired by the model (${llm})</label> <label><input type="checkbox" id="f-manual"> needs manual work (${manual})</label></div>
${html.join('\n')}
<script>const q=s=>document.querySelector(s);function f(){document.querySelectorAll('details.tour').forEach(d=>{d.hidden=(q('#f-lang').value&&d.dataset.lang!==q('#f-lang').value)||(q('#f-city').value&&d.dataset.city!==q('#f-city').value)||(q('#f-llm').checked&&d.dataset.llm!=='1')||(q('#f-manual').checked&&d.dataset.manual!=='1')})}document.querySelectorAll('#filters select,#filters input').forEach(e=>e.addEventListener('change',f))</script></body></html>`;
  mkdirSync(stage.path('review'), { recursive: true });
  writeFileSync(stage.path('review', 'index.html'), page, { mode: 0o600 });
  deps.log(`review-pack: ${tours.length} tours (${llm} repaired by the model, ${manual} need manual work) in review/index.html`);
  stage.writeReceipt('review-pack', [stage.path('review', 'index.html')], { tours: tours.length, llm, manual });
  return { tours: tours.length, llm, manual };
}

function tourHtml(ctx: Ctx, tour: ManifestTour, neutral: NeutralFile, speech: SpeechFile, cues: CueFile | null, rendered: TourRendered | null, flags: { repaired: boolean; needsManual: boolean; reason?: string }): string {
  const audio = (file?: { storagePath: string }) => {
    if (!file) return '';
    const path = ctx.stage.path('render', 'audio', file.storagePath);
    return existsSync(path) ? `<audio controls preload="none" src="${escapeHtml(relative(ctx.stage.path('review'), path))}"></audio>` : '';
  };
  const piece = (title: string, original: string, body: string, spoken: string, changes: string[][], file?: { storagePath: string }) => `<div class="row"><h3>${escapeHtml(title)}</h3>
<p>${diffHtml(original, body)}</p><div class="spoken">${escapeHtml(spoken)}</div>${changes.length ? `<details><summary>${changes.length} spoken changes</summary><ul>${changes.map(([a, b]) => `<li>${escapeHtml(a)} → ${escapeHtml(b)}</li>`).join('')}</ul></details>` : ''}${audio(file)}</div>`;
  const by = new Map(speech.pieces.map(p => [p.pieceId, p]));
  const body = [piece('Introduction', tour.introduction, neutral.bodies.introduction, speech.introductionSpokenText, by.get('introduction')?.changes ?? [], rendered?.introduction),
    ...stopsInOrder(tour.places).map(p => piece(`${p.position + 1}. ${placeName(p)}`, p.description, neutral.bodies.places[p.placeId], speech.places[p.placeId], by.get(p.placeId)?.changes ?? [], rendered?.places[p.placeId])),
    ...(cues ? [`<div class="row"><h3>Link clips (${cues.cues.length})</h3><ul>${cues.cues.map(c => `<li>${escapeHtml(c.text)}${rendered ? audio(rendered.cues[c.key]) : ''}</li>`).join('')}</ul></div>`] : [])].join('\n');
  const tags = [flags.repaired ? '<span class="tag">repaired by the model</span>' : '', flags.needsManual ? `<span class="tag bad">needs manual work${flags.reason ? ': ' + escapeHtml(flags.reason) : ''}</span>` : ''].join(' ');
  return `<details class="tour" data-lang="${tour.language}" data-city="${escapeHtml(tour.city)}" data-llm="${flags.repaired ? 1 : 0}" data-manual="${flags.needsManual ? 1 : 0}"><summary>${escapeHtml(tour.city)} · ${tour.language} · ${escapeHtml(tour.tourId)} ${tags}</summary>${body}</details>`;
}
