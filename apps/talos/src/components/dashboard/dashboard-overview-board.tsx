'use client'

import { useMemo, useState, type ReactNode } from 'react'
import NextLink from 'next/link'
import {
  Box,
  LinearProgress,
  Link as MuiLink,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import type {
  DashboardOverviewMovement,
  DashboardOverviewSnapshot,
} from '@/lib/dashboard/dashboard-overview'
import { Box as BoxIcon } from '@/lib/lucide-icons'

type InventoryMetric = 'cartons' | 'pallets' | 'units'

type InventoryMetricRow = {
  cartons: number
  pallets: number
  units: number
  carriesPallets?: boolean
}

const numberFormatter = new Intl.NumberFormat('en-US')
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  day: '2-digit',
  year: '2-digit',
  timeZone: 'UTC',
})

const metricOptions: Array<{ value: InventoryMetric; label: string }> = [
  { value: 'cartons', label: 'Cartons' },
  { value: 'pallets', label: 'Pallets' },
  { value: 'units', label: 'Units' },
]

const metricLabels: Record<InventoryMetric, string> = {
  cartons: 'Cartons',
  pallets: 'Pallets',
  units: 'Units',
}

const panelSx: SxProps<Theme> = {
  border: '1px solid',
  borderColor: 'light-dark(rgb(226 232 240), rgb(30 41 59))',
  borderRadius: '6px',
  backgroundColor: 'light-dark(rgba(255,255,255,0.82), rgba(15,23,42,0.42))',
  backgroundImage: 'none',
  boxShadow: '0 1px 2px light-dark(rgba(15,23,42,0.06), rgba(0,0,0,0.16))',
  overflow: 'hidden',
}

const panelHeaderSx: SxProps<Theme> = {
  alignItems: 'center',
  borderBottom: '1px solid',
  borderColor: 'light-dark(rgb(226 232 240), rgb(30 41 59))',
  display: 'flex',
  justifyContent: 'space-between',
  minHeight: 48,
  px: 2,
}

const panelTitleSx: SxProps<Theme> = {
  color: 'light-dark(rgb(51 65 85), rgb(226 232 240))',
  fontSize: 15,
  fontWeight: 700,
  letterSpacing: '0.14em',
  lineHeight: 1,
  textTransform: 'uppercase',
}

const headCellSx: SxProps<Theme> = {
  borderColor: 'light-dark(rgb(226 232 240), rgb(30 41 59))',
  color: 'light-dark(rgb(100 116 139), rgb(100 116 139))',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.14em',
  lineHeight: 1.2,
  px: 2,
  py: 1.5,
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
}

const bodyCellSx: SxProps<Theme> = {
  borderColor: 'light-dark(rgb(226 232 240), rgba(30,41,59,0.8))',
  color: 'light-dark(rgb(71 85 105), rgb(203 213 225))',
  fontSize: 14,
  lineHeight: 1.25,
  px: 2,
  py: 1.5,
}

const strongCellSx: SxProps<Theme> = {
  ...bodyCellSx,
  color: 'light-dark(rgb(15 23 42), rgb(241 245 249))',
  fontWeight: 700,
}

const recentHeadCellSx: SxProps<Theme> = {
  ...headCellSx,
  fontSize: 10,
  letterSpacing: '0.08em',
  px: 1,
  py: 1.15,
}

const recentBodyCellSx: SxProps<Theme> = {
  ...bodyCellSx,
  fontSize: 12,
  px: 1,
  py: 1.1,
}

function formatNumber(value: number) {
  return numberFormatter.format(value)
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value))
}

function getShare(value: number, total: number) {
  if (total === 0) {
    return 0
  }

  return Math.round((value / total) * 100)
}

function getMetricValue(row: InventoryMetricRow, metric: InventoryMetric) {
  return row[metric]
}

function formatMetricValue(row: InventoryMetricRow, metric: InventoryMetric) {
  if (metric === 'pallets' && row.carriesPallets === false) {
    return '—'
  }

  return formatNumber(getMetricValue(row, metric))
}

function Panel({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Paper elevation={0} square={false} sx={[panelSx, { minWidth: 0 }, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])]}>
      {children}
    </Paper>
  )
}

