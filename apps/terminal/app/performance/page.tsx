'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import styles from '../operator.module.css';

type DateRange = '7d' | '30d' | '90d' | 'all';

interface CalibrationBucket {
  bucket: string;
  predicted?: number;
  actual: number;
}

interface CalibrationRecord {
  marketId: string;
  predicted: number;
  actual: number;
  brierContribution: number;
}

interface PerformanceResponse {
  totalTrades?: number;
  count?: number;
  winRate?: number | null;
  directionalAccuracy?: number | null;
  avgEdge?: number | null;
  brierScore?: number | null;
  sharpeRatio?: number | null;
  sharpness?: number | null;
  maxDrawdown?: number | null;
  calibrationByBucket?: CalibrationBucket[];
  records?: CalibrationRecord[];
}

const tenantId = process.env.NEXT_PUBLIC_TENANT_ID || 'demo-tenant';

export default function PerformanceAnalytics() {
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [range, setRange] = useState<DateRange>('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPerformance = async () => {
      try {
        const params = new URLSearchParams({ tenantId });
        const from = rangeStart(range);
        if (from) params.set('from', from.toISOString());
        const res = await fetch(`/api/performance?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch performance analytics');
        setData(await res.json() as PerformanceResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading performance analytics');
      } finally {
        setLoading(false);
      }
    };

    fetchPerformance();
    const interval = setInterval(fetchPerformance, 30_000);
    return () => clearInterval(interval);
  }, [range]);

  const bucketData = useMemo(() => normalizeBuckets(data?.calibrationByBucket), [data?.calibrationByBucket]);
  const records = data?.records ?? [];
  const totalTrades = data?.totalTrades ?? data?.count ?? 0;

  if (loading) return <PerformanceSkeleton />;
  if (error) return <div className={styles.error}>Error: {error}</div>;

  return (
    <div className={styles.wideContainer}>
      <div className={styles.header}>
        <h1>Calibration & Performance Analytics</h1>
        <Link href="/" className={styles.backLink}>Back to Dashboard</Link>
      </div>

      <div className={styles.controls}>
        <label className={styles.label}>Date Range</label>
        <select value={range} onChange={(event) => setRange(event.target.value as DateRange)}>
          <option value="7d">7d</option>
          <option value="30d">30d</option>
          <option value="90d">90d</option>
          <option value="all">All-time</option>
        </select>
      </div>

      {totalTrades === 0 ? (
        <div className={styles.emptyState}>Calibration data populates as markets resolve. Check back after your first resolved positions.</div>
      ) : (
        <>
          <div className={styles.summary}>
            <Metric label="Win Rate" value={percent(data?.winRate ?? data?.directionalAccuracy)} trend="resolved edge" />
            <Metric label="Avg Edge" value={percent(data?.avgEdge)} trend="entry quality" />
            <Metric label="Brier Score" value={numberValue(data?.brierScore)} trend="lower is better" />
            <Metric label="Sharpe Ratio" value={numberValue(data?.sharpeRatio ?? data?.sharpness)} trend="risk adjusted" />
            <Metric label="Max Drawdown" value={percent(data?.maxDrawdown)} trend="capital defense" />
          </div>

          <div className={styles.panel}>
            <h2>Calibration by Probability Bucket</h2>
            <div className={styles.chartContainer}>
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart data={bucketData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" />
                  <YAxis domain={[0, 1]} tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} />
                  <Tooltip formatter={(value) => `${(Number(value) * 100).toFixed(1)}%`} />
                  <Bar dataKey="actual" fill="#ff6b35" name="Actual Outcome Rate" />
                  <Line dataKey="perfect" stroke="#151515" strokeWidth={2} dot={false} name="Perfect Calibration" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={styles.panel}>
            <h2>Raw Calibration Records</h2>
            {records.length ? (
              <div className={styles.tableContainer}>
                <table className={styles.table}>
                  <thead><tr><th>Market</th><th>Predicted</th><th>Actual</th><th>Brier Contribution</th></tr></thead>
                  <tbody>
                    {records.map((record) => (
                      <tr key={record.marketId}>
                        <td className={styles.mono}>{record.marketId}</td>
                        <td>{percent(record.predicted)}</td>
                        <td>{percent(record.actual)}</td>
                        <td>{numberValue(record.brierContribution)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.emptyState}>Raw calibration records are not available in this response yet.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, trend }: { label: string; value: string; trend: string }) {
  return (
    <div className={styles.summaryCard}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value}</span>
      <span className={styles.trend}>{trend}</span>
    </div>
  );
}

function PerformanceSkeleton() {
  return (
    <div className="skeletonPage">
      <div className="skeletonHeader" />
      <div className="skeletonGrid"><div className="skeletonCard" /><div className="skeletonCard" /><div className="skeletonCard" /></div>
      <div className="skeletonWide" />
    </div>
  );
}

function normalizeBuckets(input: CalibrationBucket[] | undefined) {
  const buckets = input?.length ? input : Array.from({ length: 10 }, (_, index) => ({ bucket: `${index * 10}-${(index + 1) * 10}%`, actual: 0, predicted: (index + 0.5) / 10 }));
  return buckets.map((bucket, index) => ({ ...bucket, perfect: bucket.predicted ?? (index + 0.5) / 10 }));
}

function rangeStart(range: DateRange): Date | undefined {
  if (range === 'all') return undefined;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return new Date(Date.now() - days * 86_400_000);
}

function percent(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'N/A';
}

function numberValue(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : 'N/A';
}
