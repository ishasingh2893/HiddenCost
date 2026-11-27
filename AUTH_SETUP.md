# HiddenCost account setup (optional)

HiddenCost is a static GitHub Pages application. Favorite apartments and saved comparisons work **without an account** using browser localStorage. Accounts must be backed by a real provider; GitHub Pages cannot securely create accounts or send verification codes by itself.

## Activate Google and email OTP sign-in

1. Create a project at https://supabase.com/dashboard .
2. In **Project Settings → API**, copy the **Project URL** and **publishable/anon key**. **Never use a service_role/secret key in this GitHub repository.**
3. Edit `auth-config.js` and set `url` and `anonKey`. The browser can safely use a Supabase publishable/anon key (with appropriate permissions).
4. Under **Authentication → URL Configuration**, set the site URL to `https://ishasingh2893.github.io/HiddenCost/` and add the same URL to allowed redirect URLs.
5. Enable the **Email** provider under Authentication. To use six-digit email codes rather than magic links, modify the email sign-in template to include the template variable `{{ .Token }}`, as described in Supabase passwordless-email documentation.
6. For Google login, enable the **Google** provider in Supabase and configure a Google OAuth client in Google Cloud. Supply the Google client ID and client secret **only in the Supabase dashboard**, and add the Supabase OAuth callback URL as an authorized redirect URI in Google Cloud. See https://supabase.com/docs/guides/auth/social-login/auth-google .
7. Save the configuration, publish GitHub Pages, and test both login methods with real email accounts.

Supabase usage and quotas depend on the project's plan. Configure email deliverability and rate limits before broad release.

## Important scope and limitations

- Authentication is **disabled** until `auth-config.js` is completed. Disabled sign-in buttons must not be presented as a functioning account system.
- Once enabled, Google OAuth and email-code verification authenticate a user, but the current application **does not sync apartments/favorites across devices**. Saved data stays in the user's browser and is not uploaded to Supabase.
- Secure cross-device storage requires a database table keyed by the authenticated user, row-level security policies, and explicit migration of local data. Do **not** add a public writeable table without RLS.
- Do not store passwords or verification codes in browser localStorage.
- Address suggestions use the public Photon OpenStreetMap geocoder after a short typing pause. Selected coordinates are stored with apartment details in the browser. Commute routes use public demonstration routing services and may be unavailable; a reliable production product should use a supported routing provider with a published service-level agreement.

Official docs: https://supabase.com/docs/guides/auth/auth-email-passwordless and https://supabase.com/docs/reference/javascript/auth-signinwithotp .
