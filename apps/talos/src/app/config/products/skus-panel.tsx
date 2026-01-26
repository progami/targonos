'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'react-hot-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PortalModal } from '@/components/ui/portal-modal'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchWithCSRF } from '@/lib/fetch-with-csrf'
import { SKU_FIELD_LIMITS } from '@/lib/sku-constants'
import {
  calculateFbaFeeForTenant,
  calculateSizeTierForTenant,
  getReferralFeePercentForTenant,
  normalizeReferralCategory2026,
  UK_SIZE_TIER_DEFINITIONS_2026,
} from '@/lib/amazon/fees'
import { resolveDimensionTripletCm } from '@/lib/sku-dimensions'
import { useSession } from '@/hooks/usePortalSession'
import type { TenantCode } from '@/lib/tenant/constants'
import { usePageState } from '@/lib/store/page-state'
import { ChevronDown, ChevronRight, ExternalLink, Loader2, Package2, Plus, Search, Trash2 } from '@/lib/lucide-icons'
import { SkuBatchesPanel } from './sku-batches-modal'

const PAGE_KEY = '/config/products'

type SkuModalTab = 'reference' | 'amazon'

const AMAZON_REFERRAL_CATEGORIES_2026 = [
  'Amazon Device Accessories',
  'Appliances - Compact',
  'Appliances - Full-size',
  'Automotive and Powersports',
  'Baby Products',
  'Backpacks, Handbags, Luggage',
  'Base Equipment Power Tools',
  'Beauty, Health, Personal Care',
  'Books',
  'Business, Industrial, Scientific',
  'Clothing and Accessories',
  'Computers',
  'Consumer Electronics',
  'DVD',
  'Electronics Accessories',
  'Everything Else',
  'Eyewear',
  'Fine Art',
  'Footwear',
  'Furniture',
  'Gift Cards',
  'Grocery and Gourmet',
  'Home and Kitchen',
  'Jewelry',
  'Lawn and Garden',
  'Lawn Mowers & Snow Throwers',
  'Mattresses',
  'Merchant Fulfilled Services',
  'Music',
  'Musical Instruments & AV',
  'Office Products',
  'Pet Supplies',
  'Software',
  'Sports and Outdoors',
  'Tires',
  'Tools and Home Improvement',
  'Toys and Games',
  'Video',
  'Video Game Consoles',
  'Video Games & Gaming Accessories',
  'Watches',
] as const

type AmazonReferralCategory = (typeof AMAZON_REFERRAL_CATEGORIES_2026)[number]

function formatReferralCategoryLabel(category: AmazonReferralCategory): string {
  return category
}

const AMAZON_SIZE_TIER_OPTIONS = [
  'Small Standard-Size',
  'Large Standard-Size',
  'Small Bulky',
  'Large Bulky',
  'Extra-Large 0 to 50 lb',
  'Extra-Large 50+ to 70 lb',
  'Extra-Large 70+ to 150 lb',
  'Extra-Large 150+ lb',
  'Overmax 0 to 150 lb',
  'Small and Light',
] as const

const UK_SIZE_TIER_OPTIONS = UK_SIZE_TIER_DEFINITIONS_2026.map(entry => entry.tier)

interface SkuBatchRow {
  id: string
  batchCode: string
  description: string | null
  productionDate: string | null
  expiryDate: string | null
  packSize: number | null
  unitsPerCarton: number | null
  material: string | null
  amazonSizeTier: string | null
  amazonFbaFulfillmentFee: number | string | null
  amazonReferenceWeightKg: number | string | null
  cartonDimensionsCm: string | null
  cartonSide1Cm: number | string | null
  cartonSide2Cm: number | string | null
  cartonSide3Cm: number | string | null
  cartonWeightKg: number | string | null
  packagingType: string | null
  storageCartonsPerPallet: number | null
  shippingCartonsPerPallet: number | null
  createdAt: string
  updatedAt: string
}

interface SkuRow {
  id: string
  skuCode: string
  description: string
  asin: string | null
  category?: string | null
  subcategory?: string | null
  sizeTier?: string | null
  referralFeePercent?: number | string | null
  fbaFulfillmentFee?: number | string | null
  amazonCategory?: string | null
  amazonSubcategory?: string | null
  amazonSizeTier?: string | null
  amazonReferralFeePercent?: number | string | null
  amazonFbaFulfillmentFee?: number | string | null
  amazonListingPrice?: number | string | null
  amazonReferenceWeightKg: number | string | null
  amazonItemPackageDimensionsCm: string | null
  amazonItemPackageSide1Cm: number | string | null
  amazonItemPackageSide2Cm: number | string | null
  amazonItemPackageSide3Cm: number | string | null
  amazonItemDimensionsCm: string | null
  amazonItemSide1Cm: number | string | null
  amazonItemSide2Cm: number | string | null
  amazonItemSide3Cm: number | string | null
  amazonItemWeightKg: number | string | null
  unitDimensionsCm: string | null
  unitSide1Cm: number | string | null
  unitSide2Cm: number | string | null
  unitSide3Cm: number | string | null
  unitWeightKg: number | string | null
  itemDimensionsCm?: string | null
  itemSide1Cm?: number | string | null
  itemSide2Cm?: number | string | null
  itemSide3Cm?: number | string | null
  itemWeightKg?: number | string | null
  packSize: number | null
  defaultSupplierId?: string | null
  secondarySupplierId?: string | null
  _count?: { inventoryTransactions: number }
  batches?: SkuBatchRow[]
}

interface SupplierOption {
  id: string
  name: string
}

interface SkuFormState {
  skuCode: string
  description: string
  asin: string
  category: string
  subcategory: string
  sizeTier: string
  referralFeePercent: string
  fbaFulfillmentFee: string
  amazonCategory: string
  amazonSubcategory: string
  amazonSizeTier: string
  amazonReferralFeePercent: string
  amazonFbaFulfillmentFee: string
  unitSide1Cm: string
  unitSide2Cm: string
  unitSide3Cm: string
  unitWeightKg: string
  amazonItemPackageSide1Cm: string
  amazonItemPackageSide2Cm: string
  amazonItemPackageSide3Cm: string
  amazonItemPackageWeightKg: string
  itemSide1Cm: string
  itemSide2Cm: string
  itemSide3Cm: string
  itemWeightKg: string
  amazonItemSide1Cm: string
  amazonItemSide2Cm: string
  amazonItemSide3Cm: string
  amazonItemWeightKg: string
  defaultSupplierId: string
  secondarySupplierId: string
  initialBatch: {
    batchCode: string
    packSize: string
    unitsPerCarton: string
    packagingType: string
  }
}

