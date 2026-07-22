import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRepos } from '../lib/repos';

const PAGE_SIZE = 10;

export function RepoList() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Debounce so we don't fire a request per keystroke — 300ms is short
  // enough to feel instant, long enough to skip the in-between characters
  // of a normal typing burst.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const { data, isPending, isError } = useRepos(search, page, PAGE_SIZE);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-3">
      <input
        type="search"
        placeholder="Search repositories..."
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      />

      {isPending && <p className="text-sm text-slate-500">Loading repositories...</p>}
      {isError && <p className="text-sm text-red-600">Couldn't load repositories.</p>}

      {data && data.items.length === 0 && (
        <p className="text-sm text-slate-500">No repositories found.</p>
      )}

      <ul className="flex flex-col divide-y divide-slate-200 rounded-lg border border-slate-200">
        {data?.items.map((repo) => (
          <li key={repo.id}>
            <Link
              to={`/repos/${repo.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
            >
              <div>
                <p className="font-medium text-slate-900">{repo.fullName}</p>
                {repo.description && <p className="text-sm text-slate-500">{repo.description}</p>}
              </div>
              {repo.isPrivate && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  private
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-slate-500">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
