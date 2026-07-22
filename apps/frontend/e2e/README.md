# End-to-end tests

Every spec here mocks the backend via Playwright's `page.route()` rather
than hitting a real one. That's a deliberate choice, not a shortcut:

Real coverage of this app's actual login flow means completing a real
GitHub OAuth authorization, which needs a real GitHub account's
credentials — something that must never be checked into a repo or typed by
an automated agent. Every real-infrastructure path here (login, build,
deploy, monitoring, AI diagnosis, webhooks) has already been verified
manually against live GitHub, Docker, Minikube, and Prometheus during
development — see the commit history and `docs/` for that evidence.

What these tests verify instead is the one thing that _can_ be tested
deterministically and safely in CI: given a known API response, does the
frontend render, route, and behave correctly? That's genuine, valuable
coverage — regressions in loading states, error handling, and navigation
are exactly the kind of thing these tests catch — it's just a different
layer than "did the OAuth handshake work."
