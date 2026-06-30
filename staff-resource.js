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
  message: document.querySelector("#staff-resource-message"),
  table: document.querySelector("#staff-resource-table"),
  refresh: document.querySelector("#refresh-staff-resource"),
};

let canManageUsers = false;

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
  renderStaff(payload.users || []);
}

function renderStaff(users) {
  if (!users.length) {
    elements.table.innerHTML = '<tr><td class="empty-cell" colspan="7">No staff accounts yet.</td></tr>';
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
        cell(user.blocked ? "Blocked" : "Active"),
        actionCell(user),
      );
      return row;
    }),
  );
}

function cell(value) {
  const td = document.createElement("td");
  td.textContent = value || "";
  return td;
}

function actionCell(user) {
  const td = document.createElement("td");
  const button = document.createElement("button");
  button.className = user.blocked ? "primary-button" : "danger-button";
  button.type = "button";
  button.textContent = user.blocked ? "Unblock Login" : "Block Login";
  button.addEventListener("click", () => toggleBlock(user));
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
  setResourceMessage("Creating staff resource...");
  const formData = new FormData(elements.form);

  try {
    const payload = await requestJson("/api/users", {
      method: "POST",
      body: JSON.stringify({
        name: formData.get("name"),
        email: formData.get("email"),
        hoursPerWeek: formData.get("hoursPerWeek"),
        rating: formData.get("rating"),
        role: formData.get("role"),
        password: formData.get("password"),
      }),
    });
    elements.form.reset();
    document.querySelector("#resource-rating").value = "3";
    document.querySelector("#resource-role").value = "Tech";
    setResourceMessage(`Created login for ${payload.user.email}.`, "success");
    await loadStaff();
  } catch (error) {
    setResourceMessage(error.message, "error");
  }
}

async function initialiseStaffResource() {
  const session = await loadSession();
  if (!session) {
    return;
  }

  applyAccess(session);
  elements.form.addEventListener("submit", handleSubmit);
  elements.refresh.addEventListener("click", loadStaff);
  await loadStaff();
}

initialiseStaffResource().catch((error) => {
  setResourceMessage(error.message, "error");
});
