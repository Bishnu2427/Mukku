import { LegalLayout, type Section } from '@/components/legal/LegalLayout'
import { Seo } from '@/components/Seo'

const UPDATED = '18 October 2026'

/**
 * Razorpay requires a published cancellation and refund policy before it will
 * approve a merchant account, and it must be specific rather than boilerplate.
 * The timelines below are the ones Razorpay settles on for UPI, cards and
 * netbanking.
 */
const SECTIONS: Section[] = [
  {
    id: 'summary',
    title: 'The short version',
    body: (
      <>
        <ul>
          <li>Cancel any time from your dashboard. You keep access until the paid month ends.</li>
          <li>No automatic renewal charges are taken after you cancel.</li>
          <li>Refunds are available within <strong>7 days</strong> of payment if you have generated <strong>3 or fewer videos</strong> on that plan.</li>
          <li>Failed renders never count against your quota and are never charged for.</li>
          <li>Approved refunds reach your account within <strong>5&ndash;7 business days</strong>.</li>
        </ul>
        <p>The rest of this page explains the detail.</p>
      </>
    ),
  },
  {
    id: 'free-plan',
    title: 'The free plan',
    body: (
      <p>
        The Free plan costs nothing, so there is nothing to cancel or refund. You can try
        Mukku with three videos a month before paying. We recommend doing that before
        buying a plan.
      </p>
    ),
  },
  {
    id: 'cancelling',
    title: 'Cancelling a paid plan',
    body: (
      <>
        <p>
          Go to <strong>Dashboard &rarr; Plan &amp; Billing</strong> and cancel, or email{' '}
          <a href="mailto:support@mukku.ai">support@mukku.ai</a> from your registered
          address.
        </p>
        <p>
          Cancelling stops future charges. It does not end your current month — you keep
          your plan&rsquo;s features and remaining video allowance until the paid period
          finishes, then move to the Free plan automatically.
        </p>
      </>
    ),
  },
  {
    id: 'refunds',
    title: 'When we refund',
    body: (
      <>
        <p>We will refund your most recent payment in full if:</p>
        <ul>
          <li>You ask within <strong>7 days</strong> of the payment, and</li>
          <li>You have generated <strong>3 or fewer videos</strong> since that payment.</li>
        </ul>
        <p>We will also refund, regardless of those limits, if:</p>
        <ul>
          <li>You were charged twice for the same period.</li>
          <li>Your plan was not activated after a successful payment.</li>
          <li>A sustained fault on our side prevented you from generating videos, and we could not fix it in reasonable time.</li>
          <li>The payment was not authorised by you. Tell us immediately and we will investigate.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'no-refund',
    title: 'When we do not refund',
    body: (
      <>
        <ul>
          <li>
            <strong>You do not like the generated output.</strong> AI output is inherently
            variable. The Free plan exists so you can judge quality before paying, and you
            can regenerate with different settings at no extra cost within your quota.
          </li>
          <li>
            <strong>You used most of the plan.</strong> Once you have generated more than
            three videos on a billing period, that period is not refundable.
          </li>
          <li>
            <strong>You forgot to cancel.</strong> We will cancel renewal going forward,
            but a period already used is not refundable.
          </li>
          <li>
            <strong>Your account was closed for breaching our terms.</strong>
          </li>
          <li>
            <strong>A video was deleted automatically.</strong> Generated videos are
            removed about 72 hours after creation; this is stated before you buy, and
            downloading is free and unlimited.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'failed',
    title: 'Failed and interrupted renders',
    body: (
      <>
        <p>
          If a render fails, it does not count against your monthly allowance — the quota
          is only charged when a video completes successfully. You can simply try again.
        </p>
        <p>
          If a render is interrupted by a restart on our side, it is marked failed, your
          quota is untouched, and we email you so you know to retry.
        </p>
        <p>
          If failures persist and we cannot resolve them, that falls under the refundable
          circumstances above.
        </p>
      </>
    ),
  },
  {
    id: 'how-to-ask',
    title: 'How to request a refund',
    body: (
      <>
        <p>
          Email <a href="mailto:support@mukku.ai">support@mukku.ai</a> from your registered
          address with:
        </p>
        <ul>
          <li>The email address on the account.</li>
          <li>The payment or order reference from your receipt.</li>
          <li>The reason for the request.</li>
        </ul>
        <p>
          We acknowledge within <strong>2 business days</strong> and decide within{' '}
          <strong>5 business days</strong>. If we need more information we will ask within
          that window.
        </p>
      </>
    ),
  },
  {
    id: 'timing',
    title: 'How long a refund takes',
    body: (
      <>
        <p>
          Approved refunds go back to the original payment method through Razorpay. We
          cannot refund to a different method or account.
        </p>
        <ul>
          <li><strong>UPI</strong> — typically 1&ndash;3 business days.</li>
          <li><strong>Credit and debit cards</strong> — typically 5&ndash;7 business days.</li>
          <li><strong>Netbanking and wallets</strong> — typically 3&ndash;7 business days.</li>
        </ul>
        <p>
          The final step is with your bank, so timing can vary. If it has been more than 10
          business days since we confirmed a refund, contact us with the reference and we
          will chase it.
        </p>
      </>
    ),
  },
  {
    id: 'contact',
    title: 'Still not resolved?',
    body: (
      <p>
        Email <a href="mailto:support@mukku.ai">support@mukku.ai</a> and put
        &ldquo;Escalation&rdquo; in the subject. We would rather sort a billing problem out
        directly than have you dispute it with your bank.
      </p>
    ),
  },
]

export default function Refunds() {
  return (
    <>
      <Seo
        title="Cancellation &amp; Refund Policy — Mukku AI Studio"
        description="How to cancel a Mukku AI Studio plan, when refunds are available, how to request one, and how long refunds take to reach your account."
        canonical="/refunds"
      />
      <LegalLayout
        title="Cancellation &amp; Refunds"
        updated={UPDATED}
        intro={
          <p>
            What happens when you cancel, when we refund, and how long it takes. If your
            situation is not covered here, email us — we would rather fix it than argue
            about it.
          </p>
        }
        sections={SECTIONS}
      />
    </>
  )
}
