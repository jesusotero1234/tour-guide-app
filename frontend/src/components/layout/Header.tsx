'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const Header = () => {
  const pathname = usePathname();
  
  return (
    <header className="border-b border-darkBrown/10 bg-surface/95 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center">
            <Link href="/">
              <h1 className="cursor-pointer text-xl font-serif font-bold text-darkBrown transition-colors hover:text-mutedGold sm:text-2xl">
                AI Tour Guide
              </h1>
            </Link>
          </div>
          
          <nav className="flex items-center gap-3 sm:gap-6">
            <Link 
              href="/" 
              className={`text-sm font-medium transition-colors hover:text-mutedGold ${
                pathname === '/' ? 'text-darkBrown' : 'text-darkBrown/70'
              }`}
            >
              Create
            </Link>
            <Link 
              href="/tours" 
              className={`text-sm font-medium transition-colors hover:text-mutedGold ${
                pathname.startsWith('/tours') ? 'text-darkBrown' : 'text-darkBrown/70'
              }`}
            >
              Browse
            </Link>
            <Link 
              href="/passes" 
              className={`text-sm font-medium transition-colors hover:text-mutedGold ${
                pathname.startsWith('/passes') ? 'text-darkBrown' : 'text-darkBrown/70'
              }`}
            >
              Passes
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
};
