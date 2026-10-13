# Cloudflare Bot Fight Mode blocks ClickUp

**Symptom.** ClickUp says "Connected to the server, but couldn't validate the connection", and the
server log shows no request at all from ClickUp (or only from your own machine).

**Cause.** On a domain with Bot Fight Mode on (Cloudflare Free plan), requests from ClickUp's cloud
(AWS addresses, no browser) get a managed challenge before they reach the tunnel. On the Free plan
Bot Fight Mode cannot be skipped per hostname. ClickUp has no fixed outbound addresses, so an IP
allow-list cannot work either.

**Fix.** Turn Bot Fight Mode off for the zone (Security → Bots), or use a domain without it. Check
Security → Events for challenged requests after a failed attempt. Protect the endpoint with the API
key and, optionally, a Cloudflare Access service token sent as custom headers instead.

**Signal it is back.** ClickUp fails while `bun run check` from your machine passes, and Security →
Events shows "Managed Challenge" for the hostname.
