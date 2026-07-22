import { expect, test } from '@playwright/test';

const USER = {
  id: 'user-1',
  username: 'testuser',
  avatarUrl: null,
  email: 'testuser@example.com',
};

const REPOS = [
  {
    id: '111',
    name: 'calculator-devops',
    fullName: 'testuser/calculator-devops',
    description: 'A Flask calculator app',
    defaultBranch: 'main',
    isPrivate: false,
    htmlUrl: 'https://github.com/testuser/calculator-devops',
    updatedAt: new Date().toISOString(),
  },
  {
    id: '222',
    name: 'aws-iot-platform',
    fullName: 'testuser/aws-iot-platform',
    description: null,
    defaultBranch: 'main',
    isPrivate: true,
    htmlUrl: 'https://github.com/testuser/aws-iot-platform',
    updatedAt: new Date().toISOString(),
  },
];

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USER) }),
  );
});

test('dashboard lists repos and search narrows the results', async ({ page }) => {
  await page.route('**/api/repos?*', (route) => {
    const url = new URL(route.request().url());
    const search = url.searchParams.get('search')?.toLowerCase() ?? '';
    const items = REPOS.filter((r) => r.fullName.toLowerCase().includes(search));
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items, page: 1, pageSize: 10, total: items.length }),
    });
  });

  await page.goto('/');

  await expect(page.getByText('testuser/calculator-devops')).toBeVisible();
  await expect(page.getByText('testuser/aws-iot-platform')).toBeVisible();
  await expect(page.getByText('private')).toBeVisible();

  await page.getByPlaceholder('Search repositories...').fill('calculator');
  await expect(page.getByText('testuser/aws-iot-platform')).toBeHidden();
  await expect(page.getByText('testuser/calculator-devops')).toBeVisible();
});

test('deploying a repo navigates to the new deployment and shows its status', async ({ page }) => {
  await page.route('**/api/repos/111', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(REPOS[0]) }),
  );
  await page.route('**/api/repos/111/branches', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ name: 'main', isDefault: true }]),
    }),
  );
  await page.route('**/api/repos/111/auto-deploy', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enabled: false }),
    }),
  );
  await page.route('**/api/deployments?*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], page: 1, pageSize: 20, total: 0 }),
    }),
  );
  await page.route('**/api/deployments', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ deploymentId: 'deploy-123' }),
    });
  });

  const deployment = {
    id: 'deploy-123',
    repositoryId: 'repo-1',
    repositoryFullName: 'testuser/calculator-devops',
    branch: 'main',
    commitSha: 'abc1234567890',
    status: 'RUNNING',
    triggeredBy: 'MANUAL',
    publicUrl: 'http://localhost:54321',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await page.route('**/api/deployments/deploy-123', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(deployment),
    }),
  );
  await page.route('**/api/deployments/deploy-123/logs', (route) =>
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }),
  );
  await page.route('**/api/deployments/deploy-123/metrics', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        podCount: 1,
        desiredReplicas: 1,
        availableReplicas: 1,
        cpuCores: 0.0004,
        memoryBytes: 23 * 1024 * 1024,
        restarts: 0,
      }),
    }),
  );
  await page.route('**/api/deployments/deploy-123/metrics/history*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ cpu: [], memory: [] }),
    }),
  );

  await page.goto('/repos/111');
  await expect(page.getByRole('heading', { name: 'testuser/calculator-devops' })).toBeVisible();

  await page.getByRole('button', { name: /^Deploy "main"$/ }).click();

  await expect(page).toHaveURL(/\/deployments\/deploy-123$/);
  await expect(page.getByText('RUNNING')).toBeVisible();
  await expect(page.getByRole('link', { name: 'http://localhost:54321' })).toBeVisible();
});
