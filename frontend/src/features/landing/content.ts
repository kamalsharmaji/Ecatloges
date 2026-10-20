/**
 * Landing page copy and figures, taken from the approved UI reference.
 *
 * Blocks marked `approved: false` contain sample figures from the design (statistics, testimonials,
 * prices). They are shown in development so the page matches the reference, but are NOT rendered
 * in production builds until someone confirms them and flips `approved` to true — publishing
 * unverified metrics, endorsements or prices would mislead visitors.
 */
import electronics from '@/assets/landing/industry-electronics.jpg'
import fashion from '@/assets/landing/industry-fashion.jpg'
import furniture from '@/assets/landing/industry-furniture.jpg'
import hotels from '@/assets/landing/industry-hotels.jpg'
import retail from '@/assets/landing/industry-retail.jpg'

export const BRAND = 'myEcatalogues'

/** Show a content block? Unapproved sample content appears only in development. */
export const showBlock = (block: { approved: boolean }) => block.approved || import.meta.env.DEV

export const HERO = {
  eyebrow: 'Your Business. One Beautiful Catalogue.',
  title: 'Showcase Your Products.',
  highlight: 'Grow Your Business.',
  description:
    'Create stunning, shareable product catalogues with high-quality photos and videos. Get QR codes, share links, WhatsApp enquiries and powerful analytics — all in one place.',
  trust: ['No technical skills needed', 'Works on all devices', 'Trusted by growing businesses'],
}

export const FEATURES = [
  { key: 'media', title: 'HD Photo & Video Catalogues', text: 'Upload high-quality images and videos without losing quality.' },
  { key: 'multi', title: 'Multiple Catalogues', text: 'Create and manage multiple catalogues for different collections or branches.' },
  { key: 'qr', title: 'QR Code & Shareable Links', text: 'Get instant QR codes and public links to share anywhere.' },
  { key: 'whatsapp', title: 'WhatsApp & Enquiry Leads', text: 'Get customer enquiries directly via WhatsApp or enquiry forms.' },
  { key: 'analytics', title: 'Catalogue Analytics', text: 'Track views, product clicks and enquiries to understand your customers.' },
  { key: 'team', title: 'Team & Role Management', text: 'Add staff members and manage access with role-based permissions.' },
] as const

export const STEPS = [
  { title: 'Create Account', text: 'Sign up, add your business details and choose a plan.' },
  { title: 'Add Products & Media', text: 'Upload your product photos, videos, write descriptions and organise categories.' },
  { title: 'Share & Get Enquiries', text: 'Publish your catalogue, share via QR code or WhatsApp and start getting customers.' },
]

export const DEVICE_BENEFITS = ['Mobile Friendly', 'Fast Loading', 'Smooth & Simple', 'No App Required']

/** Sample figures from the design — not live platform metrics. */
export const STATS = {
  approved: false,
  items: [
    { key: 'businesses', value: '10K+', label: 'Happy Businesses' },
    { key: 'products', value: '1M+', label: 'Products Shared' },
    { key: 'views', value: '5M+', label: 'Catalogue Views' },
    { key: 'rating', value: '4.8/5', label: 'Customer Rating' },
  ],
}

export const INDUSTRIES = [
  { title: 'Retail Shops', text: 'General stores, local businesses', image: retail, alt: 'Clothing and accessories on display in a retail shop' },
  { title: 'Fashion & Jewellery', text: 'Clothing, accessories, jewellery stores', image: fashion, alt: 'Racks of dresses and shirts in a fashion boutique' },
  { title: 'Electronics', text: 'Mobile, laptop, appliance stores', image: electronics, alt: 'Wireless headphones, keyboard and mouse' },
  { title: 'Hotels & Resorts', text: 'Rooms, services, facilities catalogues', image: hotels, alt: 'Resort swimming pool surrounded by palm trees' },
  { title: 'Furniture & Home', text: 'Furniture, interior, home decor products', image: furniture, alt: 'Lounge furniture in a bright loft showroom' },
]

/**
 * Reference prices and limits from the design. Checkout always uses the plans configured in
 * Super Admin, so these must match them before `approved` is set. No yearly prices or discount
 * were supplied, so the yearly view sends people to checkout instead of inventing figures.
 */
export const PRICING = {
  approved: false,
  /** e.g. 'Save 20%' — only once an actual yearly discount is configured. */
  yearlyBadge: null as string | null,
  plans: [
    {
      key: 'starter',
      name: 'Starter',
      tagline: 'Perfect for small businesses',
      monthly: '₹499',
      features: ['2 Catalogues', '100 Products', '2 Staff Members', '2 GB Storage', 'Basic Analytics', 'QR Code & WhatsApp'],
      popular: false,
    },
    {
      key: 'growth',
      name: 'Growth',
      tagline: 'Best for growing businesses',
      monthly: '₹999',
      features: ['10 Catalogues', '1,000 Products', '5 Staff Members', '10 GB Storage', 'Advanced Analytics', 'Custom Branding'],
      popular: true,
    },
    {
      key: 'business',
      name: 'Business',
      tagline: 'For larger teams & brands',
      monthly: '₹1,999',
      features: ['50 Catalogues', '5,000 Products', '15 Staff Members', '50 GB Storage', 'Priority Support', 'All Premium Features'],
      popular: false,
    },
  ],
}

/** Sample quotes from the design — placeholders, not verified customer endorsements. */
export const TESTIMONIALS = {
  approved: false,
  items: [
    { name: 'Rahul Sharma', role: 'Fashion Store Owner', quote: `${BRAND} made it so easy to showcase our products. We get daily enquiries from customers via WhatsApp.` },
    { name: 'Priya Mehta', role: 'Home Decor Business', quote: 'The catalogue looks very professional and our sales have increased significantly.' },
    { name: 'Amit Patel', role: 'Electronics Retailer', quote: 'Super easy to use and the support team is excellent. Highly recommended!' },
  ],
}

/** Answers describe how the product actually works today. */
export const FAQS = [
  {
    q: `What is ${BRAND}?`,
    a: `${BRAND} lets you build online product catalogues with photos and videos, share them with a link, QR code or WhatsApp, and receive customer enquiries and view analytics in one dashboard.`,
  },
  {
    q: 'Can I upload high-quality photos and videos?',
    a: 'Yes. JPG, PNG and WebP photos and MP4 or MOV videos are supported, and your original files are kept without re-compression. Video uploads and file-size limits depend on your plan.',
  },
  {
    q: 'Do I need technical knowledge to use it?',
    a: 'No. You add products, upload media and publish from a simple dashboard. Customers open your catalogue in any browser — they don’t need to install an app.',
  },
  {
    q: 'Can I change or cancel my plan anytime?',
    a: 'Yes. Upgrades take effect immediately after payment. Downgrades and cancellations apply at the end of your current billing period, so you keep access until then.',
  },
]
