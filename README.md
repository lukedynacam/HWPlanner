# HWPlanner

A static landing page styled to match the Horizon Wiring brand direction:
dark-grey navigation, Gilroy typography, bright yellow accents, large wiring
imagery, alternating content sections, and a yellow contact footer.

## Local preview

Install dependencies, then start the authenticated site:

```bash
npm install
ADMIN_PASSWORD='replace-with-a-strong-password' npm start
```

Then open `http://localhost:3000`.

## Admin login

The admin account is:

```text
luke@horizon-wiring.co.uk
```

Set `ADMIN_PASSWORD` before the first server run to create the initial password.
If no password is configured, the account is created without one and the
forgot-password flow can be used to set it.

## Forgot password email setup

Password reset emails are sent through SMTP. Configure these environment
variables in production:

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM='HWPlanner <no-reply@horizon-wiring.co.uk>'
```

Optional environment variables:

- `ADMIN_EMAIL` - defaults to `luke@horizon-wiring.co.uk`
- `AUTH_DATA_FILE` - defaults to `.data/auth.json`
- `PORT` - defaults to `3000`

In local development without SMTP, reset links are printed in the server logs.
