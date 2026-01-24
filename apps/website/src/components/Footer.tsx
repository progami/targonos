import Link from 'next/link';
import { site } from '@/content/site';
import { Container } from '@/components/Container';

const footerLinks = {
  Explore: [
    { label: 'Home', href: '/' },
    { label: 'Caelum Star', href: '/caelum-star' },
    { label: 'Packs', href: '/products' },
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
    <footer className="mt-16 border-t border-white/10 bg-black text-white">
      <Container className="py-14">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <div className="text-base font-semibold tracking-tightish text-white">{site.name}</div>
            <p className="mt-3 max-w-md text-sm text-white/70">
              AI‑driven manufacturing &amp; design. Home of {site.productBrandName}.
            </p>
            <p className="mt-4 text-sm text-white/70">
              Contact:{' '}
              <a className="font-semibold text-white hover:underline" href={`mailto:${site.contactEmail}`}>
                {site.contactEmail}
              </a>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 md:col-span-7 md:grid-cols-3">
            {Object.entries(footerLinks).map(([title, links]) => (
              <div key={title}>
                <div className="text-sm font-semibold text-white">{title}</div>
                <ul className="mt-3 space-y-2">
                  {links.map((l) => (
                    <li key={l.href}>
                      <Link
                        className="group relative inline-block text-sm text-white/65 transition-colors duration-200 hover:text-white"
                        href={l.href}
                      >
                        {l.label}
                        <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-accent transition-all duration-300 group-hover:w-full" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6 text-xs text-white/50">
          <div>
            © {year} {site.name}. All rights reserved.
          </div>
        </div>
      </Container>
    </footer>
  );
}
