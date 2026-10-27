# Architecture rules
- Use the shared account-scoped study queue key for fetching, prefetching and cleanup, because private session data must not cross account boundaries.
- Display unknown AI balances as loading/unavailable rather than zero; daily claims use account-scoped Query caching and the server's idempotent grant.
- Record study and AI failures through the existing error logger without prompts, card content or credentials, because diagnostics must not expose learning materials or sessions.