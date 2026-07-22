import { expect, test } from '@playwright/test';

test('an unauthenticated visitor is redirected to /login', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required' } }),
    }),
  );

  await page.goto('/');

  await expect(page).toHaveURL(/\/login$/);
  const githubLink = page.getByRole('link', { name: 'Continue with GitHub' });
  await expect(githubLink).toBeVisible();
  await expect(githubLink).toHaveAttribute('href', /\/api\/auth\/github$/);
});

test('shows the state-mismatch error message from a failed OAuth callback', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Sign in required' } }),
    }),
  );

  await page.goto('/login?error=state_mismatch');

  await expect(page.getByText('Login session expired')).toBeVisible();
});
