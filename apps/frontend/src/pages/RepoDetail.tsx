import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useCreateDeployment } from '../lib/deployments';
import { useBranches, useRepo } from '../lib/repos';

export function RepoDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: repo, isPending: repoPending, isError: repoError } = useRepo(id);
  const { data: branches, isPending: branchesPending } = useBranches(id);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const createDeployment = useCreateDeployment();
  const navigate = useNavigate();

  const effectiveBranch = selectedBranch || repo?.defaultBranch || '';

  async function handleDeploy() {
    if (!id || !effectiveBranch) return;
    const { deploymentId } = await createDeployment.mutateAsync({
      repositoryId: id,
      branch: effectiveBranch,
    });
    navigate(`/deployments/${deploymentId}`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <Link to="/" className="text-sm text-slate-500 hover:underline">
        &larr; Back to repositories
      </Link>

      {repoPending && <p className="text-slate-500">Loading...</p>}
      {repoError && <p className="text-red-600">Couldn't load this repository.</p>}

      {repo && (
        <>
          <header className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">{repo.fullName}</h1>
              {repo.description && <p className="mt-1 text-slate-600">{repo.description}</p>}
            </div>
            {repo.isPrivate && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                private
              </span>
            )}
          </header>

          <a
            href={repo.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            View on GitHub
          </a>

          <div className="flex flex-col gap-2">
            <label htmlFor="branch" className="text-sm font-medium text-slate-700">
              Branch
            </label>
            <select
              id="branch"
              value={effectiveBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              disabled={branchesPending}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {branchesPending && <option>Loading branches...</option>}
              {branches?.map((branch) => (
                <option key={branch.name} value={branch.name}>
                  {branch.name}
                  {branch.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleDeploy}
            disabled={createDeployment.isPending || !effectiveBranch}
            className="rounded-lg bg-slate-900 px-5 py-2.5 font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
          >
            {createDeployment.isPending ? 'Starting deploy...' : `Deploy "${effectiveBranch}"`}
          </button>
          {createDeployment.isError && (
            <p className="text-sm text-red-600">Couldn't start the deployment. Please try again.</p>
          )}
        </>
      )}
    </main>
  );
}
