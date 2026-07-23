import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useCurrentUser, useLogout } from '../lib/auth';
import { Button } from './ui/button';

// Wraps every protected page (see ProtectedRoute) with a persistent top bar
// — before M11.10 each page hand-rolled its own header/logout, which meant
// only Dashboard actually had a logout button and every other page was a
// dead end unless you used the browser back button.
export function AppShell({ children }: { children: ReactNode }) {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link to="/" className="text-sm font-semibold tracking-tight text-foreground">
            DeployIQ
          </Link>
          {user && (
            <div className="flex items-center gap-3">
              {user.avatarUrl && (
                <img src={user.avatarUrl} alt={user.username} className="h-7 w-7 rounded-full" />
              )}
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {user.username}
              </span>
              <Button variant="ghost" size="icon" onClick={handleLogout} aria-label="Log out">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </header>
      <div className="mx-auto max-w-5xl">{children}</div>
    </div>
  );
}
