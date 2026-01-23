'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PoliciesApi, type Policy } from '@/lib/api-client'
import { Card, CardDivider } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { StatusBadge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { NativeSelect } from '@/components/ui/select'
import { DocumentIcon, PencilIcon, XIcon } from '@/components/ui/Icons'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { ensureMe, useMeStore } from '@/lib/store/me'
import {
  POLICY_CATEGORY_OPTIONS,
  POLICY_REGION_OPTIONS,
  POLICY_STATUS_OPTIONS,
  POLICY_CATEGORY_LABELS,
  POLICY_REGION_LABELS,
  POLICY_STATUS_LABELS,
} from '@/lib/domain/policy/constants'

function getNextVersions(current: string): { minor: string; major: string } {
  const match = current.match(/^(\d+)\.(\d+)$/)
  if (!match) return { minor: '1.1', major: '2.0' }
  const major = parseInt(match[1], 10)
  const minor = parseInt(match[2], 10)
  return {
    minor: `${major}.${minor + 1}`,
    major: `${major + 1}.0`,
  }
}

const EditPolicySchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  category: z.string().min(1, 'Category is required'),
  region: z.string().min(1, 'Region is required'),
  status: z.string().min(1, 'Status is required'),
  newVersion: z.string().min(1, 'New version is required'),
  effectiveDate: z.string().optional().nullable(),
  summary: z.string().max(1000).optional().nullable(),
  content: z.string().max(50000).optional().nullable(),
})

