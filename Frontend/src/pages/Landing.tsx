import { MarketingNav } from '@/components/layout/MarketingNav'
import { Footer } from '@/components/layout/Footer'
import { Hero } from '@/components/landing/Hero'
import {
  ClosingCta, Contact, Faq, Features, HowItWorks, Languages, Platforms, Pricing,
} from '@/components/landing/Sections'

export default function Landing() {
  return (
    <div className="min-h-screen bg-bg">
      <MarketingNav />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <Platforms />
        <Languages />
        <Pricing />
        <Faq />
        <Contact />
        <ClosingCta />
      </main>
      <Footer />
    </div>
  )
}
