import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createUserScopedSupabaseClient,
  isSupabaseInvalidApiKeyError,
  normalizeSupabaseProjectUrl,
  recordSupabaseAuthEvent,
  sanitizeSupabaseApiKey,
} from './supabaseService';

test('normalizeSupabaseProjectUrl strips /rest/v1/ suffix and keeps origin', () => {
  assert.equal(
    normalizeSupabaseProjectUrl('https://exampleproj.supabase.co/rest/v1/'),
    'https://exampleproj.supabase.co'
  );
  assert.equal(
    normalizeSupabaseProjectUrl('https://exampleproj.supabase.co/'),
    'https://exampleproj.supabase.co'
  );
});

test('normalizeSupabaseProjectUrl rejects non-HTTPS, private IPs, and non-Supabase hosts', () => {
  assert.equal(normalizeSupabaseProjectUrl('http://exampleproj.supabase.co'), null);
  assert.equal(normalizeSupabaseProjectUrl('https://127.0.0.1:5432'), null);
  assert.equal(normalizeSupabaseProjectUrl('https://169.254.169.254/latest/meta-data'), null);
  assert.equal(normalizeSupabaseProjectUrl('https://evil.example.com'), null);
  assert.equal(normalizeSupabaseProjectUrl(''), null);
});

test('sanitizeSupabaseApiKey accepts valid publishable/JWT keys and rejects placeholders', () => {
  assert.equal(sanitizeSupabaseApiKey(''), null);
  assert.equal(sanitizeSupabaseApiKey('your_publishable_key_here'), null);
  assert.equal(sanitizeSupabaseApiKey('"<your-sb_publishable_key>"'), null);
  assert.equal(
    sanitizeSupabaseApiKey(' "sb_publishable_example1234567890_abcdef" '),
    'sb_publishable_example1234567890_abcdef'
  );
  const fakeJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.signaturepart1234567890';
  assert.equal(sanitizeSupabaseApiKey(fakeJwt), fakeJwt);
});

test('isSupabaseInvalidApiKeyError detects invalid API key errors without matching password errors', () => {
  assert.equal(isSupabaseInvalidApiKeyError(new Error('Invalid API key')), true);
  assert.equal(isSupabaseInvalidApiKeyError(new Error('No API key found in request')), true);
  assert.equal(isSupabaseInvalidApiKeyError(new Error('Invalid login credentials')), false);
});

test('createUserScopedSupabaseClient returns null for empty access tokens', () => {
  assert.equal(createUserScopedSupabaseClient(''), null);
  assert.equal(createUserScopedSupabaseClient('   '), null);
});

test('recordSupabaseAuthEvent safely returns synced=false when userId is missing', async () => {
  const res = await recordSupabaseAuthEvent({
    supabaseUserId: '',
    email: 'student@example.com',
    fullName: 'Student',
    eventType: 'login',
  });
  assert.equal(res.synced, false);
});
