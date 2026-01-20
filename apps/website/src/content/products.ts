export type ProductSpec = {
  label: string;
  value: string;
};

export type Product = {
  slug: string;

  /**
   * Used to highlight the primary pack (requested: 6 pack).
   */
  primary?: boolean;

  /**
   * Short display name (Apple-style).
   * Example: “3 Pack”.
   */
  name: string;

  /**
   * Ultra-short supporting line.
   */
  tagline: string;

  /**
   * One paragraph max.
   */
  description: string;

  /**
   * A few short paragraphs for the product detail page.
   */
  longDescription: string[];

  highlights: string[];
  specs: ProductSpec[];

  image: {
    src: string;
    alt: string;
  };
  gallery: { src: string; alt: string }[];

  /**
   * Primary purchase link.
   */
  amazonUrl: string;

  /**
   * Optional secondary purchase link (e.g. another Amazon region).
   */
  amazonAltUrl?: string;
  amazonAltLabel?: string;

  /**
   * Display price (copied from Amazon at time of update). Prices can change.
   */
  price?: string;

  /**
   * Coverage callout used in Apple-style comparisons.
   * Example: “648 sq ft”.
   */
  coverageLabel?: string;

  /**
   * Quick facts used on cards / product selectors.
   */
  packLabel: string;
  thicknessLabel: string;
};

// Direct Amazon links provided by the brand (kept verbatim).
// NOTE: Some Amazon regions hide prices unless signed in.
// We show the latest price we *can* verify and otherwise say “See Amazon”.

// Primary pack (6-pack). UK listing we can reliably read price from.
const AMAZON_UK_6PK = 'https://www.amazon.co.uk/Caelum-Star-Plastic-Sheets-Decorating/dp/B09HXC3NL8?th=1';

// User-provided Amazon.com links (kept as-is for reference/traffic).
const AMAZON_US_6PK =
  'https://www.amazon.com/CS-Decorating-Sheet-Plastic-Sheeting-Dust-Painting-Polythene/dp/B09HXC3NL8/ref=zg_bs_g_13399811_d_sccl_23/137-9710728-0147067?th=1';
const AMAZON_US_1PK =
  'https://www.amazon.com/CS-Decorating-Sheet-Plastic-Sheeting-Dust-Painting-Polythene/dp/B0FLKJ7WWM/ref=zg_bs_g_13399811_d_sccl_23/137-9710728-0147067?th=1';
const AMAZON_US_3PK =
  'https://www.amazon.com/CS-Decorating-Sheet-Plastic-Sheeting-Dust-Painting-Polythene/dp/B0CR1GSBQ9/ref=zg_bs_g_13399811_d_sccl_23/137-9710728-0147067?th=1';
const AMAZON_US_12PK =
  'https://www.amazon.com/CS-Decorating-Sheet-Plastic-Sheeting-Dust-Painting-Polythene/dp/B0FP66CWQ6/ref=zg_bs_g_13399811_d_sccl_23/137-9710728-0147067?th=1';

/**
 * Product set:
 * We keep the site extremely focused: one core product with a few pack options.
 * Checkout stays on Amazon.
 */
