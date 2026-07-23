import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useCurrentUser } from '../lib/auth';
import { AppShell } from './AppShell';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useCurrentUser();

  if (isPending) {
    return <div className="p-6 text-muted-foreground">Loading...</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <AppShell>{children}</AppShell>;
}
