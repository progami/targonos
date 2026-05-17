import type { ReactNode } from 'react';
import { CaelumStarHeader } from './Header';

export function CsRegionLayout({
  region,
  children
}: {
  region: 'us' | 'uk';
  children: ReactNode;
}) {
  return (
    <div className="cs-scroll-wrap">
      <CaelumStarHeader region={region} />
      <style
        dangerouslySetInnerHTML={{
          __html: `
            body > header,
            main#main-content + footer,
            a[href="#main-content"] {
              display: none;
            }
          `
        }}
      />
      {children}
    </div>
  );
}
