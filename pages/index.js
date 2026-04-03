export default function Home() {
  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <p style={styles.eyebrow}>Inside Diagnostics</p>
        <h1 style={styles.title}>Twilio Voice AI Intake is active.</h1>
        <p style={styles.body}>
          This deployment is live and ready to receive voice webhooks from
          Twilio.
        </p>

        <div style={styles.statusRow}>
          <span style={styles.dot} />
          <span style={styles.statusText}>API status: online</span>
        </div>

        <div style={styles.panel}>
          <p style={styles.panelLabel}>Webhook endpoints</p>
          <code style={styles.code}>POST /api/voice</code>
          <code style={styles.code}>POST /api/process</code>
        </div>

        <p style={styles.footer}>
          Paste <strong>/api/voice</strong> into your Twilio phone number voice
          webhook using the full Vercel domain.
        </p>
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
      "linear-gradient(135deg, #f5f7fb 0%, #eef2f7 45%, #e7eef8 100%)",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: "#142033",
  },
  card: {
    width: "100%",
    maxWidth: "720px",
    padding: "40px 32px",
    borderRadius: "24px",
    backgroundColor: "#ffffff",
    boxShadow: "0 24px 60px rgba(15, 23, 42, 0.12)",
    border: "1px solid rgba(20, 32, 51, 0.08)",
  },
  eyebrow: {
    margin: "0 0 12px",
    fontSize: "12px",
    fontWeight: 700,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "#486284",
  },
  title: {
    margin: "0 0 16px",
    fontSize: "clamp(2rem, 5vw, 3.5rem)",
    lineHeight: 1.05,
  },
  body: {
    margin: "0 0 24px",
    fontSize: "18px",
    lineHeight: 1.6,
    color: "#334155",
  },
  statusRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 14px",
    marginBottom: "24px",
    borderRadius: "999px",
    backgroundColor: "#ecfdf3",
    color: "#166534",
    fontWeight: 600,
  },
  dot: {
    width: "10px",
    height: "10px",
    borderRadius: "999px",
    backgroundColor: "#22c55e",
    boxShadow: "0 0 0 6px rgba(34, 197, 94, 0.14)",
  },
  statusText: {
    fontSize: "14px",
  },
  panel: {
    display: "grid",
    gap: "12px",
    padding: "20px",
    borderRadius: "18px",
    backgroundColor: "#0f172a",
    color: "#e2e8f0",
  },
  panelLabel: {
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
  footer: {
    margin: "24px 0 0",
    fontSize: "15px",
    lineHeight: 1.6,
    color: "#475569",
  },
};
