# Access Control

HWPlanner uses four user types with different visibility and edit levels:

- **Admin** - full system ownership.
- **Management** - operational management across projects, leads, inspections, and reports.
- **Leads** - team/project lead access for assigned work.
- **Inspection** - inspection-only access for assigned inspection work.

Access must be deny-by-default. A user can only see or edit a resource when their role explicitly grants that permission, and scoped permissions such as `assigned` or `own` must be enforced by the application.

## Permission levels

| Level | Meaning |
| --- | --- |
| None | Resource is hidden and cannot be edited. |
| View | Resource can be opened/read. |
| Edit | Existing resource fields can be changed within the user's scope. |
| Create | New resources can be created within the user's scope. |
| Delete | Resources can be removed within the user's scope. |
| Manage | Full administrative control, including configuration or user assignment. |

## Role matrix

| Area | Admin | Management | Leads | Inspection |
| --- | --- | --- | --- | --- |
| Users and roles | Manage all users and role assignments | View users | None | None |
| System settings | Manage all settings | None | None | None |
| Audit log | View all activity | View all activity | None | None |
| Management dashboard | View and edit all management data | View and edit all management data | View assigned/team summaries | None |
| Lead dashboard | View and edit all lead data | View and edit all lead data | View and edit assigned lead data | None |
| Inspection dashboard | View and edit all inspection data | View and edit all inspection data | View assigned/team inspections | View and edit assigned inspections |
| Projects/work orders | Create, view, edit, delete all | Create, view, edit all | View and edit assigned/team work | View assigned inspection-related work only |
| Lead records | Create, view, edit, delete all | Create, view, edit all | Create, view, edit assigned/team lead records | None |
| Inspections | Create, view, edit, delete all | Create, view, edit all | Create, view, edit assigned/team inspections | View and edit assigned inspections only |
| Reports | Create, view, edit, delete all | Create, view, edit all | View assigned/team reports | View own inspection report summaries |

## Role details

### Admin

Admins can see and edit everything, including:

- User accounts, role assignment, and access scopes.
- System settings and configuration.
- All project, lead, inspection, report, and audit data.

### Management

Management users can see operational data across the organization and edit the work needed to manage operations. They cannot change roles, system settings, or administrative configuration.

Allowed:

- View all dashboards, projects/work orders, leads, inspections, reports, users, and audit activity.
- Create and edit projects/work orders, lead records, inspections, and reports.

Not allowed:

- Change user roles or permissions.
- Edit system settings.
- Delete administrative records unless promoted to Admin.

### Leads

Lead users are limited to assigned work or team work. They can update the records they are responsible for, but they do not have organization-wide access.

Allowed:

- View assigned/team management summaries.
- View and edit assigned/team projects/work orders.
- Create, view, and edit assigned/team lead records.
- Create, view, and edit assigned/team inspections.
- View assigned/team reports.

Not allowed:

- Manage users, roles, or settings.
- View unrelated management data.
- Delete records.

### Inspection

Inspection users only see inspection-related work assigned to them. They can complete inspection work but cannot access management or lead administration.

Allowed:

- View assigned inspection dashboard data.
- View assigned inspection-related work orders.
- View and edit assigned inspections, including notes, status, photos, and results.
- View summaries of reports generated from their own inspection work.

Not allowed:

- Manage users, roles, settings, projects, leads, or unrelated inspections.
- View management or lead dashboards.
- Delete records.

## Implementation requirements

- Store each user's role as one of: `admin`, `management`, `leads`, or `inspection`.
- Enforce permissions on the server/API, not only in the UI.
- Hide UI navigation for resources the role cannot view.
- Disable or remove edit controls for resources the role can view but cannot edit.
- Validate scoped access for every assigned/team/own request.
- Log denied access attempts with user ID, role, resource, action, and timestamp.
