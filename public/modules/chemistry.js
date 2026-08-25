const esc = (s='') => String(s).replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

export function detectChemicalEquation(text='') {
  const t = String(text).trim();
  const hasArrow = /(?:-{1,2}>|→|⟶|⇌|↔|=>|<=>)/.test(t);
  const formulas = t.match(/\b(?:\d+\s*)?[A-Z][A-Za-z()\[\]0-9+\-]{0,18}\b/g) || [];
  return hasArrow && formulas.length >= 2;
}

export function parseReactionArrow(text='') {
  const patterns = [
    /--\s*([^-\n<>]{1,40}?)\s*-->/,          // --حرارة-->
    /-\[([^\]]{1,40})\]->/,                  // -[حرارة]->
    /-\s*([^\s\-<>][^\n<>]{0,39}?)\s*->/, // -حرارة-> (not plain -->)
    /\{([^}]{1,40})\}\s*(→|⟶|->|=>)/        // {حرارة} ->
  ];
  for (const re of patterns) {
    const m = String(text).match(re);
    if (m) return { raw: m[0], condition: m[1].trim(), arrow: '⟶', index: m.index };
  }
  const plain = String(text).match(/(<=>|⇌|↔|-->|->|=>|→|⟶)/);
  if (!plain) return null;
  return { raw: plain[0], condition: '', arrow: /<=>|⇌|↔/.test(plain[0]) ? '⇌' : '⟶', index: plain.index };
}

function formatFormulaSegment(segment) {
  // Preserves coefficients, parentheses and charge text while moving atom counts down.
  // It deliberately does not treat a leading stoichiometric coefficient as a subscript.
  const s = esc(segment);
  return s.replace(/([A-Za-z\)])(\d+)/g, '$1<sub>$2</sub>')
          .replace(/\^\{?(\d+[+\-]|[+\-]?\d+)\}?/g, '<sup data-source="^$1">$1</sup>');
}

export function formatChemicalEquation(text='') {
  const source = String(text).trim();
  const a = parseReactionArrow(source);
  if (!a) return `<span class="chem-side">${formatFormulaSegment(source)}</span>`;
  const before = source.slice(0, a.index);
  const after = source.slice(a.index + a.raw.length);
  return `<span class="chem-side">${formatFormulaSegment(before)}</span>` +
    `<span class="chem-arrow-wrapper" contenteditable="false" data-source="${esc(a.raw)}">` +
      `${a.condition ? `<span class="chem-condition" dir="rtl">${esc(a.condition)}</span>` : '<span class="chem-condition empty">&nbsp;</span>'}` +
      `<span class="chem-arrow">${a.arrow}</span>` +
    `</span>` +
    `<span class="chem-side">${formatFormulaSegment(after)}</span>`;
}

export function chemistryWarnings(text='') {
  const warnings = [];
  const arrow = parseReactionArrow(text);
  if (!arrow) warnings.push('لم يتم التعرف على سهم تفاعل واضح.');
  if (/\b[A-Z][a-z]?\^?\d+\b/.test(text) && !/[A-Za-z]\d/.test(text)) warnings.push('تحقق من موضع أعداد الذرات/التأكسد.');
  if (/\b(?:heat|حرارة|ضغط|ضوء)\b/i.test(text) && arrow && !arrow.condition) warnings.push('يوجد شرط تفاعل محتمل لكنه ليس مثبتًا أعلى السهم.');
  return warnings;
}