export const products: Product[] = [
  {
    slug: '6pk-light',
    primary: true,
    name: '6 Pack',
    packLabel: '6 PK',
    thicknessLabel: 'Light',
    coverageLabel: '648 sq ft',
    // Price copied from the Amazon UK product summary at time of update.
    // Prices can change.
    price: '£5.82',
    tagline: 'Essential coverage for standard projects.',
    description: 'Extra‑large plastic dust sheets for decorating, painting, and quick protection.',
    longDescription: [
      'Paint with confidence. Cover floors, furniture, and doorways fast.',
      'Light durability, intended for light use.',
      '55% recycled plastic, globally certified.'
    ],
    highlights: ['12ft × 9ft per sheet', 'Light durability', '55% recycled plastic (GRS)'],
    specs: [
      { label: 'Pack', value: '6 sheets' },
      { label: 'Total coverage', value: '648 sq ft (≈60 m²)' },
      { label: 'Sheet size', value: '3.6m × 2.7m (12ft × 9ft) each' },
      { label: 'Durability', value: 'Light' },
      { label: 'Material', value: 'LDPE' },
      { label: 'Recycled content', value: '55% recycled plastic' },
      { label: 'Certification', value: 'Global Recycled Standard (TE-00103494)' },
      { label: 'Weight', value: '290 g' },
      { label: 'Part number', value: 'CS-007' }
    ],
    image: { src: '/images/products/dust-essential-6pk.webp', alt: 'CS 6 Pack Extra Large Dust Sheets by Caelum Star' },
    gallery: [
      { src: '/images/amazon/aplus-4.jpg', alt: 'Dust sheet benefits: waterproof, coverage, recyclability, dust & debris' },
      { src: '/images/amazon/lifestyle-compare.jpg', alt: 'Dust sheets in use for decorating and furniture protection' },
      { src: '/images/amazon/fit-coverage.jpg', alt: 'Coverage comparison across pack sizes' }
    ],
    amazonUrl: AMAZON_UK_6PK,
    amazonAltUrl: AMAZON_US_6PK,
    amazonAltLabel: 'Amazon.com'
  },
  {
    slug: '3pk-standard',
    name: '3 Pack',
    packLabel: '3 PK',
    thicknessLabel: 'Standard',
    coverageLabel: '324 sq ft',
    tagline: 'Basic coverage for single‑room work.',
    description: 'Extra‑large dust sheets built for standard decorating use.',
    longDescription: [
      'Basic coverage for single‑room renovations.',
      'Standard durability, intended for standard use.',
      '55% recycled plastic, globally certified.'
    ],
    highlights: ['12ft × 9ft per sheet', 'Standard durability', '55% recycled plastic (GRS)'],
    specs: [
      { label: 'Pack', value: '3 sheets' },
      { label: 'Total coverage', value: '324 sq ft (≈30 m²)' },
      { label: 'Sheet size', value: '3.6m × 2.7m (12ft × 9ft) each' },
      { label: 'Durability', value: 'Standard' },
      { label: 'Material', value: 'LDPE (plastic sheeting)' }
    ],
    image: { src: '/images/products/dust-basic-3pk.webp', alt: 'CS 3 Pack Extra Large Dust Sheets by Caelum Star' },
    gallery: [
      { src: '/images/amazon/pick-protection.jpg', alt: 'Pack size comparison: strong vs light durability' },
      { src: '/images/amazon/lifestyle-compare.jpg', alt: 'Dust sheets used during decorating prep' },
      { src: '/images/unsplash/painting-setup.webp', alt: 'Painting setup with ladder and tools' }
    ],
    amazonUrl: AMAZON_US_3PK
  },
  {
    slug: '1pk-strong',
    name: '1 Pack',
    packLabel: '1 PK',
    thicknessLabel: 'Strong',
    coverageLabel: '108 sq ft',
    tagline: 'Core coverage for spot projects.',
    description: 'One extra‑large sheet with strong durability for quick jobs.',
    longDescription: [
      'Core coverage, ideal for spot projects.',
      'Strong durability for reliable protection.',
      '55% recycled plastic, globally certified.'
    ],
    highlights: ['12ft × 9ft sheet', 'Strong durability', '55% recycled plastic (GRS)'],
    specs: [
      { label: 'Pack', value: '1 sheet' },
      { label: 'Coverage', value: '108 sq ft (≈10 m²)' },
      { label: 'Sheet size', value: '3.6m × 2.7m (12ft × 9ft)' },
      { label: 'Durability', value: 'Strong' },
      { label: 'Material', value: 'LDPE (plastic sheeting)' }
    ],
    image: { src: '/images/products/dust-core-1pk.webp', alt: 'CS 1 Pack Extra Large Dust Sheet by Caelum Star' },
    gallery: [
      { src: '/images/amazon/pick-protection.jpg', alt: 'Pack size comparison: strong vs light durability' },
      { src: '/images/amazon/aplus-4.jpg', alt: 'Dust sheet benefits overview' },
      { src: '/images/unsplash/plastic-texture.webp', alt: 'Close-up plastic sheet texture' }
    ],
    amazonUrl: AMAZON_US_1PK
  },
  {
    slug: '12pk-light',
    name: '12 Pack',
    packLabel: '12 PK',
    thicknessLabel: 'Light',
    coverageLabel: '1296 sq ft',
    tagline: 'Deluxe coverage for multi‑room renovations.',
    description: 'More sheets for bigger rooms, repeat work, and bigger prep.',
    longDescription: [
      'Deluxe coverage for multi‑room renovations.',
      'Light durability, universal protection.',
      '55% recycled plastic, globally certified.'
    ],
    highlights: ['12ft × 9ft per sheet', 'Light durability', '55% recycled plastic (GRS)'],
    specs: [
      { label: 'Pack', value: '12 sheets' },
      { label: 'Total coverage', value: '1296 sq ft (≈120 m²)' },
      { label: 'Sheet size', value: '3.6m × 2.7m (12ft × 9ft) each' },
      { label: 'Durability', value: 'Light' },
      { label: 'Material', value: 'LDPE (plastic sheeting)' }
    ],
    image: { src: '/images/products/dust-deluxe-12pk.webp', alt: 'CS 12 Pack Extra Large Dust Sheets by Caelum Star' },
    gallery: [
      { src: '/images/amazon/fit-coverage.jpg', alt: 'Coverage comparison across pack sizes' },
      { src: '/images/amazon/lifestyle-compare.jpg', alt: 'Dust sheets used for floor and furniture protection' },
      { src: '/images/unsplash/renovation-room.webp', alt: 'Room prep for renovation' }
    ],
    amazonUrl: AMAZON_US_12PK
  }
];

export function getAllProducts() {
  return products;
}

export function getProductBySlug(slug: string) {
  return products.find((p) => p.slug === slug) ?? null;
}

export function getProductSlugs() {
  return products.map((p) => p.slug);
}
