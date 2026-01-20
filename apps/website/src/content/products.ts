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

// Direct Amazon links provided by the brand.
// 6-pack is the primary (UK listing).
const AMAZON_UK_6PK = 'https://www.amazon.co.uk/Caelum-Star-Plastic-Sheets-Decorating/dp/B09HXC3NL8?th=1';

// Other pack links (placeholders where region/price may vary).
const AMAZON_1PK = 'https://www.amazon.com/dp/B0FLKJ7WWM?th=1';
const AMAZON_3PK = 'https://www.amazon.com/dp/B0CR1GSBQ9?th=1';
const AMAZON_12PK = 'https://www.amazon.com/dp/B0FP66CWQ6?th=1';

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
    tagline: 'Essential coverage.',
    description: 'Extra‑large plastic dust sheets for decorating and protection.',
    longDescription: [
      'Big coverage per sheet. Fast prep for floors, furniture, and doorways.',
      'Light durability (intended for light use).',
      'Made with recycled plastic and globally certified.'
    ],
    highlights: ['12ft × 9ft per sheet', '55% recycled plastic (GRS certified)', 'LDPE plastic sheeting'],
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
    amazonUrl: AMAZON_UK_6PK
  },
  {
    slug: '3pk-standard',
    name: '3 Pack',
    packLabel: '3 PK',
    thicknessLabel: 'Strong',
    coverageLabel: '324 sq ft',
    tagline: 'Basic coverage.',
    description: 'Extra‑large dust sheets with strong durability for everyday jobs.',
    longDescription: ['A flexible middle ground: more sheets, strong durability, easy storage.'],
    highlights: ['12ft × 9ft per sheet', 'Strong durability', '324 sq ft total coverage'],
    specs: [
      { label: 'Pack', value: '3 sheets' },
      { label: 'Total coverage', value: '324 sq ft (≈30 m²)' },
      { label: 'Sheet size', value: '3.6m × 2.7m (12ft × 9ft) each' },
      { label: 'Durability', value: 'Strong' },
      { label: 'Material', value: 'LDPE (plastic sheeting)' }
    ],
    image: { src: '/images/products/dust-basic-3pk.webp', alt: 'CS 3 Pack Extra Large Dust Sheets by Caelum Star' },
    gallery: [
      { src: '/images/amazon/pick-protection.jpg', alt: 'Pack size comparison: strong vs light durability' },
      { src: '/images/amazon/lifestyle-compare.jpg', alt: 'Dust sheets used during decorating prep' },
      { src: '/images/unsplash/painting-setup.webp', alt: 'Painting setup with ladder and tools' }
    ],
    amazonUrl: AMAZON_3PK
  },
  {
    slug: '1pk-strong',
    name: '1 Pack',
    packLabel: '1 PK',
    thicknessLabel: 'Strong',
    coverageLabel: '108 sq ft',
    tagline: 'Core coverage.',
    description: 'One extra‑large sheet. Strong durability. Quick protection.',
    longDescription: ['Perfect for quick jobs, spot coverage, and keeping a spare in the van.'],
    highlights: ['12ft × 9ft sheet', 'Strong durability', '108 sq ft coverage'],
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
    amazonUrl: AMAZON_1PK
  },
  {
    slug: '12pk-light',
    name: '12 Pack',
    packLabel: '12 PK',
    thicknessLabel: 'Light',
    coverageLabel: '1296 sq ft',
    tagline: 'Deluxe coverage.',
    description: 'More sheets for bigger rooms and multi‑room projects.',
    longDescription: ['For renovations and repeat work: stock up and stay covered.'],
    highlights: ['12ft × 9ft per sheet', 'Light durability', '1296 sq ft total coverage'],
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
    amazonUrl: AMAZON_12PK
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
