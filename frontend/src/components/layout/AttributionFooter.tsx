import Link from 'next/link';

export const AttributionFooter = () => {
  return (
    <footer className="border-t border-darkBrown/20 bg-beige mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <p className="text-xs text-darkBrown/60 text-center">
          Map data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline hover:text-darkBrown">OpenStreetMap contributors</a>
          {' · '}
          Wikipedia content{' '}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer" className="underline hover:text-darkBrown">CC BY-SA</a>
          {' · '}
          <Link href="/data-sources" className="underline hover:text-darkBrown">
            Data Sources
          </Link>
        </p>
      </div>
    </footer>
  );
};
