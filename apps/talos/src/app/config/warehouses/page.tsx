'use client'

import { Suspense } from 'react'
import { Building } from '@/lib/lucide-icons'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { PageContainer, PageHeaderSection, PageContent } from '@/components/layout/page-container'
import WarehousesPanel from './warehouses-panel'

export default function WarehousesPage() {
  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <div className="p-6">Loading warehouses...</div>
        </DashboardLayout>
      }
    >
      <WarehousesPageContent />
    </Suspense>
  )
}

function WarehousesPageContent() {
  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeaderSection
          title="Warehouses"
          description="Configuration"
          icon={Building}
        />
        <PageContent>
          <WarehousesPanel />
        </PageContent>
      </PageContainer>
    </DashboardLayout>
  )
}
