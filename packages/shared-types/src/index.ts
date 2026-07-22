// Shared between apps/frontend and apps/backend so API contracts can't
// silently drift. Mirrors the enums in apps/backend/prisma/schema.prisma —
// keep them in sync by hand for now; a future milestone can generate this
// file from the Prisma schema if drift becomes a real problem.

export type DeploymentStatus =
  | 'PENDING'
  | 'CLONING'
  | 'BUILDING'
  | 'BUILD_FAILED'
  | 'PUSHING'
  | 'DEPLOYING'
  | 'RUNNING'
  | 'DEPLOY_FAILED'
  | 'STOPPED';

export type TriggerSource = 'MANUAL' | 'WEBHOOK' | 'REDEPLOY' | 'ROLLBACK';

export interface HealthResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

export interface UserProfile {
  id: string;
  username: string;
  avatarUrl: string | null;
  email: string | null;
}

export interface RepositorySummary {
  // The GitHub repo id (not yet a Repository row in our DB — we don't
  // persist one until Milestone 3, when a deploy first references it).
  id: string;
  name: string;
  fullName: string;
  description: string | null;
  defaultBranch: string;
  isPrivate: boolean;
  htmlUrl: string;
  updatedAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface BranchSummary {
  name: string;
  isDefault: boolean;
}

export interface DeploymentSummary {
  id: string;
  repositoryId: string;
  branch: string;
  commitSha: string;
  status: DeploymentStatus;
  triggeredBy: TriggerSource;
  publicUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
