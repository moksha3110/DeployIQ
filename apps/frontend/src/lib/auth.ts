import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserProfile } from '@platform/shared-types';
import { apiFetch, ApiError, API_BASE_URL } from './api';

const CURRENT_USER_QUERY_KEY = ['currentUser'];

async function fetchCurrentUser(): Promise<UserProfile | null> {
  try {
    return await apiFetch<UserProfile>('/api/auth/me');
  } catch (err) {
    // 401 means "not logged in", a valid steady state — not a fetch failure.
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export function useCurrentUser() {
  return useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: fetchCurrentUser,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    queryClient.setQueryData<UserProfile | null>(CURRENT_USER_QUERY_KEY, null);
  };
}

export function githubLoginUrl(): string {
  return `${API_BASE_URL}/api/auth/github`;
}
