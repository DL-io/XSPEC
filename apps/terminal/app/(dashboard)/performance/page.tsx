'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiFetch, tenantId } from '../../api-client';

type DateRange = '7d' | '30d' | '90d' | 'all';

interface CalibrationBucket { bucket: string; predicted?: number; actual: number; }
interface CalibrationRecord { marketId: string; predicted: number; actual: number; brierContribution: number; }

interface PerformanceData {
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

export default function PerformancePage() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [range, setRange] = useState<DateRange>('30d');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const params = new URLSearchParams({ tenantId });
        const from = rangeStart(range);
        if (from) params.set('from', from.toISOString());
        const res = await apiFetch(`/api/performance?${params}`);
        if (res.ok) setData(await res.json());
      } catch { /* keep stale */ } finally {
        setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [range]);

  const bucketData = useMemo(() => normalizeBuckets(data?.calibrationByBucket), [data?.calibrationByBucket]);
  const records = data?.records ?? [];
  const totalTrades = data?.totalTrades ?? data?.count ?? 0;

  if (loading) return (
    <div className="skeletonPage">
      <div className="skeletonHeader" />
      <div className="skeletonGrid"><div className="skeletonCard" /><div className="skeletonCard" /><div className="skeletonCard" /><div className="skeletonCard" /><div className="skeletonCard" /></div>
      <div className="skeletonWide" />
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 1280 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="pageHeader" style={{ marginBottom: 0 }}>
          <span className="pageTitle">Performance</span>
          <span className="pageSubtitle">Calibration analytics</span>
        </div>
        <select value={range} onChange={(e) => setRange(e.target.value as DateRange)} style={{ width: 'auto' }}>
          <option value="7d">7 days</option>
          <option value="30d">30 days</option>
          <option value="90d">90 days</option>
          <option value="all">All-time</option>
        </select>
      </div>

      {totalTrades === 0 ? (
        <div className="panel" style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-3)', fontSize: 13 }}>
          Calibration data populates as markets resolve.<br />Check back after your first resolved positions.
        </div>
      ) : (
        <>
          {/* Key metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14 }}>
            {[
              { label: 'Win Rate', value: pct(data?.winRate ?? data?.directionalAccuracy), sub: 'resolved direction' },
              { label: 'Avg Edge', value: pct(data?.avgEdge), sub: 'entry quality' },
              { label: 'Brier Score', value: num(data?.brierScore), sub: 'lower is better' },
              { label: 'Sharpe', value: num(data?.sharpeRatio ?? data?.sharpness), sub: 'risk adjusted' },
              { label: 'Max Drawdown', value: pct(data?.maxDrawdown), sub: 'capital defense' }
            ].map((m) => (
              <div key={m.label} className="statCard">
                <div className="statLabel">{m.label}</div>
                <div className="statValue" style={{ fontSize: 22 }}>{m.value}</div>
                <div className="statSub">{m.sub}</div>
              </div>
            ))}
          </div>

          {/* Calibration chart */}
          <div className="panel">
            <div className="panelHeader"><span className="panelTitle">Calibration by Probability Bucket</span></div>
            <div className="chartWrap" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={bucketData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: '#5a5a56' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 10, fill: '#5a5a56' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#161614', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => `${(v * 100).toFixed(1)}%`}
                  />
                  <Bar dataKey="actual" fill="#f97316" name="Actual Outcome Rate" radius={[3, 3, 0, 0]} />
                  <Line dataKey="perfect" stroke="rgba(255,255,255,0.3)" strokeWidth={2} dot={false} name="Perfect Calibration" strokeDasharray="6 3" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Raw records table */}
          {records.length > 0 && (
            <div className="panel">
              <div className="panelHeader"><span className="panelTitle">Calibration Records</span><span className="badge orange">{records.length}</span></div>
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr><th>Market</th><th>Predicted</th><th>Actual</th><th>Brier Contribution</th></tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.marketId}>
                        <td className="mono muted" style={{ fontSize: 11 }}>{r.marketId.slice(0, 20)}…</td>
                        <td className="mono">{pct(r.predicted)}</td>
                        <td className="mono">{pct(r.actual)}</td>
                        <td className="mono">{num(r.brierContribution)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function normalizeBuckets(input: CalibrationBucket[] | undefined) {
  const buckets = input?.length ? input : Array.from({ length: 10 }, (_, i) => ({ bucket: `${i * 10}-${(i + 1) * 10}%`, actual: 0, predicted: (i + 0.5) / 10 }));
  return buckets.map((b, i) => ({ ...b, perfect: b.predicted ?? (i + 0.5) / 10 }));
}

function rangeStart(range: DateRange): Date | undefined {
  if (range === 'all') return undefined;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  return new Date(Date.now() - days * 86_400_000);
}

function pct(v: number | null | undefined) {
  return typeof v === 'number' && Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : 'N/A';
}

function num(v: number | null | undefined) {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(3) : 'N/A';
}
