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
  id: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
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
