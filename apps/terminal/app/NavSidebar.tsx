'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch, tenantId } from './api-client';

interface NavData {
  equity: number | null;
  dailyPnl: number | null;
  drawdown: number | null;
  killSwitchActive: boolean;
  liveAuthorized: boolean;
  mode: 'EMERGENCY' | 'LIVE' | 'PAPER';
}

const sections = [
  {
    label: 'Operations',
    links: [
      { label: 'Dashboard', href: '/' },
      { label: 'Opportunities', href: '/opportunities' },
      { label: 'Portfolio', href: '/portfolio' },
      { label: 'Audit Trail', href: '/audit' },
    ],
  },
  {
    label: 'Analytics',
    links: [
      { label: 'Performance', href: '/performance' },
      { label: 'Research Packs', href: '/research-packs' },
      { label: 'Reconciliation', href: '/reconciliation' },
    ],
  },
  {
    label: 'System',
    links: [
      { label: 'Health', href: '/health' },
      { label: 'Configuration', href: '/configuration' },
    ],
  },
];

function fmt(n: number | null, prefix = '$') {
  if (n === null) return '—';
  return `${prefix}${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(n: number | null) {
  if (n === null) return '—';
  return `${(n * 100).toFixed(2)}%`;
}

export default function NavSidebar() {
  const [nav, setNav] = useState<NavData | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch(`/api/overview?tenantId=${encodeURIComponent(tenantId)}`);
        if (!res.ok) return;
        const data = await res.json();
        const portfolio = data.portfolio;
        const safety = data.safety ?? {};
        setNav({
          equity: portfolio?.equity ?? null,
          dailyPnl: portfolio?.dailyPnl ?? null,
          drawdown: portfolio?.maxDrawdown ?? null,
          killSwitchActive: safety.killSwitchActive ?? false,
          liveAuthorized: safety.liveAuthorized ?? false,
          mode: safety.killSwitchActive ? 'EMERGENCY' : safety.liveAuthorized ? 'LIVE' : 'PAPER'
        });
      } catch { /* silent */ }
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const modeClass = nav?.mode === 'EMERGENCY' ? 'emergency' : nav?.mode === 'LIVE' ? 'running' : 'paper';
  const modeLabel = nav?.mode ?? 'PAPER';

  return (
    <nav className="nav">
      <div className="navBrand">
        <div className="navWordmark"><em>X</em>SPEC</div>
        <div className="navSubtitle">Prediction Market Operator Terminal</div>
      </div>

      <div className="navStatusBar">
        <div className={`navBadge ${modeClass}`} style={{ alignSelf: 'flex-start' }}>
          <span className={`dot ${nav?.mode === 'EMERGENCY' ? 'red' : nav?.mode === 'LIVE' ? 'green' : 'blue'}`} />
          {modeLabel}
        </div>
        {nav !== null && (
          <>
            <div className="navMiniMetric">
              <span className="navMiniLabel">Equity</span>
              <span className="navMiniValue neutral">{fmt(nav.equity)}</span>
            </div>
            <div className="navMiniMetric">
              <span className="navMiniLabel">Daily P&L</span>
              <span className={`navMiniValue ${(nav.dailyPnl ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                {(nav.dailyPnl ?? 0) >= 0 ? '+' : ''}{fmt(nav.dailyPnl)}
              </span>
            </div>
            <div className="navMiniMetric">
              <span className="navMiniLabel">Drawdown</span>
              <span className={`navMiniValue ${(nav.drawdown ?? 0) > 0.05 ? 'negative' : 'neutral'}`}>
                {pct(nav.drawdown)}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="navLinks">
        {sections.map((section) => (
          <div key={section.label}>
            <div className="navSectionLabel">{section.label}</div>
            {section.links.map(({ label, href }) => (
              <Link key={href} href={href} className="navLink">{label}</Link>
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
}
