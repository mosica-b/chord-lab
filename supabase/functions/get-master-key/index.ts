const DEFAULT_ALLOWED_ORIGINS = 'https://mosica-b.github.io';
const DEFAULT_ALLOWED_EMAILS = 'admin@chord-lab.local';

function splitEnv(value: string | undefined, fallback: string): string[] {
  return (value || fallback)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get('origin') || '';
  const allowedOrigins = splitEnv(Deno.env.get('CHORD_LAB_ALLOWED_ORIGINS'), DEFAULT_ALLOWED_ORIGINS);
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json',
    },
  });
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

async function getUser(req: Request, token: string): Promise<{ email?: string } | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) return null;

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) return null;
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return json(req, { error: 'method_not_allowed' }, 405);
  }

  const token = getBearerToken(req);
  if (!token) {
    return json(req, { error: 'missing_token' }, 401);
  }

  const user = await getUser(req, token);
  const email = user?.email?.toLowerCase();
  const allowedEmails = splitEnv(Deno.env.get('CHORD_LAB_ALLOWED_EMAILS'), DEFAULT_ALLOWED_EMAILS)
    .map((item) => item.toLowerCase());

  if (!email || !allowedEmails.includes(email)) {
    return json(req, { error: 'forbidden' }, 403);
  }

  const masterKey = Deno.env.get('CHORD_LAB_MASTER_KEY_B64');
  if (!masterKey) {
    return json(req, { error: 'missing_master_key' }, 500);
  }

  return json(req, { masterKey });
});
