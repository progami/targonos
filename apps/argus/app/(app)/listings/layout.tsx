import type { ReactNode } from 'react'
import { ListingsLayoutClient } from './listings-layout-client'

export default function ListingsLayout({ children }: { children: ReactNode }) {
  return <ListingsLayoutClient>{children}</ListingsLayoutClient>
}

