import { detectChemicalEquation } from './chemistry.js';

export function segmentSource(source='') {
  const text = String(source).replace(/\r\n?/g, '\n');
  const segments = [];
  const blank = /\n{2,}/g;
  let cursor = 0; let m;
  const push = (raw) => {
    if (!raw) return;
    const display = raw.replace(/\n{2,}$/, '').replace(/^\n+/, '');
    if (!display.trim()) {
      if (segments.length) segments[segments.length - 1].raw += raw;
      return;
    }
    segments.push({
      id: `s${segments.length + 1}`,
      sourceStart: 0,
      sourceEnd: 0,
      raw,
      text: display,
      type: classifyLocal(display)
    });
  };
  while ((m = blank.exec(text))) {
    const content = text.slice(cursor, m.index);
    push(content + m[0]);
    cursor = blank.lastIndex;
  }
  push(text.slice(cursor));
  let offset = 0;
  for (const seg of segments) {
    seg.sourceStart = offset;
    offset += seg.raw.length;
    seg.sourceEnd = offset;
  }
  if (!segments.length && text) push(text);
  return segments;
}

export function classifyLocal(text='') {
  const t = text.trim();
  if (!t) return 'paragraph';
  if (detectChemicalEquation(t)) {
    const arabicCount = (t.match(/[\u0600-\u06FF]/g) || []).length;
    // A real equation may contain a short Arabic condition such as حرارة.
    // Longer Arabic prose around a reaction stays RTL paragraph with an isolated LTR equation fragment.
    if (arabicCount <= 10) return 'equation';
    return 'paragraph';
  }
  if (looksLikeTable(t)) return 'table';
  if (/^(?:س\s*[:：]|سؤال|اختر|علل|فسر|قارن|ما\s|ماذا\s|كيف\s|لماذا\s)/u.test(t)) return 'question';
  if (/^(?:[-•●▪◦]|\d+[.)-]|[أ-ي][.)-])\s+/u.test(t)) return 'list';
  const lineCount = t.split('\n').length;
  if (lineCount === 1 && t.length <= 90 && !/[.!؟؛:]\s*$/u.test(t)) return t.length <= 45 ? 'title' : 'subtitle';
  return 'paragraph';
}

export function looksLikeTable(text='') {
  const lines = text.trim().split('\n').filter(Boolean);
  if (lines.length < 2) return false;
  const tabCols = lines.map(l => l.split('\t').length);
  if (Math.min(...tabCols) >= 2 && new Set(tabCols).size <= 2) return true;
  const pipeCols = lines.map(l => l.split('|').filter(Boolean).length);
  return Math.min(...pipeCols) >= 2 && new Set(pipeCols).size <= 2;
}

export function verifyLossless(source, segments) {
  return segments.map(s => s.raw).join('') === String(source).replace(/\r\n?/g, '\n');
}
