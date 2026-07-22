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

export interface DeploymentMetrics {
  podCount: number;
  desiredReplicas: number;
  availableReplicas: number;
  cpuCores: number;
  memoryBytes: number;
  restarts: number;
}

export interface MetricSample {
  timestamp: number; // epoch millis
  value: number;
}

export interface DeploymentMetricsHistory {
  cpu: MetricSample[];
  memory: MetricSample[];
}

export type MetricsRange = '1h' | '24h' | '7d' | '30d';

export interface DeploymentAnalysis {
  rootCause: string;
  suggestedFixes: string[];
  likelyConfigIssue: string | null;
  confidence: number;
  createdAt: string;
}

export interface AutoDeployStatus {
  enabled: boolean;
}

export interface HealthScoreFactor {
  category: string;
  deduction: number;
  reason: string;
}

export interface HealthScore {
  score: number;
  label: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Critical';
  factors: HealthScoreFactor[];
  metrics: DeploymentMetrics;
}

export interface HealthScoreHistoryPoint {
  timestamp: string;
  score: number;
  restarts: number;
  availableReplicas: number;
  desiredReplicas: number;
}

export type RecommendationSeverity = 'low' | 'medium' | 'high';
export type RecommendationCategory =
  | 'resource-limits'
  | 'probes'
  | 'autoscaling'
  | 'availability'
  | 'other';

export interface Recommendation {
  category: RecommendationCategory;
  severity: RecommendationSeverity;
  problem: string;
  reason: string;
  impact: string;
  fix: string;
}

export interface RecommendationsResponse {
  recommendations: Recommendation[];
  aiConfigured: boolean;
}

export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low';
export type SecurityGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface SecurityFinding {
  id: string;
  severity: SecuritySeverity;
  title: string;
  description: string;
  fix: string;
}

export interface SecurityScore {
  score: number;
  grade: SecurityGrade;
  findings: SecurityFinding[];
}

export type IncidentType =
  | 'CRASH_LOOP_BACKOFF'
  | 'IMAGE_PULL_ERROR'
  | 'OOM_KILLED'
  | 'PENDING_UNSCHEDULABLE'
  | 'OTHER';
export type IncidentPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentStatus = 'OPEN' | 'RESOLVED';

export interface Incident {
  id: string;
  type: IncidentType;
  status: IncidentStatus;
  priority: IncidentPriority;
  rootCause: string;
  recommendedAction: string;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
}

export interface CostBreakdown {
  replicas: number;
  requestedCpuCores: number;
  requestedMemoryGB: number;
  actualCpuCores: number;
  actualMemoryGB: number;
  monthlyCpuCost: number;
  monthlyMemoryCost: number;
  monthlyCost: number;
  optimizedMonthlyCost: number;
  potentialMonthlySavings: number;
  pricingNote: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
