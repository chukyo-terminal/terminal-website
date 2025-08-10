import ScrollGear from '@/components/scrollGear';

import type { JSX } from 'react';


export default function Footer(): JSX.Element {
  return (
    <footer className="bottom-0 w-full border-t border-gray-800 py-6 bg-gray-900">
      <div className="container mx-auto px-4 text-center text-gray-400">
        <p>&copy; 2025 Terminal. All rights reserved.</p>
      </div>
      <ScrollGear />
    </footer>
  );
}
