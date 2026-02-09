#!/usr/bin/env bash
# Prepare the source tree for a demo deployment.
#
# Removes src/app/api/ — these are server-only route handlers that
# import Node.js-specific modules (dockerode, child_process, fs).
# In demo mode all API calls are intercepted client-side, so these
# routes are dead code. Removing them keeps them out of the Worker
# bundle (smaller size, no Node.js runtime issues).

set -euo pipefail

rm -rf src/app/api

# Write .env so Next.js/Turbopack reliably inlines the flag.
# (Step-level env vars alone aren't always picked up by Turbopack.)
echo 'NEXT_PUBLIC_DEMO=true' > .env

echo "Demo build prepared: API routes removed, .env written."
