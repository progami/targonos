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
  gallery: { src: string; alt: string; variant: 'wide' | 'square' }[];

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
   * Website list price. Intentionally maintained above Amazon marketplace price.
   */
  price?: string;

  /** Optional compare-at price for website merchandising */
  typicalPrice?: string;

  /** Discount percentage e.g. “-11%” */
  discount?: string;

  /** Per-unit price e.g. “$1.33 / count” */
  unitPrice?: string;

  /** Special price badge e.g. “Lowest price in 30 days” */
  priceBadge?: string;

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
// Website list prices are intentionally set above Amazon marketplace pricing.
// Amazon pricing can change independently by region and delivery context.

// Verified ASIN mapping: 1PK=B0FLKJ7WWM, 3PK=B0CR1GSBQ9, 6PK=B09HXC3NL8, 12PK=B0FP66CWQ6

// US Amazon links
const AMAZON_US_1PK = 'https://www.amazon.com/dp/B0FLKJ7WWM?th=1';
const AMAZON_US_3PK = 'https://www.amazon.com/dp/B0CR1GSBQ9?th=1';
const AMAZON_US_6PK = 'https://www.amazon.com/dp/B09HXC3NL8?th=1';
const AMAZON_US_12PK = 'https://www.amazon.com/dp/B0FP66CWQ6?th=1';

