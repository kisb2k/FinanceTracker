import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Landmark, ArrowRightLeft, Target, SettingsIcon } from 'lucide-react';

export interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  activePaths?: string[]; // Additional paths that should mark this link as active
}

export const navLinks: NavLink[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    href: '/accounts',
    label: 'Accounts',
    icon: Landmark,
  },
  {
    href: '/transactions',
    label: 'Transactions',
    icon: ArrowRightLeft,
  },
  {
    href: '/budgets',
    label: 'Budgets',
    icon: Target,
  },
];

export const settingsLink: NavLink = {
  href: '/settings',
  label: 'Settings',
  icon: SettingsIcon,
};
