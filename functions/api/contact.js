export async function onRequestPost(context) {
  try {
    const formData = await context.request.json();

    const { name, company, email, phone, message, turnstileToken } = formData;

    // Validate required fields
    if (!name || !company || !email || !message) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate Turnstile token
    if (!turnstileToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Security verification required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify Turnstile token with Cloudflare
    const turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secret: context.env.TURNSTILE_SECRET_KEY,
        response: turnstileToken,
        remoteip: context.request.headers.get('CF-Connecting-IP'),
      }),
    });

    const turnstileResult = await turnstileResponse.json();

    if (!turnstileResult.success) {
      console.error('Turnstile verification failed:', turnstileResult);
      return new Response(
        JSON.stringify({ success: false, error: 'Security verification failed. Please try again.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Send email via MailChannels
    const emailResponse = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: 'contact@jedyn.com', name: 'JE Dynamics' }],
          },
        ],
        from: {
          email: 'website@jedyn.com',
          name: 'JE Dynamics Website',
        },
        reply_to: {
          email: email,
          name: name,
        },
        subject: `New Contact Form Submission from ${name}`,
        content: [
          {
            type: 'text/plain',
            value: `New contact form submission from the JE Dynamics website:

Name: ${name}
Company: ${company}
Email: ${email}
Phone: ${phone || 'Not provided'}

Message:
${message}

---
This email was sent from the contact form at jedyn.com`,
          },
          {
            type: 'text/html',
            value: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1d1d1f; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #0071e3; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f5f5f7; padding: 20px; border-radius: 0 0 8px 8px; }
    .field { margin-bottom: 16px; }
    .label { font-weight: 600; color: #86868b; font-size: 12px; text-transform: uppercase; }
    .value { font-size: 16px; margin-top: 4px; }
    .message-box { background: white; padding: 16px; border-radius: 8px; margin-top: 16px; }
    .footer { font-size: 12px; color: #86868b; margin-top: 20px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">New Contact Form Submission</h2>
    </div>
    <div class="content">
      <div class="field">
        <div class="label">Name</div>
        <div class="value">${name}</div>
      </div>
      <div class="field">
        <div class="label">Company</div>
        <div class="value">${company}</div>
      </div>
      <div class="field">
        <div class="label">Email</div>
        <div class="value"><a href="mailto:${email}">${email}</a></div>
      </div>
      <div class="field">
        <div class="label">Phone</div>
        <div class="value">${phone || 'Not provided'}</div>
      </div>
      <div class="message-box">
        <div class="label">Message</div>
        <div class="value" style="white-space: pre-wrap;">${message}</div>
      </div>
      <div class="footer">
        This email was sent from the contact form at jedyn.com
      </div>
    </div>
  </div>
</body>
</html>`,
          },
        ],
      }),
    });

    if (emailResponse.ok) {
      return new Response(
        JSON.stringify({ success: true, message: 'Email sent successfully' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      const errorText = await emailResponse.text();
      console.error('MailChannels error:', errorText);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to send email' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Contact form error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
