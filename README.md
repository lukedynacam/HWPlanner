# HWPlanner

## Scheduling programme

Open [app/index.html](app/index.html) in a browser to use the static scheduling prototype.

The app has:

- An **Input Data** page with boxes for the schedule columns in this order: Customer, Part No., Description, Hours, Pick, Job Card, Asset No., Qty, Tech, Status, Notes, PO Number, Start Date, Insp Date, Disp Date, Doc No., Ship Due.
- A **Scheduling Programme** page populated from the saved input rows.
- Edit, delete, clear, and CSV export controls for schedule rows.

## Access control

HWPlanner defines four user types with different visibility and edit levels:

- Admin
- Management
- Leads
- Inspection

See [docs/access-control.md](docs/access-control.md) for the role matrix and implementation requirements. The structured policy is available at [config/access-control-policy.json](config/access-control-policy.json).
