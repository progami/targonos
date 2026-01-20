export type FAQItem = {
  question: string;
  answer: string;
};

export const faqs: FAQItem[] = [
  {
    question: 'Are Targon drop cloths reusable?',
    answer:
      'Yes. Each line is designed for multiple jobs. After use, shake off debris and store dry. For best results, follow the care notes on your packaging.'
  },
  {
    question: 'What are they made of?',
    answer:
      'Our core material is a recycled cotton blend combined with recycled plastic fibers for added strength — the goal is durability without unnecessary bulk.'
  },
  {
    question: 'Where do you sell?',
    answer:
      'Amazon is our primary retail channel. If you are a distributor or need bulk purchasing, contact us and we’ll point you to the best option.'
  },
  {
    question: 'Do you offer warranties or replacements?',
    answer:
      'If something arrives damaged or defective, contact us with your order details and we’ll make it right. Warranty terms may vary by product line and retailer.'
  }
];
