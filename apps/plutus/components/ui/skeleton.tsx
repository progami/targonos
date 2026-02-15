import * as React from 'react';
import MuiSkeleton from '@mui/material/Skeleton';
import Box from '@mui/material/Box';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  sx?: object;
}

function Skeleton({ className, sx, ...props }: SkeletonProps) {
  return (
    <MuiSkeleton
      variant="rectangular"
      animation="pulse"
      sx={{
        bgcolor: 'action.hover',
        borderRadius: 1,
        ...sx,
      }}
      className={className}
      {...(props as any)}
    />
  );
}

function SkeletonText({ sx, ...props }: SkeletonProps) {
  return <Skeleton sx={{ height: 16, width: '100%', borderRadius: 0.5, ...sx }} {...props} />;
}

function SkeletonTableRow({ columns = 5 }: { columns?: number }) {
  return (
    <TableRow sx={{ '&:hover': { bgcolor: 'transparent' } }}>
      {Array.from({ length: columns }).map((_, i) => (
        <TableCell key={i}>
          <Skeleton sx={{ height: 16, width: '100%', maxWidth: 120 }} />
        </TableCell>
      ))}
    </TableRow>
  );
}

function SkeletonTable({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonTableRow key={i} columns={columns} />
      ))}
    </>
  );
}

function SkeletonCard({ sx, ...props }: { sx?: object } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Box
      sx={{
        borderRadius: 4,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        p: 3,
        ...sx,
      }}
      {...(props as any)}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Skeleton sx={{ height: 20, width: '33%' }} />
        <Skeleton sx={{ height: 16, width: '66%' }} />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 1 }}>
          <Skeleton sx={{ height: 12, width: '100%' }} />
          <Skeleton sx={{ height: 12, width: '80%' }} />
        </Box>
      </Box>
    </Box>
  );
}

export { Skeleton, SkeletonText, SkeletonTableRow, SkeletonTable, SkeletonCard };
