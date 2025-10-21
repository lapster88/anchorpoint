import { test, expect } from '@playwright/test'

const toLocalDateTimeInput = (date: Date): string => {
  const pad = (value: number) => value.toString().padStart(2, '0')
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

test.describe('Guide availability management', () => {
  test('user can register and manage availability', async ({ page }) => {
    const timestamp = Date.now()
    const email = `guide+${timestamp}@example.com`
    const password = 'pass12345'

    await page.goto('/')
    await page.getByRole('button', { name: 'Need an account? Register' }).click()
    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').first().fill(password)
    const textInputs = page.locator('input[type="text"]')
    await textInputs.nth(0).fill('Test')
    await textInputs.nth(1).fill('Guide')
    await textInputs.nth(2).fill('Test Guide')
    await page.getByRole('button', { name: 'Create Account' }).click()

    await page.getByRole('link', { name: 'Profile' }).waitFor()
    await page.getByRole('link', { name: 'Profile' }).click()
    await page.getByRole('heading', { name: 'Profile' }).waitFor()

    const start = new Date(Date.now() + 24 * 60 * 60 * 1000)
    start.setMinutes(0, 0, 0)
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000)

    const [startInput, endInput] = await page.locator('input[type="datetime-local"]').all()
    await startInput.fill(toLocalDateTimeInput(start))
    await endInput.fill(toLocalDateTimeInput(end))
    await page.locator('input[placeholder="Optional context"]').fill('Prep climb')
    await page.getByRole('button', { name: 'Add availability' }).click()

    await expect(page.getByText('Availability added')).toBeVisible()

    const availabilityRow = page.locator('[data-testid^="availability-row-"]').first()
    await expect(availabilityRow).toBeVisible()

    const noteInput = availabilityRow.locator('input[type="text"]').first()
    await noteInput.fill('Updated climb')
    await availabilityRow.getByRole('button', { name: 'Save changes' }).click()
    await expect(noteInput).toHaveValue('Updated climb')

    page.once('dialog', dialog => dialog.accept())
    await availabilityRow.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('No availability slots yet.')).toBeVisible()
  })
})
