import type { ReactNode } from 'react';
import NavSidebar from './NavSidebar';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <NavSidebar />
      <main className="main">{children}</main>
    </div>
  );
}
