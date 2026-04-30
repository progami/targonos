'use client'

import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FreightSection } from './freight-section'
import type { AmazonFreightState } from './types'

interface FreightLogisticsTabProps {
  amazonFreight: AmazonFreightState
  setAmazonFreight: React.Dispatch<React.SetStateAction<AmazonFreightState>>
}

export function FreightLogisticsTab({
  amazonFreight,
  setAmazonFreight,
}: FreightLogisticsTabProps) {
  const updateField = (field: keyof AmazonFreightState, value: string) => {
    setAmazonFreight(prev => ({ ...prev, [field]: value }))
  }

  const hasIdentifiers = Boolean(
    amazonFreight.shipmentReference ||
    amazonFreight.shipperId ||
    amazonFreight.loadId ||
    amazonFreight.freightBillNumber ||
    amazonFreight.billOfLadingNumber
  )

  const hasAppointments = Boolean(
    amazonFreight.pickupNumber ||
    amazonFreight.pickupAppointmentId ||
    amazonFreight.deliveryAppointmentId ||
    amazonFreight.pickupWindowStart ||
    amazonFreight.pickupWindowEnd ||
    amazonFreight.deliveryWindowStart ||
    amazonFreight.deliveryWindowEnd
  )

  const hasPickup = Boolean(
    amazonFreight.pickupAddress ||
    amazonFreight.pickupContactName ||
    amazonFreight.pickupContactPhone
  )

  const hasDelivery = Boolean(
    amazonFreight.deliveryAddress ||
    amazonFreight.shipmentMode
  )

  const hasCargo = Boolean(
    amazonFreight.boxCount ||
    amazonFreight.palletCount ||
    amazonFreight.commodityDescription
  )

  const hasPricing = Boolean(
    amazonFreight.distanceMiles ||
    amazonFreight.basePrice ||
    amazonFreight.fuelSurcharge ||
    amazonFreight.totalPrice ||
    amazonFreight.currency
  )

  return (
    <div className="space-y-4">
      <div className="mb-2">
        <h3 className="text-sm font-semibold">Amazon Freight Details</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Capture freight booking, BOL, and delivery information
        </p>
      </div>

      <FreightSection
        id="identifiers"
        label="Shipment Identifiers"
        defaultOpen={true}
        hasContent={hasIdentifiers}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1.5">Shipment Reference</label>
            <Input
              value={amazonFreight.shipmentReference}
              onChange={e => updateField('shipmentReference', e.target.value)}
              placeholder="Shipment reference"
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Shipper ID</label>
            <Input
              value={amazonFreight.shipperId}
              onChange={e => updateField('shipperId', e.target.value)}
              placeholder="Shipper ID"
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Load ID</label>
            <Input
              value={amazonFreight.loadId}
              onChange={e => updateField('loadId', e.target.value)}
              placeholder="Load ID"
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Pro/Freight Bill Number</label>
            <Input
              value={amazonFreight.freightBillNumber}
              onChange={e => updateField('freightBillNumber', e.target.value)}
              placeholder="Freight bill / PRO #"
              className="text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1.5">BOL Number</label>
            <Input
              value={amazonFreight.billOfLadingNumber}
              onChange={e => updateField('billOfLadingNumber', e.target.value)}
              placeholder="Bill of lading #"
              className="text-sm"
            />
          </div>
        </div>
      </FreightSection>

      <FreightSection
        id="appointments"
        label="Pickup & Delivery Appointments"
        defaultOpen={true}
        hasContent={hasAppointments}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1.5">Pickup Number</label>
            <Input
              value={amazonFreight.pickupNumber}
              onChange={e => updateField('pickupNumber', e.target.value)}
              placeholder="Pickup number"
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Pickup Appointment ID</label>
            <Input
              value={amazonFreight.pickupAppointmentId}
              onChange={e => updateField('pickupAppointmentId', e.target.value)}
              placeholder="Pickup appointment ID"
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">ISA / Delivery Appointment ID</label>
            <Input
              value={amazonFreight.deliveryAppointmentId}
              onChange={e => updateField('deliveryAppointmentId', e.target.value)}
              placeholder="Delivery appointment ID"
              className="text-sm"
            />
          </div>
          <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1.5">Pickup Window Start</label>
              <Input
                type="datetime-local"
                value={amazonFreight.pickupWindowStart}
                onChange={e => updateField('pickupWindowStart', e.target.value)}
                className="text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Pickup Window End</label>
              <Input
                type="datetime-local"
                value={amazonFreight.pickupWindowEnd}
                onChange={e => updateField('pickupWindowEnd', e.target.value)}
                className="text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Delivery Window Start</label>
              <Input
                type="datetime-local"
                value={amazonFreight.deliveryWindowStart}
                onChange={e => updateField('deliveryWindowStart', e.target.value)}
                className="text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Delivery Window End</label>
              <Input
                type="datetime-local"
                value={amazonFreight.deliveryWindowEnd}
                onChange={e => updateField('deliveryWindowEnd', e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
        </div>
      </FreightSection>

      <FreightSection
        id="pickup"
        label="Pickup Details"
        defaultOpen={false}
        hasContent={hasPickup}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1.5">Pickup Contact Name</label>
            <Input
              value={amazonFreight.pickupContactName}
              onChange={e => updateField('pickupContactName', e.target.value)}
              placeholder="Contact name"
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Pickup Contact Phone</label>
            <Input
              value={amazonFreight.pickupContactPhone}
              onChange={e => updateField('pickupContactPhone', e.target.value)}
              placeholder="Phone number"
              className="text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1.5">Pickup Address</label>
            <Textarea
              value={amazonFreight.pickupAddress}
              onChange={e => updateField('pickupAddress', e.target.value)}
              placeholder="Full pickup address"
              rows={3}
              className="text-sm"
            />
          </div>
        </div>
      </FreightSection>

      <FreightSection
        id="delivery"
        label="Delivery Details"
        defaultOpen={false}
        hasContent={hasDelivery}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1.5">Shipment Mode</label>
            <Input
              value={amazonFreight.shipmentMode}
              onChange={e => updateField('shipmentMode', e.target.value)}
              placeholder="Full truckload, LTL, etc."
              className="text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1.5">Delivery Address</label>
            <Textarea
              value={amazonFreight.deliveryAddress}
              onChange={e => updateField('deliveryAddress', e.target.value)}
              placeholder="Full delivery address"
              rows={3}
              className="text-sm"
            />
          </div>
        </div>
      </FreightSection>

      <FreightSection
        id="cargo"
        label="Cargo Information"
        defaultOpen={false}
        hasContent={hasCargo}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1.5">Box Count</label>
            <Input
              type="number"
              min="0"
              value={amazonFreight.boxCount}
              onChange={e => updateField('boxCount', e.target.value)}
              placeholder="Number of boxes"
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Pallet Count</label>
            <Input
              type="number"
              min="0"
              value={amazonFreight.palletCount}
              onChange={e => updateField('palletCount', e.target.value)}
              placeholder="Number of pallets"
              className="text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1.5">Commodity Description</label>
            <Textarea
              value={amazonFreight.commodityDescription}
              onChange={e => updateField('commodityDescription', e.target.value)}
              placeholder="Description of goods"
              rows={2}
              className="text-sm"
            />
          </div>
        </div>
      </FreightSection>

      <FreightSection
        id="pricing"
        label="Pricing & Distance"
        defaultOpen={false}
        hasContent={hasPricing}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1.5">Distance (miles)</label>
            <Input
              type="number"
              min="0"
              value={amazonFreight.distanceMiles}
              onChange={e => updateField('distanceMiles', e.target.value)}
              placeholder="Miles"
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Currency</label>
            <Input
              value={amazonFreight.currency}
              onChange={e => updateField('currency', e.target.value)}
              placeholder="USD"
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Base Price</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amazonFreight.basePrice}
              onChange={e => updateField('basePrice', e.target.value)}
              placeholder="0.00"
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Fuel Surcharge</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amazonFreight.fuelSurcharge}
              onChange={e => updateField('fuelSurcharge', e.target.value)}
              placeholder="0.00"
              className="text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1.5">Total Price</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amazonFreight.totalPrice}
              onChange={e => updateField('totalPrice', e.target.value)}
              placeholder="0.00"
              className="text-sm"
            />
          </div>
        </div>
      </FreightSection>
    </div>
  )
}
