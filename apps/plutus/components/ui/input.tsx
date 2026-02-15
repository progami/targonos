import * as React from 'react';
import TextField from '@mui/material/TextField';
import type { SxProps, Theme } from '@mui/material/styles';

type InputProps = Omit<React.ComponentProps<'input'>, 'size'> & {
  sx?: SxProps<Theme>;
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ sx, type, ...props }, ref) => {
  return (
    <TextField
      inputRef={ref}
      type={type}
      size="small"
      variant="outlined"
      fullWidth
      slotProps={{
        input: {
          sx: {
            fontSize: '0.875rem',
            height: 36,
          },
        },
      }}
      sx={{
        '& .MuiOutlinedInput-root': {
          borderRadius: '8px',
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#45B3D4',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#00C2B9',
            borderWidth: 2,
          },
        },
        ...sx,
      }}
      {...(props as any)}
    />
  );
});
Input.displayName = 'Input';

export { Input };
