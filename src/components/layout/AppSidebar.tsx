
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar';
import { Logo } from '@/components/icons/Logo';
import { navLinks, settingsLink, type NavLink } from '@/lib/nav-links';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

interface AppSidebarLinkProps {
  link: NavLink;
  pathname: string;
}

function AppSidebarLink({ link, pathname }: AppSidebarLinkProps) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const isActive = pathname === link.href || (link.activePaths && link.activePaths.some(p => pathname.startsWith(p)));

  const handleClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };
  
  return (
    <SidebarMenuItem>
      <Link href={link.href}>
        <SidebarMenuButton
          isActive={isActive}
          tooltip={link.label}
          onClick={handleClick}
          className={cn(
            'justify-start',
            state === 'collapsed' && !isMobile && 'justify-center'
          )}
        >
          <link.icon className="h-5 w-5 shrink-0" />
          {(state === 'expanded' || isMobile) && <span>{link.label}</span>}
        </SidebarMenuButton>
      </Link>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const { state, isMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon" variant="sidebar" side="left" className="border-r">
      <SidebarHeader className={cn("p-4", state === 'collapsed' && !isMobile && "p-2 justify-center")}>
        <Link href="/dashboard" className="flex items-center gap-2">
          <Logo className={cn(state === 'collapsed' && !isMobile && "h-8 w-8")} />
        </Link>
      </SidebarHeader>
      <SidebarContent className="flex-1 overflow-y-auto">
        <SidebarMenu>
          {navLinks.map((link) => (
            <AppSidebarLink key={link.href} link={link} pathname={pathname} />
          ))}
        </SidebarMenu>
      </SidebarContent>
      <Separator className="my-2" />
      <SidebarFooter className="p-2">
         <AppSidebarLink link={settingsLink} pathname={pathname} />
      </SidebarFooter>
    </Sidebar>
  );
}
