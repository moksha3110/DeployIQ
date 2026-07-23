import { RepoList } from '../components/RepoList';
import { useCurrentUser } from '../lib/auth';
import { Card, CardContent } from '../components/ui/card';

export function Dashboard() {
  const { data: user } = useCurrentUser();

  return (
    <main className="flex flex-col gap-6 px-6 py-8">
      {user && (
        <Card>
          <CardContent className="flex flex-row items-center gap-3 pt-4">
            {user.avatarUrl && (
              <img src={user.avatarUrl} alt={user.username} className="h-10 w-10 rounded-full" />
            )}
            <div>
              <p className="font-medium text-foreground">{user.username}</p>
              <p className="text-sm text-muted-foreground">{user.email ?? 'no public email'}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-foreground">Repositories</h2>
        <RepoList />
      </section>
    </main>
  );
}
