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
  gradeHoursGrid: document.querySelector("#grade-hours-grid"),
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
  renderGradeHours(staffUsers);
}

function renderStaff(users) {
  if (!users.length) {
    elements.table.innerHTML = '<tr><td class="empty-cell" colspan="9">No staff accounts yet.</td></tr>';
    renderGradeHours([]);
    return;
  }

  elements.table.replaceChildren(
    ...users.map((user) => {
      const row = document.createElement("tr");
      row.append(
        editableTextCell(user, "name"),
        editableTextCell(user, "email", "email"),
        editableNumberCell(user, "hoursPerWeek"),
        editableNumberCell(user, "holidayDays", "0.5"),
        calculatedHoursCell(user),
        editableSelectCell(user, "rating", [
          ["1", "1/5"],
          ["2", "2/5"],
          ["3", "3/5"],
          ["4", "4/5"],
          ["5", "5/5"],
        ]),
        editableSelectCell(user, "role", [
          ["Admin", "Admin"],
          ["Management", "Management"],
          ["Lead", "Lead"],
          ["Tech", "Tech"],
          ["Inspection", "Inspection"],
        ]),
        cell(statusLabel(user)),
        actionCell(user),
      );
      return row;
    }),
  );
}

function renderGradeHours(users) {
  if (!elements.gradeHoursGrid) {
    return;
  }

  const totals = [1, 2, 3, 4, 5].map((grade) => {
    const usersInGrade = users.filter((user) => Number(user.rating || 1) === grade);
    const totalHours = usersInGrade.reduce((sum, user) => sum + calculateAnnualHours(user), 0);
    return { grade, totalHours, staffCount: usersInGrade.length };
  });

  elements.gradeHoursGrid.replaceChildren(
    ...totals.map((total) => {
      const card = document.createElement("article");
      card.className = "grade-hours-card";
      card.innerHTML = `
        <span>Grade ${total.grade}</span>
        <strong>${formatAnnualHours(total.totalHours)}</strong>
        <small>${total.staffCount} staff</small>
      `;
      return card;
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

function calculatedHoursCell(user) {
  const td = document.createElement("td");
  td.className = "calculated-cell";
  td.textContent = formatAnnualHours(calculateAnnualHours(user));
  return td;
}

function calculateAnnualHours(user) {
  const workingDays = 261 - Number(user.holidayDays || 0);
  const dailyHours = Number(user.hoursPerWeek || 0) / 5;
  return workingDays * dailyHours;
}

function formatAnnualHours(value) {
  return `${Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}h`;
}

function editableTextCell(user, field, type = "text") {
  const td = document.createElement("td");
  const input = document.createElement("input");
  input.className = "inline-edit";
  input.type = type;
  input.value = user[field] || "";
  input.addEventListener("blur", () => saveInlineEdit(user, field, input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    }
  });
  td.append(input);
  return td;
}

function editableNumberCell(user, field, step = "0.25") {
  const td = document.createElement("td");
  const input = document.createElement("input");
  input.className = "inline-edit inline-edit-number";
  input.type = "number";
  input.min = "0";
  input.step = step;
  input.value = user[field] ?? 0;
  input.addEventListener("blur", () => saveInlineEdit(user, field, input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    }
  });
  td.append(input);
  return td;
}

function editableSelectCell(user, field, options) {
  const td = document.createElement("td");
  const select = document.createElement("select");
  select.className = "inline-edit";
  options.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  });
  select.value = String(user[field] || options[0][0]);
  select.addEventListener("change", () => saveInlineEdit(user, field, select.value));
  td.append(select);
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

async function saveInlineEdit(user, field, value) {
  const nextUser = {
    ...user,
    [field]: value,
  };

  if (String(user[field] ?? "") === String(value ?? "")) {
    return;
  }

  try {
    const payload = await updateStaffResource(nextUser);
    setResourceMessage(`Updated ${payload.user.email}.`, "success");
    await loadStaff();
  } catch (error) {
    setResourceMessage(error.message, "error");
    await loadStaff();
  }
}

async function updateStaffResource(user, password = "") {
  return requestJson(`/api/users/${user.id}`, {
    method: "PUT",
    body: JSON.stringify({
      name: user.name,
      email: user.email,
      hoursPerWeek: user.hoursPerWeek,
      holidayDays: user.holidayDays,
      rating: user.rating,
      role: user.role,
      password,
    }),
  });
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
    const payload = editingId
      ? await updateStaffResource({
          id: editingId,
          name: formData.get("name"),
          email: formData.get("email"),
          hoursPerWeek: formData.get("hoursPerWeek"),
          rating: formData.get("rating"),
          role: formData.get("role"),
        }, password)
      : await requestJson("/api/users", {
          method: "POST",
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
