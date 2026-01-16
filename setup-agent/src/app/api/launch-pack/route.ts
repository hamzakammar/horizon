import { NextResponse } from "next/server";
import AdmZip from "adm-zip";

function envLine(key: string, value?: string) {
  if (!value) return `${key}=`;
  // Quote values that contain spaces or special characters
  const needsQuotes = /[\s"'`\\]/.test(value);
  const safe = value.replace(/"/g, '\\"');
  return needsQuotes ? `${key}="${safe}"` : `${key}=${safe}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      supabaseUrl,
      supabaseServiceRoleKey,
      openaiApiKey,
      notesMap,
      piazzaMap,
      notesRepoPath,
      notesRepoWebBase,
    } = body ?? {};

    if (!supabaseUrl || typeof supabaseUrl !== "string") {
      return NextResponse.json({ success: false, error: "supabaseUrl is required" }, { status: 400 });
    }

    // Build .env
    const env = [
      envLine("SUPABASE_URL", supabaseUrl),
      envLine("SUPABASE_SERVICE_ROLE_KEY", supabaseServiceRoleKey),
      envLine("OPENAI_API_KEY", openaiApiKey),
      envLine("NOTES_REPO_PATH", notesRepoPath),           // optional (local parse mode)
      envLine("NOTES_REPO_WEB_BASE", notesRepoWebBase),    // optional
      "",
    ].join("\n");

    // Default map templates if none provided
    const defaultNotesMap = notesMap && typeof notesMap === "object"
      ? notesMap
      : {
          EXAMPLE101: ["./path/to/your.pdf"]
        };

    const defaultPiazzaMap = piazzaMap && typeof piazzaMap === "object"
      ? piazzaMap
      : {
          EXAMPLE101: { piazza_url: "https://piazza.com/class/XXXXXXX" }
        };

    const setupMd = `# Generated Setup

## 1) Paste files into your repo
Unzip this pack into the root of \`mcp-workspace\` (it will place files in the correct paths).

## 2) Install + run
\`\`\`bash
npm install
npm run dev
\`\`\`

## 3) Test MCP tools
Try:
- notes_sync
- notes_embed_missing
- piazza_sync
- piazza_embed_missing
`;

    const zip = new AdmZip();

    // Write files into correct repo paths
    zip.addFile(".env", Buffer.from(env, "utf8"));
    zip.addFile("d2l-mcp/src/db/notes_map.json", Buffer.from(JSON.stringify(defaultNotesMap, null, 2), "utf8"));
    zip.addFile("d2l-mcp/src/db/piazza_map.json", Buffer.from(JSON.stringify(defaultPiazzaMap, null, 2), "utf8"));
    zip.addFile("docs/SETUP_GENERATED.md", Buffer.from(setupMd, "utf8"));

    // Optional: Claude Desktop config snippet (adjust command to your actual run command)
    const claudeConfigSnippet = {
      mcpServers: {
        "study-mcp": {
          command: "npm",
          args: ["run", "dev"],
          env: {
            SUPABASE_URL: supabaseUrl,
            SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey ?? "",
            OPENAI_API_KEY: openaiApiKey ?? "",
          }
        }
      }
    };
    zip.addFile("claude_desktop_config_snippet.json", Buffer.from(JSON.stringify(claudeConfigSnippet, null, 2), "utf8"));

    const out = zip.toBuffer();

    // Convert Node.js Buffer to Uint8Array for web compatibility
    const outArray = new Uint8Array(out);

    return new NextResponse(outArray, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="study-mcp-launch-pack.zip"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
