#!/usr/bin/env node
import "dotenv/config";
import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { assignmentTools } from "./tools/dropbox.js";
import { contentTools } from "./tools/content.js";
import { gradeTools } from "./tools/grades.js";
import { calendarTools } from "./tools/calendar.js";
import { newsTools } from "./tools/news.js";
import { enrollmentTools } from "./tools/enrollments.js";
import { downloadFile } from "./tools/files.js";
import { ApiFootballClient } from "./football-client.js";
import { tools as footballTools, handleToolCall as handleFootballTool } from "./tools/football.js";

function createServer(): McpServer {
  const server = new McpServer({
    name: "d2l-brightspace",
    version: "1.0.0",
  });

  // Helper to wrap tool handlers with logging
  const wrapToolHandler = (
    toolName: string,
    handler: (args: any) => Promise<string>
  ) => {
    return async (args: any) => {
      const startTime = Date.now();
      console.error(`[TOOL] Starting tool execution: ${toolName}`);
      console.error(`[TOOL] Tool: ${toolName}, Args:`, JSON.stringify(args));
      try {
        const result = await handler(args);
        const elapsedTime = Date.now() - startTime;
        console.error(
          `[TOOL] Completed tool execution: ${toolName} (${elapsedTime}ms)`
        );
        return { content: [{ type: "text" as const, text: result }] };
      } catch (error) {
        const elapsedTime = Date.now() - startTime;
        console.error(
          `[TOOL] Tool execution failed: ${toolName} (${elapsedTime}ms)`,
          error
        );
        throw error;
      }
    };
  };

  // Register assignment tools
  server.tool(
    "get_assignments",
    assignmentTools.get_assignments.description,
    { orgUnitId: assignmentTools.get_assignments.schema.orgUnitId },
    wrapToolHandler("get_assignments", async (args) => {
      return await assignmentTools.get_assignments.handler(
        args as { orgUnitId?: number }
      );
    })
  );

  server.tool(
    "get_assignment",
    assignmentTools.get_assignment.description,
    {
      orgUnitId: assignmentTools.get_assignment.schema.orgUnitId,
      assignmentId: assignmentTools.get_assignment.schema.assignmentId,
    },
    wrapToolHandler("get_assignment", async (args) => {
      return await assignmentTools.get_assignment.handler(
        args as { orgUnitId?: number; assignmentId: number }
      );
    })
  );

  server.tool(
    "get_assignment_submissions",
    assignmentTools.get_assignment_submissions.description,
    {
      orgUnitId: assignmentTools.get_assignment_submissions.schema.orgUnitId,
      assignmentId:
        assignmentTools.get_assignment_submissions.schema.assignmentId,
    },
    wrapToolHandler("get_assignment_submissions", async (args) => {
      return await assignmentTools.get_assignment_submissions.handler(
        args as { orgUnitId?: number; assignmentId: number }
      );
    })
  );

  // Register content tools
  server.tool(
    "get_course_content",
    contentTools.get_course_content.description,
    { orgUnitId: contentTools.get_course_content.schema.orgUnitId },
    wrapToolHandler("get_course_content", async (args) => {
      return await contentTools.get_course_content.handler(
        args as { orgUnitId?: number }
      );
    })
  );

  server.tool(
    "get_course_topic",
    contentTools.get_course_topic.description,
    {
      orgUnitId: contentTools.get_course_topic.schema.orgUnitId,
      topicId: contentTools.get_course_topic.schema.topicId,
    },
    wrapToolHandler("get_course_topic", async (args) => {
      return await contentTools.get_course_topic.handler(
        args as { orgUnitId?: number; topicId: number }
      );
    })
  );

  server.tool(
    "get_course_modules",
    contentTools.get_course_modules.description,
    { orgUnitId: contentTools.get_course_modules.schema.orgUnitId },
    wrapToolHandler("get_course_modules", async (args) => {
      return await contentTools.get_course_modules.handler(
        args as { orgUnitId?: number }
      );
    })
  );

  server.tool(
    "get_course_module",
    contentTools.get_course_module.description,
    {
      orgUnitId: contentTools.get_course_module.schema.orgUnitId,
      moduleId: contentTools.get_course_module.schema.moduleId,
    },
    wrapToolHandler("get_course_module", async (args) => {
      return await contentTools.get_course_module.handler(
        args as { orgUnitId?: number; moduleId: number }
      );
    })
  );

  // Register grade tools
  server.tool(
    "get_my_grades",
    gradeTools.get_my_grades.description,
    { orgUnitId: gradeTools.get_my_grades.schema.orgUnitId },
    wrapToolHandler("get_my_grades", async (args) => {
      return await gradeTools.get_my_grades.handler(
        args as { orgUnitId?: number }
      );
    })
  );

  // Register calendar tools
  server.tool(
    "get_upcoming_due_dates",
    calendarTools.get_upcoming_due_dates.description,
    {
      orgUnitId: calendarTools.get_upcoming_due_dates.schema.orgUnitId,
      daysBack: calendarTools.get_upcoming_due_dates.schema.daysBack,
      daysAhead: calendarTools.get_upcoming_due_dates.schema.daysAhead,
    },
    wrapToolHandler("get_upcoming_due_dates", async (args) => {
      return await calendarTools.get_upcoming_due_dates.handler(
        args as { orgUnitId?: number; daysBack?: number; daysAhead?: number }
      );
    })
  );

  // Register news tools
  server.tool(
    "get_announcements",
    newsTools.get_announcements.description,
    { orgUnitId: newsTools.get_announcements.schema.orgUnitId },
    wrapToolHandler("get_announcements", async (args) => {
      return await newsTools.get_announcements.handler(
        args as { orgUnitId?: number }
      );
    })
  );

  // Register enrollment tools
  server.tool(
    "get_my_courses",
    enrollmentTools.get_my_courses.description,
    {},
    wrapToolHandler("get_my_courses", async () => {
      return await enrollmentTools.get_my_courses.handler();
    })
  );

  // Register file tools
  server.tool(
    "download_file",
    "Download a file from D2L Brightspace. Provide a D2L content URL (e.g., https://learn.ul.ie/content/enforced/68929-CS4444.../file.docx or /content/enforced/...). The file will be saved to your Downloads folder by default, or to a custom path if specified. Returns the local file path, filename, size, and content type. Use this to download lecture slides, assignment files, course materials, or any file linked in course content.",
    {
      url: z
        .string()
        .describe(
          "The D2L URL or path to the file to download (e.g., https://learn.ul.ie/content/enforced/68929-CS4444_SEM1_2025_6/file.docx)"
        ),
      savePath: z
        .string()
        .optional()
        .describe(
          "Optional: Custom path to save the file (directory or full file path). Defaults to ~/Downloads"
        ),
    },
    wrapToolHandler("download_file", async (args) => {
      const result = await downloadFile(args.url, args.savePath);
      const sizeKB = (result.size / 1024).toFixed(1);
      let text = `Downloaded: ${result.filename}\nPath: ${result.path}\nSize: ${sizeKB} KB\nType: ${result.contentType}`;

      if (result.content) {
        text += `\n\n--- File Content ---\n${result.content}`;
      }

      return text;
    })
  );

  // Register football tools
  const footballApiKey = process.env.API_FOOTBALL_KEY;
  if (footballApiKey) {
    const footballClient = new ApiFootballClient(footballApiKey);
    
    for (const tool of footballTools) {
      // Convert JSON schema properties to Zod schemas
      const zodSchema: Record<string, any> = {};
      
      if (tool.inputSchema.properties) {
        const props = tool.inputSchema.properties;
        for (const [key, prop] of Object.entries(props)) {
          const p = prop as any;
          let zodType;
          
          if (p.type === 'string') {
            zodType = z.string();
          } else if (p.type === 'number') {
            zodType = z.number();
          } else if (p.type === 'boolean') {
            zodType = z.boolean();
          } else {
            zodType = z.any();
          }
          
          // Make optional if not in required array
          const isRequired = tool.inputSchema.required?.includes(key);
          if (!isRequired) {
            zodType = zodType.optional();
          }
          
          if (p.description) {
            zodType = zodType.describe(p.description);
          }
          
          zodSchema[key] = zodType;
        }
      }
      
      server.tool(
        tool.name,
        tool.description,
        zodSchema,
        wrapToolHandler(tool.name, async (args) => {
          return await handleFootballTool(tool.name, args, footballClient);
        })
      );
    }
    console.error(`[INIT] Registered ${footballTools.length} football tools`);
  } else {
    console.error("[INIT] API_FOOTBALL_KEY not found, skipping football tools");
  }

  return server;
}

