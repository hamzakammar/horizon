/**
 * Public auth routes for the onboarding page.
 * No JWT required — these handle signup/signin and return tokens.
 */

import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key);
}

/** POST /auth/signup */
router.post("/auth/signup", async (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ token: data.session?.access_token, userId: data.user?.id, needsConfirmation: !data.session });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/** POST /auth/signin */
router.post("/auth/signin", async (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { res.status(400).json({ error: error.message }); return; }
    res.json({ token: data.session?.access_token, userId: data.user?.id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
