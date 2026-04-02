import Image from 'next/image';
import Link from 'next/link';

import { Code } from 'lucide-react';

import LogoImage from '@/public/logo.svg';

import type { JSX } from 'react';


export default function Header(): JSX.Element {
  return (
    <div className="container mx-auto px-4 pb-4 mt-4 md:mt-8 item-center justify-center flex">
      <Link href="/" className="ml-[35px] md:pl-0 flex items-center space-x-2">
        <Code className="h-16 w-16 text-emerald-400" />
        <Image src={LogoImage} alt="ロゴ画像" height={256} className="ml-[-70px]" />
      </Link>
    </div>
  );
}
