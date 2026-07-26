export const metadata = { title: "Terms of Service · Athlytica" };

const EFFECTIVE = "26 July 2026";

export default function TermsPage() {
  return (
    <article>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Terms of Service</h1>
      <p style={{ color: "#5f7392", marginTop: 0, fontSize: 13 }}>
        Effective {EFFECTIVE}. These terms describe how the Athlytica platform currently operates.
        They are a working baseline and have not been reviewed by counsel — have them reviewed
        before relying on them commercially.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>1. Who we are</h2>
      <p>
        The platform is operated by Athlytica Technologies Limited (&ldquo;Athlytica&rdquo;), a company
        registered in Kenya. It serves three programmes: the Nairobi Regional Hockey League (NRHL),
        Big Ice Hockey &amp; Inline Academy, and Athlytica&rsquo;s own athlete development services.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>2. Accounts and access</h2>
      <p>
        One account may hold roles in more than one workspace. Roles are granted by an
        administrator and may be changed or revoked at any time. You are responsible for keeping
        access to your email address secure, because sign-in links are delivered there. Do not
        share your account with anyone else.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>3. Registrations and payments</h2>
      <p>
        Programme fees are shown in Kenyan Shillings before payment and are collected through
        M-Pesa Paybill 4325935 (Athlytica Technologies Limited). The amount charged is always the
        price we hold on the server for the selected programme or package; a price displayed in
        your browser is never the basis of a charge.
      </p>
      <p>
        A registration is confirmed only when Safaricom settles the payment to our Paybill and our
        systems match it to your registration reference. Manual Paybill payments are matched by the
        ATH reference issued at checkout, usually within a few minutes.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>4. Refunds and cancellations</h2>
      <p>
        Refund eligibility depends on the programme and is set out in the programme materials you
        receive at registration. Where a payment is taken in error or a duplicate settlement
        occurs, contact us and we will reconcile it against our payment ledger.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>5. Athlete data and minors</h2>
      <p>
        Many athletes on the platform are minors. A parent or guardian must register on their
        behalf and is responsible for the accuracy of the information supplied. Performance,
        biometric, and session data is collected to run coaching programmes. How we handle it is
        described in the <a href="/privacy" style={{ color: "#73a8ff" }}>Privacy Policy</a>.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>6. Acceptable use</h2>
      <p>
        Do not attempt to access data belonging to athletes, families, or workspaces you have not
        been granted access to, interfere with the payment or telemetry systems, or use the
        platform to break Kenyan law.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>7. Service availability</h2>
      <p>
        The platform depends on third-party services including Safaricom Daraja for payments and
        Supabase for data storage. We do not guarantee uninterrupted availability, and outages in
        those services may delay registration confirmations.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>8. Changes and governing law</h2>
      <p>
        We may update these terms; material changes will be announced in the platform. These terms
        are governed by the laws of Kenya, and disputes fall to the Kenyan courts.
      </p>
    </article>
  );
}
