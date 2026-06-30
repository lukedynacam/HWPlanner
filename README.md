# HWPlanner

HWPlanner is a dependency-free weekly production planner prototype. It lets a planner log in, add project demand, enter staff capacity and competence levels, and view an automatically generated weekly allocation plan.

## Run locally

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

## Staff accounts

The weekly planner includes a staff section for adding:

- Staff name
- Working hours
- Role: `Management`, `Lead`, `Tech`, or `Inspection`
- Staff rating from 1 to 5
- Competence level
- Login email and password

Adding a staff member creates a server-side login account for that email. Staff
members can sign in through the same login page and can use the forgot-password
flow if SMTP is configured.

The dedicated Staff Resource page at `/staff-resource.html` is for Admin and
Management users. It can add staff login accounts and block or unblock existing
staff logins.

## Role access

Current role access is:

- `Admin` - full view/edit access and staff login management.
- `Management` - can edit planning data and manage staff login accounts.
- `Lead` - can edit planning data, but cannot manage staff login details.
- `Tech` - view-only planning and allocation access.
- `Inspection` - view-only schedule/allocation access for inspection review.
