import type { ReactNode } from 'react';
import { CsRegionLayout } from '../components/CsRegionLayout';

export default function CsUsLayout({ children }: { children: ReactNode }) {
  return <CsRegionLayout region="us">{children}</CsRegionLayout>;
}
