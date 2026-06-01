import type { MarketDossier, ResearchPack } from '@polyshore/core';

export function renderResearchPack(input: { id: string; tenantId: string; title: string; dossiers: MarketDossier[] }): ResearchPack {
  const sections = input.dossiers.map((dossier) => `<section><h2>${escapeHtml(dossier.marketId)}</h2><p>Probability: ${dossier.probabilityEstimate}</p><p>Confidence: ${dossier.confidence}</p><p>${escapeHtml(dossier.contraryCase)}</p></section>`).join('');
  return { id: input.id, tenantId: input.tenantId, title: input.title, marketIds: input.dossiers.map((d) => d.marketId), html: `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(input.title)}</title></head><body><h1>${escapeHtml(input.title)}</h1>${sections}</body></html>`, createdAt: new Date() };
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
