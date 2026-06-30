const ROLE_ACCESS = {
  Admin: "Full staff resource access.",
  Management: "Can create staff accounts and block or unblock staff logins.",
  Lead: "Can view planning pages, but cannot manage staff logins.",
  Tech: "Can view planning pages only.",
  Inspection: "Can view scheduling and allocation information only.",
};

const elements = {
  accessRole: document.querySelector("#staff-access-role"),
  accessDescription: document.querySelector("#staff-access-description"),
  form: document.querySelector("#staff-resource-form"),
  resourceId: document.querySelector("#resource-id"),
  submit: document.querySelector("#resource-submit"),
  cancelEdit: document.querySelector("#resource-cancel-edit"),
  message: document.querySelector("#staff-resource-message"),
  table: document.querySelector("#staff-resource-table"),
  refresh: document.querySelector("#refresh-staff-resource"),
};

let canManageUsers = false;
let staffUsers = [];

function setResourceMessage(message, type = "info") {
  if (!elements.message) {
    return;
  }

  elements.message.textContent = message;
  elements.message.dataset.type = type;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message || "Request failed.");
  }

  return payload;
}

async function loadSession() {
  const response = await fetch("/api/session");
  if (!response.ok) {
    window.location.assign("/login.html?next=/staff-resource.html");
    return null;
  }

  return response.json();
}

function applyAccess(session) {
  const role = session?.role || "Tech";
  canManageUsers = Boolean(session?.permissions?.canManageUsers);
  elements.accessRole.textContent = `${role} access`;
  elements.accessDescription.textContent = ROLE_ACCESS[role] || ROLE_ACCESS.Tech;

  elements.form.hidden = !canManageUsers;
  elements.refresh.hidden = !canManageUsers;
  if (!canManageUsers) {
    setResourceMessage("Only Admin and Management can manage staff resources.", "error");
  }
}

async function loadStaff() {
  if (!canManageUsers) {
    renderStaff([]);
    return;
  }

  const payload = await requestJson("/api/users");
  staffUsers = payload.users || [];
  renderStaff(staffUsers);
}

function renderStaff(users) {
  if (!users.length) {
    elements.table.innerHTML = '<tr><td class="empty-cell" colspan="8">No staff accounts yet.</td></tr>';
    return;
  }

  elements.table.replaceChildren(
    ...users.map((user) => {
      const row = document.createElement("tr");
      row.append(
        cell(user.name),
        cell(user.email),
        cell(formatHours(user.hoursPerWeek)),
        cell(`${user.rating || 1}/5`),
        cell(user.role),
        cell(statusLabel(user)),
        detailsCell(user),
        actionCell(user),
      );
      return row;
    }),
  );
}

function statusLabel(user) {
  if (user.protected) {
    return "Protected admin";
  }

  if (user.blocked) {
    return "Blocked";
  }

  return user.hasPassword ? "Active" : "Pending details";
}

function cell(value) {
  const td = document.createElement("td");
  td.textContent = value || "";
  return td;
}

function actionCell(user) {
  const td = document.createElement("td");
  if (user.protected) {
    td.textContent = "Cannot block";
    return td;
  }

  const button = document.createElement("button");
  button.className = user.blocked ? "primary-button" : "danger-button";
  button.type = "button";
  button.textContent = user.blocked ? "Unblock Login" : "Block Login";
  button.addEventListener("click", () => toggleBlock(user));
  td.append(button);
  return td;
}

function detailsCell(user) {
  const td = document.createElement("td");
  const button = document.createElement("button");
  button.className = "primary-button";
  button.type = "button";
  button.textContent = "Edit Details";
  button.addEventListener("click", () => editUser(user));
  td.append(button);
  return td;
}

function formatHours(value) {
  const hours = Number(value || 0);
  return `${hours.toLocaleString(undefined, { maximumFractionDigits: 2 })}h`;
}

async function toggleBlock(user) {
  const nextBlocked = !user.blocked;
  const action = nextBlocked ? "block" : "unblock";
  const confirmed = window.confirm(`Are you sure you want to ${action} ${user.email}?`);
  if (!confirmed) {
    return;
  }

  await requestJson(`/api/users/${user.id}/block`, {
    method: "POST",
    body: JSON.stringify({ blocked: nextBlocked }),
  });
  setResourceMessage(`${user.email} has been ${nextBlocked ? "blocked" : "unblocked"}.`, "success");
  await loadStaff();
}

async function handleSubmit(event) {
  event.preventDefault();
  const editingId = elements.resourceId.value;
  setResourceMessage(editingId ? "Updating staff resource..." : "Creating staff resource...");
  const formData = new FormData(elements.form);
  const password = String(formData.get("password") || "");

  if (!editingId && password.length < 10) {
    setResourceMessage("New staff logins need a password with at least 10 characters.", "error");
    return;
  }

  try {
    const payload = await requestJson(editingId ? `/api/users/${editingId}` : "/api/users", {
      method: editingId ? "PUT" : "POST",
      body: JSON.stringify({
        name: formData.get("name"),
        email: formData.get("email"),
        hoursPerWeek: formData.get("hoursPerWeek"),
        rating: formData.get("rating"),
        role: formData.get("role"),
        password,
      }),
    });
    resetForm();
    setResourceMessage(
      editingId ? `Updated ${payload.user.email}.` : `Created login for ${payload.user.email}.`,
      "success",
    );
    await loadStaff();
  } catch (error) {
    setResourceMessage(error.message, "error");
  }
}

function editUser(user) {
  elements.resourceId.value = user.id;
  document.querySelector("#resource-name").value = user.name || "";
  document.querySelector("#resource-email").value = user.email || "";
  document.querySelector("#resource-hours").value = user.hoursPerWeek || 0;
  document.querySelector("#resource-rating").value = String(user.rating || 1);
  document.querySelector("#resource-role").value = user.role || "Tech";
  document.querySelector("#resource-password").value = "";
  elements.submit.textContent = "Update Staff";
  elements.cancelEdit.hidden = false;
  setResourceMessage("Editing staff details. Leave password blank to keep the existing login password.");
  elements.form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetForm() {
  elements.form.reset();
  elements.resourceId.value = "";
  document.querySelector("#resource-rating").value = "3";
  document.querySelector("#resource-role").value = "Tech";
  elements.submit.textContent = "Add Staff";
  elements.cancelEdit.hidden = true;
}

async function initialiseStaffResource() {
  const session = await loadSession();
  if (!session) {
    return;
  }

  applyAccess(session);
  elements.form.addEventListener("submit", handleSubmit);
  elements.cancelEdit.addEventListener("click", resetForm);
  elements.refresh.addEventListener("click", loadStaff);
  await loadStaff();
}

initialiseStaffResource().catch((error) => {
  setResourceMessage(error.message, "error");
});
