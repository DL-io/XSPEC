import './globals.css';
import Link from 'next/link';
import type { ReactNode } from 'react';

const sections = [
  {
    label: 'Operations',
    links: [
      ['Dashboard', '/'],
      ['Opportunities', '/opportunities'],
      ['Portfolio', '/portfolio'],
      ['Audit Trail', '/audit'],
    ],
  },
  {
    label: 'Analytics',
    links: [
      ['Performance', '/performance'],
      ['Research Packs', '/research-packs'],
      ['Reconciliation', '/reconciliation'],
    ],
  },
  {
    label: 'System',
    links: [
      ['Health', '/health'],
      ['Configuration', '/configuration'],
    ],
  },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <nav className="nav">
            <div className="navBrand">
              <div className="navWordmark"><em>X</em>SPEC</div>
              <div className="navSubtitle">Prediction Market&nbsp;Operator Terminal</div>
            </div>
            <div className="navLinks">
              {sections.map((section) => (
                <div key={section.label}>
                  <div className="navSectionLabel">{section.label}</div>
                  {section.links.map(([label, href]) => (
                    <Link key={href} href={href} className="navLink">{label}</Link>
                  ))}
                </div>
              ))}
            </div>
          </nav>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
