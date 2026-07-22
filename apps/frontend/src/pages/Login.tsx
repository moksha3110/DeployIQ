import { Navigate, useSearchParams } from 'react-router-dom';
import { githubLoginUrl, useCurrentUser } from '../lib/auth';

const ERROR_MESSAGES: Record<string, string> = {
  state_mismatch: 'Login session expired — please try again.',
  oauth_failed: 'GitHub sign-in failed. Please try again.',
};

export function Login() {
  const { data: user, isPending } = useCurrentUser();
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');

  if (isPending) return null;
  if (user) return <Navigate to="/" replace />;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Deployment Platform</h1>
        <p className="text-slate-600">Sign in to deploy your GitHub repositories.</p>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">
          {ERROR_MESSAGES[error] ?? 'Something went wrong signing in.'}
        </p>
      )}

      <a
        href={githubLoginUrl()}
        className="rounded-lg bg-slate-900 px-5 py-2.5 font-medium text-white hover:bg-slate-800"
      >
        Continue with GitHub
      </a>
    </main>
  );
}
