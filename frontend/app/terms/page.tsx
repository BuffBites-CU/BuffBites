import type { Metadata } from 'next'
import Link from 'next/link'
import LegalPage, { Contact, Section } from '@/components/LegalPage'

export const metadata: Metadata = { title: 'Terms of Service · BuffBites' }

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These terms are an agreement between you and BuffBites. By signing in or using BuffBites, you agree to them and
          to our <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>. If you don&apos;t
          agree, please don&apos;t use the app.
        </p>
      }
    >
      <Section title="1. Who can use BuffBites">
        <p>
          You must be at least 16 years old. You&apos;re responsible for what happens on your account, so keep your Google
          sign-in secure.
        </p>
      </Section>

      <Section title="2. Not an official CU service">
        <p>
          BuffBites is an independent student project. It is not run, endorsed or sponsored by the University of Colorado
          or CU Dining Services. &ldquo;CU&rdquo; and hall names are used only to describe where the food is served.
        </p>
      </Section>

      <Section title="3. Food, nutrition and allergens">
        <ul>
          <li>
            Menus and nutrition facts come from CU Dining&apos;s public menus and can be incomplete, out of date or wrong.
            Halls change dishes and recipes without notice.
          </li>
          <li>
            AI combos, fuel plans and plate scans are automated estimates. They can misidentify food or get numbers wrong.
          </li>
          <li>
            <b>BuffBites is not a source of allergen information.</b> If you have a food allergy, intolerance or medical
            diet, always confirm ingredients with dining hall staff before eating.
          </li>
          <li>
            Nothing in BuffBites is medical, nutritional or fitness advice. Talk to a doctor or registered dietitian before
            changing how you eat or train, especially if you have a health condition or a history of disordered eating.
          </li>
        </ul>
      </Section>

      <Section title="4. Your username and content">
        <p>
          You keep ownership of what you post: combos, comments, chat messages and table notes. You give BuffBites
          permission to store and display it in the app so the features work. You&apos;re responsible for what you post.
        </p>
        <p>Usernames can&apos;t impersonate someone else or be offensive; we may change or remove ones that are.</p>
      </Section>

      <Section title="5. Community rules">
        <p>Don&apos;t use BuffBites to:</p>
        <ul>
          <li>harass, bully, threaten or discriminate against anyone;</li>
          <li>post sexual, violent, hateful or illegal content;</li>
          <li>share someone else&apos;s personal information;</li>
          <li>share phone numbers, links or social handles in chat (swap them in person if you want);</li>
          <li>spam, advertise, scam or impersonate others;</li>
          <li>scrape the app, get around rate limits or interfere with how it runs.</li>
        </ul>
        <p>
          You can report messages and block people at any time. We may remove content and suspend or delete accounts that
          break these rules.
        </p>
      </Section>

      <Section title="6. Dine together safety">
        <p>
          Tables and chat rooms help students meet over meals in campus dining halls. We don&apos;t verify who people are or
          run background checks. Meet only in the dining hall, trust your instincts and leave if you feel uncomfortable.
          You&apos;re responsible for your own interactions. If you&apos;re ever in danger, call 911 or CU Boulder Police.
        </p>
      </Section>

      <Section title="7. Strava and Google">
        <p>
          Signing in with Google, and connecting Strava if you choose to, are also subject to those companies&apos; own
          terms and privacy policies. You can disconnect Strava at any time in Profile.
        </p>
      </Section>

      <Section title="8. The service">
        <p>
          BuffBites is free. We may change, pause or end features at any time, and some features have daily limits. We try
          to keep it running, but it may sometimes be unavailable.
        </p>
      </Section>

      <Section title="9. Ending your account">
        <p>
          You can delete your account at any time in Profile. We may suspend or end accounts that break these terms or put
          others at risk.
        </p>
      </Section>

      <Section title="10. Disclaimers">
        <p>
          BuffBites is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties of any kind, express
          or implied, including accuracy, fitness for a particular purpose and non-infringement, to the fullest extent the
          law allows.
        </p>
      </Section>

      <Section title="11. Limitation of liability">
        <p>
          To the fullest extent the law allows, BuffBites and the people who build it are not liable for indirect,
          incidental or consequential damages, or for anything arising from food you eat, allergic reactions, menu or
          nutrition errors, or your interactions with other users. Our total liability for any claim is limited to $50.
          Some places don&apos;t allow these limits, so they may not apply to you.
        </p>
      </Section>

      <Section title="12. Governing law">
        <p>These terms are governed by the laws of the State of Colorado, USA.</p>
      </Section>

      <Section title="13. Changes">
        <p>
          We may update these terms. We&apos;ll change the date above and, for significant changes, tell you in the app.
          Using BuffBites after a change means you accept the new terms.
        </p>
      </Section>

      <Section title="14. Contact">
        <p>Questions about these terms? Reach us at <Contact />.</p>
      </Section>
    </LegalPage>
  )
}
