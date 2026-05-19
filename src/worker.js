// src/worker.js
// Cloudflare Worker - handles contact form POST and sends via send_email binding.

import { EmailMessage } from "cloudflare:email";
import { createMimeMessage, Mailbox } from "mimetext";

const TO_ADDRESS = "a.wong@jedyn.com";      // must match wrangler.toml destination_address
const FROM_ADDRESS = "a.wong@jedyn.com";    // must be allowed by Cloudflare Email Routing
const FROM_NAME = "JEDYN Website";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...cors,
    },
  });

const esc = (s = "") =>
  String(s).replace(/[<>&"']/g, c => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

const cleanHeader = (s = "") =>
  String(s).replace(/[\r\n]+/g, " ").trim();

// Verify a Cloudflare Turnstile token against the siteverify endpoint.
// Returns { ok: true } on success or { ok: false, codes: [...] } on failure.
async function verifyTurnstile(token, secret, remoteIp) {
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );

  if (!res.ok) {
    return { ok: false, codes: [`http-${res.status}`] };
  }

  const result = await res.json();
  return result.success
    ? { ok: true }
    : { ok: false, codes: result["error-codes"] || [] };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (url.pathname === "/api/contact" && request.method === "POST") {
      let data;

      try {
        data = await request.json();
      } catch {
        return json({ ok: false, error: "Invalid JSON" }, 400);
      }

      // Honeypot - bots fill hidden fields, humans do not.
      if (data.website) {
        return json({ ok: true });
      }

      const name = String(data.name || "").trim();
      const company = String(data.company || "").trim();
      const email = String(data.email || "").trim().toLowerCase();
      const service = String(data.service || "").trim();
      const message = String(data.message || "").trim();
      const turnstileToken = String(data.turnstileToken || "").trim();

      if (!name || !email || !message) {
        return json({ ok: false, error: "Missing required fields" }, 400);
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ ok: false, error: "Invalid email" }, 400);
      }

      if (message.length > 5000) {
        return json({ ok: false, error: "Message too long" }, 400);
      }

      // Turnstile verification — gate before any outbound email cost.
      if (!turnstileToken) {
        return json({ ok: false, error: "Verification missing" }, 400);
      }
      if (!env.TURNSTILE_SECRET) {
        console.error("TURNSTILE_SECRET binding is missing");
        return json({ ok: false, error: "Server misconfigured" }, 500);
      }
      const remoteIp = request.headers.get("CF-Connecting-IP") || "";
      const verdict = await verifyTurnstile(
        turnstileToken,
        env.TURNSTILE_SECRET,
        remoteIp,
      );
      if (!verdict.ok) {
        console.error("Turnstile failed:", verdict.codes);
        return json({ ok: false, error: "Verification failed" }, 403);
      }

      if (!env.SEND_EMAIL) {
        return json({ ok: false, error: "SEND_EMAIL binding is missing" }, 500);
      }

      try {
        const cleanName = cleanHeader(name);
        const cleanCompany = cleanHeader(company);
        const cleanService = cleanHeader(service || "Unspecified");

        const msg = createMimeMessage();

        msg.setSender({
          name: FROM_NAME,
          addr: FROM_ADDRESS,
        });

        msg.setRecipient(TO_ADDRESS);
        msg.setSubject(`New brief from ${cleanName} (${cleanService})`);

        // IMPORTANT:
        // mimetext requires Reply-To to be a Mailbox object, not a plain string.
        msg.setHeader("Reply-To", new Mailbox({ addr: email }));

        msg.addMessage({
          contentType: "text/plain",
          data:
`New website enquiry
-------------------
Name:    ${cleanName}
Company: ${cleanCompany}
Email:   ${email}
Service: ${cleanService}

Brief:
${message}
`,
        });

        msg.addMessage({
          contentType: "text/html",
          data: `
<h2>New website enquiry</h2>
<table cellpadding="6">
  <tr><td><b>Name</b></td><td>${esc(cleanName)}</td></tr>
  <tr><td><b>Company</b></td><td>${esc(cleanCompany)}</td></tr>
  <tr><td><b>Email</b></td><td><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
  <tr><td><b>Service</b></td><td>${esc(cleanService)}</td></tr>
</table>

<h3>Brief</h3>
<p style="white-space:pre-wrap">${esc(message)}</p>`,
        });

        const outbound = new EmailMessage(
          FROM_ADDRESS,
          TO_ADDRESS,
          msg.asRaw()
        );

        await env.SEND_EMAIL.send(outbound);

        return json({ ok: true });
      } catch (err) {
        console.error("contact form failed:", err);

        return json({
          ok: false,
          error: String(err?.message || err),
        }, 500);
      }
    }

    return env.ASSETS
      ? env.ASSETS.fetch(request)
      : new Response("Not found", { status: 404 });
  },
};
