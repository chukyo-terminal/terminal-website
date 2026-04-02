import Overview from '@/components/sections/overview';
import Activities from '@/components/sections/activities';
import Location from '@/components/sections/location';
import Contact from '@/components/sections/contact';
import LoadingScreen from '@/components/elements/loadingScreen';

import type { JSX } from 'react';


export default function Home(): JSX.Element {
  return (
    <>
      <LoadingScreen />
      <section id="overview" className="pt-20">
        <Overview />
      </section>
      <section id="activities" className="pt-20">
        <Activities />
      </section>
      <section id="location" className="pt-20">
        <Location />
      </section>
      <section id="contact" className="pt-20 pb-32">
        <Contact />
      </section>
    </>
  );
}
