const defaultDomain = 'targonglobal.com';
const domain = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? defaultDomain;

export const site = {
  name: 'Targon',
  domain,
  description: 'AI-driven manufacturing & design.',
  contactEmail: 'support@targonglobal.com',

  // Primary retail link (requested: 6-pack is the main focus).
  // ASIN B09HXC3NL8 = 6 Pack
  amazonStoreUrl:
    'https://www.amazon.com/CS-Decorating-Sheet-Plastic-Sheeting-Dust-Painting-Polythene/dp/B09HXC3NL8?th=1',

  // Secondary link (alternate pack/region).
  // ASIN B0FP66CWQ6 = 12 Pack
  amazonStoreAltUrl:
    'https://www.amazon.com/CS-Decorating-Sheet-Plastic-Sheeting-Dust-Painting-Polythene/dp/B0FP66CWQ6?th=1',

  // Product brand shown on listings.
  productBrandName: 'Caelum Star',

  socials: {
    instagram: '',
    linkedin: ''
  }
};
