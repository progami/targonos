import * as React from 'react';
import MuiCard from '@mui/material/Card';
import MuiCardHeader from '@mui/material/CardHeader';
import MuiCardContent from '@mui/material/CardContent';
import MuiCardActions from '@mui/material/CardActions';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';

type CardProps = React.HTMLAttributes<HTMLDivElement> & { sx?: SxProps<Theme> };

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ sx, children, ...props }, ref) => (
  <MuiCard ref={ref} sx={sx} {...(props as any)}>
    {children}
  </MuiCard>
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, CardProps>(({ sx, children, ...props }, ref) => (
  <Box
    ref={ref}
    sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, p: 3, ...sx }}
    {...(props as any)}
  >
    {children}
  </Box>
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLDivElement, CardProps>(({ sx, children, ...props }, ref) => (
  <Typography
    ref={ref}
    variant="subtitle1"
    component="div"
    sx={{ fontWeight: 600, lineHeight: 1, letterSpacing: '-0.01em', color: 'text.primary', ...sx }}
    {...(props as any)}
  >
    {children}
  </Typography>
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLDivElement, CardProps>(({ sx, children, ...props }, ref) => (
  <Typography
    ref={ref}
    variant="body2"
    component="div"
    sx={{ color: 'text.secondary', ...sx }}
    {...(props as any)}
  >
    {children}
  </Typography>
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, CardProps>(({ sx, children, ...props }, ref) => (
  <MuiCardContent ref={ref} sx={{ p: 3, pt: 0, '&:last-child': { pb: 3 }, ...sx }} {...(props as any)}>
    {children}
  </MuiCardContent>
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, CardProps>(({ sx, children, ...props }, ref) => (
  <MuiCardActions
    ref={ref}
    sx={{ display: 'flex', alignItems: 'center', p: 3, pt: 0, ...sx }}
    {...(props as any)}
  >
    {children}
  </MuiCardActions>
));
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
