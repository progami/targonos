import Link from 'next/link';
import { site } from '@/content/site';
import { Container } from '@/components/Container';

const footerLinks = {
  Products: [
    { label: 'All products', href: '/products' },
    { label: 'Where to buy', href: '/where-to-buy' }
  ],
  Company: [
    { label: 'About', href: '/about' },
    { label: 'Support', href: '/support' }
  ],
  Legal: [
    { label: 'Privacy', href: '/legal/privacy' },
    { label: 'Terms', href: '/legal/terms' }
  ]
};

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-border">
      <Container className="py-12">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <div className="text-base font-semibold tracking-tightish">{site.name}</div>
            <p className="mt-3 max-w-md text-sm text-muted">
              Sustainable protection products designed for clean work. Built with recycled materials and obsessive attention to detail.
            </p>
            <p className="mt-4 text-sm text-muted">
              Contact: <a className="font-semibold text-ink hover:underline" href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 md:col-span-7 md:grid-cols-3">
            {Object.entries(footerLinks).map(([title, links]) => (
              <div key={title}>
                <div className="text-sm font-semibold text-ink">{title}</div>
                <ul className="mt-3 space-y-2">
                  {links.map((l) => (
                    <li key={l.href}>
                      <Link className="text-sm text-muted hover:text-ink" href={l.href}>
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted md:flex-row md:items-center md:justify-between">
          <div>© {year} {site.name}. All rights reserved.</div>
          <div>Built for performance, accessibility, and clarity.</div>
        </div>
      </Container>
    </footer>
  );
}
