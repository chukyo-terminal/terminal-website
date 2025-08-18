'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect } from 'react';


import { motion } from 'framer-motion';
import { Code, Menu, X } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';

import LogoImage from '@/public/logo.svg'


type NavItem = {
  name: string;
  href: string;
  onClick?: () => void;
  mode: 'user' | 'root' | 'all';
};


const baseNavItems: NavItem[] = [
  { name: '概要管理', href: '/admin/control/index', onClick: undefined, mode: 'user' },
  { name: '活動実績管理', href: '/admin/control/achievements', onClick: undefined, mode: 'user' },
  { name: '投稿管理', href: '/admin/control/posts', onClick: undefined, mode: 'user' },
  { name: 'お問い合わせ管理', href: '/admin/control/contact', onClick: undefined, mode: 'user' },
  { name: 'ログアウト', href: '#', onClick: () => signOut(), mode: 'all' },
];


export default function Header() { // eslint-disable-line sonarjs/cognitive-complexity
  const [isScrolled, setIsScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { data: session, update } = useSession();

  const privilegeEscalation = async (redirect?: string) => {
    await update({ user: { mode: 'root' } });
    globalThis.location.href = redirect || '/admin/control/root';
  };

  const privilegeDemotion = async (redirect?: string) => {
    await update({ user: { mode: 'user' } });
    globalThis.location.href = redirect || '/admin/control';
  }

  let navItems: NavItem[] = [];
  if (session?.user) { // ログイン必須なので、session.userは必ず存在する
    if (session.user.isSudoer) {
      if (session.user.mode === 'root') {
        navItems = [{ name: '権限降格', href: '#', onClick: () => privilegeDemotion(), mode: 'root' }, ...baseNavItems];
        for (const item of navItems) {
          if (item.mode === 'user') {
            const href = item.href;
            item.onClick = () => privilegeDemotion(href);
          }
        }
      } else if (session.user.mode === 'user') {
        navItems = [{ name: '権限昇格', href: '#', onClick: () => privilegeEscalation(), mode: 'user' }, ...baseNavItems];
      }
    } else {
      navItems = baseNavItems;
    }
  }

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'bg-gray-900/90 backdrop-blur-md shadow-lg' : 'bg-transparent'
      }`}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16 md:h-20">
          <Link href="/" className="flex items-center space-x-2">
            <Code className="h-12 w-12 text-emerald-400" />
            <Image src={LogoImage} alt="ロゴ画像" height={200} className="ml-[-50px] fill-[#111827]" />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex space-x-8">
            {navItems.map((item, index) => (
              <motion.div
                key={item.name}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Link
                  href={item.href}
                  onClick={item.onClick}
                  className="text-gray-300 hover:text-emerald-400 transition-colors duration-200 font-medium"
                >
                  {item.name}
                </Link>
              </motion.div>
            ))}
          </nav>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden text-gray-300 hover:text-white mr-4"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="md:hidden bg-gray-800 border-b border-gray-700"
        >
          <div className="container mx-auto px-4 py-4">
            <nav className="flex flex-col space-y-4">
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className="text-gray-300 hover:text-emerald-400 transition-colors duration-200 py-2 font-medium"
                  onClick={item.onClick || (() => setMobileMenuOpen(false))}
                >
                  {item.name}
                </Link>
              ))}
            </nav>
          </div>
        </motion.div>
      )}
    </header>
  )
}
