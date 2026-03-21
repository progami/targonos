import type { ReactNode } from 'react';
import { CsRegionLayout } from '../components/CsRegionLayout';

export default function CsUkLayout({ children }: { children: ReactNode }) {
  return <CsRegionLayout region="uk">{children}</CsRegionLayout>;
}
