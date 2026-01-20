'use client'

import { MapPin } from '@/lib/lucide-icons'

interface Warehouse {
  id: string
  code: string
  name: string
  address?: string | null
}

interface WarehouseMapSimpleProps {
  warehouses: Warehouse[]
  selectedWarehouseId?: string
}

export function WarehouseMapSimple({
  warehouses,
  selectedWarehouseId,
}: WarehouseMapSimpleProps) {
  if (warehouses.length === 0) {
    return (
      <div className="bg-slate-50 border border-slate-200 dark:border-slate-700 rounded-lg p-8 text-center">
        <MapPin className="h-12 w-12 text-slate-400 mx-auto mb-2" />
        <p className="text-slate-500">No warehouses available</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {warehouses.map((warehouse) => (
        <div
          key={warehouse.id}
          className={`border rounded-lg p-4 ${
            warehouse.id === selectedWarehouseId
              ? 'border-cyan-600 bg-cyan-50'
              : 'border-slate-200 dark:border-slate-700 bg-white'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <MapPin
                  className={`h-5 w-5 ${
                    warehouse.id === selectedWarehouseId ? 'text-cyan-600' : 'text-slate-600'
                  }`}
                />
                <h4 className="font-semibold">{warehouse.name}</h4>
                <span className="text-sm text-slate-500">({warehouse.code})</span>
              </div>
              {warehouse.address && (
                <p className="text-sm text-slate-600 mt-1 ml-7 whitespace-pre-line">
                  {warehouse.address}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
