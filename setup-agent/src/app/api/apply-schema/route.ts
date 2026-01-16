import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

export async function POST(req: Request) {
  try {
    const { pgUrl } = await req.json();

    if (!pgUrl || typeof pgUrl !== "string") {
      return NextResponse.json({ success: false, error: "pgUrl is required" }, { status: 400 });
    }

    // Load schema.sql from assets
    const schemaPath = path.join(process.cwd(), "assets", "schema.sql");
    const schemaSql = await fs.readFile(schemaPath, "utf8");

    const client = new Client({
      connectionString: pgUrl,
      // Supabase requires SSL for remote connections
      ssl: { rejectUnauthorized: false },
    });

    await client.connect();

    try {
      // Run the full schema in a single call to preserve $$ blocks.
      await client.query(schemaSql);

      // Smoke checks: verify key tables exist
      const tables = ["tasks", "sync_state", "note_sections", "office_hours", "piazza_posts"];
      const tableChecks = await Promise.all(
        tables.map(async (t) => {
          const r = await client.query(
            `select exists (
               select 1
               from information_schema.tables
               where table_schema = 'public' and table_name = $1
             ) as ok`,
            [t]
          );
          return { table: t, ok: Boolean(r.rows?.[0]?.ok) };
        })
      );

      // Verify RPC functions exist
      const funcs = ["match_note_sections", "match_piazza_posts"];
      const funcChecks = await Promise.all(
        funcs.map(async (f) => {
          const r = await client.query(
            `select exists (
               select 1
               from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = $1
             ) as ok`,
            [f]
          );
          return { function: f, ok: Boolean(r.rows?.[0]?.ok) };
        })
      );

      // Verify pgvector extension
      const ext = await client.query(
        `select exists (select 1 from pg_extension where extname = 'vector') as ok`
      );

      const allOk =
        tableChecks.every((x) => x.ok) &&
        funcChecks.every((x) => x.ok) &&
        Boolean(ext.rows?.[0]?.ok);

      return NextResponse.json({
        success: allOk,
        checks: {
          extension_vector: Boolean(ext.rows?.[0]?.ok),
          tables: tableChecks,
          functions: funcChecks,
        },
      });
    } finally {
      await client.end();
    }
  } catch (err: any) {
    // IMPORTANT: do not echo pgUrl or secrets
    return NextResponse.json(
      { success: false, error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
