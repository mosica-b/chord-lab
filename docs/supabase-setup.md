# Supabase Login Setup

This project uses GitHub Pages for the static frontend and Supabase for login.
The app decryption master key must live in Supabase Edge Function secrets, not
in public files.

## Project

- Project ref: `uciiyjxknkxgaynbmqki`
- Project URL: `https://uciiyjxknkxgaynbmqki.supabase.co`
- Public key in frontend: `sb_publishable_zHEGT9xPZlgM5zihVIrIFg_K_L5aON2`

## Create Admin User

In Supabase Dashboard:

1. Open `Authentication` > `Users`.
2. Click `Add user`.
3. Use:
   - Email: your admin email
   - Password: your admin password
4. Make sure the user is confirmed.

The login screen uses the Supabase user email as the login ID.

## Deploy Edge Function

Install and log in to the Supabase CLI:

```bash
npm install -g supabase
supabase login
```

Set the generated local secret file, then deploy:

```bash
supabase link --project-ref uciiyjxknkxgaynbmqki
supabase secrets set --env-file /private/tmp/chord-lab-supabase.env --project-ref uciiyjxknkxgaynbmqki
supabase functions deploy get-master-key --project-ref uciiyjxknkxgaynbmqki
```

Do not commit `/private/tmp/chord-lab-supabase.env` or paste its values into
GitHub Pages code.
