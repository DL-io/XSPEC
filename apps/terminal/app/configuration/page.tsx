'use client';

import { useEffect, useState } from 'react';
import { MANDATES } from '@polyshore/risk';
import { apiFetch, tenantId } from '../api-client';

interface SafetyState {
  killSwitchActive: boolean;
  liveAuthorized: boolean;
  killSwitchReason?: string;
}

interface RiskOverrides {
  minEdge: number;
  minConfidence: number;
  maxSpreadBps: number;
  maxDrawdown: number;
  fractionalKelly: number;
  maxOrderSizeUsdc: number;
}

const DEFAULT_RISK: RiskOverrides = {
  minEdge: 0.06,
  minConfidence: 0.70,
  maxSpreadBps: 200,
  maxDrawdown: 0.10,
  fractionalKelly: 0.10,
  maxOrderSizeUsdc: 500
};

const activeMandate = 'conservative' as const;

export default function Configuration() {
  const [safety, setSafety] = useState<SafetyState>({ killSwitchActive: true, liveAuthorized: false });
  const [keys, setKeys] = useState<Array<{ key: string; status: 'SET' | 'MISSING' }>>([]);
  const [risk, setRisk] = useState<RiskOverrides>(DEFAULT_RISK);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [riskSaved, setRiskSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [overviewRes, configRes] = await Promise.all([
          apiFetch(`/api/overview?tenantId=${tenantId}`),
          apiFetch(`/api/configuration?tenantId=${tenantId}`)
        ]);
        if (overviewRes.ok) {
          const d = await overviewRes.json();
          setSafety(d.safety ?? { killSwitchActive: true, liveAuthorized: false });
        }
        if (configRes.ok) {
          const d = await configRes.json();
          setKeys(d.keys ?? []);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Load error');
      } finally {
        setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  async function patchSafety(patch: Record<string, unknown>) {
    setUpdating(true);
    setError(null);
    try {
      const res = await apiFetch('/api/safety', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, ...patch })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? res.statusText);
      setSafety(payload.state ?? safety);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setUpdating(false);
    }
  }

  async function saveRisk() {
    setUpdating(true);
    try {
      await apiFetch('/api/configuration', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, riskOverrides: risk })
      });
      setRiskSaved(true);
      setTimeout(() => setRiskSaved(false), 2500);
    } catch { /* best effort */ } finally {
      setUpdating(false);
    }
  }

  const mode = safety.liveAuthorized ? 'LIVE' : 'PAPER';
  const mandate = MANDATES[activeMandate];

  if (loading) return <Skeleton />;

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 1080 }}>
      <div className="pageHeader">
        <span className="pageTitle">Configuration</span>
        <span className="pageSubtitle">Runtime settings · All mutations audited</span>
      </div>

      {error && (
        <div style={{ padding: 12, background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 8, color: 'var(--red)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Status row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        <div className="statCard">
          <div className="statLabel">Operating Mode</div>
          <div className={`statValue ${mode === 'LIVE' ? 'positive' : 'accent'}`} style={{ fontSize: 22 }}>{mode}</div>
        </div>
        <div className="statCard">
          <div className="statLabel">Kill Switch</div>
          <div className={`statValue ${safety.killSwitchActive ? 'negative' : 'positive'}`} style={{ fontSize: 22 }}>
            {safety.killSwitchActive ? 'ENGAGED' : 'CLEAR'}
          </div>
        </div>
        <div className="statCard">
          <div className="statLabel">Live Authorization</div>
          <div className={`statValue ${safety.liveAuthorized ? 'positive' : 'neutral'}`} style={{ fontSize: 22, color: safety.liveAuthorized ? undefined : 'var(--text-2)' }}>
            {safety.liveAuthorized ? 'AUTHORIZED' : 'DISABLED'}
          </div>
        </div>
      </div>

      {/* Safety controls */}
      <div className="panel">
        <div className="panelHeader"><span className="panelTitle">Safety Controls</span></div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="danger" disabled={updating || safety.killSwitchActive}
            onClick={() => patchSafety({ killSwitch: { active: true, reason: 'operator engaged' } })}>
            Engage Kill Switch
          </button>
          <button className="success" disabled={updating || !safety.killSwitchActive}
            onClick={() => patchSafety({ killSwitch: { active: false, reason: 'operator cleared' } })}>
            Clear Kill Switch
          </button>
          <button disabled={updating || safety.killSwitchActive || safety.liveAuthorized}
            onClick={() => patchSafety({ liveAuthorization: { enabled: true, reason: 'operator authorized live' } })}>
            Authorize Live Trading
          </button>
          <button disabled={updating || !safety.liveAuthorized}
            onClick={() => patchSafety({ liveAuthorization: { enabled: false, reason: 'operator disabled live' } })}>
            Disable Live Trading
          </button>
        </div>
        {safety.killSwitchReason && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
            Reason: {safety.killSwitchReason}
          </div>
        )}
      </div>

      {/* Risk sliders */}
      <div className="panel">
        <div className="panelHeader">
          <span className="panelTitle">Risk Parameters</span>
          <button className={riskSaved ? 'success' : 'primary'} disabled={updating} onClick={saveRisk} style={{ padding: '6px 14px' }}>
            {riskSaved ? 'Saved ✓' : 'Save Changes'}
          </button>
        </div>

        <div style={{ display: 'grid', gap: 20 }}>
          {([
            { key: 'minEdge', label: 'Minimum Edge', min: 1, max: 20, step: 0.5, fmt: (v: number) => `${(v * 100).toFixed(1)}%` },
            { key: 'minConfidence', label: 'Minimum Confidence', min: 40, max: 95, step: 5, fmt: (v: number) => `${(v * 100).toFixed(0)}%` },
            { key: 'maxSpreadBps', label: 'Max Spread', min: 50, max: 500, step: 25, fmt: (v: number) => `${v} bps` },
            { key: 'maxDrawdown', label: 'Max Drawdown', min: 2, max: 30, step: 1, fmt: (v: number) => `${(v * 100).toFixed(0)}%` },
            { key: 'fractionalKelly', label: 'Fractional Kelly', min: 2, max: 30, step: 1, fmt: (v: number) => `${(v * 100).toFixed(0)}%` },
            { key: 'maxOrderSizeUsdc', label: 'Max Order Size', min: 50, max: 5000, step: 50, fmt: (v: number) => `$${v.toFixed(0)}` }
          ] as Array<{ key: keyof RiskOverrides; label: string; min: number; max: number; step: number; fmt: (v: number) => string }>).map(({ key, label, min, max, step, fmt }) => {
            const raw = risk[key];
            const displayVal = key === 'maxSpreadBps' || key === 'maxOrderSizeUsdc' ? raw : raw;
            const sliderVal = key === 'maxSpreadBps' || key === 'maxOrderSizeUsdc' ? raw : raw * 100;
            return (
              <div key={key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="formLabel">{label}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
                    {fmt(displayVal)}
                  </span>
                </div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={sliderVal}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setRisk((prev) => ({
                      ...prev,
                      [key]: key === 'maxSpreadBps' || key === 'maxOrderSizeUsdc' ? v : v / 100
                    }));
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Active mandate reference */}
      <div className="panel">
        <div className="panelHeader">
          <span className="panelTitle">Mandate: {activeMandate.toUpperCase()}</span>
          <span className="badge blue">READ ONLY</span>
        </div>
        <table className="table">
          <thead><tr><th>Parameter</th><th>Threshold</th></tr></thead>
          <tbody>
            {Object.entries(mandate).map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td className="mono">{(Number(v) * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Config key presence */}
      {keys.length > 0 && (
        <div className="panel">
          <div className="panelHeader"><span className="panelTitle">Environment Variables</span></div>
          <table className="table">
            <thead><tr><th>Key</th><th>Status</th></tr></thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.key}>
                  <td className="mono">{k.key}</td>
                  <td><span className={`badge ${k.status === 'SET' ? 'green' : 'red'}`}>{k.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="skeletonPage">
      <div className="skeletonHeader" />
      <div className="skeletonGrid"><div className="skeletonCard" /><div className="skeletonCard" /><div className="skeletonCard" /></div>
      <div className="skeletonWide" />
      <div className="skeletonWide" />
    </div>
  );
}
