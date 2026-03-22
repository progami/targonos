import Image from 'next/image';
import Link from 'next/link';

export const metadata = {
  title: 'Caelum Star — Select Region'
};

const regions = [
  {
    flag: '\u{1F1FA}\u{1F1F8}',
    title: 'United States',
    href: '/cs/us/packs'
  },
  {
    flag: '\u{1F1EC}\u{1F1E7}',
    title: 'United Kingdom',
    href: '/cs/uk/packs'
  }
];

export default function CaelumStarPage() {
  return (
    <>
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#012d44] px-6">
        <div className="w-full max-w-md text-center">
          <Image
            src="/logos/caelum-star-white.png"
            alt="Caelum Star"
            width={200}
            height={46}
            className="mx-auto h-auto w-[180px]"
            priority
          />

          <p className="mt-6 text-sm text-white/40">Select your region</p>

          <div className="mt-8 flex flex-col gap-3">
            {regions.map((r) => (
              <Link
                key={r.title}
                href={r.href}
                className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.04] px-6 py-4 text-left transition-all hover:border-[#3AF3FF]/30 hover:bg-white/[0.08]"
              >
                <span className="text-2xl">{r.flag}</span>
                <span className="text-base font-semibold text-white">{r.title}</span>
              </Link>
            ))}
          </div>

          <Link href="/" className="mt-10 inline-block opacity-40 transition-opacity hover:opacity-70">
            <Image src="/brand/logo-inverted.svg" alt="Targon" width={80} height={18} className="h-4 w-auto" />
          </Link>
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            body > header,
            main#main-content + footer,
            a[href="#main-content"] {
              display: none;
            }
            body,
            main#main-content {
              background: #012d44;
              padding: 0;
              margin: 0;
            }
          `
        }}
      />
    </>
  );
}
