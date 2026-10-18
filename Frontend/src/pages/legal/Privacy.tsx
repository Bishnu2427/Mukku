import { LegalLayout, type Section } from '@/components/legal/LegalLayout'
import { Seo } from '@/components/Seo'

const UPDATED = '18 October 2026'

/**
 * Written against what the application actually does, not a template:
 * the data listed here maps to real MongoDB collections (users,
 * user_sessions, login_history, projects, payments) and the processors
 * listed are the providers the pipeline genuinely calls.
 */
const SECTIONS: Section[] = [
  {
    id: 'who-we-are',
    title: 'Who we are',
    body: (
      <>
        <p>
          Mukku AI Studio (&ldquo;Mukku&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) provides an
          online service that turns a text prompt into a finished video. We operate from
          India, and this notice is written to meet the Digital Personal Data Protection
          Act, 2023 (DPDP Act).
        </p>
        <p>
          For anything in this notice, write to{' '}
          <a href="mailto:support@mukku.ai">support@mukku.ai</a>. We are the data fiduciary
          for the information described below.
        </p>
      </>
    ),
  },
  {
    id: 'what-we-collect',
    title: 'What we collect',
    body: (
      <>
        <p>We collect only what the service needs to function:</p>
        <ul>
          <li>
            <strong>Account details</strong> — your name, email address, and a securely
            hashed password. If you sign in with Google we receive your name, email address
            and profile picture from Google; we never receive your Google password.
          </li>
          <li>
            <strong>What you create</strong> — the prompts you write, the settings you
            choose, any photos or videos you upload, and the videos we generate for you.
          </li>
          <li>
            <strong>Security records</strong> — sign-in attempts (successful and failed),
            IP address, browser and operating system, and active session details. We keep
            these to detect unauthorised access to your account and show them to you under
            Dashboard &rarr; Security.
          </li>
          <li>
            <strong>Payment records</strong> — your plan, order identifiers and payment
            status. <strong>We never see or store your card, UPI or bank details</strong>;
            those go directly to our payment processor.
          </li>
        </ul>
        <p>
          We do not use advertising trackers, and we do not sell personal data to anyone.
        </p>
      </>
    ),
  },
  {
    id: 'how-we-use-it',
    title: 'How we use it',
    body: (
      <>
        <ul>
          <li>To generate the videos you ask for and keep them in your library.</li>
          <li>To run your account — signing in, two-factor codes, password resets.</li>
          <li>To apply your plan&rsquo;s monthly limit.</li>
          <li>To keep the service secure, including rate limiting and lockouts after repeated failed sign-ins.</li>
          <li>To reply when you contact us.</li>
        </ul>
        <p>
          We do not use your prompts, uploads or generated videos to train AI models, and
          we do not publish your content.
        </p>
      </>
    ),
  },
  {
    id: 'processors',
    title: 'Who else processes your data',
    body: (
      <>
        <p>
          Generating a video requires sending parts of your request to specialist
          providers. Each receives only what its stage needs:
        </p>
        <ul>
          <li><strong>Groq, Ollama</strong> — your prompt, to write the script and plan scenes.</li>
          <li><strong>Leonardo.ai</strong> — scene descriptions, to generate images.</li>
          <li><strong>Google (Gemini / Veo), Kling.ai, Pollo.ai</strong> — scene images and descriptions, to generate motion.</li>
          <li><strong>Google (gTTS)</strong> — narration text, to synthesise speech.</li>
          <li><strong>Suno</strong> — a short description of topic and mood, to compose music.</li>
          <li><strong>Google</strong> — if you choose to sign in with Google.</li>
          <li><strong>Razorpay</strong> — to take payment. They handle card and UPI details under their own privacy policy and PCI-DSS obligations.</li>
          <li><strong>Our email provider</strong> — to send verification codes and notifications.</li>
        </ul>
        <p>
          Some of these providers operate outside India, so generating a video may involve
          transferring your prompt and related content abroad. We only use providers that
          offer contractual protections for the data they handle.
        </p>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep things',
    body: (
      <>
        <ul>
          <li>
            <strong>Intermediate files</strong> — scene images, clips and voice tracks are
            deleted automatically about 24 hours after a render.
          </li>
          <li>
            <strong>Finished videos and thumbnails</strong> — deleted automatically about
            72 hours after a render, so download anything you want to keep.
          </li>
          <li>
            <strong>Your uploads</strong> — kept with the project until you delete it.
          </li>
          <li>
            <strong>Account and security records</strong> — kept while your account is
            open. Sessions, one-time codes and password-reset tokens expire on their own.
          </li>
          <li>
            <strong>Payment records</strong> — kept as long as Indian tax and accounting
            law requires, which is longer than your account may remain open.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'your-rights',
    title: 'Your rights',
    body: (
      <>
        <p>Under the DPDP Act you may:</p>
        <ul>
          <li><strong>Access</strong> the personal data we hold about you.</li>
          <li><strong>Correct</strong> anything inaccurate — your name is editable in your profile.</li>
          <li>
            <strong>Erase</strong> your data. You can delete any individual video from your
            dashboard, which removes the video, its scene assets and anything you uploaded
            for it. To delete your whole account, email us.
          </li>
          <li><strong>Withdraw consent</strong>, by closing your account.</li>
          <li><strong>Nominate</strong> someone to exercise these rights if you die or become incapacitated.</li>
          <li><strong>Complain</strong> to us first, and then to the Data Protection Board of India if we do not resolve it.</li>
        </ul>
        <p>
          Email <a href="mailto:support@mukku.ai">support@mukku.ai</a> and we will respond
          within 30 days.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'How we protect it',
    body: (
      <>
        <ul>
          <li>Passwords are hashed with bcrypt. We cannot read them.</li>
          <li>Two-factor codes are sent by email on every sign-in and are also stored hashed.</li>
          <li>Sign-in attempts are rate limited, and repeated failures lock the account temporarily.</li>
          <li>Sessions are tracked server-side so you can revoke any device from your dashboard.</li>
          <li>Traffic is served over HTTPS with strict security headers.</li>
        </ul>
        <p>
          No system is perfectly secure. If we discover a breach affecting your personal
          data, we will notify you and the Data Protection Board as the DPDP Act requires.
        </p>
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies',
    body: (
      <>
        <p>
          We use two cookies, both strictly necessary, and no advertising or analytics
          cookies:
        </p>
        <ul>
          <li><code>mukku_token</code> — keeps you signed in. HttpOnly, so JavaScript cannot read it.</li>
          <li><code>mukku_session</code> — protects the Google sign-in flow against cross-site request forgery.</li>
        </ul>
        <p>
          Your theme preference is stored in your browser&rsquo;s local storage and never
          sent to us.
        </p>
      </>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: (
      <p>
        Mukku is not intended for anyone under 18. We do not knowingly create accounts for
        children. If you believe a child has an account, contact us and we will remove it.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this notice',
    body: (
      <p>
        If we change this notice materially we will email registered users and update the
        date at the top. Continuing to use Mukku after a change means you accept the
        updated notice.
      </p>
    ),
  },
]

export default function Privacy() {
  return (
    <>
      <Seo
        title="Privacy Policy — Mukku AI Studio"
        description="How Mukku AI Studio collects, uses, shares and protects your personal data, and the rights you have under India's DPDP Act, 2023."
      />
      <LegalLayout
        title="Privacy Policy"
        updated={UPDATED}
        intro={
          <p>
            This explains what Mukku collects, why, who else sees it, and what you can ask
            us to do about it. We have written it in plain language and kept it specific to
            what the product actually does.
          </p>
        }
        sections={SECTIONS}
      />
    </>
  )
}
