import { useNavigate } from 'react-router-dom';
import { RepoList } from '../components/RepoList';
import { useCurrentUser, useLogout } from '../lib/auth';

// Deploy button and deployment history land in Milestone 3+.
export function Dashboard() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Deployment Platform</h1>
        <button
          onClick={handleLogout}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          Log out
        </button>
      </header>

      {user && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          {user.avatarUrl && (
            <img src={user.avatarUrl} alt={user.username} className="h-10 w-10 rounded-full" />
          )}
          <div>
            <p className="font-medium text-slate-900">{user.username}</p>
            <p className="text-sm text-slate-500">{user.email ?? 'no public email'}</p>
          </div>
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-slate-900">Repositories</h2>
        <RepoList />
      </section>
    </main>
  );
}
