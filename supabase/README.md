# Supabase migrations

`migrations/` is the version-controlled source of database changes. New schema
changes should be added as timestamped SQL migrations here.

## Bootstrap the existing project

The initial migration matches the current `supabase-schema.sql` setup. Since
the hosted project already has that schema, mark the migration as applied
instead of running it against the existing database:

1. Install the Supabase CLI and authenticate with `supabase login`.
2. Link this checkout to the project:

   ```powershell
   supabase link --project-ref ovqksdgfmyxwpjwrhbcr
   ```

3. Mark the existing schema as the migration baseline:

   ```powershell
   supabase migration repair --linked --status applied 20261105213000
   ```

This records migration history; it does not execute the migration SQL. Do not
run `supabase db push` against this already-populated project until this
baseline step has completed.

## Configure GitHub Actions

In the repository's **Settings → Secrets and variables → Actions**, add:

- Repository secret `SUPABASE_ACCESS_TOKEN`: a Supabase personal access token.
- Repository secret `SUPABASE_DB_PASSWORD`: the database password for the
  linked Supabase project.
- Repository variable `SUPABASE_PROJECT_ID`: `ovqksdgfmyxwpjwrhbcr`.

After confirming the baseline command completed successfully, add repository
variable `SUPABASE_BASELINE_COMPLETE` with value `true`. This gates the
migration workflow so it cannot change the existing database before its
migration history is initialized.

After bootstrap, pushes to `main` that change `supabase/migrations/` run
`supabase db push --linked`. You can also start the workflow manually from the
GitHub Actions tab.

The root `supabase-schema.sql` describes the current setup schema; future
database changes should be made in timestamped migration files. The
category/due-date removal migration also deletes those values from existing
ideas.

## Public idea sharing

The migration `20261106150000_public_idea_sharing.sql` adds the `is_public`
field and read-only policies for the community directory. Apply it to the
linked existing project with:

```powershell
supabase db push --linked
```

Only ideas explicitly marked public are visible to anonymous or authenticated
visitors. Database policies permit visitors to read shared ideas and their
photos, but only the owner can change or delete an idea. Treat shared idea
titles, notes, status, and photos as public information.

## Google sign-in redirects

The app sends Google sign-in back to the URL where it was opened. In the
Supabase Dashboard, open **Authentication → URL Configuration** and set:

- **Site URL** to `https://flyinggamecock.github.io/Memory-Maker/`.
- **Redirect URLs** to include
  `https://flyinggamecock.github.io/Memory-Maker/**`.

If testing locally, keep the local web server running while signing in and add
its exact origin and path to **Redirect URLs** (for example,
`http://localhost:8000/**`). Use the port your server actually reports.

In **Authentication → Providers → Google**, make sure Google is enabled. In
the Google OAuth client configuration, the authorized redirect URI must be
the Supabase callback URL:
`https://gzkhdcuaioyyybbedppq.supabase.co/auth/v1/callback`. This is not the
app's localhost or GitHub Pages URL.

If sign-in ends at `localhost` while using the deployed site, check that the
deployed URL is in Supabase's **Redirect URLs** list and that **Site URL** is
not set to localhost. Supabase may use **Site URL** when the requested return
URL is not allowed.
