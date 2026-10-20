import {
  Bed,
  Car,
  Dumbbell,
  Folder,
  Gem,
  Headphones,
  Home,
  Lamp,
  Monitor,
  Package,
  Shirt,
  ShoppingBag,
  Sofa,
  Sparkles,
  Trees,
  Utensils,
  type LucideIcon,
} from 'lucide-react'

/** Must match CATEGORY_ICONS in backend/apps/products/models.py. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  sofa: Sofa,
  lamp: Lamp,
  shirt: Shirt,
  monitor: Monitor,
  utensils: Utensils,
  bed: Bed,
  trees: Trees,
  headphones: Headphones,
  'shopping-bag': ShoppingBag,
  dumbbell: Dumbbell,
  car: Car,
  gem: Gem,
  package: Package,
  home: Home,
  sparkles: Sparkles,
}

export const iconFor = (key: string): LucideIcon => CATEGORY_ICONS[key] ?? Folder
