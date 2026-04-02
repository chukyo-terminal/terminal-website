'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';

export default function ScrollGear() {
  const [rotation, setRotation] = useState(0);
  const containerReference = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      // スクロール量に応じて回転角度を計算（1ピクセルあたり0.1度）
      setRotation(scrollPosition * 0.1);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div ref={containerReference}>
      <div className="fixed bottom-0 right-0 z-0 overflow-hidden w-[180px] h-[180px] md:w-[270px] md:h-[270px] pointer-events-none">
        <Image
          src="/Gear.png"
          alt="Gear"
          width={1000}
          height={1000}
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: 'transform 0.1s ease-out',
            position: 'absolute',
            bottom: '-30%',
            right: '-30%',
            filter: 'invert(70%) sepia(20%) saturate(1000%) hue-rotate(100deg) brightness(90%) contrast(90%)',
          }}
        />
      </div>
    </div>
  );
}