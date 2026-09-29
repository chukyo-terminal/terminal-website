import { Geist, Geist_Mono, IBM_Plex_Sans_JP, Klee_One, Nunito_Sans, Roboto_Slab } from 'next/font/google';


export const GeistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});


export const GeistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});


export const RobotoSlab = Roboto_Slab({
  variable: '--font-roboto-slab',
  subsets: ['latin'],
  display: 'swap',
  weight: '400',
});


export const NunitoSans = Nunito_Sans({
  variable: '--font-nunito-sans',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400'],
});


export const IBMPlexSansJP = IBM_Plex_Sans_JP({
  variable: '--font-ibm-plex-sans-jp',
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500'],
});


export const KleeOne = Klee_One({
  variable: '--font-klee-one',
  // @ts-expect-error japanese subset
  subsets: ['latin', 'japanese'],
  display: 'swap',
  weight: ['400', '600'],
});
