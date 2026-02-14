import * as React from 'react';
import MuiTable from '@mui/material/Table';
import MuiTableHead from '@mui/material/TableHead';
import MuiTableBody from '@mui/material/TableBody';
import MuiTableRow from '@mui/material/TableRow';
import MuiTableCell from '@mui/material/TableCell';
import type { SxProps, Theme } from '@mui/material/styles';

type TableProps = React.HTMLAttributes<HTMLTableElement> & { sx?: SxProps<Theme> };
type TableSectionProps = React.HTMLAttributes<HTMLTableSectionElement> & { sx?: SxProps<Theme> };
type TableRowProps = React.HTMLAttributes<HTMLTableRowElement> & { sx?: SxProps<Theme> };
type TableCellProps = React.TdHTMLAttributes<HTMLTableCellElement> & React.ThHTMLAttributes<HTMLTableCellElement> & { sx?: SxProps<Theme>; component?: string };

const Table = React.forwardRef<HTMLTableElement, TableProps>(({ sx, ...props }, ref) => (
  <MuiTable ref={ref} sx={{ width: '100%', fontSize: '0.875rem', ...sx }} {...(props as any)} />
));
Table.displayName = 'Table';

const TableHeader = React.forwardRef<HTMLTableSectionElement, TableSectionProps>(({ sx, ...props }, ref) => (
  <MuiTableHead
    ref={ref}
    sx={{
      bgcolor: 'rgba(248, 250, 252, 0.8)',
      '[data-mui-color-scheme="dark"] &, .dark &': {
        bgcolor: 'rgba(255, 255, 255, 0.05)',
      },
      '& .MuiTableRow-root': { borderBottom: 1, borderColor: 'divider' },
      ...sx,
    }}
    {...(props as any)}
  />
));
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<HTMLTableSectionElement, TableSectionProps>(({ sx, ...props }, ref) => (
  <MuiTableBody
    ref={ref}
    sx={{
      '& .MuiTableRow-root:last-child': { borderBottom: 0 },
      ...sx,
    }}
    {...(props as any)}
  />
));
TableBody.displayName = 'TableBody';

const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(({ sx, ...props }, ref) => (
  <MuiTableRow
    ref={ref}
    sx={{
      borderBottom: 1,
      borderColor: 'divider',
      transition: 'background-color 0.15s',
      '&:hover': { bgcolor: 'action.hover' },
      '&[data-state="selected"]': {
        bgcolor: 'rgba(69, 179, 212, 0.08)',
      },
      ...sx,
    }}
    {...(props as any)}
  />
));
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<HTMLTableCellElement, TableCellProps>(({ sx, ...props }, ref) => (
  <MuiTableCell
    ref={ref}
    component="th"
    sx={{
      height: 44,
      px: 1.5,
      fontSize: '0.75rem',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: 'text.secondary',
      ...sx,
    }}
    {...(props as any)}
  />
));
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(({ sx, ...props }, ref) => (
  <MuiTableCell
    ref={ref}
    sx={{
      px: 1.5,
      py: 1.5,
      color: 'text.primary',
      fontVariantNumeric: 'tabular-nums',
      ...sx,
    }}
    {...(props as any)}
  />
));
TableCell.displayName = 'TableCell';

export { Table, TableHeader, TableBody, TableHead, TableRow, TableCell };
