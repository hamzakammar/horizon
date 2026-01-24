#!/usr/bin/env node
import "dotenv/config";
import { getToken } from "../dist/auth.js";

async function main() {
  try {
    const token = await getToken();
    console.log("\n=== D2L Token ===");
    console.log(token);
    console.log("\n=== To use in AWS Secrets Manager ===");
    console.log(`aws secretsmanager create-secret --name study-mcp/d2l-token --secret-string '${token}'`);
    console.log("\nOr if secret already exists:");
    console.log(`aws secretsmanager update-secret --secret-id study-mcp/d2l-token --secret-string '${token}'`);
  } catch (error) {
    console.error("Failed to get token:", error);
    process.exit(1);
  }
}

main();