// UK Amazon links (same ASINs on amazon.co.uk)
const AMAZON_UK_1PK = 'https://www.amazon.co.uk/dp/B0FLKJ7WWM';
const AMAZON_UK_3PK = 'https://www.amazon.co.uk/dp/B0CR1GSBQ9';
const AMAZON_UK_6PK = 'https://www.amazon.co.uk/dp/B09HXC3NL8';
const AMAZON_UK_12PK = 'https://www.amazon.co.uk/dp/B0FP66CWQ6';

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
    price: '$12.99',
    unitPrice: '$2.17 / count',
    tagline: 'Multi coverage for standard projects.',
    description: 'Extra large plastic drop cloths for decorating, painting, and quick protection.',
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
    image: { src: '/images/products/US-products/6pk-light.png', alt: 'CS 6 Pack Extra Large Drop Cloths by Caelum Star' },
    gallery: [
      {
        src: '/images/amazon/uk/6pk-light-lifestyle.webp',
        alt: 'Essential coverage — perfect for standard projects (6 pack)',
        variant: 'square'
      },
      { src: '/images/amazon/general-projects.webp', alt: 'Ideal for general projects: coverage and thickness', variant: 'square' },
      { src: '/images/amazon/fit-coverage.webp', alt: 'Find your perfect fit: pack-to-coverage comparison', variant: 'wide' },
      { src: '/images/amazon/pick-protection.webp', alt: 'Pick your protection: pack options at a glance', variant: 'wide' },
      { src: '/images/amazon/applications.webp', alt: 'Applications: moving, painting, renovating', variant: 'square' },
      { src: '/images/amazon/sustainable-process.webp', alt: 'Sustainable efficiency: recycled plastic into protective sheets', variant: 'wide' },
      { src: '/images/amazon/sustainable-efficiency.webp', alt: '55% recycled plastic and eco-kind packaging', variant: 'square' }
    ],
    amazonUrl: AMAZON_US_6PK
  },
  {
    slug: '1pk-strong',
    name: '1 Pack',
    packLabel: '1 PK',
    thicknessLabel: 'Strong',
    coverageLabel: '108 sq ft',
    price: '$9.99',
    tagline: 'Spot coverage for quick jobs.',
    description: 'One extra large drop cloth with strong durability for quick jobs.',
    longDescription: [
      'Spot coverage, ideal for quick jobs.',
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
    image: { src: '/images/products/US-products/1pk-strong.png', alt: 'CS 1 Pack Extra Large Drop Cloth by Caelum Star' },
    gallery: [
      {
        src: '/images/amazon/uk/1pk-strong-lifestyle.webp',
        alt: 'Core coverage — perfect for spot projects (1 pack)',
        variant: 'square'
      },
      { src: '/images/amazon/uk/1pk-strong-hero.webp', alt: '1 pack coverage and thickness', variant: 'square' },
      { src: '/images/amazon/pick-protection.webp', alt: 'Pick your protection: pack options at a glance', variant: 'wide' },
      { src: '/images/amazon/strong-vs-light.webp', alt: 'Strong vs light durability comparison', variant: 'wide' },
      { src: '/images/amazon/aplus-4.webp', alt: 'One sheet, multiple benefits', variant: 'wide' }
    ],
    amazonUrl: AMAZON_US_1PK
  },
  {
    slug: '3pk-standard',
    name: '3 Pack',
    packLabel: '3 PK',
    thicknessLabel: 'Standard',
    coverageLabel: '324 sq ft',
    price: '$17.99',
    unitPrice: '$6.00 / count',
    tagline: 'Room coverage for single-room work.',
    description: 'Extra large drop cloths with strong durability for decorating.',
    longDescription: [
      'Room coverage for single-room renovations.',
      'Strong durability for reliable protection.',
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
    image: { src: '/images/products/US-products/3pk-standard.png', alt: 'CS 3 Pack Extra Large Drop Cloths by Caelum Star' },
    gallery: [
      {
        src: '/images/amazon/uk/3pk-standard-lifestyle.webp',
        alt: 'Basic coverage — perfect for small projects (3 pack)',
        variant: 'square'
      },
      { src: '/images/amazon/uk/3pk-standard-hero.webp', alt: '3 pack coverage and thickness', variant: 'square' },
      { src: '/images/amazon/standard-durability.webp', alt: 'Standard durability: universal protection', variant: 'square' },
      { src: '/images/amazon/pick-protection.webp', alt: 'Pick your protection: pack options at a glance', variant: 'wide' },
      { src: '/images/amazon/fit-coverage.webp', alt: 'Find your perfect fit: pack-to-coverage comparison', variant: 'wide' },
      { src: '/images/amazon/applications.webp', alt: 'Applications: moving, painting, renovating', variant: 'square' }
    ],
    amazonUrl: AMAZON_US_3PK
  },
  {
    slug: '12pk-light',
    name: '12 Pack',
    packLabel: '12 PK',
    thicknessLabel: 'Light',
    coverageLabel: '1296 sq ft',
    price: '$17.99',
    unitPrice: '$1.50 / count',
    tagline: 'Pro coverage for multi-room renovations.',
    description: 'More drop cloths for bigger rooms, repeat work, and bigger prep.',
    longDescription: [
      'Pro coverage for multi-room renovations.',
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
    image: { src: '/images/products/US-products/12pk-light.png', alt: 'CS 12 Pack Extra Large Drop Cloths by Caelum Star' },
    gallery: [
      {
        src: '/images/amazon/uk/12pk-light-lifestyle.webp',
        alt: 'Deluxe coverage — perfect for multi-room projects (12 pack)',
        variant: 'square'
      },
      { src: '/images/amazon/multi-room-projects.webp', alt: 'Ideal for multi-room projects: deluxe coverage', variant: 'square' },
      { src: '/images/amazon/light-durability.webp', alt: 'Light durability: universal protection', variant: 'square' },
      { src: '/images/amazon/fit-coverage.webp', alt: 'Find your perfect fit: pack-to-coverage comparison', variant: 'wide' },
      { src: '/images/amazon/applications.webp', alt: 'Applications: moving, painting, renovating', variant: 'square' }
    ],
    amazonUrl: AMAZON_US_12PK
  }
];

/**
 * UK product set — same products, GBP pricing, amazon.co.uk links.
 */
export const productsUK: Product[] = [
  {
    slug: '6pk-light',
    primary: true,
    name: '6 Pack',
    packLabel: '6 PK',
    thicknessLabel: 'Light',
    coverageLabel: '648 sq ft',
    price: '£9.89',
    tagline: 'Multi coverage for standard projects.',
    description: 'Extra large plastic dust sheets for decorating, painting, and quick protection.',
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
    image: { src: '/images/products/UK-products/6pk-light.png', alt: 'CS 6 Pack Extra Large Dust Sheets — Light by Caelum Star' },
    gallery: [
      {
        src: '/images/amazon/uk/6pk-light-lifestyle.webp',
        alt: 'Essential coverage — perfect for standard projects (6 pack)',
        variant: 'square'
      },
      { src: '/images/amazon/general-projects.webp', alt: 'Ideal for general projects: coverage and thickness', variant: 'square' },
      { src: '/images/amazon/fit-coverage.webp', alt: 'Find your perfect fit: pack-to-coverage comparison', variant: 'wide' },
      { src: '/images/amazon/pick-protection.webp', alt: 'Pick your protection: pack options at a glance', variant: 'wide' },
      { src: '/images/amazon/applications.webp', alt: 'Applications: moving, painting, renovating', variant: 'square' },
      { src: '/images/amazon/sustainable-process.webp', alt: 'Sustainable efficiency: recycled plastic into protective sheets', variant: 'wide' },
      { src: '/images/amazon/sustainable-efficiency.webp', alt: '55% recycled plastic and eco-kind packaging', variant: 'square' }
    ],
    amazonUrl: AMAZON_UK_6PK
  },
  {
    slug: '6pk-strong',
    name: '6 Pack',
    packLabel: '6 PK',
    thicknessLabel: 'Strong',
    coverageLabel: '648 sq ft',
    price: '£13.99',
    tagline: 'Multi coverage with strong durability.',
    description: 'Extra large plastic dust sheets with strong durability for decorating and painting.',
    longDescription: [
      'Paint with confidence. Cover floors, furniture, and doorways fast.',
      'Strong durability for reliable protection.',
      '55% recycled plastic, globally certified.'
    ],
    highlights: ['12ft × 9ft per sheet', 'Strong durability', '55% recycled plastic (GRS)'],
    specs: [
      { label: 'Pack', value: '6 sheets' },
      { label: 'Total coverage', value: '648 sq ft (≈60 m²)' },
      { label: 'Sheet size', value: '3.6m × 2.7m (12ft × 9ft) each' },
      { label: 'Durability', value: 'Strong' },
      { label: 'Material', value: 'LDPE' }
    ],
    image: { src: '/images/products/UK-products/6pk-strong.png', alt: 'CS 6 Pack Extra Large Dust Sheets — Strong by Caelum Star' },
    gallery: [
      {
        src: '/images/amazon/uk/6pk-light-lifestyle.webp',
        alt: 'Essential coverage — perfect for standard projects (6 pack strong)',
        variant: 'square'
      },
      { src: '/images/amazon/general-projects.webp', alt: 'Ideal for general projects: coverage and thickness', variant: 'square' },
      { src: '/images/amazon/fit-coverage.webp', alt: 'Find your perfect fit: pack-to-coverage comparison', variant: 'wide' },
      { src: '/images/amazon/pick-protection.webp', alt: 'Pick your protection: pack options at a glance', variant: 'wide' },
      { src: '/images/amazon/applications.webp', alt: 'Applications: moving, painting, renovating', variant: 'square' }
    ],
    amazonUrl: AMAZON_UK_6PK
  },
  {
    slug: '1pk-strong',
    name: '1 Pack',
    packLabel: '1 PK',
    thicknessLabel: 'Strong',
    coverageLabel: '108 sq ft',
    price: '£9.99',
    tagline: 'Spot coverage for quick jobs.',
    description: 'One extra large dust sheet with strong durability for quick jobs.',
    longDescription: [
      'Spot coverage, ideal for quick jobs.',
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
    image: { src: '/images/products/UK-products/1pk-strong.png', alt: 'CS 1 Pack Extra Large Dust Sheet — Strong by Caelum Star' },
    gallery: [
      {
        src: '/images/amazon/uk/1pk-strong-lifestyle.webp',
        alt: 'Core coverage — perfect for spot projects (1 pack)',
        variant: 'square'
      },
      { src: '/images/amazon/uk/1pk-strong-hero.webp', alt: '1 pack coverage and thickness', variant: 'square' },
      { src: '/images/amazon/pick-protection.webp', alt: 'Pick your protection: pack options at a glance', variant: 'wide' },
      { src: '/images/amazon/strong-vs-light.webp', alt: 'Strong vs light durability comparison', variant: 'wide' },
      { src: '/images/amazon/aplus-4.webp', alt: 'One sheet, multiple benefits', variant: 'wide' }
    ],
    amazonUrl: AMAZON_UK_1PK
  },
  {
    slug: '3pk-strong',
    name: '3 Pack',
    packLabel: '3 PK',
    thicknessLabel: 'Strong',
    coverageLabel: '324 sq ft',
    price: '£10.99',
    tagline: 'Room coverage for single-room work.',
    description: 'Extra large dust sheets with strong durability for decorating.',
    longDescription: [
      'Room coverage for single-room renovations.',
      'Strong durability for reliable protection.',
      '55% recycled plastic, globally certified.'
    ],
    highlights: ['12ft × 9ft per sheet', 'Strong durability', '55% recycled plastic (GRS)'],
    specs: [
      { label: 'Pack', value: '3 sheets' },
      { label: 'Total coverage', value: '324 sq ft (≈30 m²)' },
      { label: 'Sheet size', value: '3.6m × 2.7m (12ft × 9ft) each' },
      { label: 'Durability', value: 'Strong' },
      { label: 'Material', value: 'LDPE (plastic sheeting)' }
    ],
    image: { src: '/images/products/UK-products/3pk-strong.png', alt: 'CS 3 Pack Extra Large Dust Sheets — Strong by Caelum Star' },
    gallery: [
      {
        src: '/images/amazon/uk/3pk-standard-lifestyle.webp',
        alt: 'Room coverage — perfect for small projects (3 pack)',
        variant: 'square'
      },
      { src: '/images/amazon/uk/3pk-standard-hero.webp', alt: '3 pack coverage and thickness', variant: 'square' },
      { src: '/images/amazon/pick-protection.webp', alt: 'Pick your protection: pack options at a glance', variant: 'wide' },
      { src: '/images/amazon/fit-coverage.webp', alt: 'Find your perfect fit: pack-to-coverage comparison', variant: 'wide' },
      { src: '/images/amazon/applications.webp', alt: 'Applications: moving, painting, renovating', variant: 'square' }
    ],
    amazonUrl: AMAZON_UK_3PK
  },
  {
    slug: '3pk-light',
    name: '3 Pack',
    packLabel: '3 PK',
    thicknessLabel: 'Light',
    coverageLabel: '324 sq ft',
    price: '£10.99',
    tagline: 'Room coverage with light durability.',
    description: 'Extra large dust sheets with light durability for decorating.',
    longDescription: [
      'Room coverage for single-room renovations.',
      'Light durability, intended for light use.',
      '55% recycled plastic, globally certified.'
    ],
    highlights: ['12ft × 9ft per sheet', 'Light durability', '55% recycled plastic (GRS)'],
    specs: [
      { label: 'Pack', value: '3 sheets' },
      { label: 'Total coverage', value: '324 sq ft (≈30 m²)' },
      { label: 'Sheet size', value: '3.6m × 2.7m (12ft × 9ft) each' },
      { label: 'Durability', value: 'Light' },
      { label: 'Material', value: 'LDPE (plastic sheeting)' }
    ],
    image: { src: '/images/products/UK-products/3pk-strong-alt.png', alt: 'CS 3 Pack Extra Large Dust Sheets — Light by Caelum Star' },
    gallery: [
      {
        src: '/images/amazon/uk/3pk-standard-lifestyle.webp',
        alt: 'Room coverage — perfect for small projects (3 pack light)',
        variant: 'square'
      },
      { src: '/images/amazon/uk/3pk-standard-hero.webp', alt: '3 pack coverage and thickness', variant: 'square' },
      { src: '/images/amazon/pick-protection.webp', alt: 'Pick your protection: pack options at a glance', variant: 'wide' },
      { src: '/images/amazon/fit-coverage.webp', alt: 'Find your perfect fit: pack-to-coverage comparison', variant: 'wide' },
      { src: '/images/amazon/applications.webp', alt: 'Applications: moving, painting, renovating', variant: 'square' }
    ],
    amazonUrl: AMAZON_UK_3PK
  },
  {
    slug: '10pk-light',
    name: '10 Pack',
    packLabel: '10 PK',
    thicknessLabel: 'Light',
    coverageLabel: '1080 sq ft',
    price: '£13.99',
    tagline: 'Pro coverage for multi-room renovations.',
    description: 'More sheets for bigger rooms, repeat work, and bigger prep.',
    longDescription: [
      'Pro coverage for multi-room renovations.',
      'Light durability, universal protection.',
      '55% recycled plastic, globally certified.'
    ],
    highlights: ['12ft × 9ft per sheet', 'Light durability', '55% recycled plastic (GRS)'],
    specs: [
      { label: 'Pack', value: '10 sheets' },
      { label: 'Total coverage', value: '1080 sq ft (≈100 m²)' },
      { label: 'Sheet size', value: '3.6m × 2.7m (12ft × 9ft) each' },
      { label: 'Durability', value: 'Light' },
      { label: 'Material', value: 'LDPE (plastic sheeting)' }
    ],
    image: { src: '/images/products/UK-products/10pk-light.png', alt: 'CS 10 Pack Extra Large Dust Sheets — Light by Caelum Star' },
    gallery: [
      {
        src: '/images/amazon/uk/12pk-light-lifestyle.webp',
        alt: 'Pro coverage — perfect for multi-room projects (10 pack)',
        variant: 'square'
      },
      { src: '/images/amazon/multi-room-projects.webp', alt: 'Ideal for multi-room projects: pro coverage', variant: 'square' },
      { src: '/images/amazon/light-durability.webp', alt: 'Light durability: universal protection', variant: 'square' },
      { src: '/images/amazon/fit-coverage.webp', alt: 'Find your perfect fit: pack-to-coverage comparison', variant: 'wide' },
      { src: '/images/amazon/applications.webp', alt: 'Applications: moving, painting, renovating', variant: 'square' }
    ],
    amazonUrl: AMAZON_UK_12PK
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
