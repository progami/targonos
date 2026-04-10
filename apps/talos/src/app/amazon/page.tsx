'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { useSession } from '@/hooks/usePortalSession'
import { redirectToPortal } from '@/lib/portal'
import { withBasePath } from '@/lib/utils/base-path'
import { AMAZON_WORKSPACE_TOOLS } from '@/lib/amazon/workspace'
import { PageContainer, PageContent, PageHeaderSection } from '@/components/layout/page-container'
import { AmazonWorkspaceSwitcher } from '@/components/amazon/amazon-workspace-switcher'
import {
  ArrowRight,
  LayoutGrid,
  Loader2,
  Sparkles,
} from '@/lib/lucide-icons'

const ALLOWED_ROLES = ['admin', 'staff'] as const

export default function AmazonPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const workspaceTools = AMAZON_WORKSPACE_TOOLS.filter((tool) => tool.href !== '/amazon')

  const isAllowed =
    session !== null &&
    ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])

  useEffect(() => {
    if (status === 'loading') return

    if (!session) {
      redirectToPortal('/login', `${window.location.origin}${withBasePath('/amazon')}`)
      return
    }

    if (!isAllowed) {
      toast.error('You are not authorised to view this page')
      router.push('/dashboard')
    }
  }, [isAllowed, router, session, status])

  if (status === 'loading') {
    return (
      <PageContainer>
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-600" />
            <span className="text-sm text-slate-500">Loading...</span>
          </div>
        </div>
      </PageContainer>
    )
  }

  if (!session || !isAllowed) return null

  const tenantCode = session.user.region

  return (
    <PageContainer>
      <PageHeaderSection
        title="Amazon Workspace"
        description="Live fee and replenishment controls"
        icon={LayoutGrid}
        metadata={<AmazonWorkspaceSwitcher currentHref="/amazon" />}
      />

      <PageContent className="space-y-6">
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)]">
          <div className="rounded-[28px] border border-slate-200/80 bg-white px-6 py-6 shadow-soft dark:border-slate-700/80 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700/75 dark:text-cyan-400/75">
              <span>{tenantCode} marketplace</span>
              <span className="h-1 w-1 rounded-full bg-cyan-500/60" />
              <span>{workspaceTools.length} live tools</span>
            </div>

            <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(240px,0.8fr)]">
              <div className="space-y-4">
                <h2 className="max-w-2xl text-[clamp(2rem,3.2vw,3.25rem)] font-semibold leading-[0.96] tracking-[-0.06em] text-slate-950 dark:text-slate-50">
                  Cost intelligence, fee references, and shipment planning in one Talos surface.
                </h2>
                <p className="max-w-[64ch] text-sm leading-7 text-slate-600 dark:text-slate-300">
                  The Amazon section now exposes the live tools that operators actually use. Jump
                  between rate cards, fee audits, and replenishment planning without bouncing
                  through unrelated areas like Products or memorising route paths.
                </p>
              </div>

              <div className="rounded-3xl border border-slate-200/80 bg-slate-50 px-5 py-5 dark:border-slate-700/80 dark:bg-slate-950/70">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  <Sparkles className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                  Recommended flow
                </div>
                <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-700 dark:text-slate-300">
                  <li>1. Audit fee mismatches when Amazon inputs drift from your reference package data.</li>
                  <li>2. Check the fee tables before updating reference costs or reviewing rate-card changes.</li>
                  <li>3. Use shipment planning to turn low-stock risk into an actual replenishment move.</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-[24px] border border-slate-200/80 bg-white px-5 py-5 shadow-soft dark:border-slate-700/80 dark:bg-slate-900">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                Workspace coverage
              </p>
              <div className="mt-4 flex items-end gap-3">
                <span className="text-5xl font-semibold tracking-[-0.08em] text-slate-950 dark:text-slate-50">
                  {workspaceTools.length}
                </span>
                <span className="pb-2 text-sm text-slate-500 dark:text-slate-400">
                  surfaced tools
                </span>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                The sidebar now exposes live Amazon workflows directly instead of leaving them behind
                unlinked URLs.
              </p>
            </div>

            <div className="rounded-[24px] border border-slate-200/80 bg-slate-50 px-5 py-5 dark:border-slate-700/80 dark:bg-slate-950/70">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                What stays hidden
              </p>
              <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-slate-300">
                Under-construction routes like Market Orders and Reorder stay out of the primary nav
                until they are ready for real operator use.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_repeat(2,minmax(0,1fr))]">
          {workspaceTools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group rounded-[28px] border border-slate-200/80 bg-white px-5 py-5 shadow-soft transition-all hover:-translate-y-0.5 hover:border-cyan-300/70 hover:bg-slate-50 dark:border-slate-700/80 dark:bg-slate-900 dark:hover:border-cyan-500/40 dark:hover:bg-slate-900/90"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700/75 dark:text-cyan-400/75">
                    {tool.note}
                  </p>
                  <h3 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-slate-950 dark:text-slate-50">
                    {tool.name}
                  </h3>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3 text-slate-700 dark:border-slate-700/80 dark:bg-slate-950/70 dark:text-slate-200">
                  <tool.icon className="h-5 w-5" />
                </div>
              </div>

              <p className="mt-4 max-w-[34ch] text-sm leading-7 text-slate-600 dark:text-slate-300">
                {tool.description}
              </p>
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{tool.note}</p>

              <div className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-cyan-700 dark:text-cyan-400">
                Open tool
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </section>
      </PageContent>
    </PageContainer>
  )
}
