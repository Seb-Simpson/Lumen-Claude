# Connecting Lumen to Supabase

Supabase is a free online database. Connecting it lets people share uploads, comments, likes, subscriptions and accounts across devices. Everything here happens in your web browser and takes about 5 minutes.

## 1. Create a free Supabase project

1. Go to **https://supabase.com** and click **Start your project**.
2. Choose **Continue with GitHub** and allow access.
3. Click **New project** and fill in the form:
   - **Name:** `lumen`
   - **Database password:** click **Generate a password**, and save it somewhere safe (such as a password manager). Lumen doesn't need it, but you might later.
   - **Region:** pick the one closest to you, for example *West EU (London)*.
   - **Plan:** Free.
4. Click **Create new project**, then wait a minute or two while it sets up.

## 2. Run the setup script

1. Open the script on GitHub: [`supabase/setup.sql`](setup.sql).
2. Click the **Copy raw file** button (the two overlapping squares, top right of the file).
3. In Supabase, click **SQL Editor** in the left sidebar, then **New query**.
4. Paste the script into the editor (Ctrl + V) and click **Run** (bottom right).
5. You should see **"Success. No rows returned"**.
   - If Supabase warns that the query includes "destructive operations", that's caused by the lines that safely replace older copies of the rules. Click **Run this query** to continue.
   - Running the script again later is safe. It never deletes your data.

## 3. Two settings

1. **Turn off email confirmation** (recommended for now). Go to **Authentication** → **Sign In / Providers** → **Email**, switch off **Confirm email**, then click **Save**.

   *Why:* the free plan can only send a few emails per hour, so new sign-ups would get stuck waiting for a confirmation email. You can turn it back on later after connecting your own email service.

2. **Set the site address.** Go to **Authentication** → **URL Configuration** and set **Site URL** to:

   ```
   https://seb-simpson.github.io/Lumen-Claude/
   ```

   Then click **Save**.

## 4. Send Claude two values

Click the **Connect** button at the top of your project page, or go to **Project Settings** → **API Keys**, and copy:

| What | Looks like | Safe to share? |
| --- | --- | --- |
| **Project URL** | `https://abcdefghijkl.supabase.co` | ✅ Yes |
| **Publishable key** (may be called the **anon public** key) | starts with `sb_publishable_` or `eyJ…` | ✅ Yes. It's designed to be public, and the database rules protect the data. |
| ~~Secret / service_role key~~ | starts with `sb_secret_` | ❌ **Never share or paste this anywhere.** |

## What the script sets up

- **Tables:** profiles, videos, comments, comment likes, video ratings, subscriptions, playlists and reports.
- **File storage:** a `videos` bucket (MP4/WebM, up to 50 MB each) and a `thumbnails` bucket (images, up to 5 MB each).
- **Security rules (Row Level Security):** anyone can read public content, but people can only create, change or delete their own things. Private videos are visible only to their owner, playlists are private, and nobody can fake their view counts or post as someone else. These rules are checked by 62 automated tests.

## Moderating content

- **Reports** from viewers appear in **Table Editor** → `reports`.
- To remove a video, delete its row in **Table Editor** → `videos`. Its comments, likes and reports are removed automatically. To also free the storage space, delete the file in **Storage** → `videos` (it's in a folder named after the uploader's user id).
- To remove a user and everything they posted, go to **Authentication** → **Users**, open the user, and choose **Delete user**.

## Free plan limits

The free plan includes a 500 MB database, 1 GB of file storage and a 50 MB maximum per upload. The project **pauses after 7 days with no activity**. If that happens, open the Supabase dashboard and click **Restore project**. Nothing is lost.
