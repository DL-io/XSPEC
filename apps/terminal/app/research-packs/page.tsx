'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch, tenantId } from '../api-client';
import styles from '../operator.module.css';

interface AuditRecord {
  marketId: string;
  scannerData?: { question?: string };
}

interface StageFailure {
  stage: string;
  reason: string;
  retryable: boolean;
}

interface MarketDossier {
  marketId: string;
  generatedAt?: string;
  freshnessExpiresAt?: string;
  resolutionCriteria?: string;
  currentFacts?: { claim: string; source: string; capturedAt: string }[];
  probabilityEstimate?: number;
  confidence?: number;
  keyDrivers?: string[];
  catalysts?: string[];
  contraryCase?: string;
  steelmanRebuttal?: string;
  identifiedBlindSpots?: string[];
  stagesCompleted?: string[];
  stageFailures?: StageFailure[];
  skipReason?: string;
}

export default function ResearchPacks() {
  const [dossiers, setDossiers] = useState<MarketDossier[]>([]);
  const [questions, setQuestions] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<MarketDossier | null>(null);
  const [search, setSearch] = useState('');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const fetchDossiers = async () => {
      try {
        const auditRes = await apiFetch(`/api/audits?tenantId=${tenantId}&limit=25`);
        if (!auditRes.ok) throw new Error('Failed to fetch audited markets');
        const auditPayload = await auditRes.json() as { audits?: AuditRecord[] };
        const audits = auditPayload.audits ?? [];
        setQuestions(Object.fromEntries(audits.map((audit) => [audit.marketId, audit.scannerData?.question ?? audit.marketId])));
        const marketIds = [...new Set(audits.map((audit) => audit.marketId))].slice(0, 12);
        const results = await Promise.all(marketIds.map(async (marketId) => {
          const res = await apiFetch(`/api/dossiers?tenantId=${tenantId}&marketId=${encodeURIComponent(marketId)}`);
          if (res.status === 404) return null;
          if (!res.ok) throw new Error('Failed to fetch market dossier');
          return await res.json() as MarketDossier;
        }));
        setDossiers(results.filter((dossier): dossier is MarketDossier => dossier !== null));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading research packs');
      } finally {
        setLoading(false);
      }
    };

    fetchDossiers();
    const interval = setInterval(fetchDossiers, 60_000);
    return () => clearInterval(interval);
  }, []);

  const filtered = useMemo(() => dossiers.filter((dossier) => questionFor(dossier, questions).toLowerCase().includes(search.toLowerCase())), [dossiers, questions, search]);

  const exportPack = async (dossier: MarketDossier) => {
    setExporting(true);
    try {
      const res = await apiFetch('/api/research-packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, marketIds: [dossier.marketId], title: `Research pack ${dossier.marketId}` })
      });
      if (!res.ok) throw new Error('Failed to generate research pack export');
      const pack = await res.json() as { html: string };
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(URL.createObjectURL(new Blob([pack.html], { type: 'text/html' })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error exporting research pack');
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <ResearchSkeleton />;
  if (error) return <div className={styles.error}>Error: {error}</div>;

  return (
    <div className={styles.wideContainer}>
      <div className={styles.header}>
        <h1>Research Pack Viewer</h1>
        <Link href="/" className={styles.backLink}>Back to Dashboard</Link>
      </div>

      {downloadUrl && (
        <div className={styles.successToast}>
          HTML export generated. <a href={downloadUrl} download="research-pack.html">Download research pack</a>
        </div>
      )}

      <div className={styles.controls}>
        <label className={styles.label}>Search</label>
        <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Filter research packs by question text" />
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>Research packs are generated after the scanner evaluates markets. Run the scanner worker to populate this view.</div>
      ) : (
        <div className={styles.grid}>
          {filtered.map((dossier) => (
            <button key={dossier.marketId} type="button" className={styles.card} onClick={() => setSelected(dossier)}>
              <h3 className={styles.cardTitle}>{truncate(questionFor(dossier, questions), 120)}</h3>
              <p className={styles.muted}>{dossier.generatedAt ? new Date(dossier.generatedAt).toLocaleString() : 'Generation time unavailable'}</p>
              <div className={styles.buttonRow}>
                <span className={`${styles.badge} ${confidenceClass(dossier.confidence)}`}>{percent(dossier.confidence)} confidence</span>
                <span className={`${styles.badge} ${styles.info}`}>{percent(dossier.probabilityEstimate)} probability</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className={styles.slideOver}>
          <div className={styles.slideHeader}>
            <div>
              <h2>{questionFor(selected, questions)}</h2>
              <p className={styles.muted}>{selected.marketId}</p>
            </div>
            <button type="button" onClick={() => setSelected(null)}>Close</button>
          </div>
          <div className={styles.summary}>
            <div className={styles.summaryCard}><span className={styles.label}>Probability</span><span className={styles.value}>{percent(selected.probabilityEstimate)}</span></div>
            <div className={styles.summaryCard}><span className={styles.label}>Confidence</span><span className={styles.value}>{percent(selected.confidence)}</span></div>
          </div>
          <Section title="Resolution Criteria" content={[selected.resolutionCriteria]} />
          <Section title="Completed Stages" content={selected.stagesCompleted} />
          <Section title="Current Facts" content={selected.currentFacts?.map((fact) => `${fact.claim} (${fact.source})`)} />
          <Section title="Key Drivers" content={selected.keyDrivers} />
          <Section title="Catalysts" content={selected.catalysts} />
          <Section title="Reasoning Summary" content={[selected.contraryCase, selected.steelmanRebuttal, selected.skipReason]} />
          <Section title="Blind Spots" content={selected.identifiedBlindSpots} />
          <Section title="Stage Failures" content={selected.stageFailures?.map((failure) => `${failure.stage}: ${failure.reason}`)} />
          <div className={styles.buttonRow}>
            <button type="button" disabled={exporting} onClick={() => exportPack(selected)}>{exporting ? 'Exporting...' : 'Export HTML Pack'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, content }: { title: string; content: Array<string | undefined> | undefined }) {
  const rows = (content ?? []).filter((row): row is string => Boolean(row));
  if (!rows.length) return null;
  return (
    <details className={styles.panel} open>
      <summary>{title}</summary>
      {rows.map((row, index) => <p key={`${title}-${index}`} className={styles.muted}>{row}</p>)}
    </details>
  );
}

function ResearchSkeleton() {
  return (
    <div className="skeletonPage">
      <div className="skeletonHeader" />
      <div className="skeletonGrid"><div className="skeletonCard" /><div className="skeletonCard" /><div className="skeletonCard" /></div>
    </div>
  );
}

function questionFor(dossier: MarketDossier, questions: Record<string, string>): string {
  return questions[dossier.marketId] ?? dossier.marketId;
}

function percent(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'N/A';
}

function confidenceClass(value: number | undefined): string {
  return (value ?? 0) >= 0.7 ? styles.approved : styles.pending;
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}
