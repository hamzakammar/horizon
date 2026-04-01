/**
 * Public auth routes for the onboarding page.
 * No JWT required — these handle signup/signin and return tokens.
 */

import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  // Use anon key for user auth — service role key issues short-lived tokens
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key);
}

/** POST /auth/signup */
router.post("/signup", async (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({
      token: data.session?.access_token,
      refreshToken: data.session?.refresh_token,
      expiresAt: data.session?.expires_at,
      userId: data.user?.id,
      needsConfirmation: !data.session,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /auth/signin */
router.post("/signin", async (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({
      token: data.session?.access_token,
      refreshToken: data.session?.refresh_token,
      expiresAt: data.session?.expires_at,
      userId: data.user?.id,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /auth/refresh — exchange refresh_token for a new access_token */
router.post("/refresh", async (req: Request, res: Response) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    res.status(400).json({ error: "refreshToken required" });
    return;
  }
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
    if (error) { res.status(401).json({ error: error.message }); return; }
    res.json({
      token: data.session?.access_token,
      refreshToken: data.session?.refresh_token,
      expiresAt: data.session?.expires_at,
      userId: data.user?.id,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