function PanelTitle({ children }: { children: ReactNode }) {
  return <Typography component="h2" sx={panelTitleSx}>{children}</Typography>
}

function MetricToggle({
  selectedMetric,
  setSelectedMetric,
}: {
  selectedMetric: InventoryMetric
  setSelectedMetric: (metric: InventoryMetric) => void
}) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={selectedMetric}
      onChange={(_event, value: InventoryMetric | null) => {
        if (value !== null) {
          setSelectedMetric(value)
        }
      }}
      aria-label="Distribution metric"
      sx={{
        border: '1px solid',
        borderColor: 'light-dark(rgb(203 213 225), rgb(51 65 85))',
        borderRadius: '6px',
        overflow: 'hidden',
        '& .MuiToggleButton-root': {
          border: 0,
          borderRadius: 0,
          color: 'light-dark(rgb(71 85 105), rgb(148 163 184))',
          fontSize: 12,
          fontWeight: 700,
          lineHeight: 1,
          px: 2,
          py: 1,
          textTransform: 'none',
        },
        '& .MuiToggleButton-root.Mui-selected': {
          backgroundColor: 'light-dark(rgb(15 118 110), rgba(20,184,166,0.8))',
          color: 'light-dark(white, rgb(15 23 42))',
        },
        '& .MuiToggleButton-root.Mui-selected:hover': {
          backgroundColor: 'light-dark(rgb(17 94 89), rgb(45 212 191))',
        },
      }}
    >
      {metricOptions.map(option => (
        <ToggleButton key={option.value} value={option.value} aria-label={option.label}>
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
}

function MetricBar({ value, total }: { value: number; total: number }) {
  const share = getShare(value, total)

  return (
    <Stack direction="row" spacing={1.5} alignItems="center" minWidth={0}>
      <Typography
        sx={{
          color: 'light-dark(rgb(15 23 42), rgb(241 245 249))',
          fontSize: 16,
          fontWeight: 700,
          minWidth: 80,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatNumber(value)}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={share}
        sx={{
          backgroundColor: 'light-dark(rgb(226 232 240), rgb(30 41 59))',
          borderRadius: '2px',
          flex: 1,
          height: 8,
          minWidth: 120,
          '& .MuiLinearProgress-bar': {
            backgroundColor: 'light-dark(rgb(15 118 110), rgba(20,184,166,0.8))',
            borderRadius: '2px',
          },
        }}
      />
      <Typography
        sx={{
          color: 'light-dark(rgb(100 116 139), rgb(100 116 139))',
          fontSize: 13,
          minWidth: 42,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {share}%
      </Typography>
    </Stack>
  )
}

function StageTable({ snapshot }: { snapshot: DashboardOverviewSnapshot }) {
  const rows = [
    {
      label: 'Factory',
      cartons: snapshot.summary.factory.cartons,
      pallets: snapshot.summary.factory.pallets,
      units: snapshot.summary.factory.units,
      count: `${formatNumber(snapshot.summary.factory.poCount)} Inbound`,
    },
    {
      label: 'Transit',
      cartons: snapshot.summary.transit.cartons,
      pallets: snapshot.summary.transit.pallets,
      units: snapshot.summary.transit.units,
      count: `${formatNumber(snapshot.summary.transit.poCount)} Inbound`,
    },
    {
      label: 'Warehouse',
      cartons: snapshot.summary.warehouses.cartons,
      pallets: snapshot.summary.warehouses.pallets,
      units: snapshot.summary.warehouses.units,
      count: `${formatNumber(snapshot.summary.warehouses.warehouseCount)} sites`,
    },
  ]
  const totalCartons = rows.reduce((sum, row) => sum + row.cartons, 0)

  return (
    <Panel>
      <TableContainer>
        <Table size="small" sx={{ minWidth: 760, tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ ...headCellSx, width: '24%' }}>Stage</TableCell>
              <TableCell sx={{ ...headCellSx, width: '32%' }}>Cartons</TableCell>
              <TableCell align="right" sx={headCellSx}>Pallets</TableCell>
              <TableCell align="right" sx={headCellSx}>Units</TableCell>
              <TableCell align="right" sx={headCellSx}>Count</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(row => (
              <TableRow key={row.label} hover={false}>
                <TableCell
                  sx={{
                    ...strongCellSx,
                    fontSize: 16,
                    textTransform: 'uppercase',
                  }}
                >
                  {row.label}
                </TableCell>
                <TableCell sx={bodyCellSx}>
                  <MetricBar value={row.cartons} total={totalCartons} />
                </TableCell>
                <TableCell align="right" sx={bodyCellSx}>
                  {formatNumber(row.pallets)}
                </TableCell>
                <TableCell align="right" sx={bodyCellSx}>
                  {formatNumber(row.units)}
                </TableCell>
                <TableCell align="right" sx={{ ...bodyCellSx, color: 'light-dark(rgb(100 116 139), rgb(148 163 184))' }}>
                  {row.count}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Panel>
  )
}

function WarehouseTable({
  warehouses,
  selectedMetric,
}: {
  warehouses: DashboardOverviewSnapshot['warehouses']
  selectedMetric: InventoryMetric
}) {
  const totalSelected = warehouses.reduce(
    (sum, row) => sum + getMetricValue(row, selectedMetric),
    0
  )

  return (
    <Panel sx={{ height: '100%' }}>
      <Box sx={panelHeaderSx}>
        <PanelTitle>Warehouses</PanelTitle>
      </Box>
      <TableContainer>
        <Table size="small" sx={{ tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ ...headCellSx, width: '38%' }}>Warehouse</TableCell>
              <TableCell align="right" sx={headCellSx}>Cartons</TableCell>
              <TableCell align="right" sx={headCellSx}>Pallets</TableCell>
              <TableCell align="right" sx={headCellSx}>Units</TableCell>
              <TableCell align="right" sx={headCellSx}>SKUs</TableCell>
              <TableCell align="right" sx={headCellSx}>Share</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {warehouses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ ...bodyCellSx, py: 5 }}>
                  No warehouse stock.
                </TableCell>
              </TableRow>
            ) : null}
            {warehouses.map(row => {
              const selectedValue = getMetricValue(row, selectedMetric)
              const share = getShare(selectedValue, totalSelected)

              return (
                <TableRow key={row.warehouseCode} hover={false}>
                  <TableCell sx={bodyCellSx}>
                    <Typography
                      noWrap
                      sx={{
                        color: 'light-dark(rgb(15 23 42), rgb(241 245 249))',
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      {row.warehouseName}
                    </Typography>
                    <Typography
                      noWrap
                      sx={{
                        color: 'light-dark(rgb(100 116 139), rgb(100 116 139))',
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: '0.12em',
                        mt: 0.5,
                        textTransform: 'uppercase',
                      }}
                    >
                      {row.warehouseCode}
                    </Typography>
                  </TableCell>
                  {metricOptions.map(option => {
                    const selected = selectedMetric === option.value
                    return (
                      <TableCell
                        key={option.value}
                        align="right"
                        sx={selected ? strongCellSx : bodyCellSx}
                      >
                        {formatMetricValue(row, option.value)}
                      </TableCell>
                    )
                  })}
                  <TableCell align="right" sx={bodyCellSx}>
                    {formatNumber(row.skuCount)}
                  </TableCell>
                  <TableCell align="right" sx={{ ...bodyCellSx, color: 'light-dark(rgb(100 116 139), rgb(148 163 184))' }}>
                    {share}%
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Panel>
  )
}

function WarehouseChart({
  warehouses,
  selectedMetric,
  setSelectedMetric,
}: {
  warehouses: DashboardOverviewSnapshot['warehouses']
  selectedMetric: InventoryMetric
  setSelectedMetric: (metric: InventoryMetric) => void
}) {
  const chartData = warehouses.map(row => ({
    name: row.warehouseCode,
    value: getMetricValue(row, selectedMetric),
    carriesPallets: row.carriesPallets,
  }))
  const maxValue = chartData.reduce((max, row) => Math.max(max, row.value, 0), 0)
  const scaleMax = maxValue === 0 ? 1 : maxValue
  const metricLabel = metricLabels[selectedMetric].toLowerCase()

  return (
    <Panel sx={{ height: '100%' }}>
      <Box sx={panelHeaderSx}>
        <PanelTitle>Distribution</PanelTitle>
        <MetricToggle selectedMetric={selectedMetric} setSelectedMetric={setSelectedMetric} />
      </Box>

      <Stack spacing={2.5} sx={{ px: 2, py: 3 }}>
        {chartData.length === 0 ? (
          <Box sx={{ alignItems: 'center', display: 'flex', height: 224, justifyContent: 'center' }}>
            <Typography sx={{ color: 'light-dark(rgb(100 116 139), rgb(100 116 139))', fontSize: 14 }}>
              No chart data.
            </Typography>
          </Box>
        ) : null}
        {chartData.map(row => {
          const width = Math.round((Math.max(row.value, 0) / scaleMax) * 100)
          const displayValue =
            selectedMetric === 'pallets' && row.carriesPallets === false
              ? '—'
              : formatNumber(row.value)
          const title =
            selectedMetric === 'pallets' && row.carriesPallets === false
              ? `${row.name}: FBA does not carry pallets`
              : `${row.name}: ${formatNumber(row.value)} ${metricLabel}`

          return (
            <Box
              key={row.name}
              sx={{
                alignItems: 'center',
                display: 'grid',
                gap: 1.5,
                gridTemplateColumns: '5.75rem minmax(0, 1fr) 5rem',
              }}
            >
              <Typography
                noWrap
                sx={{
                  color: 'light-dark(rgb(71 85 105), rgb(203 213 225))',
                  fontSize: 13,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                {row.name}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={width}
                title={title}
                sx={{
                  backgroundColor: 'light-dark(rgb(226 232 240), rgba(30,41,59,0.78))',
                  borderRadius: '2px',
                  height: 40,
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: 'light-dark(rgb(15 118 110), rgba(20,184,166,0.82))',
                    borderRadius: '2px',
                  },
                }}
              />
              <Typography
                align="right"
                sx={{
                  color: 'light-dark(rgb(15 23 42), rgb(241 245 249))',
                  fontSize: 16,
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {displayValue}
              </Typography>
            </Box>
          )
        })}
      </Stack>
    </Panel>
  )
}

function RecentMovementSection({
  title,
  movements,
  direction,
}: {
  title: string
  movements: DashboardOverviewMovement[]
  direction: 'in' | 'out'
}) {
  const dateColumnLabel = direction === 'in' ? 'Received' : 'Shipped'
  const iconColor =
    direction === 'in'
      ? 'light-dark(rgb(15 118 110), rgb(45 212 191))'
      : 'light-dark(rgb(8 145 178), rgb(103 232 249))'

  return (
    <Panel sx={{ height: '100%', minHeight: 270 }}>
      <Box sx={panelHeaderSx}>
        <PanelTitle>{title}</PanelTitle>
        <MuiLink
          component={NextLink}
          href="/operations/transactions"
          underline="none"
          sx={{
            color: 'light-dark(rgb(15 118 110), rgb(45 212 191))',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          View all
        </MuiLink>
      </Box>

      {movements.length === 0 ? (
        <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ minHeight: 224, px: 2, py: 3 }}>
          <BoxIcon size={42} color="currentColor" />
          <Typography
            sx={{
              color: 'light-dark(rgb(100 116 139), rgb(100 116 139))',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            No recent movements
          </Typography>
        </Stack>
      ) : (
        <TableContainer sx={{ overflowX: 'hidden' }}>
          <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={recentHeadCellSx}>PO / SKU</TableCell>
                <TableCell sx={{ ...recentHeadCellSx, width: 82 }}>{dateColumnLabel}</TableCell>
                <TableCell sx={{ ...recentHeadCellSx, width: 56 }}>WH</TableCell>
                <TableCell align="right" sx={{ ...recentHeadCellSx, width: 66 }}>Units</TableCell>
                <TableCell align="right" sx={{ ...recentHeadCellSx, width: 72 }}>Cartons</TableCell>
                <TableCell align="right" sx={{ ...recentHeadCellSx, width: 66 }}>Pallets</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {movements.map(movement => (
                <TableRow
                  key={movement.id}
                  hover={false}
                  sx={{
                    borderLeft: '3px solid',
                    borderLeftColor: iconColor,
                  }}
                >
                  <TableCell sx={{ ...recentBodyCellSx, color: 'light-dark(rgb(15 23 42), rgb(241 245 249))', fontWeight: 700 }}>
                    <Stack spacing={0.15} minWidth={0}>
                      <Typography
                        noWrap
                        sx={{
                          color: 'light-dark(rgb(8 145 178), rgb(34 211 238))',
                          fontSize: 11,
                          fontWeight: 700,
                          lineHeight: 1.15,
                        }}
                      >
                        {movement.poId === null ? '-' : movement.poId}
                      </Typography>
                      <Typography
                        noWrap
                        sx={{
                          color: 'light-dark(rgb(15 23 42), rgb(241 245 249))',
                          fontSize: 11,
                          fontWeight: 700,
                          lineHeight: 1.15,
                        }}
                      >
                        {movement.skuCode}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ ...recentBodyCellSx, fontWeight: 700 }}>
                    <Typography noWrap sx={{ fontSize: 11, fontWeight: 700, lineHeight: 1.15 }}>
                      {formatDate(movement.transactionDate)}
                    </Typography>
                  </TableCell>
                  <TableCell sx={recentBodyCellSx}>
                    <Typography
                      noWrap
                      title={movement.warehouseName}
                      sx={{
                        color: 'light-dark(rgb(71 85 105), rgb(203 213 225))',
                        fontSize: 11,
                        fontWeight: 700,
                        lineHeight: 1.15,
                      }}
                    >
                      {movement.warehouseCode}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ ...recentBodyCellSx, fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumber(movement.units)}
                  </TableCell>
                  <TableCell align="right" sx={{ ...recentBodyCellSx, color: 'light-dark(rgb(15 23 42), rgb(241 245 249))', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                    {formatNumber(movement.cartons)}
                  </TableCell>
                  <TableCell align="right" sx={{ ...recentBodyCellSx, fontVariantNumeric: 'tabular-nums' }}>
                    {movement.carriesPallets ? formatNumber(movement.pallets) : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Panel>
  )
}

export function DashboardOverviewBoard({ snapshot }: { snapshot: DashboardOverviewSnapshot }) {
  const [selectedMetric, setSelectedMetric] = useState<InventoryMetric>('cartons')
  const warehouses = useMemo(
    () =>
      [...snapshot.warehouses].sort(
        (left, right) =>
          getMetricValue(right, selectedMetric) - getMetricValue(left, selectedMetric)
      ),
    [selectedMetric, snapshot.warehouses]
  )

  return (
    <Stack
      spacing={2.5}
      sx={{
        color: 'light-dark(rgb(51 65 85), rgb(226 232 240))',
        flex: 1,
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        width: '100%',
      }}
    >
      <StageTable snapshot={snapshot} />

      <Box
        sx={{
          display: 'grid',
          gap: 2.5,
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            lg: 'minmax(0, 1.3fr) minmax(22rem, 0.7fr)',
          },
          minWidth: 0,
        }}
      >
        <WarehouseTable warehouses={warehouses} selectedMetric={selectedMetric} />
        <WarehouseChart
          warehouses={warehouses}
          selectedMetric={selectedMetric}
          setSelectedMetric={setSelectedMetric}
        />
      </Box>

      <Box
        sx={{
          display: 'grid',
          flex: {
            lg: 1,
          },
          gap: 2.5,
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            lg: 'repeat(2, minmax(0, 1fr))',
          },
          height: {
            lg: '100%',
          },
          minHeight: {
            lg: 270,
          },
          minWidth: 0,
        }}
      >
        <RecentMovementSection title="Recent In" movements={snapshot.recentIn} direction="in" />
        <RecentMovementSection title="Recent Out" movements={snapshot.recentOut} direction="out" />
      </Box>
    </Stack>
  )
}
