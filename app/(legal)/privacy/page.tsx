export const metadata = { title: "Privacy Policy · Athlytica" };

const EFFECTIVE = "26 July 2026";

export default function PrivacyPage() {
  return (
    <article>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Privacy Policy</h1>
      <p style={{ color: "#5f7392", marginTop: 0, fontSize: 13 }}>
        Effective {EFFECTIVE}. This describes the data the platform actually collects and how it is
        handled today. It is a working baseline and has not been reviewed by counsel.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>1. Who controls your data</h2>
      <p>
        Athlytica Technologies Limited, Nairobi, Kenya, is the data controller. We process personal
        data under the Kenya Data Protection Act, 2019. Contact us at{" "}
        <a href="mailto:legal@athlyticahq.com" style={{ color: "#73a8ff" }}>
          legal@athlyticahq.com
        </a>
        .
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>2. What we collect</h2>
      <ul>
        <li>
          <strong>Registration details</strong> — parent or guardian name and email, athlete name
          and age, preferred campus, and the programme selected.
        </li>
        <li>
          <strong>Payment records</strong> — the M-Pesa receipt number, amount, and registration
          reference returned by Safaricom when a payment settles.
        </li>
        <li>
          <strong>Performance and session data</strong> — coach evaluations, session attendance,
          skill metrics, and where recorded, biometric and injury records held in the athlete
          passport.
        </li>
        <li>
          <strong>Account data</strong> — the email address you sign in with and the workspace
          roles granted to you.
        </li>
      </ul>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>3. Phone numbers are not stored</h2>
      <p>
        Your M-Pesa phone number is used to send the payment prompt and is then discarded. What we
        keep is a one-way keyed hash of the number, used solely to match an incoming payment to the
        right registration. The number itself cannot be recovered from that hash.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>4. Why we process it</h2>
      <p>
        To register athletes and take payment (performance of a contract), to run coaching
        programmes and report progress to parents (legitimate interest), and to keep financial and
        audit records (legal obligation). Athlete performance history is retained so a passport
        remains meaningful over a career; settled registration records are retained as part of the
        payment audit trail.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>5. Children&rsquo;s data</h2>
      <p>
        Most athletes are minors. Registration is completed by a parent or guardian, and consent to
        process the athlete&rsquo;s data is given by them. A guardian may request access to, or
        correction of, their athlete&rsquo;s records at any time.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>6. Who else sees it</h2>
      <ul>
        <li>Safaricom PLC — processes M-Pesa payments through the Daraja API.</li>
        <li>Supabase — hosts the database and authentication.</li>
        <li>Vercel — hosts the web application.</li>
        <li>
          Coaches and administrators — see only the athletes and workspaces their role grants them.
        </li>
      </ul>
      <p>We do not sell personal data and we do not use it for advertising.</p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>7. Your rights</h2>
      <p>
        Under the Data Protection Act, 2019 you may request access to your data, correction of
        inaccurate data, deletion where we have no overriding obligation to retain it, and you may
        object to certain processing. Write to legal@athlyticahq.com; we respond within 30 days. You
        may also complain to the Office of the Data Protection Commissioner.
      </p>

      <h2 style={{ fontSize: 18, marginTop: 32 }}>8. Security</h2>
      <p>
        Access to athlete and financial records is restricted by workspace role and enforced on the
        server. Payment settlement notifications are authenticated before they are accepted. If a
        breach affects your data, we will notify you and the Commissioner as the Act requires.
      </p>
    </article>
  );
}
