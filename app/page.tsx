import { GetIntakeDialog } from "../components/onboarding/get-intake-dialog";

const tiers = [
  {
    name: "Annual Athlete Pathway",
    amount: "KSh 200,000",
    description: "Foundations, training plan design, and academy onboarding.",
  },
  {
    name: "Athlete Tier",
    amount: "KSh 350,000",
    description: "Priority coaching access and performance tracking support.",
  },
  {
    name: "Speed-Mov / West",
    amount: "KSh 500,000",
    description: "High-performance pathway access for ambitious athlete households.",
  },
  {
    name: "Family & Estate",
    amount: "KSh 750,000",
    description: "Multi-athlete family support, legacy planning, and concierge guidance.",
  },
  {
    name: "Executive Partner Track",
    amount: "KSh 1,000,000",
    description: "Strategic sponsorship, visibility, and institutional partnership access.",
  },
] as const;

export default function HomePage() {
  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(135deg, #07111f 0%, #111d31 100%)", color: "#f5f7fb", padding: "32px 20px 80px" }}>
      <section style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gap: 24 }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div>
            <p style={{ margin: 0, color: "#73a8ff", fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase" }}>
              Big Ice Academy Conversion Overhaul
            </p>
            <h1 style={{ margin: "8px 0 10px", fontSize: "clamp(2rem, 4vw, 3rem)" }}>
              Elite athlete conversion landing experience for the next revenue chapter.
            </h1>
            <p style={{ margin: 0, maxWidth: 720, lineHeight: 1.7, color: "#dce8ff" }}>
              This homepage now delivers the investor-grade conversion narrative, the 5-tier investment grid, and an intake modal that routes families into the admissions workflow.
            </p>
          </div>
          <GetIntakeDialog />
        </div>

        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {tiers.map((tier) => (
            <article
              key={tier.name}
              style={{
                border: "1px solid rgba(115, 168, 255, 0.22)",
                borderRadius: 20,
                padding: 20,
                background: "rgba(9, 16, 30, 0.86)",
                boxShadow: "0 16px 48px rgba(2, 8, 23, 0.25)",
              }}
            >
              <p style={{ margin: 0, color: "#73a8ff", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.22em" }}>
                Investment Tier
              </p>
              <h2 style={{ margin: "8px 0 8px", fontSize: 20 }}>{tier.name}</h2>
              <p style={{ margin: 0, color: "#f6c443", fontWeight: 700, fontSize: 18 }}>{tier.amount}</p>
              <p style={{ marginTop: 10, lineHeight: 1.6, color: "#dce8ff" }}>{tier.description}</p>
            </article>
          ))}
        </div>

        <section style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          <div style={{ borderRadius: 22, padding: 24, background: "rgba(11, 22, 39, 0.82)", border: "1px solid rgba(115, 168, 255, 0.2)" }}>
            <h3 style={{ marginTop: 0 }}>Strategic partners</h3>
            <ul style={{ paddingLeft: 18, lineHeight: 1.8, color: "#dce8ff" }}>
              <li>
                <a href="https://www.athlyticahq.com" target="_blank" rel="noreferrer" style={{ color: "#8dd3ff" }}>
                  athlyticahq.com
                </a>
              </li>
              <li>
                <a href="https://nairobihockey.com" target="_blank" rel="noreferrer" style={{ color: "#8dd3ff" }}>
                  nairobihockey.com
                </a>
              </li>
            </ul>
          </div>

          <div style={{ borderRadius: 22, padding: 24, background: "rgba(11, 22, 39, 0.82)", border: "1px solid rgba(115, 168, 255, 0.2)" }}>
            <h3 style={{ marginTop: 0 }}>Admissions workflow</h3>
            <p style={{ lineHeight: 1.7, color: "#dce8ff" }}>
              The modal wizard submits to the admissions API at <code>/api/admissions/submit</code> and captures the family intent for follow-up.
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}
