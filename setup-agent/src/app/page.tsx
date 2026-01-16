"use client";

import { useMemo, useState } from "react";

type Msg = { role: "agent" | "user"; text: string };

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "agent", text: "Paste your Supabase Postgres connection string, then click “Initialize DB”." },
  ]);

  const [pgUrl, setPgUrl] = useState("");
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [serviceRoleKey, setServiceRoleKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");

  const [busy, setBusy] = useState(false);
  const [dbReady, setDbReady] = useState(false);

  const transcript = useMemo(
    () =>
      messages.map((m, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <b>{m.role === "agent" ? "Agent" : "You"}:</b> {m.text}
        </div>
      )),
    [messages]
  );

  async function initDb() {
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: "Initialize DB" }]);

    try {
      const res = await fetch("/api/apply-schema", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pgUrl }),
      });

      const json = await res.json();
      if (!json.success) {
        setMessages((m) => [
          ...m,
          { role: "agent", text: `DB init failed: ${json.error ?? "unknown error"}` },
        ]);
        setDbReady(false);
      } else {
        setMessages((m) => [
          ...m,
          { role: "agent", text: "Database initialized. Next: paste Supabase URL + keys, then download Launch Pack." },
        ]);
        setDbReady(true);
      }
    } catch (e: any) {
      setMessages((m) => [...m, { role: "agent", text: `DB init error: ${e?.message ?? String(e)}` }]);
      setDbReady(false);
    } finally {
      setBusy(false);
    }
  }

  async function downloadPack() {
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: "Download Launch Pack" }]);

    try {
      const res = await fetch("/api/launch-pack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          supabaseUrl,
          supabaseServiceRoleKey: serviceRoleKey,
          openaiApiKey: openaiKey,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "study-mcp-launch-pack.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setMessages((m) => [
        ...m,
        { role: "agent", text: "✅ Launch Pack downloaded. Unzip into your repo root, then run `npm install` + `npm run dev`." },
      ]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "agent", text: `Download failed: ${e?.message ?? String(e)}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 900,
        margin: "56px auto 0 auto",
        padding: 0,
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        background: "#f7f8fa",
        minHeight: "100vh",
        borderRadius: 20,
        boxShadow: "0 8px 32px 0 rgba(60,60,90,0.13)",
        border: "1px solid #e5e7eb"
      }}
    >
      <div style={{ padding: '40px 60px 0 60px' }}>
        <h1 style={{ marginBottom: 10, fontWeight: 800, fontSize: 32, letterSpacing: -1, color: '#1a2233', lineHeight: 1.15 }}>Study MCP Setup Agent</h1>
        <p style={{ marginTop: 0, opacity: 0.78, fontSize: 17, color: '#3a4255', lineHeight: 1.5 }}>
          This wizard applies your schema to Supabase Postgres and generates a Launch Pack for local MCP running.
        </p>
      </div>

      <div
        style={{
          border: "none",
          borderRadius: 16,
          background: "#fff",
          boxShadow: "0 2px 12px 0 rgba(60,60,90,0.07)",
          padding: 28,
          margin: "36px 60px 0 60px"
        }}
      >
        <h3 style={{ marginTop: 0, fontWeight: 700, fontSize: 19, color: '#2b3142', letterSpacing: -0.5 }}>Chat</h3>
        <div
          style={{
            background: "linear-gradient(90deg, #f5f7fa 0%, #e9ecf3 100%)",
            borderRadius: 10,
            padding: 22,
            minHeight: 110,
            fontSize: 16,
            color: "#23272f",
            border: "1px solid #e5e7eb",
            marginTop: 6,
            marginBottom: 2,
            boxShadow: "0 1px 4px 0 rgba(60,60,90,0.04)"
          }}
        >
          {transcript}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 32,
          margin: "36px 60px 0 60px"
        }}
      >
        <div
          style={{
            border: "none",
            borderRadius: 16,
            background: "#fff",
            boxShadow: "0 2px 12px 0 rgba(60,60,90,0.07)",
            padding: 28
          }}
        >
          <h3 style={{ marginTop: 0, fontWeight: 700, fontSize: 18, color: '#2b3142', letterSpacing: -0.5 }}>1) Initialize DB (Postgres)</h3>
          <input
            value={pgUrl}
            onChange={(e) => setPgUrl(e.target.value)}
            placeholder="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
            style={{
              width: "100%",
              padding: "15px 18px",
              borderRadius: 9,
              border: "1.5px solid #d1d5db",
              fontSize: 16,
              marginBottom: 14,
              background: "#f9fafb",
              color: '#23272f',
              outline: 'none',
              transition: 'border 0.2s',
            }}
            onFocus={e => e.currentTarget.style.border = '1.5px solid #2563eb'}
            onBlur={e => e.currentTarget.style.border = '1.5px solid #d1d5db'}
          />
          <button
            onClick={initDb}
            disabled={busy || !pgUrl}
            style={{
              marginTop: 4,
              padding: "14px 0",
              width: '100%',
              borderRadius: 9,
              border: "none",
              background: busy || !pgUrl ? "#e5e7eb" : "#2563eb",
              color: busy || !pgUrl ? "#888" : "#fff",
              fontWeight: 700,
              fontSize: 16,
              cursor: busy || !pgUrl ? "not-allowed" : "pointer",
              boxShadow: busy || !pgUrl ? "none" : "0 1px 4px 0 rgba(37,99,235,0.09)",
              letterSpacing: 0.2,
              transition: 'background 0.2s',
            }}
            onMouseOver={e => {
              if (!(busy || !pgUrl)) e.currentTarget.style.background = '#1749b1';
            }}
            onMouseOut={e => {
              if (!(busy || !pgUrl)) e.currentTarget.style.background = '#2563eb';
            }}
          >
            {busy ? "Working..." : "Initialize DB"}
          </button>
        </div>

        <div
          style={{
            border: "none",
            borderRadius: 16,
            background: "#fff",
            boxShadow: "0 2px 12px 0 rgba(60,60,90,0.07)",
            padding: 28
          }}
        >
          <h3 style={{ marginTop: 0, fontWeight: 700, fontSize: 18, color: '#2b3142', letterSpacing: -0.5 }}>2) Download Launch Pack</h3>

          <input
            value={supabaseUrl}
            onChange={(e) => setSupabaseUrl(e.target.value)}
            placeholder="SUPABASE_URL"
            style={{
              width: "100%",
              padding: "15px 18px",
              borderRadius: 9,
              border: "1.5px solid #d1d5db",
              fontSize: 16,
              marginBottom: 14,
              background: "#f9fafb",
              color: '#23272f',
              outline: 'none',
              transition: 'border 0.2s',
            }}
            onFocus={e => e.currentTarget.style.border = '1.5px solid #059669'}
            onBlur={e => e.currentTarget.style.border = '1.5px solid #d1d5db'}
          />
          <input
            value={serviceRoleKey}
            onChange={(e) => setServiceRoleKey(e.target.value)}
            placeholder="SUPABASE_SERVICE_ROLE_KEY"
            style={{
              width: "100%",
              padding: "15px 18px",
              borderRadius: 9,
              border: "1.5px solid #d1d5db",
              fontSize: 16,
              marginBottom: 14,
              background: "#f9fafb",
              color: '#23272f',
              outline: 'none',
              transition: 'border 0.2s',
            }}
            onFocus={e => e.currentTarget.style.border = '1.5px solid #059669'}
            onBlur={e => e.currentTarget.style.border = '1.5px solid #d1d5db'}
          />
          <input
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            placeholder="OPENAI_API_KEY"
            style={{
              width: "100%",
              padding: "15px 18px",
              borderRadius: 9,
              border: "1.5px solid #d1d5db",
              fontSize: 16,
              background: "#f9fafb",
              color: '#23272f',
              outline: 'none',
              transition: 'border 0.2s',
            }}
            onFocus={e => e.currentTarget.style.border = '1.5px solid #059669'}
            onBlur={e => e.currentTarget.style.border = '1.5px solid #d1d5db'}
          />

          <button
            onClick={downloadPack}
            disabled={busy || !dbReady || !supabaseUrl}
            style={{
              marginTop: 4,
              padding: "14px 0",
              width: '100%',
              borderRadius: 9,
              border: "none",
              background: busy || !dbReady || !supabaseUrl ? "#e5e7eb" : "#059669",
              color: busy || !dbReady || !supabaseUrl ? "#888" : "#fff",
              fontWeight: 700,
              fontSize: 16,
              cursor: busy || !dbReady || !supabaseUrl ? "not-allowed" : "pointer",
              boxShadow: busy || !dbReady || !supabaseUrl ? "none" : "0 1px 4px 0 rgba(5,150,105,0.09)",
              letterSpacing: 0.2,
              transition: 'background 0.2s',
            }}
            onMouseOver={e => {
              if (!(busy || !dbReady || !supabaseUrl)) e.currentTarget.style.background = '#047857';
            }}
            onMouseOut={e => {
              if (!(busy || !dbReady || !supabaseUrl)) e.currentTarget.style.background = '#059669';
            }}
          >
            {busy ? "Working..." : "Download Launch Pack (.zip)"}
          </button>

          {!dbReady && (
            <p style={{ marginTop: 10, opacity: 0.7, fontSize: 15, color: '#b91c1c', fontWeight: 500 }}>
              Initialize DB first.
            </p>
          )}
        </div>
      </div>

      <div style={{ height: 48 }} />
    </main>
  );
}
