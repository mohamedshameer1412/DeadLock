"use client";

/** Last resort when the root layout itself fails. */
export default function GlobalError({ error }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#eaf6fd", color: "#0b1f3a", padding: "4rem 1rem", textAlign: "center" }}>
        <h1>Nexus hit an error</h1>
        <p>Reload the page. If it keeps happening, sign out and back in.</p>
        {error?.digest && <p style={{ fontSize: "0.8rem" }}>Reference: {error.digest}</p>}
        <button type="button" onClick={() => window.location.reload()} style={{ minHeight: 44, padding: "0 1rem", borderRadius: 8, border: 0, background: "#1561ad", color: "#fff", fontWeight: 600 }}>Reload</button>
      </body>
    </html>
  );
}
