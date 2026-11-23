import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function normalizeSupabaseUrl(rawUrl?: string): string | null {
  if (!rawUrl || !rawUrl.trim()) return null;
  try {
    const cleaned = rawUrl
      .trim()
      .replace(/^['"]+|['"]+$/g, '')
      .trim()
      .replace(/\/rest\/v1\/?$/i, '')
      .replace(/\/+$/, '');
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'https:') return null;
    if (!parsed.hostname.endsWith('.supabase.co') && !parsed.hostname.endsWith('.supabase.in')) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function sanitizeBrowserSupabaseKey(rawKey?: unknown): string | null {
  if (typeof rawKey !== 'string') return null;
  const cleaned = rawKey.trim().replace(/^['"]+|['"]+$/g, '').trim();
  if (!cleaned) return null;
  if (/^(your_|my_|replace_|placeholder|<)/i.test(cleaned)) return null;
  if (cleaned.includes('your_publishable_key') || cleaned.includes('your-sb_')) return null;

  const isModernKey = cleaned.startsWith('sb_publishable_') && cleaned.length >= 24;
  const isLegacyJwt =
    cleaned.startsWith('eyJ') && cleaned.split('.').length === 3 && cleaned.length >= 60;

  return isModernKey || isLegacyJwt ? cleaned : null;
}

const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
const supabasePublishableKey =
  sanitizeBrowserSupabaseKey(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) ||
  sanitizeBrowserSupabaseKey(import.meta.env.VITE_SUPABASE_ANON_KEY);

export const isSupabaseBrowserConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase: SupabaseClient | null =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;
