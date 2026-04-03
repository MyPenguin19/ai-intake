export default function Home() {
  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <p style={styles.eyebrow}>Inside Diagnostics</p>
        <h1 style={styles.title}>AI Phone Intake System</h1>
        <p style={styles.body}>
          This deployment is live and ready to receive Twilio voice webhooks.
        </p>

        <div style={styles.panel}>
          <p style={styles.label}>Endpoints</p>
          <code style={styles.code}>POST /api/voice</code>
          <code style={styles.code}>POST /api/process</code>
        </div>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    margin: 0,
    padding: "32px 20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background:
      "linear-gradient(135deg, #f4f7fb 0%, #e9f0f8 50%, #dde8f3 100%)",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: "#122033",
  },
  card: {
    width: "100%",
    maxWidth: "720px",
    padding: "40px 32px",
    borderRadius: "24px",
    backgroundColor: "#ffffff",
    border: "1px solid rgba(18, 32, 51, 0.08)",
    boxShadow: "0 24px 60px rgba(15, 23, 42, 0.12)",
  },
  eyebrow: {
    margin: "0 0 12px",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#486284",
  },
  title: {
    margin: "0 0 14px",
    fontSize: "clamp(2rem, 5vw, 3.4rem)",
    lineHeight: 1.05,
  },
  body: {
    margin: "0 0 24px",
    fontSize: "18px",
    lineHeight: 1.6,
    color: "#334155",
  },
  panel: {
    display: "grid",
    gap: "12px",
    padding: "20px",
    borderRadius: "18px",
    backgroundColor: "#0f172a",
    color: "#e2e8f0",
  },
  label: {
    margin: 0,
    fontSize: "13px",
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#93c5fd",
  },
  code: {
    display: "block",
    padding: "12px 14px",
    borderRadius: "12px",
    backgroundColor: "rgba(148, 163, 184, 0.14)",
    fontSize: "15px",
    overflowX: "auto",
  },
};
