'use client';

import { useEffect, useState } from 'react';
import { apiFetch, tenantId } from '../../api-client';

interface Signal {
  marketId: string;
  probability: number;
  uncertainty: number;
  confidence: number;
  finalOutcome: string;
  riskApproved: boolean;
  opportunityScore: number;
  createdAt: string;
}

type SortKey = 'score' | 'confidence' | 'probability' | 'recent';

export default function OpportunitiesPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [venue, setVenue] = useState<'all' | 'polymarket' | 'kalshi'>('all');
  const [sortBy, setSortBy] = useState<SortKey>('score');
  const [selected, setSelected] = useState<Signal | null>(null);
  const [orderSide, setOrderSide] = useState<'yes' | 'no'>('yes');
  const [orderSize, setOrderSize] = useState('');
  const [orderPrice, setOrderPrice] = useState('');
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderResult, setOrderResult] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch(`/api/signals?tenantId=${tenantId}`);
        if (res.ok) setSignals((await res.json()).signals ?? []);
      } catch { /* keep stale */ } finally {
        setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const sorted = [...signals]
    .filter((s) => !search || s.marketId.toLowerCase().includes(search.toLowerCase()))
    .filter((s) => venue === 'all' || s.marketId.toLowerCase().includes(venue))
    .sort((a, b) => {
      if (sortBy === 'score') return b.opportunityScore - a.opportunityScore;
      if (sortBy === 'confidence') return b.confidence - a.confidence;
      if (sortBy === 'probability') return b.probability - a.probability;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  async function submitOrder() {
    if (!selected || !orderSize || !orderPrice) return;
    setOrderSubmitting(true);
    setOrderResult(null);
    try {
      const res = await apiFetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          marketId: selected.marketId,
          side: orderSide,
          quantity: parseFloat(orderSize),
          limitPrice: parseFloat(orderPrice) / 100
        })
      });
      const data = await res.json();
      if (!res.ok) setOrderResult(`Error: ${data.error ?? res.statusText}`);
      else setOrderResult(`Order submitted: ${data.orderId ?? 'ok'}`);
    } catch (e) {
      setOrderResult(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setOrderSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 1380 }}>
      <div className="pageHeader">
        <span className="pageTitle">Market Scanner</span>
        <span className="pageSubtitle">{sorted.length} opportunities</span>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search market ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <select value={venue} onChange={(e) => setVenue(e.target.value as typeof venue)} style={{ width: 'auto' }}>
          <option value="all">All venues</option>
          <option value="polymarket">Polymarket</option>
          <option value="kalshi">Kalshi</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)} style={{ width: 'auto' }}>
          <option value="score">Sort: Score</option>
          <option value="confidence">Sort: Confidence</option>
          <option value="probability">Sort: Probability</option>
          <option value="recent">Sort: Recent</option>
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 380px' : '1fr', gap: 20 }}>
        {/* Scanner results */}
        <div className="panel">
          {loading ? (
            <div className="skeletonPage"><div className="skeletonWide" /></div>
          ) : sorted.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
              {signals.length === 0 ? 'Waiting for first scanner cycle' : 'No results matching filters'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Market ID</th>
                    <th>Probability</th>
                    <th>Confidence</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th>Time</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s, i) => (
                    <tr
                      key={i}
                      onClick={() => {
                        setSelected(s);
                        setOrderPrice(((s.probability) * 100).toFixed(1));
                        setOrderResult(null);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <td><span className="mono" style={{ fontSize: 11 }}>{s.marketId.slice(0, 24)}…</span></td>
                      <td className="mono">{(s.probability * 100).toFixed(1)}%</td>
                      <td className="mono">{(s.confidence * 100).toFixed(1)}%</td>
                      <td>
                        <span className={s.opportunityScore > 0 ? 'positive' : 'muted'}
                          style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600 }}>
                          {s.opportunityScore > 0 ? '+' : ''}{(s.opportunityScore * 100).toFixed(2)}%
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${s.finalOutcome === 'trade' ? 'green' : 'amber'}`}>
                          {s.finalOutcome === 'trade' ? 'TRADE' : 'SKIP'}
                        </span>
                      </td>
                      <td className="muted" style={{ fontSize: 11 }}>{new Date(s.createdAt).toLocaleTimeString()}</td>
                      <td>
                        <button style={{ padding: '4px 10px', fontSize: 11 }}
                          onClick={(e) => { e.stopPropagation(); setSelected(s); setOrderResult(null); }}>
                          Order
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Order entry panel */}
        {selected && (
          <div className="panel" style={{ position: 'sticky', top: 20, alignSelf: 'start' }}>
            <div className="panelHeader">
              <span className="panelTitle">Order Entry</span>
              <button style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setSelected(null)}>✕</button>
            </div>

            <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>
              {selected.marketId}
            </div>

            {/* Confidence meter */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 5 }}>
                <span>Probability estimate</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>{(selected.probability * 100).toFixed(1)}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${selected.probability * 100}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.3s' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
                <span>Confidence: {(selected.confidence * 100).toFixed(0)}%</span>
                <span>Score: {(selected.opportunityScore * 100).toFixed(2)}%</span>
              </div>
            </div>

            <div className="formGroup" style={{ marginBottom: 12 }}>
              <div className="formLabel">Side</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <button
                  className={orderSide === 'yes' ? 'success' : ''}
                  onClick={() => setOrderSide('yes')}
                  style={{ justifyContent: 'center' }}
                >YES</button>
                <button
                  className={orderSide === 'no' ? 'danger' : ''}
                  onClick={() => setOrderSide('no')}
                  style={{ justifyContent: 'center' }}
                >NO</button>
              </div>
            </div>

            <div className="formGrid" style={{ marginBottom: 12 }}>
              <div className="formGroup">
                <div className="formLabel">Size (USDC)</div>
                <input type="number" placeholder="100" value={orderSize} onChange={(e) => setOrderSize(e.target.value)} min="1" />
              </div>
              <div className="formGroup">
                <div className="formLabel">Price (¢)</div>
                <input type="number" placeholder="50.0" value={orderPrice} onChange={(e) => setOrderPrice(e.target.value)} min="1" max="99" step="0.1" />
              </div>
            </div>

            <button className="primary" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
              disabled={orderSubmitting || !orderSize || !orderPrice}
              onClick={submitOrder}>
              {orderSubmitting ? 'Submitting…' : 'Submit Order'}
            </button>

            {orderResult && (
              <div style={{ fontSize: 11, padding: 10, borderRadius: 6, background: orderResult.startsWith('Error') ? 'var(--red-bg)' : 'var(--green-bg)', color: orderResult.startsWith('Error') ? 'var(--red)' : 'var(--green)', border: `1px solid ${orderResult.startsWith('Error') ? 'var(--red-border)' : 'var(--green-border)'}` }}>
                {orderResult}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
