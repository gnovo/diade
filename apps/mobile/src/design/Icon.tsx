import { memoryIconSvg, sizes } from '@diade/design-tokens';
import {
  Apple,
  ArrowLeft,
  Baby,
  Bell,
  Cake,
  Calendar,
  CalendarCheck,
  CalendarHeart,
  CalendarPlus,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleCheck,
  Clock,
  CloudOff,
  Coffee,
  CookingPot,
  Cross,
  EllipsisVertical,
  Gem,
  GripVertical,
  Heart,
  House,
  Image,
  Images,
  Info,
  ListChecks,
  Lock,
  type LucideIcon,
  Luggage,
  MapPin,
  Minus,
  Monitor,
  Moon,
  Pencil,
  Pill,
  Pin,
  Plus,
  RefreshCw,
  Repeat,
  Search,
  Settings,
  Share2,
  ShoppingBasket,
  SlidersHorizontal,
  SquareCheck,
  Star,
  StickyNote,
  Sun,
  Trash,
  TriangleAlert,
  User,
  Users,
  Utensils,
  X,
} from 'lucide-react-native';
import type React from 'react';
import { SvgXml } from 'react-native-svg';
import { useColor } from './theme';

/** Lucide icons used by Díade, keyed by the handover's names (24px grid, 2px stroke). */
const lucideIcons = {
  settings: Settings,
  'list-checks': ListChecks,
  check: Check,
  'triangle-alert': TriangleAlert,
  search: Search,
  house: House,
  repeat: Repeat,
  user: User,
  x: X,
  lock: Lock,
  'refresh-cw': RefreshCw,
  'chevron-left': ChevronLeft,
  'chevron-down': ChevronDown,
  'chevron-up': ChevronUp,
  'calendar-heart': CalendarHeart,
  'chevron-right': ChevronRight,
  'calendar-plus': CalendarPlus,
  'calendar-check': CalendarCheck,
  'square-check': SquareCheck,
  'circle-check': CircleCheck,
  bell: Bell,
  plus: Plus,
  image: Image,
  images: Images,
  camera: Camera,
  'cloud-off': CloudOff,
  pencil: Pencil,
  'trash-2': Trash,
  clock: Clock,
  calendar: Calendar,
  'map-pin': MapPin,
  'sticky-note': StickyNote,
  'shopping-basket': ShoppingBasket,
  users: Users,
  info: Info,
  monitor: Monitor,
  moon: Moon,
  sun: Sun,
  cake: Cake,
  baby: Baby,
  heart: Heart,
  gem: Gem,
  pin: Pin,
  pill: Pill,
  cross: Cross,
  luggage: Luggage,
  'grip-vertical': GripVertical,
  'arrow-left': ArrowLeft,
  star: Star,
  'sliders-horizontal': SlidersHorizontal,
  utensils: Utensils,
  minus: Minus,
  'ellipsis-vertical': EllipsisVertical,
  'share-2': Share2,
  coffee: Coffee,
  apple: Apple,
  'cooking-pot': CookingPot,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof lucideIcons | 'memory';

export interface IconProps {
  name: IconName;
  /** Defaults to icon-lg (24px). Use sizes['icon-sm'] (16) inside badges and captions. */
  size?: number;
  color?: string;
  /** Accessible name. Omit for decorative icons that sit next to a visible label. */
  title?: string;
  strokeWidth?: number;
  /** Fill colour for the glyph's shape (e.g. a filled star). Omit for an outline. */
  fill?: string;
}

export const Icon: React.FC<IconProps> = ({
  name,
  size = sizes['icon-lg'],
  color,
  title,
  strokeWidth = 2,
  fill,
}) => {
  const ink = useColor('ink');
  const tint = color ?? ink;
  const a11y = title
    ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: title }
    : { accessible: false, importantForAccessibility: 'no' as const };

  if (name === 'memory') {
    const xml = memoryIconSvg.replace(/\{\{ink\}\}/g, tint);
    return <SvgXml xml={xml} width={size} height={size} {...a11y} />;
  }

  const Component = lucideIcons[name];
  return (
    <Component size={size} color={tint} strokeWidth={strokeWidth} fill={fill ?? 'none'} {...a11y} />
  );
};
