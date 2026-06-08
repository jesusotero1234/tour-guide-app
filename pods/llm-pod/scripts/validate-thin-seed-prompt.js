#!/usr/bin/env node
/**
 * Thin-seed prompt validation — verifies Phase A prompt engineering.
 * Run: node scripts/validate-thin-seed-prompt.js
 * 
 * Checks:
 *   - System prompt contains STRICT FACTUAL BOUNDARIES for thin seeds
 *   - Forbidden patterns are explicitly listed (fechas, arquitectos, estilos, eventos)
 *   - Attribution guard is present (no atribuir contexto regional al POI)
 *   - Honest-fallback guidance is present
 *   - Arrival thin prompt is distinct from rich prompt
 */
const { sectionSystem } = require('../dist/prompts/narrative/types');

const THIN_SYSTEM = sectionSystem('es', false, 'thin', '60 to 80');
const RICH_SYSTEM = sectionSystem('es', false, 'rich', '70 to 90');

let pass = 0, fail = 0;

function check(name, condition) {
  if (condition) {
    pass++;
    console.log(`✅ ${name}`);
  } else {
    fail++;
    console.log(`❌ ${name}`);
  }
}

console.log('=== THIN-SEED SYSTEM PROMPT CHECKS ===\n');

// 1. Thin prompt is distinct from rich
check('Thin prompt differs from rich', THIN_SYSTEM !== RICH_SYSTEM);

// 2. Contains thin-seed marker
check('Contains "THIN-SEED MODE"', THIN_SYSTEM.includes('THIN-SEED MODE'));

// 3. Forbidden: dates
check('Forbids specific years', THIN_SYSTEM.includes('Specific years'));
check('Forbids centuries', THIN_SYSTEM.includes('centuries'));

// 4. Forbidden: architects
check('Forbids architects', THIN_SYSTEM.includes('architects'));

// 5. Forbidden: styles
check('Forbids architectural styles', THIN_SYSTEM.includes('Architectural styles'));

// 6. Forbidden: events
check('Forbids historical events', THIN_SYSTEM.includes('Historical events'));

// 7. Forbidden: relationships
check('Forbids nobility/royalty', THIN_SYSTEM.includes('royalty') || THIN_SYSTEM.includes('nobility'));

// 8. Anti-contamination: regional ≠ POI
check('Regional-to-POI attribution guard', 
  THIN_SYSTEM.includes('NEVER attribute a regional fact'));

// 9. Honest fallback guidance
check('Contains honest-fallback example', 
  THIN_SYSTEM.includes('The public record on this place is sparse'));

// 10. Forbidden phrase patterns
check('Forbids "was built in"', THIN_SYSTEM.includes('was built in'));
check('Forbids "dates back to"', THIN_SYSTEM.includes('dates back to'));

// 11. Rich prompt does NOT contain thin-seed restrictions
check('Rich prompt lacks THIN-SEED MODE', !RICH_SYSTEM.includes('THIN-SEED MODE'));

console.log(`\n=== SECTION PROMPTS (thin-seed) ===\n`);

// Test arrival prompt generation with thin seed
const { arrivalPrompt } = require('../dist/prompts/narrative/arrival');
const thinInput = {
  localName: 'Pazo de Meire',
  seeds: { osmTags: { historic: 'manor', building: 'yes' }, wikidataClaims: {} },
  theme: 'history',
  language: 'es',
  position: 'middle',
  seedQuality: 'thin',
  targetWords: '60 to 80',
};
const arrival = arrivalPrompt(thinInput);

check('Arrival user prompt mentions THIN-SEED', arrival.user.includes('THIN-SEED'));
check('Arrival user prompt forbids inventing dates', arrival.user.includes('Do NOT invent dates'));
check('Arrival user prompt suggests visible description', arrival.user.includes('visible'));

const { historyPrompt } = require('../dist/prompts/narrative/history');
const history = historyPrompt(thinInput);

check('History user prompt mentions THIN-SEED', history.user.includes('THIN-SEED'));
check('History user prompt forbids inventing backstory', history.user.includes('Do NOT invent a backstory'));
check('History user prompt forbids attribution', history.user.includes('Never attribute'));

const { significancePrompt } = require('../dist/prompts/narrative/significance');
const significance = significancePrompt(thinInput);

check('Significance user prompt mentions THIN-SEED', significance.user.includes('THIN-SEED'));
check('Significance user prompt forbids inventing importance', significance.user.includes('Do NOT invent historical importance'));
check('Significance prompt gives regional example', significance.user.includes('In small Galician towns'));

console.log(`\n${pass}/${pass + fail} PASS, ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
