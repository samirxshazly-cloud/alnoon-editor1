import test from 'node:test';
import assert from 'node:assert/strict';
import { detectChemicalEquation, parseReactionArrow, formatChemicalEquation } from '../public/modules/chemistry.js';
import { segmentSource, verifyLossless } from '../public/modules/segmentation.js';

test('detects equation and condition above arrow', () => {
  const s = '3Fe + 2O2 -حرارة-> Fe3O4';
  assert.equal(detectChemicalEquation(s), true);
  const a = parseReactionArrow(s);
  assert.equal(a.condition, 'حرارة');
  const h = formatChemicalEquation(s);
  assert.match(h, /chem-condition/);
  assert.match(h, /Fe<sub>3<\/sub>O<sub>4<\/sub>/);
  assert.match(h, /2O<sub>2<\/sub>/);
});

test('segmentation is lossless', () => {
  const src = 'العنوان\n\nفقرة عربية بها H2O.\n\n3Fe + 2O2 -حرارة-> Fe3O4\n';
  const s = segmentSource(src);
  assert.equal(verifyLossless(src, s), true);
  assert.equal(s.at(-1).type, 'equation');
});

test('Arabic prose containing an equation remains a paragraph, equation-only line stays equation', async () => {
  const { classifyLocal } = await import('../public/modules/segmentation.js');
  assert.equal(classifyLocal('3Fe + 2O2 -حرارة-> Fe3O4'), 'equation');
  assert.equal(classifyLocal('عند تسخين الحديد يحدث التفاعل 3Fe + 2O2 -حرارة-> Fe3O4 ثم يتكون أكسيد الحديد'), 'paragraph');
});

test('reaction arrow parser distinguishes conditions from plain arrows', () => {
  assert.equal(parseReactionArrow('2H2 + O2 --> 2H2O').condition, '');
  assert.equal(parseReactionArrow('2H2 + O2 --حرارة--> 2H2O').condition, 'حرارة');
  assert.equal(parseReactionArrow('SO4^2-'), null);
  const h=formatChemicalEquation('Fe^3+ + e- -> Fe^2+');
  assert.match(h, /<sup data-source="\^3\+">3\+<\/sup>/);
});
