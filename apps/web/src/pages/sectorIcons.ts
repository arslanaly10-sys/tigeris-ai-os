import type { SectorKey } from '@tigeris/shared';
import {
  Banknote,
  Building,
  Factory,
  Landmark,
  Ship,
  ShieldCheck,
  Truck,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export const SECTOR_ICON: Record<SectorKey, LucideIcon> = {
  energy: Ship,
  utilities: Zap,
  capital: Landmark,
  supply_chain: Truck,
  banking: Banknote,
  manufacturing: Factory,
  real_estate: Building,
  insurance: ShieldCheck,
};
