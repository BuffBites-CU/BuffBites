import type { Metadata } from 'next'
import Link from 'next/link'
import LegalPage, { Contact, Section } from '@/components/LegalPage'

export const metadata: Metadata = { title: 'Privacy Policy · BuffBites' }

const RETENTION: Array<[string, string]> = [
  ['Profile, preferences, goals, interests, body stats', 'Until you change them or delete your account'],
  ['Meal log and favorites', 'Newest 1,000 meals and 200 favorites, until you remove them or delete your account'],
  ['Community posts and their comments', 'Shown in the feed for 24 hours, deleted after 7 days'],
  ['Chat messages', '24 hours'],
  ['Tables', 'Until the meal ends (or 90 minutes after the time you set)'],
  ['Blocks', 'Until you unblock'],
  ['Strava connection', 'Until you disconnect or revoke access at Strava'],
  ['Built meal plans', '6 hours'],
  ['Plate photos', 'Not stored: processed and discarded'],
  ['Server logs', 'Kept by our hosting provider for a limited period'],
]

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          BuffBites helps students find meals at campus dining halls, track what they eat and meet people to eat with. This
          policy explains what we collect, why, who else handles it and the choices you have. We don&apos;t sell your data,
          show ads or use tracking cookies or analytics.
        </p>
      }
    >
      <Section title="1. Who we are">
        <p>
          BuffBites is an independent project built by students. It is not run, endorsed or sponsored by the University of
          Colorado or CU Dining Services. Questions about this policy go to <Contact />.
        </p>
      </Section>

      <Section title="2. What we collect">
        <ul>
          <li>
            <b>Account.</b> You sign in with Google. We store your email address and the account ID Google&apos;s Firebase
            service gives you. Your Google profile photo is shown on your profile page straight from Google; we don&apos;t
            store it.
          </li>
          <li>
            <b>Profile you choose.</b> Username, avatar, dietary preferences and restrictions, nutrition goals, default
            dining hall and up to 5 interests.
          </li>
          <li>
            <b>What you track.</b> Meals you log (name, calories and macros, hall, date, meal) and combos you save.
          </li>
          <li>
            <b>Body stats (optional).</b> Weight, height, age and sex, used only to estimate your daily calorie target.
          </li>
          <li>
            <b>Community.</b> Combos you post, comments, and your votes. Your karma score goes up and down with votes on
            your posts.
          </li>
          <li>
            <b>Dine together.</b> Chat messages, tables you open or join (hall, meal, time, note, interests), people you
            block and messages you report.
          </li>
          <li>
            <b>Plate photos.</b> When you scan a plate, the photo is shrunk on your phone, sent to our server and on to our
            AI provider to identify the food, then discarded. We never store it.
          </li>
          <li>
            <b>Strava (optional).</b> Only if you connect it and agree on the consent screen: your Strava athlete ID, first
            name, weight and sex (if set on Strava), and the last 7 days of activities (sport, title, start time, duration,
            distance, climb and power-meter work). Your sign-in tokens are encrypted. We never read routes, maps, photos or
            followers.
          </li>
          <li>
            <b>Technical data.</b> Our server logs each request&apos;s method, path, status and timing; some paths include
            your account ID. Your IP address is used briefly in memory to limit abuse and is not logged.
          </li>
        </ul>
      </Section>

      <Section title="3. How we use it">
        <ul>
          <li>To run your account and show your profile, meal log and saved combos.</li>
          <li>To suggest meal combos and fuel plans that fit your preferences, goals and the day&apos;s menu.</li>
          <li>To show your posts, comments, messages and tables to other students.</li>
          <li>To keep the service safe: rate limits, reports, blocks and filters that keep contact details out of chat.</li>
        </ul>
        <p>We don&apos;t use your data for advertising and we don&apos;t sell or rent it to anyone.</p>
      </Section>

      <Section title="4. What other students can see">
        <p>
          Your username and avatar appear on everything you post. Other students can see your community combos and comments
          (some of these can be viewed without signing in), your karma, your chat messages, and the tables you open or join
          (with the note, interests and member usernames). Community posts and comments also carry your account ID, which is
          not your name or email. Your email, body stats, meal log, favorites and Strava data are never shown to others.
        </p>
      </Section>

      <Section title="5. AI features">
        <p>
          Some features send data to Anthropic&apos;s Claude AI to generate results. We never send your name, email or
          username with these requests.
        </p>
        <ul>
          <li><b>AI combos:</b> the hall&apos;s menu, plus your dietary preferences and nutrition goals.</li>
          <li><b>Plate scan:</b> your plate photo and the hall&apos;s menu.</li>
          <li>
            <b>Fuel plan:</b> your calorie and macro targets, a summary of today&apos;s workouts (sport, start time,
            minutes, distance, climb, calories, but no titles, maps or routes), your dietary rules and foods to avoid, and
            meals you&apos;ve logged today. Your raw body stats are not sent.
          </li>
        </ul>
        <p>
          AI results can be wrong. See the <Link href="/terms" className="underline underline-offset-2">Terms</Link> about
          nutrition and allergens.
        </p>
      </Section>

      <Section title="6. Who handles your data for us">
        <ul>
          <li><b>Google Firebase:</b> sign-in.</li>
          <li><b>MongoDB Atlas:</b> our database.</li>
          <li><b>Fly.io:</b> runs our server in the United States.</li>
          <li><b>Vercel:</b> hosts the website.</li>
          <li><b>Anthropic:</b> the AI features above.</li>
          <li><b>Strava:</b> only if you connect it.</li>
        </ul>
        <p>
          Each provider handles data only to provide its service to us, under its own terms. Menus come from CU Dining&apos;s
          public menu site and contain no personal data. We may disclose information if the law requires it.
        </p>
      </Section>

      <Section title="7. How long we keep it">
        <table>
          <thead><tr><th>Data</th><th>Kept for</th></tr></thead>
          <tbody>
            {RETENTION.map(([what, how]) => (
              <tr key={what}><td>{what}</td><td>{how}</td></tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="8. Your choices">
        <ul>
          <li>Edit your profile, preferences, goals, interests and body stats at any time in Profile.</li>
          <li>Remove meals, favorites, your posts and your comments; leave or close tables; block and unblock people.</li>
          <li>Disconnect Strava in Profile. We revoke our access at Strava and delete the connection and cached plans.</li>
          <li>
            <b>Delete your account</b> in Profile. This permanently deletes your profile, meal log, favorites, body stats,
            posts and the comments on them, your comments, chat messages, tables, blocks, your Strava connection and your
            sign-in record. Copies in our database provider&apos;s backups may persist for a short time before they expire.
          </li>
        </ul>
        <p>
          To ask for a copy of your data, or for anything else about your privacy, contact <Contact />. Depending on where
          you live, you may have extra rights to access, correct or delete your data, and we&apos;ll honor them.
        </p>
      </Section>

      <Section title="9. Browser storage">
        <p>
          We use no cookies of our own. Your browser stores your sign-in session (through Firebase), whether you&apos;ve
          dismissed the install tip and the chat safety note, and your scroll position on some pages.
        </p>
      </Section>

      <Section title="10. Security">
        <p>
          All traffic uses HTTPS. Strava tokens are encrypted, every request is checked against your signed-in account, and
          nobody else can read your private data. No system is perfectly secure, but we work to protect your information.
        </p>
      </Section>

      <Section title="11. Age">
        <p>
          BuffBites is for people 16 and older. We don&apos;t knowingly collect data from children under 13; if you believe a
          child has given us data, contact us and we&apos;ll delete it.
        </p>
      </Section>

      <Section title="12. Changes">
        <p>
          If we change this policy, we&apos;ll update the date above, and for significant changes we&apos;ll tell you in the
          app.
        </p>
      </Section>
    </LegalPage>
  )
}
