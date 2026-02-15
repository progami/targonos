'use client';

import * as React from 'react';
import MuiDialog from '@mui/material/Dialog';
import MuiDialogTitle from '@mui/material/DialogTitle';
import MuiDialogContent from '@mui/material/DialogContent';
import MuiDialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import CloseIcon from '@mui/icons-material/Close';
import type { SxProps, Theme } from '@mui/material/styles';

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  fullWidth?: boolean;
  sx?: SxProps<Theme>;
};

function Dialog({ open, onOpenChange, children, maxWidth = 'sm', fullWidth = true, sx }: DialogProps) {
  return (
    <MuiDialog
      open={open}
      onClose={() => onOpenChange(false)}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
      sx={sx}
      slotProps={{
        backdrop: {
          sx: { bgcolor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' },
        },
      }}
    >
      {children}
    </MuiDialog>
  );
}

type DialogContentProps = {
  children: React.ReactNode;
  showClose?: boolean;
  onClose?: () => void;
  sx?: SxProps<Theme>;
};

function DialogContent({ children, showClose = true, onClose, sx }: DialogContentProps) {
  return (
    <MuiDialogContent sx={{ position: 'relative', p: 3, ...sx }}>
      {showClose && onClose && (
        <IconButton
          onClick={onClose}
          size="small"
          sx={{
            position: 'absolute',
            right: 12,
            top: 12,
            color: 'text.disabled',
            '&:hover': { color: 'text.secondary', bgcolor: 'action.hover' },
          }}
          aria-label="Close"
        >
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      )}
      {children}
    </MuiDialogContent>
  );
}

function DialogHeader({ children, sx }: { children: React.ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, textAlign: { xs: 'center', sm: 'left' }, ...sx }}>
      {children}
    </Box>
  );
}

function DialogFooter({ children, sx }: { children: React.ReactNode; sx?: SxProps<Theme> }) {
  return (
    <MuiDialogActions sx={{ px: 3, pb: 3, pt: 0, ...sx }}>
      {children}
    </MuiDialogActions>
  );
}

function DialogTitle({ children, sx }: { children: React.ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Typography
      variant="h6"
      component="div"
      sx={{ fontWeight: 600, lineHeight: 1, letterSpacing: '-0.01em', color: 'text.primary', ...sx }}
    >
      {children}
    </Typography>
  );
}

function DialogDescription({ children, sx }: { children: React.ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Typography variant="body2" sx={{ color: 'text.secondary', ...sx }}>
      {children}
    </Typography>
  );
}

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
