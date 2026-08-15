import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";

export interface AuthSnapshot {
  session: Session | null;
  user: User | null;
}

export async function restoreCloudSession(): Promise<AuthSnapshot> {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) throw error;
  return { session: data.session, user: data.session?.user ?? null };
}

export async function sendSignInLink(email: string, redirectTo = `${window.location.origin}/cloud`): Promise<void> {
  const { error } = await getSupabaseClient().auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
  });
  if (error) throw error;
}

export async function signOutCloud(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}

