'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, BookOpen, Package, Plus, ArrowLeftRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { href: '/',        label: 'Inicio',   Icon: Home           },
  { href: '/album',   label: 'Álbum',    Icon: BookOpen       },
  { href: '/agregar', label: 'Agregar',  Icon: Plus, cta: true },
  { href: '/mazo',    label: 'Mazo',     Icon: Package        },
  { href: '/cambios', label: 'Cambios',  Icon: ArrowLeftRight },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200
                    safe-area-inset-bottom shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
      <div className="flex items-stretch h-16 max-w-lg mx-auto">
        {tabs.map(({ href, label, Icon, cta }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href))

          if (cta) {
            return (
              <Link
                key={href}
                href={href}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 -mt-4"
              >
                <div
                  className={cn(
                    'w-14 h-14 rounded-full flex items-center justify-center shadow-lg',
                    'bg-primary active:scale-95 transition-transform duration-100',
                    active && 'ring-4 ring-primary/20'
                  )}
                >
                  <Icon className="text-white" size={26} strokeWidth={2.5} />
                </div>
                <span className="text-[10px] font-semibold text-primary">{label}</span>
              </Link>
            )
          }

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 pt-1',
                'transition-colors duration-100',
                active ? 'text-primary' : 'text-gray-400'
              )}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              <span className="text-[10px] font-semibold">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