function buildFormState(sku?: SkuRow | null): SkuFormState {
  const latestBatch = sku?.batches && sku.batches.length > 0 ? sku.batches[0] : null

  const unitTriplet = resolveDimensionTripletCm({
    side1Cm: sku?.unitSide1Cm,
    side2Cm: sku?.unitSide2Cm,
    side3Cm: sku?.unitSide3Cm,
    legacy: sku?.unitDimensionsCm,
  })
  const amazonItemPackageTriplet = resolveDimensionTripletCm({
    side1Cm: sku?.amazonItemPackageSide1Cm,
    side2Cm: sku?.amazonItemPackageSide2Cm,
    side3Cm: sku?.amazonItemPackageSide3Cm,
    legacy: sku?.amazonItemPackageDimensionsCm,
  })
  const amazonItemTriplet = resolveDimensionTripletCm({
    side1Cm: sku?.amazonItemSide1Cm,
    side2Cm: sku?.amazonItemSide2Cm,
    side3Cm: sku?.amazonItemSide3Cm,
    legacy: sku?.amazonItemDimensionsCm,
  })

  // Parse item dimensions from individual values or legacy combined string
  let side1 = ''
  let side2 = ''
  let side3 = ''

  if (sku?.itemSide1Cm != null) {
    side1 = String(sku.itemSide1Cm)
  }
  if (sku?.itemSide2Cm != null) {
    side2 = String(sku.itemSide2Cm)
  }
  if (sku?.itemSide3Cm != null) {
    side3 = String(sku.itemSide3Cm)
  }

  // Fallback to parsing legacy combined string if individual values not present
  if (!side1 && !side2 && !side3 && sku?.itemDimensionsCm) {
    const parts = sku.itemDimensionsCm.split(/[x×]/i).map(p => p.trim())
    if (parts.length === 3) {
      side1 = parts[0]
      side2 = parts[1]
      side3 = parts[2]
    }
  }

  let category = ''
  if (sku?.category) {
    category = sku.category
  } else if (sku?.amazonCategory) {
    const normalizedAmazonCategory = normalizeReferralCategory2026(sku.amazonCategory)
    if (normalizedAmazonCategory) category = normalizedAmazonCategory
  }

  return {
    skuCode: sku?.skuCode ?? '',
    description: sku?.description ?? '',
    asin: sku?.asin ?? '',
    category,
    subcategory: sku?.subcategory ?? '',
    sizeTier: sku?.sizeTier ?? '',
    referralFeePercent: sku?.referralFeePercent?.toString?.() ?? '',
    fbaFulfillmentFee: sku?.fbaFulfillmentFee?.toString?.() ?? '',
    amazonCategory: sku?.amazonCategory ?? '',
    amazonSubcategory: sku?.amazonSubcategory ?? '',
    amazonSizeTier: latestBatch?.amazonSizeTier ?? '',
    amazonReferralFeePercent: sku?.amazonReferralFeePercent?.toString?.() ?? '',
    amazonFbaFulfillmentFee: latestBatch?.amazonFbaFulfillmentFee?.toString?.() ?? '',
    unitSide1Cm: unitTriplet ? String(unitTriplet.side1Cm) : '',
    unitSide2Cm: unitTriplet ? String(unitTriplet.side2Cm) : '',
    unitSide3Cm: unitTriplet ? String(unitTriplet.side3Cm) : '',
    unitWeightKg: sku?.unitWeightKg?.toString?.() ?? '',
    amazonItemPackageSide1Cm: amazonItemPackageTriplet ? String(amazonItemPackageTriplet.side1Cm) : '',
    amazonItemPackageSide2Cm: amazonItemPackageTriplet ? String(amazonItemPackageTriplet.side2Cm) : '',
    amazonItemPackageSide3Cm: amazonItemPackageTriplet ? String(amazonItemPackageTriplet.side3Cm) : '',
    amazonItemPackageWeightKg: sku?.amazonReferenceWeightKg?.toString?.() ?? '',
    itemSide1Cm: side1,
    itemSide2Cm: side2,
    itemSide3Cm: side3,
    itemWeightKg: sku?.itemWeightKg?.toString?.() ?? '',
    amazonItemSide1Cm: amazonItemTriplet ? String(amazonItemTriplet.side1Cm) : '',
    amazonItemSide2Cm: amazonItemTriplet ? String(amazonItemTriplet.side2Cm) : '',
    amazonItemSide3Cm: amazonItemTriplet ? String(amazonItemTriplet.side3Cm) : '',
    amazonItemWeightKg: sku?.amazonItemWeightKg?.toString?.() ?? '',
    defaultSupplierId: sku?.defaultSupplierId ?? '',
    secondarySupplierId: sku?.secondarySupplierId ?? '',
    initialBatch: {
      batchCode: '',
      packSize: '1',
      unitsPerCarton: '1',
      packagingType: '',
    },
  }
}

function parseFiniteNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number.parseFloat(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

type ListingPriceResolution =
  | { listingPrice: number; source: 'EXACT' }
  | { listingPrice: number; source: 'BAND' }

function resolveAmazonListingPriceForFeeCalculation(sku: SkuRow | null): ListingPriceResolution | null {
  if (!sku) return null

  const explicitListingPrice = parseFiniteNumber(sku.amazonListingPrice)
  if (explicitListingPrice !== null && explicitListingPrice >= 0) {
    return { listingPrice: explicitListingPrice, source: 'EXACT' }
  }

  // If no explicit listing price, return null
  // Price band inference was US-specific; for UK, we need an explicit price
  return null
}

type ReferenceFeesAutofill = {
  normalizedCategory: string
  computedSizeTier: string | null
  referralFeePercent: number | null
  fbaFulfillmentFee: number | null
}

type ReferencePackageInput = {
  side1Cm: string
  side2Cm: string
  side3Cm: string
  weightKg: string
}

function computeReferenceFeesAutofill(
  sku: SkuRow | null,
  category: string,
  sizeTier: string,
  tenantCode: TenantCode,
  referencePackage: ReferencePackageInput
): ReferenceFeesAutofill {
  const categoryTrimmed = category.trim()
  const normalizedCategory = categoryTrimmed ? normalizeReferralCategory2026(categoryTrimmed) : ''

  const listingPriceResolution = resolveAmazonListingPriceForFeeCalculation(sku)

  const referralFeePercent =
    listingPriceResolution !== null && listingPriceResolution.source === 'EXACT' && normalizedCategory
      ? getReferralFeePercentForTenant(tenantCode, normalizedCategory, listingPriceResolution.listingPrice)
      : null

  let computedSizeTier: string | null = null
  const selectedSizeTier = sizeTier.trim()
  if (selectedSizeTier) {
    computedSizeTier = selectedSizeTier
  }

  const unitTriplet = resolveDimensionTripletCm({
    side1Cm: parseFiniteNumber(referencePackage.side1Cm),
    side2Cm: parseFiniteNumber(referencePackage.side2Cm),
    side3Cm: parseFiniteNumber(referencePackage.side3Cm),
  })
  const parsedUnitWeightKg = parseFiniteNumber(referencePackage.weightKg)
  const unitWeightKg = parsedUnitWeightKg !== null && parsedUnitWeightKg > 0 ? parsedUnitWeightKg : null

  if (computedSizeTier === null) {
    if (unitTriplet && unitWeightKg !== null) {
      computedSizeTier = calculateSizeTierForTenant(
        tenantCode,
        unitTriplet.side1Cm,
        unitTriplet.side2Cm,
        unitTriplet.side3Cm,
        unitWeightKg
      )
    }
  }

  let fbaFulfillmentFee: number | null = null
  if (listingPriceResolution !== null && computedSizeTier !== null) {
    if (unitTriplet && unitWeightKg !== null) {
      fbaFulfillmentFee = calculateFbaFeeForTenant(tenantCode, {
        side1Cm: unitTriplet.side1Cm,
        side2Cm: unitTriplet.side2Cm,
        side3Cm: unitTriplet.side3Cm,
        unitWeightKg,
        listingPrice: listingPriceResolution.listingPrice,
        sizeTier: computedSizeTier,
        category: normalizedCategory,
      })
    }
  }

  return {
    normalizedCategory,
    computedSizeTier,
    referralFeePercent,
    fbaFulfillmentFee,
  }
}

interface SkusPanelProps {
  externalModalOpen?: boolean
  externalEditSkuId?: string | null
  onExternalModalClose?: () => void
}

export default function SkusPanel({ externalModalOpen, externalEditSkuId, onExternalModalClose }: SkusPanelProps) {
  const { data: session } = useSession()
  const tenantCode: TenantCode = session?.user?.region ?? 'US'
  const referenceSizeTierOptions =
    tenantCode === 'UK' ? UK_SIZE_TIER_OPTIONS : AMAZON_SIZE_TIER_OPTIONS
  const pageState = usePageState(PAGE_KEY)
  const [skus, setSkus] = useState<SkuRow[]>([])
  const [loading, setLoading] = useState(false)
  const searchTerm = pageState.search ?? ''
  const setSearchTerm = pageState.setSearch
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [suppliersLoading, setSuppliersLoading] = useState(false)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingSku, setEditingSku] = useState<SkuRow | null>(null)
  const [formState, setFormState] = useState<SkuFormState>(() => buildFormState())

  const [confirmDelete, setConfirmDelete] = useState<SkuRow | null>(null)
  const [expandedSkuIds, setExpandedSkuIds] = useState<Set<string>>(new Set())
  const [modalTab, setModalTab] = useState<SkuModalTab>('reference')
  const [externalEditOpened, setExternalEditOpened] = useState(false)

  const autoFillReferenceFees = useCallback(() => {
    const computed = computeReferenceFeesAutofill(editingSku, formState.category, formState.sizeTier, tenantCode, {
      side1Cm: formState.unitSide1Cm,
      side2Cm: formState.unitSide2Cm,
      side3Cm: formState.unitSide3Cm,
      weightKg: formState.unitWeightKg,
    })

    setFormState(prev => {
      const next: SkuFormState = { ...prev }
      let didUpdate = false

      if (!next.category.trim() && computed.normalizedCategory) {
        next.category = computed.normalizedCategory
        didUpdate = true
      }

      if (!next.sizeTier.trim() && computed.computedSizeTier) {
        next.sizeTier = computed.computedSizeTier
        didUpdate = true
      }

      if (!next.referralFeePercent.trim() && computed.referralFeePercent !== null) {
        next.referralFeePercent = String(computed.referralFeePercent)
        didUpdate = true
      }

      if (!next.fbaFulfillmentFee.trim() && computed.fbaFulfillmentFee !== null) {
        next.fbaFulfillmentFee = computed.fbaFulfillmentFee.toFixed(2)
        didUpdate = true
      }

      if (!didUpdate) return prev
      return next
    })
  }, [
    editingSku,
    formState.category,
    formState.sizeTier,
    formState.unitSide1Cm,
    formState.unitSide2Cm,
    formState.unitSide3Cm,
    formState.unitWeightKg,
    tenantCode,
  ])

  const handleReferenceCategoryChange = useCallback(
    (nextCategory: string) => {
      setFormState(prev => {
        const next: SkuFormState = { ...prev, category: nextCategory }
        const computed = computeReferenceFeesAutofill(editingSku, next.category, next.sizeTier, tenantCode, {
          side1Cm: next.unitSide1Cm,
          side2Cm: next.unitSide2Cm,
          side3Cm: next.unitSide3Cm,
          weightKg: next.unitWeightKg,
        })

        if (computed.normalizedCategory && computed.normalizedCategory !== next.category) {
          next.category = computed.normalizedCategory
        }

        const sizeTierWasBlank = !prev.sizeTier.trim()
        if (sizeTierWasBlank && computed.computedSizeTier) {
          next.sizeTier = computed.computedSizeTier
        }

        if (computed.referralFeePercent !== null) {
          next.referralFeePercent = String(computed.referralFeePercent)
        }

        if (computed.fbaFulfillmentFee !== null) {
          const shouldUpdateFbaFee = sizeTierWasBlank || !prev.fbaFulfillmentFee.trim()
          if (shouldUpdateFbaFee) {
            next.fbaFulfillmentFee = computed.fbaFulfillmentFee.toFixed(2)
          }
        }

        return next
      })
    },
    [editingSku, tenantCode]
  )

  const handleReferenceSizeTierChange = useCallback(
    (nextSizeTier: string) => {
      setFormState(prev => {
        const next: SkuFormState = { ...prev, sizeTier: nextSizeTier }
        const computed = computeReferenceFeesAutofill(editingSku, next.category, next.sizeTier, tenantCode, {
          side1Cm: next.unitSide1Cm,
          side2Cm: next.unitSide2Cm,
          side3Cm: next.unitSide3Cm,
          weightKg: next.unitWeightKg,
        })

        if (computed.computedSizeTier && computed.computedSizeTier !== next.sizeTier.trim()) {
          next.sizeTier = computed.computedSizeTier
        }

        if (computed.fbaFulfillmentFee !== null) {
          next.fbaFulfillmentFee = computed.fbaFulfillmentFee.toFixed(2)
        }

        return next
      })
    },
    [editingSku, tenantCode]
  )

  // Handle external modal open trigger
  useEffect(() => {
    if (externalModalOpen) {
      setEditingSku(null)
      setFormState(buildFormState(null))
      setIsModalOpen(true)
    }
  }, [externalModalOpen])

  useEffect(() => {
    setExternalEditOpened(false)
  }, [externalEditSkuId])

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams()
    if (searchTerm.trim()) params.set('search', searchTerm.trim())
    return params.toString()
  }, [searchTerm])

  const fetchSkus = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/skus?${buildQuery()}`, { credentials: 'include' })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? 'Failed to load SKUs')
      }

      const data = await response.json()
      const rows: SkuRow[] = Array.isArray(data) ? data : []
      setSkus(rows)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load SKUs')
    } finally {
      setLoading(false)
    }
  }, [buildQuery])

  useEffect(() => {
    fetchSkus()
  }, [fetchSkus])

  const fetchSuppliers = useCallback(async () => {
    try {
      setSuppliersLoading(true)
      const response = await fetch('/api/suppliers', { credentials: 'include' })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? 'Failed to load suppliers')
      }

      const payload = await response.json()
      const rows = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
          ? payload
          : []
      setSuppliers(rows)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load suppliers')
      setSuppliers([])
    } finally {
      setSuppliersLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSuppliers()
  }, [fetchSuppliers])

  const filteredSkus = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return skus.filter(sku => {
      if (!term) return true

      return (
        sku.skuCode.toLowerCase().includes(term) ||
        sku.description.toLowerCase().includes(term) ||
        (sku.asin ?? '').toLowerCase().includes(term)
      )
    })
  }, [skus, searchTerm])

  const openCreate = useCallback(() => {
    setEditingSku(null)
    setFormState(buildFormState(null))
    setModalTab('reference')
    setIsModalOpen(true)
  }, [])

  const openEdit = useCallback((sku: SkuRow) => {
    setEditingSku(sku)
    setFormState(buildFormState(sku))
    setModalTab('reference')
    setIsModalOpen(true)
  }, [])

  useEffect(() => {
    if (!isModalOpen) return
    if (modalTab !== 'reference') return

    const hasReferenceFee = formState.fbaFulfillmentFee.trim()
    const hasReferralFee = formState.referralFeePercent.trim()
    const hasSizeTier = formState.sizeTier.trim()
    if (hasReferenceFee && hasReferralFee && hasSizeTier) return

    autoFillReferenceFees()
  }, [
    autoFillReferenceFees,
    formState.fbaFulfillmentFee,
    formState.referralFeePercent,
    formState.sizeTier,
    isModalOpen,
    modalTab,
  ])

  useEffect(() => {
    if (!externalEditSkuId) return
    if (externalEditOpened) return
    if (skus.length === 0) return
    const sku = skus.find(item => item.id === externalEditSkuId)
    if (!sku) return
    openEdit(sku)
    setExternalEditOpened(true)
  }, [externalEditOpened, externalEditSkuId, openEdit, skus])

  const closeModal = () => {
    if (isSubmitting) return
    setIsModalOpen(false)
    setEditingSku(null)
    setFormState(buildFormState(null))
    onExternalModalClose?.()
  }

  const submitSku = async (event: React.FormEvent) => {
    event.preventDefault()
    if (isSubmitting) return

    if (
      formState.defaultSupplierId &&
      formState.secondarySupplierId &&
      formState.defaultSupplierId === formState.secondarySupplierId
    ) {
      toast.error('Default and secondary supplier must be different')
      return
    }

    const skuCode = formState.skuCode.trim()
    const description = formState.description.trim()
    const asinValue = formState.asin.trim() ? formState.asin.trim() : null

    if (!skuCode) {
      toast.error('SKU code is required')
      return
    }

    if (!description) {
      toast.error('Description is required')
      return
    }

    const isCreating = !editingSku

    // Parse item package dimension fields
    const unitSide1Raw = formState.unitSide1Cm.trim()
    const unitSide2Raw = formState.unitSide2Cm.trim()
    const unitSide3Raw = formState.unitSide3Cm.trim()
    const unitWeightRaw = formState.unitWeightKg.trim()

    let unitSide1Cm: number | null = null
    let unitSide2Cm: number | null = null
    let unitSide3Cm: number | null = null

    const hasAnyPackageDimension = unitSide1Raw || unitSide2Raw || unitSide3Raw
    if (hasAnyPackageDimension) {
      if (!unitSide1Raw || !unitSide2Raw || !unitSide3Raw) {
        toast.error('Item package dimensions require length, width, and height')
        return
      }

      unitSide1Cm = Number.parseFloat(unitSide1Raw)
      unitSide2Cm = Number.parseFloat(unitSide2Raw)
      unitSide3Cm = Number.parseFloat(unitSide3Raw)

      if (!Number.isFinite(unitSide1Cm) || unitSide1Cm <= 0) {
        toast.error('Item package length must be a positive number')
        return
      }
      if (!Number.isFinite(unitSide2Cm) || unitSide2Cm <= 0) {
        toast.error('Item package width must be a positive number')
        return
      }
      if (!Number.isFinite(unitSide3Cm) || unitSide3Cm <= 0) {
        toast.error('Item package height must be a positive number')
        return
      }
    }

    let unitWeightKg: number | null = null
    if (unitWeightRaw) {
      unitWeightKg = Number.parseFloat(unitWeightRaw)
      if (!Number.isFinite(unitWeightKg) || unitWeightKg <= 0) {
        toast.error('Item package weight (kg) must be a positive number')
        return
      }
    } else if (isCreating) {
      toast.error('Item package weight (kg) is required')
      return
    }

    // Parse item dimension fields
    const side1Raw = formState.itemSide1Cm.trim()
    const side2Raw = formState.itemSide2Cm.trim()
    const side3Raw = formState.itemSide3Cm.trim()
    const itemWeightRaw = formState.itemWeightKg.trim()

    let itemSide1Cm: number | null = null
    let itemSide2Cm: number | null = null
    let itemSide3Cm: number | null = null

    // All three dimensions must be provided together, or none at all
    const hasAnyDimension = side1Raw || side2Raw || side3Raw
    if (hasAnyDimension) {
      if (!side1Raw || !side2Raw || !side3Raw) {
        toast.error('Item dimensions require length, width, and height')
        return
      }

      itemSide1Cm = Number.parseFloat(side1Raw)
      itemSide2Cm = Number.parseFloat(side2Raw)
      itemSide3Cm = Number.parseFloat(side3Raw)

      if (!Number.isFinite(itemSide1Cm) || itemSide1Cm <= 0) {
        toast.error('Item length must be a positive number')
        return
      }
      if (!Number.isFinite(itemSide2Cm) || itemSide2Cm <= 0) {
        toast.error('Item width must be a positive number')
        return
      }
      if (!Number.isFinite(itemSide3Cm) || itemSide3Cm <= 0) {
        toast.error('Item height must be a positive number')
        return
      }
    }

    let itemWeightKg: number | null = null
    if (itemWeightRaw) {
      itemWeightKg = Number.parseFloat(itemWeightRaw)
      if (!Number.isFinite(itemWeightKg) || itemWeightKg <= 0) {
        toast.error('Item weight (kg) must be a positive number')
        return
      }
    }

    // Parse reference fee fields
    const categoryTrimmed = formState.category.trim()
    const normalizedCategory = categoryTrimmed ? normalizeReferralCategory2026(categoryTrimmed) : ''
    const categoryValue = normalizedCategory ? normalizedCategory : null
    const sizeTierTrimmed = formState.sizeTier.trim()
    const sizeTierValue = sizeTierTrimmed ? sizeTierTrimmed : null
    let referralFeePercent: number | null = null
    let fbaFulfillmentFee: number | null = null

    if (formState.referralFeePercent.trim()) {
      referralFeePercent = Number.parseFloat(formState.referralFeePercent)
      if (!Number.isFinite(referralFeePercent) || referralFeePercent < 0 || referralFeePercent > 100) {
        toast.error('Referral fee must be between 0 and 100')
        return
      }
    }

    if (formState.fbaFulfillmentFee.trim()) {
      fbaFulfillmentFee = Number.parseFloat(formState.fbaFulfillmentFee)
      if (!Number.isFinite(fbaFulfillmentFee) || fbaFulfillmentFee < 0) {
        toast.error('FBA fulfillment fee must be a non-negative number')
        return
      }
    }

    let initialBatchPayload: Record<string, unknown> | null = null

    if (isCreating) {
      const batchCode = formState.initialBatch.batchCode.trim()
      if (!batchCode) {
        toast.error('Batch code is required')
        return
      }

      const packSize = Number.parseInt(formState.initialBatch.packSize, 10)
      if (!Number.isFinite(packSize) || packSize <= 0) {
        toast.error('Pack size must be a positive number')
        return
      }

      const unitsPerCarton = Number.parseInt(formState.initialBatch.unitsPerCarton, 10)
      if (!Number.isFinite(unitsPerCarton) || unitsPerCarton <= 0) {
        toast.error('Units per carton must be a positive number')
        return
      }

      initialBatchPayload = {
        batchCode,
        packSize,
        unitsPerCarton,
        packagingType: formState.initialBatch.packagingType ? formState.initialBatch.packagingType : null,
      }
    }

    setIsSubmitting(true)
    try {
      const subcategoryTrimmed = formState.subcategory.trim()
      const subcategoryValue = subcategoryTrimmed ? subcategoryTrimmed : null

      const payload: Record<string, unknown> = {
        skuCode,
        asin: asinValue,
        description,
        defaultSupplierId: formState.defaultSupplierId ? formState.defaultSupplierId : null,
        secondarySupplierId: formState.secondarySupplierId ? formState.secondarySupplierId : null,
        category: categoryValue,
        subcategory: subcategoryValue,
        sizeTier: sizeTierValue,
        referralFeePercent,
        fbaFulfillmentFee,
        unitSide1Cm,
        unitSide2Cm,
        unitSide3Cm,
        unitWeightKg,
        itemSide1Cm,
        itemSide2Cm,
        itemSide3Cm,
        itemWeightKg,
      }

      if (initialBatchPayload) {
        payload.initialBatch = initialBatchPayload
      }

      let endpoint = '/api/skus'
      let method: 'POST' | 'PATCH' = 'POST'

      if (editingSku) {
        endpoint = `/api/skus?id=${encodeURIComponent(editingSku.id)}`
        method = 'PATCH'
      }

      const response = await fetchWithCSRF(endpoint, {
        method,
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? 'Failed to save SKU')
      }

      toast.success(editingSku ? 'SKU updated' : 'SKU created')
      setIsModalOpen(false)
      setEditingSku(null)
      setFormState(buildFormState(null))
      onExternalModalClose?.()
      await fetchSkus()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save SKU')
    } finally {
      setIsSubmitting(false)
    }
  }

  const deleteSku = async (sku: SkuRow) => {
    try {
      const response = await fetchWithCSRF(`/api/skus?id=${encodeURIComponent(sku.id)}`, {
        method: 'DELETE',
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to delete SKU')
      }

      toast.success(payload?.message ?? 'SKU deleted')
      await fetchSkus()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete SKU')
    } finally {
      setConfirmDelete(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-700 px-6 py-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Package2 className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">SKU Catalog</h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">Manage product SKUs and their specifications</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-cyan-50 text-cyan-700 border-cyan-200 font-medium">
              {skus.length} SKUs
            </Badge>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-6 py-4 bg-slate-50/50 dark:bg-slate-900/50 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 items-center gap-3">
            <div className="relative flex-1 md:max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder="Search SKUs..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-600 bg-white dark:bg-slate-800 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100 dark:focus:ring-cyan-900 transition-shadow"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400 dark:text-slate-500" />
          </div>
        ) : filteredSkus.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <Package2 className="h-10 w-10 text-slate-300 dark:text-slate-600" />
            <div>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {searchTerm ? 'No SKUs found' : 'No SKUs yet'}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {searchTerm
                  ? 'Clear your search or create a new SKU.'
                  : 'Create your first SKU to start receiving inventory.'}
              </p>
            </div>
            {!searchTerm && (
              <Button onClick={openCreate} className="gap-2">
                <Plus className="h-4 w-4" />
                New SKU
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-2 py-3 text-left font-semibold w-8"></th>
                  <th className="px-4 py-3 text-left font-semibold">SKU</th>
                  <th className="px-4 py-3 text-left font-semibold">Description</th>
                  <th className="px-4 py-3 text-left font-semibold">ASIN</th>
                  <th className="px-4 py-3 text-right font-semibold">Txns</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredSkus.map(sku => {
                  const isExpanded = expandedSkuIds.has(sku.id)

                  const toggleExpand = () => {
                    setExpandedSkuIds(prev => {
                      const next = new Set(prev)
                      if (next.has(sku.id)) {
                        next.delete(sku.id)
                      } else {
                        next.add(sku.id)
                      }
                      return next
                    })
                  }

                  return (
                    <React.Fragment key={sku.id}>
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/50 transition-colors">
                        <td className="px-2 py-3">
                          <button
                            type="button"
                            onClick={toggleExpand}
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            aria-label={isExpanded ? 'Collapse batches' : 'Expand batches'}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openEdit(sku)}
                            className="text-cyan-700 dark:text-cyan-400 hover:underline"
                          >
                            {sku.skuCode}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {sku.description}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {sku.asin ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {sku._count?.inventoryTransactions ?? 0}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmDelete(sku)}
                            className="border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-800 dark:hover:text-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="p-0 bg-slate-50/80 dark:bg-slate-900/50">
                            <div className="p-4">
                              <SkuBatchesPanel
                                sku={{
                                  id: sku.id,
                                  skuCode: sku.skuCode,
                                  description: sku.description,
                                  unitDimensionsCm: sku.unitDimensionsCm,
                                  amazonReferenceWeightKg: sku.amazonReferenceWeightKg,
                                  itemDimensionsCm: sku.itemDimensionsCm ?? null,
                                  itemSide1Cm: sku.itemSide1Cm ?? null,
                                  itemSide2Cm: sku.itemSide2Cm ?? null,
                                  itemSide3Cm: sku.itemSide3Cm ?? null,
                                  itemWeightKg: sku.itemWeightKg ?? null,
                                }}
                                onBatchesUpdated={fetchSkus}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PortalModal open={isModalOpen} className="items-center" onClose={closeModal}>
        <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white dark:bg-slate-800 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {editingSku ? 'Edit SKU' : 'New SKU'}
            </h2>
            <Button variant="ghost" onClick={closeModal} disabled={isSubmitting}>
              Close
            </Button>
          </div>

          <form onSubmit={submitSku} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="skuCode">SKU Code</Label>
                  <Input
                    id="skuCode"
                    value={formState.skuCode}
                    onChange={event =>
                      setFormState(prev => ({ ...prev, skuCode: event.target.value }))
                    }
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="asin">ASIN</Label>
                  <Input
                    id="asin"
                    value={formState.asin}
                    onChange={event =>
                      setFormState(prev => ({ ...prev, asin: event.target.value }))
                    }
                    placeholder="Optional"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="description">Description</Label>
                    <span className={`text-xs ${formState.description.length > SKU_FIELD_LIMITS.DESCRIPTION_MAX ? 'text-red-500' : 'text-slate-400'}`}>
                      {formState.description.length}/{SKU_FIELD_LIMITS.DESCRIPTION_MAX}
                    </span>
                  </div>
                  <Input
                    id="description"
                    value={formState.description}
                    onChange={event =>
                      setFormState(prev => ({ ...prev, description: event.target.value }))
                    }
                    maxLength={SKU_FIELD_LIMITS.DESCRIPTION_MAX}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="defaultSupplierId">Default Supplier</Label>
                  <select
                    id="defaultSupplierId"
                    value={formState.defaultSupplierId}
                    onChange={event =>
                      setFormState(prev => ({ ...prev, defaultSupplierId: event.target.value }))
                    }
                    className="w-full rounded-md border border-border/60 bg-white dark:bg-slate-800 px-3 py-2 text-sm shadow-soft focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    disabled={suppliersLoading}
                  >
                    <option value="">{suppliersLoading ? 'Loading…' : 'None'}</option>
                    {suppliers.map(supplier => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="secondarySupplierId">Secondary Supplier</Label>
                  <select
                    id="secondarySupplierId"
                    value={formState.secondarySupplierId}
                    onChange={event =>
                      setFormState(prev => ({
                        ...prev,
                        secondarySupplierId: event.target.value,
                      }))
                    }
                    className="w-full rounded-md border border-border/60 bg-white dark:bg-slate-800 px-3 py-2 text-sm shadow-soft focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    disabled={suppliersLoading}
                  >
                    <option value="">{suppliersLoading ? 'Loading…' : 'None'}</option>
                    {suppliers.map(supplier => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Amazon Fees Section */}
                <div className="md:col-span-2 pt-4 border-t">
                  <Tabs>
                    <TabsList className="w-full grid grid-cols-2 mb-4">
                      <TabsTrigger
                        type="button"
                        onClick={() => setModalTab('reference')}
                        data-state={modalTab === 'reference' ? 'active' : 'inactive'}
                      >
                        Reference
                      </TabsTrigger>
                      <TabsTrigger
                        type="button"
                        onClick={() => setModalTab('amazon')}
                        data-state={modalTab === 'amazon' ? 'active' : 'inactive'}
                      >
                        Amazon
                      </TabsTrigger>
                    </TabsList>

                    <div className="rounded-lg border-2 border-slate-300 bg-white dark:bg-slate-800 p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <h4 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-1.5">
                            Amazon Fees
                            <Link
                              href="/amazon/fba-fee-tables"
                              target="_blank"
                              className="text-slate-400 hover:text-cyan-600 transition-colors"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                          </h4>
                        </div>
                      </div>
                      {modalTab === 'reference' ? (
                        <div className="space-y-4">
                          <div className="grid gap-3 md:grid-cols-2">
                                <div className="md:col-span-2 pt-2">
                                  <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Dimensions
                                  </h5>
                                </div>

                                <div className="space-y-1">
                                  <Label>Item package dimensions (cm)</Label>
                                  <div className="grid grid-cols-3 gap-2">
                                    <Input
                                      id="unitSide1Cm"
                                      type="number"
                                      step="0.01"
                                      min={0.01}
                                      value={formState.unitSide1Cm}
                                      onChange={event =>
                                        setFormState(prev => ({ ...prev, unitSide1Cm: event.target.value }))
                                      }
                                      placeholder="L"
                                      inputMode="decimal"
                                    />
                                    <Input
                                      id="unitSide2Cm"
                                      type="number"
                                      step="0.01"
                                      min={0.01}
                                      value={formState.unitSide2Cm}
                                      onChange={event =>
                                        setFormState(prev => ({ ...prev, unitSide2Cm: event.target.value }))
                                      }
                                      placeholder="W"
                                      inputMode="decimal"
                                    />
                                    <Input
                                      id="unitSide3Cm"
                                      type="number"
                                      step="0.01"
                                      min={0.01}
                                      value={formState.unitSide3Cm}
                                      onChange={event =>
                                        setFormState(prev => ({ ...prev, unitSide3Cm: event.target.value }))
                                      }
                                      placeholder="H"
                                      inputMode="decimal"
                                    />
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <Label htmlFor="unitWeightKg">Item package weight (kg)</Label>
                                  <Input
                                    id="unitWeightKg"
                                    type="number"
                                    step="0.001"
                                    min={0.001}
                                    value={formState.unitWeightKg}
                                    onChange={event =>
                                      setFormState(prev => ({ ...prev, unitWeightKg: event.target.value }))
                                    }
                                    placeholder="e.g. 0.29"
                                    required={!editingSku}
                                  />
                                </div>

                                <div className="space-y-1">
                                  <Label>Item dimensions (cm)</Label>
                                  <div className="grid grid-cols-3 gap-2">
                                    <Input
                                      id="itemSide1Cm"
                                      type="number"
                                      step="0.01"
                                      min={0.01}
                                      value={formState.itemSide1Cm}
                                      onChange={event =>
                                        setFormState(prev => ({ ...prev, itemSide1Cm: event.target.value }))
                                      }
                                      placeholder="L"
                                      inputMode="decimal"
                                    />
                                    <Input
                                      id="itemSide2Cm"
                                      type="number"
                                      step="0.01"
                                      min={0.01}
                                      value={formState.itemSide2Cm}
                                      onChange={event =>
                                        setFormState(prev => ({ ...prev, itemSide2Cm: event.target.value }))
                                      }
                                      placeholder="W"
                                      inputMode="decimal"
                                    />
                                    <Input
                                      id="itemSide3Cm"
                                      type="number"
                                      step="0.01"
                                      min={0.01}
                                      value={formState.itemSide3Cm}
                                      onChange={event =>
                                        setFormState(prev => ({ ...prev, itemSide3Cm: event.target.value }))
                                      }
                                      placeholder="H"
                                      inputMode="decimal"
                                    />
                                  </div>
                                </div>

                                <div className="space-y-1">
                                  <Label htmlFor="itemWeightKg">Item weight (kg)</Label>
                                  <Input
                                    id="itemWeightKg"
                                    type="number"
                                    step="0.001"
                                    min={0.001}
                                    value={formState.itemWeightKg}
                                    onChange={event =>
                                      setFormState(prev => ({ ...prev, itemWeightKg: event.target.value }))
                                    }
                                    placeholder="e.g. 0.29"
                                  />
                                </div>

                                <div className="md:col-span-2 pt-4 border-t border-slate-200 dark:border-slate-700">
                                  <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Fees
                                  </h5>
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor="category">Category</Label>
                                  <select
                                    id="category"
                                    value={formState.category}
                                    onChange={event => handleReferenceCategoryChange(event.target.value)}
                                    className="w-full rounded-md border border-border/60 bg-white dark:bg-slate-800 px-3 py-2 text-sm shadow-soft focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                                  >
                                    <option value="">Select category</option>
                                    {AMAZON_REFERRAL_CATEGORIES_2026.map(category => (
                                      <option key={category} value={category}>
                                        {formatReferralCategoryLabel(category)}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor="subcategory">Subcategory</Label>
                                  <Input
                                    id="subcategory"
                                    value={formState.subcategory}
                                    onChange={event =>
                                      setFormState(prev => ({ ...prev, subcategory: event.target.value }))
                                    }
                                    placeholder="Optional"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor="sizeTier">Size Tier</Label>
                                  <select
                                    id="sizeTier"
                                    value={formState.sizeTier}
                                    onChange={event => handleReferenceSizeTierChange(event.target.value)}
                                    className="w-full rounded-md border border-border/60 bg-white dark:bg-slate-800 px-3 py-2 text-sm shadow-soft focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                                  >
                                    <option value="">Select size tier</option>
                                    {referenceSizeTierOptions.map(sizeTier => (
                                      <option key={sizeTier} value={sizeTier}>
                                        {sizeTier}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div className="space-y-1">
                                  <Label htmlFor="referralFeePercent">Referral Fee (%)</Label>
                                  <Input
                                    id="referralFeePercent"
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    max={100}
                                    value={formState.referralFeePercent}
                                    onChange={event =>
                                      setFormState(prev => ({
                                        ...prev,
                                        referralFeePercent: event.target.value,
                                      }))
                                    }
                                    placeholder="e.g. 15"
                                  />
                                </div>
                            <div className="space-y-1">
                              <Label htmlFor="fbaFulfillmentFee">FBA Fulfillment Fee</Label>
                              <Input
                                id="fbaFulfillmentFee"
                                type="number"
                                step="0.01"
                                min={0}
                                value={formState.fbaFulfillmentFee}
                                onChange={event =>
                                  setFormState(prev => ({
                                    ...prev,
                                    fbaFulfillmentFee: event.target.value,
                                  }))
                                }
                                placeholder="e.g. 3.22"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="md:col-span-2 pt-2">
                              <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Dimensions
                              </h5>
                            </div>

                            <div className="space-y-1">
                              <Label>Item package dimensions (cm)</Label>
                              <div className="grid grid-cols-3 gap-2">
                                <Input
                                  value={formState.amazonItemPackageSide1Cm}
                                  disabled
                                  className="bg-slate-100 text-slate-500"
                                  placeholder="—"
                                />
                                <Input
                                  value={formState.amazonItemPackageSide2Cm}
                                  disabled
                                  className="bg-slate-100 text-slate-500"
                                  placeholder="—"
                                />
                                <Input
                                  value={formState.amazonItemPackageSide3Cm}
                                  disabled
                                  className="bg-slate-100 text-slate-500"
                                  placeholder="—"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <Label>Item package weight (kg)</Label>
                              <Input
                                value={formState.amazonItemPackageWeightKg}
                                disabled
                                className="bg-slate-100 text-slate-500"
                                placeholder="—"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label>Item dimensions (cm)</Label>
                              <div className="grid grid-cols-3 gap-2">
                                <Input
                                  value={formState.amazonItemSide1Cm}
                                  disabled
                                  className="bg-slate-100 text-slate-500"
                                  placeholder="—"
                                />
                                <Input
                                  value={formState.amazonItemSide2Cm}
                                  disabled
                                  className="bg-slate-100 text-slate-500"
                                  placeholder="—"
                                />
                                <Input
                                  value={formState.amazonItemSide3Cm}
                                  disabled
                                  className="bg-slate-100 text-slate-500"
                                  placeholder="—"
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <Label>Item weight (kg)</Label>
                              <Input
                                value={formState.amazonItemWeightKg}
                                disabled
                                className="bg-slate-100 text-slate-500"
                                placeholder="—"
                              />
                            </div>

                            <div className="md:col-span-2 pt-4 border-t border-slate-200 dark:border-slate-700">
                              <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Fees
                              </h5>
                            </div>
                            <div className="space-y-1">
                              <Label>Category</Label>
                              <Input
                                value={formState.amazonCategory}
                                disabled
                                className="bg-slate-100 text-slate-500"
                                placeholder="—"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Subcategory</Label>
                              <Input
                                value={formState.amazonSubcategory}
                                disabled
                                className="bg-slate-100 text-slate-500"
                                placeholder="—"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Size Tier</Label>
                              <Input
                                value={formState.amazonSizeTier}
                                disabled
                                className="bg-slate-100 text-slate-500"
                                placeholder="—"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Referral Fee (%)</Label>
                              <Input
                                value={formState.amazonReferralFeePercent}
                                disabled
                                className="bg-slate-100 text-slate-500"
                                placeholder="—"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>FBA Fulfillment Fee</Label>
                              <Input
                                value={formState.amazonFbaFulfillmentFee}
                                disabled
                                className="bg-slate-100 text-slate-500"
                                placeholder="—"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </Tabs>
                </div>

                {!editingSku ? (
                  <>
                    <div className="md:col-span-2 pt-2">
                      <h3 className="text-sm font-semibold text-slate-900">Initial Batch</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Required. Defines pack size and units/carton.
                      </p>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="initialBatchCode">Batch Code</Label>
                      <Input
                        id="initialBatchCode"
                        value={formState.initialBatch.batchCode}
                        onChange={event =>
                          setFormState(prev => ({
                            ...prev,
                            initialBatch: { ...prev.initialBatch, batchCode: event.target.value },
                          }))
                        }
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="initialPackagingType">Packaging Type</Label>
                      <select
                        id="initialPackagingType"
                        value={formState.initialBatch.packagingType}
                        onChange={event =>
                          setFormState(prev => ({
                            ...prev,
                            initialBatch: {
                              ...prev.initialBatch,
                              packagingType: event.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-md border border-border/60 bg-white dark:bg-slate-800 px-3 py-2 text-sm shadow-soft focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <option value="">Optional</option>
                        <option value="BOX">Box</option>
                        <option value="POLYBAG">Polybag</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="initialPackSize">Pack Size</Label>
                      <Input
                        id="initialPackSize"
                        type="number"
                        min={1}
                        value={formState.initialBatch.packSize}
                        onChange={event =>
                          setFormState(prev => ({
                            ...prev,
                            initialBatch: { ...prev.initialBatch, packSize: event.target.value },
                          }))
                        }
                        required
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="initialUnitsPerCarton">Units per Carton</Label>
                      <Input
                        id="initialUnitsPerCarton"
                        type="number"
                        min={1}
                        value={formState.initialBatch.unitsPerCarton}
                        onChange={event =>
                          setFormState(prev => ({
                            ...prev,
                            initialBatch: {
                              ...prev.initialBatch,
                              unitsPerCarton: event.target.value,
                            },
                          }))
                        }
                        required
                      />
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t px-6 py-4">
              <div />

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeModal}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving…
                    </span>
                  ) : (
                    'Save'
                  )}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </PortalModal>

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (!confirmDelete) return
          void deleteSku(confirmDelete)
        }}
        title="Delete SKU?"
        message={
          confirmDelete
            ? `Delete ${confirmDelete.skuCode}? This is permanent and only allowed when there is no related history.`
            : ''
        }
        confirmText="Delete"
        type="danger"
      />
    </div>
  )
}