type FormData = z.infer<typeof EditPolicySchema>

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function PolicyDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [policy, setPolicy] = useState<Policy | null>(null)
  const me = useMeStore((s) => s.me)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(EditPolicySchema),
  })

  const category = watch('category')
  const region = watch('region')

  // Force region to ALL for CONDUCT category
  useEffect(() => {
    if (category === 'CONDUCT' && region !== 'ALL') {
      setValue('region', 'ALL', { shouldValidate: true })
    }
  }, [category, region, setValue])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [policyData] = await Promise.all([
        PoliciesApi.get(id),
        ensureMe().catch(() => null),
      ])
      setPolicy(policyData)

      // Initialize form
      const versions = getNextVersions(policyData.version)
      reset({
        title: policyData.title,
        category: policyData.category,
        region: policyData.region,
        status: policyData.status,
        newVersion: versions.minor,
        effectiveDate: policyData.effectiveDate?.split('T')[0],
        summary: policyData.summary,
        content: policyData.content,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load policy'
      setError(message)
      setPolicy(null)
    } finally {
      setLoading(false)
    }
  }, [id, reset])

  useEffect(() => {
    void load()
  }, [load])

  const canEdit = Boolean(me?.isHR || me?.isSuperAdmin)

  const onSubmit = async (data: FormData) => {
    setError(null)
    setSuccessMessage(null)

    try {
      const updated = await PoliciesApi.update(id, {
        title: data.title,
        category: data.category,
        region: data.region,
        status: data.status,
        version: data.newVersion,
        effectiveDate: data.effectiveDate,
        summary: data.summary,
        content: data.content,
      })
      setPolicy(updated)
      setIsEditing(false)
      setSuccessMessage('Policy updated successfully')

      // Re-initialize form with new version
      const newVersions = getNextVersions(updated.version)
      reset({
        title: updated.title,
        category: updated.category,
        region: updated.region,
        status: updated.status,
        newVersion: newVersions.minor,
        effectiveDate: updated.effectiveDate?.split('T')[0],
        summary: updated.summary,
        content: updated.content,
      })
    } catch (e: any) {
      setError(e.message || 'Failed to save policy')
    }
  }

  const cancelEdit = () => {
    if (!policy) return
    const versions = getNextVersions(policy.version)
    reset({
      title: policy.title,
      category: policy.category,
      region: policy.region,
      status: policy.status,
      newVersion: versions.minor,
      effectiveDate: policy.effectiveDate?.split('T')[0],
      summary: policy.summary,
      content: policy.content,
    })
    setIsEditing(false)
    setError(null)
  }

  const versions = policy ? getNextVersions(policy.version) : { minor: '1.1', major: '2.0' }

  if (loading) {
    return (
      <>
        <PageHeader
          title="Policy"
          description="Company Policies"
          icon={<DocumentIcon className="h-6 w-6 text-white" />}
          showBack
        />
        <div className="max-w-3xl mx-auto space-y-6">
          <Card padding="lg">
            <div className="animate-pulse space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-muted" />
                <div className="space-y-2 flex-1">
                  <div className="h-5 bg-muted rounded w-1/3" />
                  <div className="h-4 bg-muted rounded w-1/4" />
                </div>
              </div>
              <div className="h-32 bg-muted rounded" />
            </div>
          </Card>
        </div>
      </>
    )
  }

  if (!policy) {
    return (
      <>
        <PageHeader
          title="Policy"
          description="Company Policies"
          icon={<DocumentIcon className="h-6 w-6 text-white" />}
          showBack
        />
        <div className="max-w-3xl mx-auto space-y-6">
          <Card padding="lg">
            <p className="text-sm font-medium text-foreground">Policy not found</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </Card>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Policy"
        description="Company Policies"
        icon={<DocumentIcon className="h-6 w-6 text-white" />}
        showBack
      />

      <div className="max-w-3xl mx-auto space-y-6">

      {/* Alerts */}
      {error && (
        <Alert variant="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {successMessage && (
        <Alert variant="success" onDismiss={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}

      {/* Main content */}
      {isEditing ? (
        /* Edit Mode */
        <form onSubmit={handleSubmit(onSubmit)}>
          <Card padding="lg">
            {/* Edit header */}
            <div className="flex items-start justify-between gap-4 pb-6 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-accent/20 to-accent/5 ring-2 ring-accent/20">
                  <DocumentIcon className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-foreground">Edit Policy</h1>
                  <p className="text-sm text-muted-foreground">
                    Current version: v{policy.version}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={cancelEdit}
              >
                <XIcon className="h-5 w-5" />
              </Button>
            </div>

            <div className="pt-6 space-y-6">
              {/* Policy Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Policy Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2 space-y-2">
                    <Label htmlFor="title">
                      Title <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      {...register('title')}
                      placeholder="Policy title"
                      className={cn(errors.title && 'border-destructive')}
                    />
                    {errors.title && (
                      <p className="text-xs text-destructive">{errors.title.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category">
                      Category <span className="text-destructive">*</span>
                    </Label>
                    <NativeSelect
                      {...register('category')}
                      className={cn(errors.category && 'border-destructive')}
                    >
                      {POLICY_CATEGORY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </NativeSelect>
                    {errors.category && (
                      <p className="text-xs text-destructive">{errors.category.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="region">
                      Region <span className="text-destructive">*</span>
                    </Label>
                    <NativeSelect
                      {...register('region')}
                      disabled={category === 'CONDUCT'}
                      className={cn(errors.region && 'border-destructive')}
                    >
                      {POLICY_REGION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </NativeSelect>
                    {category === 'CONDUCT' && (
                      <p className="text-xs text-muted-foreground">Conduct policies apply to all regions</p>
                    )}
                    {errors.region && (
                      <p className="text-xs text-destructive">{errors.region.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="status">
                      Status <span className="text-destructive">*</span>
                    </Label>
                    <NativeSelect
                      {...register('status')}
                      className={cn(errors.status && 'border-destructive')}
                    >
                      {POLICY_STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </NativeSelect>
                    {errors.status && (
                      <p className="text-xs text-destructive">{errors.status.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="newVersion">
                      New Version <span className="text-destructive">*</span>
                    </Label>
                    <NativeSelect
                      {...register('newVersion')}
                      className={cn(errors.newVersion && 'border-destructive')}
                    >
                      <option value={versions.minor}>v{versions.minor} (Minor update)</option>
                      <option value={versions.major}>v{versions.major} (Major update)</option>
                    </NativeSelect>
                    {errors.newVersion && (
                      <p className="text-xs text-destructive">{errors.newVersion.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="effectiveDate">Effective Date</Label>
                    <Input {...register('effectiveDate')} type="date" />
                  </div>
                </div>
              </div>

              <CardDivider />

              {/* Summary */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Summary</h3>
                <div className="space-y-2">
                  <Textarea
                    {...register('summary')}
                    rows={3}
                    placeholder="Brief overview of the policy..."
                    className="resize-none"
                  />
                </div>
              </div>

              <CardDivider />

              {/* Content */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Policy Content</h3>
                <p className="text-xs text-muted-foreground">
                  Supports Markdown formatting (headings, lists, tables, etc.)
                </p>
                <div className="space-y-2">
                  <Textarea
                    {...register('content')}
                    rows={16}
                    placeholder="Full policy content..."
                    className="resize-none font-mono text-sm"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="pt-6 border-t border-border flex items-center justify-end gap-3">
                <Button type="button" variant="secondary" onClick={cancelEdit}>
                  Cancel
                </Button>
                <Button type="submit" loading={isSubmitting}>
                  Save Changes
                </Button>
              </div>
            </div>
          </Card>
        </form>
      ) : (
        /* View Mode */
        <div className="space-y-6">
          {/* Header card */}
          <Card padding="lg">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-accent/20 to-accent/5 ring-2 ring-accent/20">
                  <DocumentIcon className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-foreground">{policy.title}</h1>
                  <p className="text-sm text-muted-foreground">
                    Version {policy.version}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={POLICY_STATUS_LABELS[policy.status as keyof typeof POLICY_STATUS_LABELS] ?? policy.status} />
                {canEdit && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                    icon={<PencilIcon className="h-4 w-4" />}
                  >
                    Edit
                  </Button>
                )}
              </div>
            </div>

            {/* Details */}
            <div className="mt-6 pt-6 border-t border-border">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Category</p>
                  <p className="text-sm text-foreground">
                    {POLICY_CATEGORY_LABELS[policy.category as keyof typeof POLICY_CATEGORY_LABELS] ?? policy.category}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Region</p>
                  <p className="text-sm text-foreground">
                    {POLICY_REGION_LABELS[policy.region as keyof typeof POLICY_REGION_LABELS] ?? policy.region}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Effective Date</p>
                  <p className="text-sm text-foreground">{formatDate(policy.effectiveDate)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Last Updated</p>
                  <p className="text-sm text-foreground">{formatDate(policy.updatedAt)}</p>
                </div>
              </div>

              {policy.summary && (
                <div className="mt-6">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Summary</p>
                  <p className="text-sm text-foreground whitespace-pre-line">{policy.summary}</p>
                </div>
              )}
            </div>
          </Card>

          {/* Policy content */}
          {policy.content && (
            <Card padding="lg">
              <h2 className="text-sm font-semibold text-foreground mb-4">Policy Content</h2>
              <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-headings:font-semibold prose-h1:text-xl prose-h2:text-lg prose-h2:border-b prose-h2:border-border/50 prose-h2:pb-2 prose-h2:mt-6 prose-table:text-sm prose-th:bg-muted/50 prose-th:text-foreground prose-th:p-2 prose-th:border prose-th:border-border prose-td:p-2 prose-td:border prose-td:border-border prose-strong:text-foreground prose-a:text-accent hover:prose-a:text-accent/80 [&_mark]:bg-accent/20 [&_mark]:text-foreground [&_mark]:rounded [&_mark]:px-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {policy.content}
                </ReactMarkdown>
              </div>
            </Card>
          )}

          {/* Created date */}
          {policy.createdAt && (
            <p className="text-sm text-muted-foreground text-center">
              Created on {formatDate(policy.createdAt)}
            </p>
          )}
        </div>
      )}
      </div>
    </>
  )
}