async function main() {
  const transportType = process.env.MCP_TRANSPORT?.toLowerCase() || "http";

  if (transportType === "stdio") {
    // Use stdio transport (manual selection)
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("D2L Brightspace MCP server running on stdio");
  } else if (transportType === "http" || transportType === "https") {
    // Use HTTP transport with StreamableHTTPServerTransport
    const port = process.env.MCP_PORT
      ? parseInt(process.env.MCP_PORT, 10)
      : 3000;
    const app = express();

    app.use(express.json());
    app.use(
      cors({
        origin: "*",
        exposedHeaders: ["Mcp-Session-Id"],
      })
    );

    // Map to store transports by session ID
    const transports: Record<string, StreamableHTTPServerTransport> = {};

    // MCP POST endpoint
    const mcpPostHandler = async (
      req: express.Request,
      res: express.Response
    ) => {
      const requestStartTime = Date.now();
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      const requestMethod = req.body?.method || "unknown";
      const requestId = req.body?.id || null;
      const requestParams = req.body?.params || {};

      console.error(`[MCP] POST request received`);
      console.error(
        `[MCP] Session ID: ${sessionId || "none (initialization)"}`
      );
      console.error(`[MCP] Method: ${requestMethod}`);
      console.error(`[MCP] Request ID: ${requestId}`);
      if (requestMethod === "tools/call") {
        console.error(
          `[MCP] Tool: ${requestParams.name || "unknown"}, Args:`,
          JSON.stringify(requestParams.arguments || {})
        );
      }

      try {
        let transport: StreamableHTTPServerTransport;

        if (sessionId && transports[sessionId]) {
          // Reuse existing transport
          console.error(
            `[MCP] Reusing existing transport for session: ${sessionId}`
          );
          transport = transports[sessionId];
        } else if (!sessionId && isInitializeRequest(req.body)) {
          // New initialization request
          const initStartTime = Date.now();
          console.error(`[MCP] Creating new transport for initialization`);
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sessionId: string) => {
              const initTime = Date.now() - initStartTime;
              console.error(
                `[MCP] Session initialized with ID: ${sessionId} (${initTime}ms)`
              );
              transports[sessionId] = transport;
            },
            onsessionclosed: (sessionId: string) => {
              console.error(`[MCP] Session closed: ${sessionId}`);
              delete transports[sessionId];
            },
          });

          // Set up onclose handler to clean up transport when closed
          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid && transports[sid]) {
              console.error(
                `[MCP] Transport closed for session ${sid}, removing from transports map`
              );
              delete transports[sid];
            }
          };

          // Connect the transport to the MCP server BEFORE handling the request
          const server = createServer();
          const connectStartTime = Date.now();
          await server.connect(transport);
          const connectTime = Date.now() - connectStartTime;
          console.error(
            `[MCP] Server connected to transport (${connectTime}ms)`
          );

          const handleStartTime = Date.now();
          await transport.handleRequest(req, res, req.body);
          const handleTime = Date.now() - handleStartTime;
          const totalTime = Date.now() - requestStartTime;
          console.error(
            `[MCP] Request handled (${handleTime}ms, total: ${totalTime}ms)`
          );
          return; // Already handled
        } else {
          // Invalid request - no session ID or not initialization request
          const totalTime = Date.now() - requestStartTime;
          console.error(
            `[MCP] Invalid request - no session ID or not initialization (${totalTime}ms)`
          );
          res.status(400).json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Bad Request: No valid session ID provided",
            },
            id: null,
          });
          return;
        }

        // Handle the request with existing transport
        const handleStartTime = Date.now();
        await transport.handleRequest(req, res, req.body);
        const handleTime = Date.now() - handleStartTime;
        const totalTime = Date.now() - requestStartTime;
        console.error(
          `[MCP] Request handled (${handleTime}ms, total: ${totalTime}ms)`
        );
      } catch (error) {
        const totalTime = Date.now() - requestStartTime;
        console.error(
          `[MCP] Error handling MCP request (${totalTime}ms):`,
          error
        );
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal server error",
            },
            id: null,
          });
        }
      }
    };

    app.post("/mcp", mcpPostHandler);

    // Handle GET requests for SSE streams
    const mcpGetHandler = async (
      req: express.Request,
      res: express.Response
    ) => {
      const requestStartTime = Date.now();
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      console.error(`[MCP] GET request received`);
      console.error(`[MCP] Session ID: ${sessionId || "none"}`);

      if (!sessionId || !transports[sessionId]) {
        const totalTime = Date.now() - requestStartTime;
        console.error(`[MCP] Invalid or missing session ID (${totalTime}ms)`);
        res.status(400).send("Invalid or missing session ID");
        return;
      }

      const lastEventId = req.headers["last-event-id"] as string | undefined;
      if (lastEventId) {
        console.error(
          `[MCP] Client reconnecting with Last-Event-ID: ${lastEventId}`
        );
      } else {
        console.error(
          `[MCP] Establishing new SSE stream for session ${sessionId}`
        );
      }

      const transport = transports[sessionId];
      const handleStartTime = Date.now();
      await transport.handleRequest(req, res);
      const handleTime = Date.now() - handleStartTime;
      const totalTime = Date.now() - requestStartTime;
      console.error(
        `[MCP] GET request handled (${handleTime}ms, total: ${totalTime}ms)`
      );
    };

    app.get("/mcp", mcpGetHandler);

    // Handle DELETE requests for session termination
    const mcpDeleteHandler = async (
      req: express.Request,
      res: express.Response
    ) => {
      const requestStartTime = Date.now();
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      console.error(`[MCP] DELETE request received`);
      console.error(`[MCP] Session ID: ${sessionId || "none"}`);

      if (!sessionId || !transports[sessionId]) {
        const totalTime = Date.now() - requestStartTime;
        console.error(`[MCP] Invalid or missing session ID (${totalTime}ms)`);
        res.status(400).send("Invalid or missing session ID");
        return;
      }

      console.error(
        `[MCP] Received session termination request for session ${sessionId}`
      );
      try {
        const transport = transports[sessionId];
        const handleStartTime = Date.now();
        await transport.handleRequest(req, res);
        const handleTime = Date.now() - handleStartTime;
        const totalTime = Date.now() - requestStartTime;
        console.error(
          `[MCP] DELETE request handled (${handleTime}ms, total: ${totalTime}ms)`
        );
      } catch (error) {
        const totalTime = Date.now() - requestStartTime;
        console.error(
          `[MCP] Error handling session termination (${totalTime}ms):`,
          error
        );
        if (!res.headersSent) {
          res.status(500).send("Error processing session termination");
        }
      }
    };

    app.delete("/mcp", mcpDeleteHandler);

    app.listen(port, () => {
      console.error(`D2L Brightspace MCP server running on HTTP port ${port}`);
      console.error(`Connect to: http://localhost:${port}/mcp`);
    });

    // Handle server shutdown
    process.on("SIGINT", async () => {
      console.error("Shutting down server...");
      // Close all active transports to properly clean up resources
      for (const sessionId in transports) {
        try {
          console.error(`Closing transport for session ${sessionId}`);
          await transports[sessionId].close();
          delete transports[sessionId];
        } catch (error) {
          console.error(
            `Error closing transport for session ${sessionId}:`,
            error
          );
        }
      }
      console.error("Server shutdown complete");
      process.exit(0);
    });
  } else {
    console.error(
      `Invalid MCP_TRANSPORT value: ${transportType}. Must be 'stdio', 'http', or 'https'`
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
