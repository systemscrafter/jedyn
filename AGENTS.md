# Repository Guidelines

## Project Structure & Module Organization

This repository contains a Cloudflare Worker-backed static site. `src/worker.js` is the Worker entrypoint; it serves static assets, handles `POST /api/contact`, verifies Cloudflare Turnstile tokens, and sends email through the `SEND_EMAIL` binding. `public/index.html` contains the static page, styles, and browser-side form logic. `public/it-taglines.json` stores rotating tagline content loaded by the page. `wrangler.toml` defines the Worker name, entrypoint, assets binding, compatibility settings, and outbound email binding.

Keep browser assets in `public/` and server-only request handling in `src/`. If adding more data files, prefer small JSON files under `public/` when they are safe to expose publicly.

## Build, Test, and Development Commands

- `npx wrangler dev`: run the Worker and static assets locally.
- `npx wrangler deploy --dry-run`: validate the Worker bundle and Wrangler configuration without publishing.
- `npx wrangler deploy`: deploy the Worker and `public/` assets to Cloudflare.
- `npx wrangler secret put TURNSTILE_SECRET`: set the private Turnstile secret required by `src/worker.js`.

There are no committed npm scripts or package manifest yet. If scripts are added later, document the primary workflow here.

## Coding Style & Naming Conventions

Use 2-space indentation, semicolons, and double quotes in JavaScript. Keep configuration constants in uppercase, such as `TO_ADDRESS`, and keep helper functions small and named by behavior, such as `verifyTurnstile` or `cleanHeader`. In HTML and CSS, use lowercase hyphenated class names and keep visual changes in `public/index.html` unless extracting assets becomes necessary.

## Testing Guidelines

No automated test suite is currently present. Before handoff, run `npx wrangler deploy --dry-run` and manually check the homepage, `/it-taglines.json`, and contact form validation in `npx wrangler dev`. If tests are added, cover `POST /api/contact` cases for invalid JSON, missing required fields, invalid email, oversized messages, Turnstile failure, missing bindings, and successful email submission.

## Commit & Pull Request Guidelines

Recent commits use short, direct subjects such as `update carousel` and `setup cloudflare turnstile`. Follow that style with a concise imperative subject, and add a body when behavior or configuration changes need context. Pull requests should include a summary, validation performed, linked issue when applicable, screenshots for visual changes, and notes for any Cloudflare binding or secret changes.

## Security & Configuration Tips

Do not commit secrets. The Turnstile site key in `public/index.html` is public; `TURNSTILE_SECRET` must stay in Wrangler secrets. Keep the Email Routing destination verified, and update both `wrangler.toml` and the Worker address constants when changing email addresses.
