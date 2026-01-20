export type ProductSpec = {
  label: string;
  value: string;
};

export type Product = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  longDescription: string[];
  highlights: string[];
  specs: ProductSpec[];
  image: {
    src: string;
    alt: string;
  };
  gallery: { src: string; alt: string }[];
  amazonUrl: string;
  sku?: string;
  price?: string;
  accent?: 'core' | 'basic' | 'essential' | 'deluxe';
};

export const products: Product[] = [
  {
    slug: 'core',
    name: 'Core',
    tagline: 'Everyday protection, made to be used again.',
    description:
      'A reliable, reusable drop cloth designed for clean coverage and quick setup — built from a recycled cotton blend.',
    longDescription: [
      'Core is the no-drama drop cloth: it rolls out flat, holds its shape, and cleans up easily.',
      'We build it around a recycled cotton + recycled plastic blend (your "recycled plastic cotton" core), tuned for strength without bulk.',
      'Perfect for quick jobs, touchups, and everyday protection.'
    ],
    highlights: [
      'Reusable, low-lint surface',
      'Improved grip to reduce slipping',
      'Easy fold + store'
    ],
    specs: [
      { label: 'Material', value: 'Recycled cotton blend + recycled plastic' },
      { label: 'Finish', value: 'Low-lint surface' },
      { label: 'Recommended use', value: 'Everyday coverage' }
    ],
    image: { src: '/products/core.svg', alt: 'Targon Core drop cloth' },
    gallery: [
      { src: '/products/core.svg', alt: 'Core hero' },
      { src: '/products/basic.svg', alt: 'Core detail' }
    ],
    amazonUrl: 'https://www.amazon.com/dp/B09HXC3NL8',
    accent: 'core'
  },
  {
    slug: 'basic',
    name: 'Basic',
    tagline: 'More coverage. Same clean, recycled materials.',
    description:
      'A step up in thickness and coverage for larger rooms and longer sessions — still easy to handle and store.',
    longDescription: [
      'Basic is built for more surface area and more time on the floor.',
      'It keeps the same recycled-material foundation, with a sturdier hand-feel and a smoother fold.',
      'Great for contractors and weekend projects alike.'
    ],
    highlights: [
      'More coverage per sheet',
      'Better edge control',
      'Reusable across multiple jobs'
    ],
    specs: [
      { label: 'Material', value: 'Recycled cotton blend + recycled plastic' },
      { label: 'Weight', value: 'Midweight coverage' },
      { label: 'Recommended use', value: 'Rooms, hallways, larger areas' }
    ],
    image: { src: '/products/basic.svg', alt: 'Targon Basic drop cloth' },
    gallery: [
      { src: '/products/basic.svg', alt: 'Basic hero' },
      { src: '/products/essential.svg', alt: 'Basic detail' }
    ],
    amazonUrl: 'https://www.amazon.com/dp/B0FLKJ7WWM',
    accent: 'basic'
  },
  {
    slug: 'essential',
    name: 'Essential',
    tagline: 'Extra durable. Built for repeated jobs.',
    description:
      'Designed for frequent use with upgraded durability and better resistance to wear across repeat setups.',
    longDescription: [
      'Essential is the workhorse line: durable enough for repeat jobs, yet still easy to transport and store.',
      'The material blend is engineered for high cycle life, so it stays consistent across setups.',
      'Ideal for teams that want a drop cloth that feels professional every time you unroll it.'
    ],
    highlights: [
      'Durability tuned for repeat use',
      'Strong edges for better control',
      'Clean look on the job'
    ],
    specs: [
      { label: 'Material', value: 'Recycled cotton blend + recycled plastic' },
      { label: 'Durability', value: 'High-cycle, repeat use' },
      { label: 'Recommended use', value: 'Pro & frequent jobs' }
    ],
    image: { src: '/products/essential.svg', alt: 'Targon Essential drop cloth' },
    gallery: [
      { src: '/products/essential.svg', alt: 'Essential hero' },
      { src: '/products/deluxe.svg', alt: 'Essential detail' }
    ],
    amazonUrl: 'https://www.amazon.com/dp/B0CR1GSBQ9',
    accent: 'essential'
  },
  {
    slug: 'deluxe',
    name: 'Deluxe',
    tagline: 'Premium finish. Maximum grip and protection.',
    description:
      'Our most premium option — built for maximum traction and a cleaner finish for high-visibility projects.',
    longDescription: [
      'Deluxe is designed for the highest standards: premium finish, strong grip, and a more refined hand-feel.',
      'It’s the line you choose when the room matters and the setup needs to feel flawless.',
      'Best for finish work, premium residential, and repeat pros who want one best option.'
    ],
    highlights: [
      'Maximum grip for stability',
      'Premium finish for cleaner jobs',
      'Built to hold up over time'
    ],
    specs: [
      { label: 'Material', value: 'Recycled cotton blend + recycled plastic' },
      { label: 'Grip', value: 'Maximum traction' },
      { label: 'Recommended use', value: 'Premium finish work' }
    ],
    image: { src: '/products/deluxe.svg', alt: 'Targon Deluxe drop cloth' },
    gallery: [
      { src: '/products/deluxe.svg', alt: 'Deluxe hero' },
      { src: '/products/core.svg', alt: 'Deluxe detail' }
    ],
    amazonUrl: 'https://www.amazon.com/dp/B0FP66CWQ6',
    accent: 'deluxe'
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
