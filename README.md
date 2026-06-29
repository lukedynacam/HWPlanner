# HWPlanner

HWPlanner is a dependency-free weekly production planner prototype. It lets a planner log in, add project demand, enter staff capacity and competence levels, and view an automatically generated weekly allocation plan.

## Run locally

Open `index.html` in a browser, or serve the folder with any static file server:

```bash
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.

## Demo login

- Email: `planner@example.com`
- Password: `planner123`

The demo uses browser local storage for the login session and planning data. It is intended as a front-end prototype, not a production authentication system.

## Planner features

- Weekly planning view using an ISO week picker.
- Manual project entry with project name, required hours, required competence level, and week.
- CSV project upload with columns:

  ```csv
  project,hours,competence,week
  Retail display build,46,2,2026-W27
  Prototype assembly,32,4,2026-W27
  ```

- Manual staff entry with name, working hours, and competence level.
- Competence levels from Level 1 - Basic through Level 4 - Expert.
- Automatic weekly allocation that assigns project hours only to staff at or above the required competence level.
- Summary cards for demand, capacity, allocated hours, and unallocated gaps.
- Sample data buttons for quick evaluation.
