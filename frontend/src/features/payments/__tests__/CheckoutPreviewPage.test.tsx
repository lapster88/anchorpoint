import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import CheckoutPreviewPage from '../CheckoutPreviewPage'

function renderPreview(path = '/payments/preview?party=42&amount=12345&session=cs_test_123'){
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/payments/preview" element={<CheckoutPreviewPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('CheckoutPreviewPage', () => {
  it('renders party details from the query string', () => {
    renderPreview()

    expect(screen.getByText(/Stripe Checkout Preview/)).toBeInTheDocument()
    expect(screen.getByText(/Party snapshot/i)).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('$123.45')).toBeInTheDocument()
    expect(screen.getByText('cs_test_123')).toBeInTheDocument()
  })

  it('falls back to legacy booking query param', () => {
    renderPreview('/payments/preview?booking=99&amount=5000&session=cs_test_legacy')

    expect(screen.getByText('99')).toBeInTheDocument()
    expect(screen.getByText('$50.00')).toBeInTheDocument()
    expect(screen.getByText('cs_test_legacy')).toBeInTheDocument()
  })

  it('handles missing or invalid query params', () => {
    renderPreview('/payments/preview?amount=not-a-number')

    expect(screen.getByText('Unknown')).toBeInTheDocument()
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
    expect(screen.getByText('Not generated')).toBeInTheDocument()
  })
})
