import { test, expect } from '@playwright/test'

test.describe('Staff trip workflow', () => {
  test('owner can create a party and receive stub links', async ({ page }) => {
    const authResponse = await page.request.post('http://backend:8000/api/auth/login/', {
      data: {
        email: 'owner@summitguides.test',
        password: 'Anchorpoint123!'
      }
    })
    const authPayload = await authResponse.json()
    await page.addInitScript(([key, value]) => {
      window.localStorage.setItem(key, value)
    }, ['anchorpoint.auth', JSON.stringify(authPayload)])

    const membershipsResponse = page.waitForResponse(resp =>
      resp.url().includes('/api/auth/memberships/') && resp.status() === 200
    )
    const tripsResponse = page.waitForResponse(resp =>
      resp.url().includes('/api/trips/') && resp.status() === 200
    )

    await page.goto('/')
    await Promise.all([membershipsResponse, tripsResponse])
    await expect(page.getByRole('heading', { name: 'Anchorpoint' })).toBeVisible()

    const manageTripButton = page.getByRole('button', { name: 'Manage trip' }).first()
    await expect(manageTripButton).toBeVisible({ timeout: 30000 })
    await manageTripButton.click()

    const timestamp = Date.now()
    await page.getByLabel(/^Email/, { exact: false }).fill(`guest+${timestamp}@example.test`)
    await page.locator('form button[type="submit"]').first().click()

    await expect(page.getByText('Party created')).toBeVisible()
    await expect(page.getByText(/payments\/preview/)).toBeVisible()
    await expect(page.getByText(/guest\?token=/)).toBeVisible()
  })
})
