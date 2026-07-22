import { expect, test } from '@playwright/test';

test('a failed deployment shows the AI diagnosis card', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'user-1',
        username: 'testuser',
        avatarUrl: null,
        email: null,
      }),
    }),
  );

  const deployment = {
    id: 'deploy-failed-1',
    repositoryId: 'repo-1',
    repositoryFullName: 'testuser/calculator-devops',
    branch: 'main',
    commitSha: 'deadbeef1234',
    status: 'DEPLOY_FAILED',
    triggeredBy: 'MANUAL',
    publicUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await page.route('**/api/deployments/deploy-failed-1', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(deployment),
    }),
  );
  await page.route('**/api/deployments/deploy-failed-1/logs', (route) =>
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }),
  );
  await page.route('**/api/deployments/deploy-failed-1/metrics', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        podCount: 1,
        desiredReplicas: 1,
        availableReplicas: 0,
        cpuCores: 0,
        memoryBytes: 0,
        restarts: 8,
      }),
    }),
  );
  await page.route('**/api/deployments/deploy-failed-1/metrics/history*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ cpu: [], memory: [] }),
    }),
  );
  await page.route('**/api/deployments/deploy-failed-1/analysis', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        rootCause: 'The container crash-looped because it never bound to the expected port.',
        suggestedFixes: [
          'Verify the Dockerfile EXPOSE matches the port the app actually listens on.',
          'Check the app logs for a startup error.',
        ],
        likelyConfigIssue: 'Dockerfile EXPOSE port',
        confidence: 0.72,
        createdAt: new Date().toISOString(),
      }),
    }),
  );

  await page.goto('/deployments/deploy-failed-1');

  await expect(page.getByText('DEPLOY_FAILED')).toBeVisible();
  await expect(page.getByText('AI Diagnosis')).toBeVisible();
  await expect(page.getByText('High confidence (72%)')).toBeVisible();
  await expect(page.getByText(/never bound to the expected port/)).toBeVisible();
  await expect(page.getByText('Dockerfile EXPOSE port')).toBeVisible();
  await expect(page.getByText(/Verify the Dockerfile EXPOSE/)).toBeVisible();

  // Restarts > 0 should render as a warning, not a neutral stat.
  const restartsValue = page.locator('p.text-amber-600', { hasText: '8' });
  await expect(restartsValue).toBeVisible();
});
