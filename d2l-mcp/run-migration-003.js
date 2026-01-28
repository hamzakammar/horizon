#!/usr/bin/env node
/**
 * Run migration 003: Add token column to user_credentials table
 * Uses existing database connection
 */

import "dotenv/config";
import pg from 'pg';
const { Pool } = pg;

const dbUrl = process.env.SUPABASE_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  console.error("❌ Error: DATABASE_URL or SUPABASE_URL environment variable not set");
  console.error("   Set it in your .env file or export it:");
  console.error("   export DATABASE_URL='postgresql://postgres:PASSWORD@ENDPOINT:5432/postgres?sslmode=require'");
  process.exit(1);
}

async function runMigration() {
  console.log("🚀 Running migration 003: Add token column...\n");

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl.includes('rds') || dbUrl.includes('amazonaws') ? { rejectUnauthorized: false } : undefined,
  });

  try {
    // Add token column
    console.log("📝 Adding 'token' column...");
    await pool.query(`
      alter table public.user_credentials 
      add column if not exists token text;
    `);
    console.log("   ✅ Token column added");

    // Make password nullable
    console.log("📝 Making 'password' column nullable...");
    await pool.query(`
      alter table public.user_credentials 
      alter column password drop not null;
    `);
    console.log("   ✅ Password column is now nullable");

    // Verify the column exists
    console.log("\n🔍 Verifying migration...");
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
      AND table_name = 'user_credentials' 
      AND column_name = 'token';
    `);

    if (result.rows.length > 0) {
      console.log("✅ Migration completed successfully!");
      console.log(`   Column details: ${JSON.stringify(result.rows[0], null, 2)}`);
    } else {
      console.log("⚠️  Warning: Could not verify token column (but migration may have succeeded)");
    }

  } catch (error) {
    console.error("\n❌ Migration failed:");
    console.error(error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
