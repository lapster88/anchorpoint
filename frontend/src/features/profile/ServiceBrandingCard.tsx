import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChangeEvent, useRef, useState } from 'react'

import {
  deleteGuideServiceLogo,
  getGuideServiceSettings,
  GuideServiceSettings,
  ServiceMembership,
  uploadGuideServiceLogo
} from './api'

type Props = {
  membership: ServiceMembership
}

const MAX_FILE_BYTES = 2 * 1024 * 1024

export default function ServiceBrandingCard({ membership }: Props){
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const settingsQuery = useQuery({
    queryKey: ['service-settings', membership.guide_service],
    queryFn: () => getGuideServiceSettings(membership.guide_service),
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadGuideServiceLogo(membership.guide_service, file),
    onMutate: () => {
      setError(null)
      setSuccess(null)
    },
    onSuccess: (data: GuideServiceSettings) => {
      queryClient.setQueryData(['service-settings', membership.guide_service], data)
      queryClient.invalidateQueries({ queryKey: ['memberships'] })
      setSuccess('Logo updated')
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail || err?.message || 'Unable to upload logo.'
      setError(String(detail))
    }
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteGuideServiceLogo(membership.guide_service),
    onMutate: () => {
      setError(null)
      setSuccess(null)
    },
    onSuccess: () => {
      queryClient.setQueryData<GuideServiceSettings | undefined>(
        ['service-settings', membership.guide_service],
        (prev) => (prev ? { ...prev, logo_url: null } : prev)
      )
      queryClient.invalidateQueries({ queryKey: ['memberships'] })
      setSuccess('Logo removed')
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail || err?.message || 'Unable to remove logo.'
      setError(String(detail))
    }
  })

  const isSaving = uploadMutation.isPending || deleteMutation.isPending
  const settings = settingsQuery.data
  const logoUrl = settings?.logo_url ?? membership.guide_service_logo_url ?? null

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      setError('Logo must be 2 MB or smaller.')
      event.target.value = ''
      return
    }
    const type = file.type || ''
    if (!['image/png', 'image/jpeg', 'image/svg+xml'].includes(type)) {
      setError('Upload PNG, JPEG, or SVG files only.')
      event.target.value = ''
      return
    }
    await uploadMutation.mutateAsync(file)
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  return (
    <section className="border rounded-lg bg-white shadow p-5 space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{membership.guide_service_name}</h3>
          {settings && (
            <p className="text-xs text-gray-500">
              {settings.contact_email}
              {settings.phone ? ` · ${settings.phone}` : ''}
            </p>
          )}
        </div>
        <span className="text-xs uppercase tracking-wide text-gray-500">Branding</span>
      </header>
      <div className="flex flex-col sm:flex-row sm:items-center gap-6">
        <div className="w-40 h-40 border border-dashed rounded-lg flex items-center justify-center bg-slate-50 overflow-hidden">
          {logoUrl ? (
            <img src={logoUrl} alt={`${membership.guide_service_name} logo`} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-gray-500 text-center px-4">No logo uploaded yet</span>
          )}
        </div>
        <div className="flex-1 space-y-3 text-sm">
          <div className="space-y-1">
            <p className="font-medium text-gray-700">Upload new logo</p>
            <p className="text-xs text-gray-500">PNG, JPEG, or SVG • max 2 MB</p>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              onChange={handleFileChange}
              disabled={isSaving}
              className="text-sm"
              aria-label="Upload new logo"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-sm text-blue-600 underline disabled:opacity-50"
              onClick={async () => {
                await deleteMutation.mutateAsync()
              }}
              disabled={isSaving || !logoUrl}
            >
              Remove logo
            </button>
            {isSaving && <span className="text-xs text-gray-500">Saving…</span>}
            {success && <span className="text-xs text-green-600">{success}</span>}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </section>
  )
}
