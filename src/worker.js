// src/worker.js
// Cloudflare Worker - handles contact form POST and sends via send_email binding.
// Assumes you also serve index.html from this Worker (Static Assets) or from Pages.

import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";

const TO_ADDRESS   = "a.wong@jedyn.com";          // must be VERIFIED in Email Routing
const FROM_ADDRESS = "a.wong@jedyn.com";          // must be a domain you control
const FROM_NAME    = "Jedyn Website";

// Basic CORS - tighten the origin once you know your final domain
const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });

const esc = (s = "") =>
  String(s).replace(/[<>&"']/g, c => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;",
  }[c]));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    if (url.pathname === "/api/contact" && request.method === "POST") {
      let data;
      try {
        data = await request.json();
      } catch {
        return json({ ok: false, error: "Invalid JSON" }, 400);
      }

      // Honeypot - bots fill hidden fields, humans don't
      if (data.website) return json({ ok: true });   // silently accept + drop

      const { name = "", company = "", email = "", service = "", message = "" } = data;

      // Minimal validation
      if (!name.trim() || !email.trim() || !message.trim()) {
        return json({ ok: false, error: "Missing required fields" }, 400);
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ ok: false, error: "Invalid email" }, 400);
      }
      if (message.length > 5000) {
        return json({ ok: false, error: "Message too long" }, 400);
      }

      // Build MIME message
      const msg = createMimeMessage();
      msg.setSender({ name: FROM_NAME, addr: FROM_ADDRESS });
      msg.setRecipient(TO_ADDRESS);
      msg.setSubject(`New brief from ${name} (${service || "Unspecified"})`);
      msg.setHeader("Reply-To", `${name} <${email}>`);

      msg.addMessage({
        contentType: "text/plain",
        data:
`New website enquiry
-------------------
Name:    ${name}
Company: ${company}
Email:   ${email}
Service: ${service}

Brief:
${message}
`,
      });

      msg.addMessage({
        contentType: "text/html",
        data: `
<h2>New website enquiry</h2>
<table cellpadding="6">
  <tr><td><b>Name</b></td><td>${esc(name)}</td></tr>
  <tr><td><b>Company</b></td><td>${esc(company)}</td></tr>
  <tr><td><b>Email</b></td><td>${esc(email)}</td></tr>
  <tr><td><b>Service</b></td><td>${esc(service)}</td></tr>
</table>
<h3>Brief</h3>
<p style="white-space:pre-wrap">${esc(message)}</p>`,
      });

      try {
        const email = new EmailMessage(FROM_ADDRESS, TO_ADDRESS, msg.asRaw());
        await env.SEND_EMAIL.send(email);
        return json({ ok: true });
      } catch (err) {
        console.error("send_email failed:", err);
        return json({ ok: false, error: "Send failed" }, 502);
      }
    }

    // If you're serving the site via Worker Static Assets, this fallthrough
    // lets the assets handler take over. Otherwise return 404.
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not found", { status: 404 });
  },
};
