const STORAGE_KEY = "hwplanner.productionPlanner.v1";

const COMPETENCE_LEVELS = [
  { value: 1, label: "Level 1 - Basic" },
  { value: 2, label: "Level 2 - Skilled" },
  { value: 3, label: "Level 3 - Senior" },
  { value: 4, label: "Level 4 - Expert" },
];

const SAMPLE_PROJECTS = [
  { name: "Retail display build", hours: 46, competence: 2 },
  { name: "Packaging artwork approval", hours: 18, competence: 3 },
  { name: "Prototype assembly", hours: 32, competence: 4 },
  { name: "Print run preparation", hours: 26, competence: 1 },
];

const SAMPLE_STAFF = [
  { name: "Alex Morgan", hours: 37.5, competence: 4 },
  { name: "Priya Shah", hours: 30, competence: 3 },
  { name: "Sam Lee", hours: 37.5, competence: 2 },
  { name: "Jordan Ellis", hours: 20, competence: 1 },
];

const state = loadState();

const elements = {
  appView: document.querySelector("#app-view"),
  planningWeek: document.querySelector("#planning-week"),
  projectForm: document.querySelector("#project-form"),
  projectName: document.querySelector("#project-name"),
  projectHours: document.querySelector("#project-hours"),
  projectCompetence: document.querySelector("#project-competence"),
  projectWeek: document.querySelector("#project-week"),
  projectUpload: document.querySelector("#project-upload"),
  projectsTable: document.querySelector("#projects-table"),
  staffForm: document.querySelector("#staff-form"),
  staffName: document.querySelector("#staff-name"),
  staffHours: document.querySelector("#staff-hours"),
  staffCompetence: document.querySelector("#staff-competence"),
  staffTable: document.querySelector("#staff-table"),
  summaryDemand: document.querySelector("#summary-demand"),
  summaryCapacity: document.querySelector("#summary-capacity"),
  summaryAllocated: document.querySelector("#summary-allocated"),
  summaryGap: document.querySelector("#summary-gap"),
  capacityBars: document.querySelector("#capacity-bars"),
  plannerEmpty: document.querySelector("#planner-empty"),
  plannerOutput: document.querySelector("#planner-output"),
  loadSampleProjects: document.querySelector("#load-sample-projects"),
  loadSampleStaff: document.querySelector("#load-sample-staff"),
  clearData: document.querySelector("#clear-data"),
  emptyRowTemplate: document.querySelector("#empty-row-template"),
};

initialise();

function initialise() {
  populateCompetenceOptions();
  bindEvents();

  if (!state.selectedWeek) {
    state.selectedWeek = currentWeekValue();
    saveState();
  }

  elements.planningWeek.value = state.selectedWeek;
  elements.projectWeek.value = state.selectedWeek;
  render();
}

function populateCompetenceOptions() {
  for (const select of [elements.projectCompetence, elements.staffCompetence]) {
    select.replaceChildren(
      ...COMPETENCE_LEVELS.map((level) => {
        const option = document.createElement("option");
        option.value = String(level.value);
        option.textContent = level.label;
        return option;
      }),
    );
  }
}

function bindEvents() {
  elements.planningWeek.addEventListener("change", handleWeekChange);
  elements.projectForm.addEventListener("submit", handleProjectSubmit);
  elements.staffForm.addEventListener("submit", handleStaffSubmit);
  elements.projectUpload.addEventListener("change", handleProjectUpload);
  elements.projectsTable.addEventListener("click", handleProjectRemove);
  elements.staffTable.addEventListener("click", handleStaffRemove);
  elements.loadSampleProjects.addEventListener("click", addSampleProjects);
  elements.loadSampleStaff.addEventListener("click", addSampleStaff);
  elements.clearData.addEventListener("click", clearAllData);
}

function handleWeekChange() {
  state.selectedWeek = elements.planningWeek.value || currentWeekValue();
  elements.projectWeek.value = state.selectedWeek;
  saveState();
  render();
}

function handleProjectSubmit(event) {
  event.preventDefault();
  addProject({
    name: elements.projectName.value,
    hours: elements.projectHours.value,
    competence: elements.projectCompetence.value,
    week: elements.projectWeek.value,
  });
  elements.projectForm.reset();
  elements.projectCompetence.value = "1";
  elements.projectWeek.value = state.selectedWeek;
}

function handleStaffSubmit(event) {
  event.preventDefault();
  addStaff({
    name: elements.staffName.value,
    hours: elements.staffHours.value,
    competence: elements.staffCompetence.value,
  });
  elements.staffForm.reset();
  elements.staffCompetence.value = "1";
}

async function handleProjectUpload(event) {
  const [file] = event.target.files;
  if (!file) {
    return;
  }

  try {
    const content = await file.text();
    const rows = parseCsv(content);
    rows.forEach((row) => {
      addProject({
        name: row.project || row.name,
        hours: row.hours,
        competence: row.competence || row.level,
        week: row.week || state.selectedWeek,
      });
    });
  } catch (error) {
    window.alert(error.message);
  } finally {
    event.target.value = "";
  }
}

function handleProjectRemove(event) {
  const button = event.target.closest("[data-remove-project]");
  if (!button) {
    return;
  }

  state.projects = state.projects.filter((project) => project.id !== button.dataset.removeProject);
  saveState();
  render();
}

function handleStaffRemove(event) {
  const button = event.target.closest("[data-remove-staff]");
  if (!button) {
    return;
  }

  state.staff = state.staff.filter((staffMember) => staffMember.id !== button.dataset.removeStaff);
  saveState();
  render();
}

function addSampleProjects() {
  SAMPLE_PROJECTS.forEach((project) => addProject({ ...project, week: state.selectedWeek }));
}

function addSampleStaff() {
  SAMPLE_STAFF.forEach(addStaff);
}

function clearAllData() {
  const confirmed = window.confirm("Clear all projects and staff from this planner?");
  if (!confirmed) {
    return;
  }

  state.projects = [];
  state.staff = [];
  saveState();
  render();
}

function addProject(project) {
  const normalised = normaliseProject(project);
  if (!normalised) {
    return;
  }

  state.projects.push(normalised);
  saveState();
  render();
}

function addStaff(staffMember) {
  const normalised = normaliseStaff(staffMember);
  if (!normalised) {
    return;
  }

  state.staff.push(normalised);
  saveState();
  render();
}

function normaliseProject(project) {
  const name = String(project.name || "").trim();
  const hours = Number(project.hours);
  const competence = parseCompetence(project.competence);
  const week = normaliseWeek(project.week || state.selectedWeek);

  if (!name || !Number.isFinite(hours) || hours <= 0 || !competence || !week) {
    return null;
  }

  return {
    id: createId("project"),
    name,
    hours,
    competence,
    week,
  };
}

function normaliseStaff(staffMember) {
  const name = String(staffMember.name || "").trim();
  const hours = Number(staffMember.hours);
  const competence = parseCompetence(staffMember.competence);

  if (!name || !Number.isFinite(hours) || hours <= 0 || !competence) {
    return null;
  }

  return {
    id: createId("staff"),
    name,
    hours,
    competence,
  };
}

function parseCompetence(value) {
  const text = String(value || "").trim().toLowerCase();
  const namedLevel = COMPETENCE_LEVELS.find((level) => level.label.toLowerCase().includes(text));
  const numericValue = Number(text.replace(/[^0-9.]/g, ""));
  const parsed = Number.isFinite(numericValue) && numericValue > 0 ? numericValue : namedLevel?.value;

  if (!parsed) {
    return null;
  }

  return Math.min(4, Math.max(1, Math.round(parsed)));
}

function parseCsv(content) {
  const rows = content
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(parseCsvLine);

  if (rows.length < 2) {
    throw new Error("CSV upload needs a header row and at least one project row.");
  }

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  return rows.slice(1).map((row) =>
    headers.reduce((record, header, index) => {
      record[header] = row[index]?.trim() || "";
      return record;
    }, {}),
  );
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let isQuoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && nextCharacter === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      isQuoted = !isQuoted;
      continue;
    }

    if (character === "," && !isQuoted) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);
  return values;
}

function render() {
  renderProjects();
  renderStaff();
  renderPlanner();
}

function renderProjects() {
  const projects = state.projects
    .filter((project) => project.week === state.selectedWeek)
    .sort((first, second) => first.name.localeCompare(second.name));

  if (!projects.length) {
    renderEmptyRow(elements.projectsTable, 5);
    return;
  }

  elements.projectsTable.replaceChildren(
    ...projects.map((project) => {
      const row = document.createElement("tr");
      row.append(
        tableCell(project.name),
        tableCell(formatWeek(project.week)),
        tableCell(formatHours(project.hours)),
        tableCell(competenceBadge(project.competence)),
        tableCell(removeButton("project", project.id)),
      );
      return row;
    }),
  );
}

function renderStaff() {
  const staff = [...state.staff].sort((first, second) => first.name.localeCompare(second.name));

  if (!staff.length) {
    renderEmptyRow(elements.staffTable, 4);
    return;
  }

  elements.staffTable.replaceChildren(
    ...staff.map((staffMember) => {
      const row = document.createElement("tr");
      row.append(
        tableCell(staffMember.name),
        tableCell(formatHours(staffMember.hours)),
        tableCell(competenceBadge(staffMember.competence)),
        tableCell(removeButton("staff", staffMember.id)),
      );
      return row;
    }),
  );
}

function renderPlanner() {
  const plan = buildPlan();
  elements.summaryDemand.textContent = formatHours(plan.totalDemand);
  elements.summaryCapacity.textContent = formatHours(plan.totalCapacity);
  elements.summaryAllocated.textContent = formatHours(plan.totalAllocated);
  elements.summaryGap.textContent = formatHours(plan.totalGap);

  renderCapacityBars(plan);

  const hasPlanningData = state.projects.some((project) => project.week === state.selectedWeek) && state.staff.length;
  elements.plannerEmpty.hidden = hasPlanningData;

  if (!hasPlanningData) {
    elements.plannerOutput.replaceChildren();
    return;
  }

  elements.plannerOutput.replaceChildren(
    ...plan.staffPlans.map(renderStaffPlan),
    renderUnallocatedPlan(plan.unallocated),
  );
}

function buildPlan() {
  const weeklyProjects = state.projects
    .filter((project) => project.week === state.selectedWeek)
    .sort((first, second) => second.competence - first.competence || second.hours - first.hours);

  const staffPlans = state.staff
    .map((staffMember) => ({
      ...staffMember,
      remaining: staffMember.hours,
      allocations: [],
    }))
    .sort((first, second) => second.competence - first.competence || second.hours - first.hours);

  const unallocated = [];

  weeklyProjects.forEach((project) => {
    let remainingProjectHours = project.hours;

    staffPlans
      .filter((staffMember) => staffMember.competence >= project.competence && staffMember.remaining > 0)
      .sort((first, second) => first.remaining - second.remaining)
      .forEach((staffMember) => {
        if (remainingProjectHours <= 0) {
          return;
        }

        const assignedHours = Math.min(staffMember.remaining, remainingProjectHours);
        staffMember.remaining -= assignedHours;
        remainingProjectHours -= assignedHours;
        staffMember.allocations.push({
          projectId: project.id,
          projectName: project.name,
          hours: assignedHours,
          competence: project.competence,
        });
      });

    if (remainingProjectHours > 0) {
      unallocated.push({
        projectId: project.id,
        projectName: project.name,
        hours: remainingProjectHours,
        competence: project.competence,
      });
    }
  });

  const totalDemand = weeklyProjects.reduce((sum, project) => sum + project.hours, 0);
  const totalCapacity = state.staff.reduce((sum, staffMember) => sum + staffMember.hours, 0);
  const totalAllocated = staffPlans.reduce(
    (sum, staffMember) =>
      sum + staffMember.allocations.reduce((allocationSum, allocation) => allocationSum + allocation.hours, 0),
    0,
  );

  return {
    staffPlans,
    unallocated,
    weeklyProjects,
    totalDemand,
    totalCapacity,
    totalAllocated,
    totalGap: Math.max(0, totalDemand - totalAllocated),
  };
}

function renderCapacityBars(plan) {
  const bars = COMPETENCE_LEVELS.map((level) => {
    const qualifiedCapacity = state.staff
      .filter((staffMember) => staffMember.competence >= level.value)
      .reduce((sum, staffMember) => sum + staffMember.hours, 0);
    const requiredDemand = plan.weeklyProjects
      .filter((project) => project.competence >= level.value)
      .reduce((sum, project) => sum + project.hours, 0);
    const percentage = qualifiedCapacity ? Math.min(100, (requiredDemand / qualifiedCapacity) * 100) : 0;

    const card = document.createElement("article");
    card.className = "capacity-bar";
    card.append(
      createElement("header", {}, [
        createElement("span", {}, [level.label]),
        createElement("span", {}, [`${formatHours(requiredDemand)} / ${formatHours(qualifiedCapacity)}`]),
      ]),
      createElement("div", { class: `meter ${percentage < 80 ? "success" : percentage <= 100 ? "warning" : ""}` }, [
        createElement("span", { style: `width: ${percentage}%` }),
      ]),
    );
    return card;
  });

  elements.capacityBars.replaceChildren(...bars);
}

function renderStaffPlan(staffMember) {
  const usedHours = staffMember.hours - staffMember.remaining;
  const utilisation = staffMember.hours ? Math.round((usedHours / staffMember.hours) * 100) : 0;
  const card = createElement("article", { class: "staff-plan" }, [
    createElement("header", {}, [
      createElement("div", {}, [
        createElement("h3", {}, [staffMember.name]),
        createElement("p", { class: "allocation-note" }, [
          `${formatHours(usedHours)} of ${formatHours(staffMember.hours)} used (${utilisation}%)`,
        ]),
      ]),
      competenceBadge(staffMember.competence),
    ]),
    createElement("div", { class: `meter ${utilisation < 80 ? "success" : utilisation <= 100 ? "warning" : ""}` }, [
      createElement("span", { style: `width: ${Math.min(100, utilisation)}%` }),
    ]),
  ]);

  if (!staffMember.allocations.length) {
    card.append(createElement("p", { class: "allocation-note" }, ["No allocations for this week."]));
    return card;
  }

  card.append(
    createElement(
      "ul",
      {},
      staffMember.allocations.map((allocation) =>
        createElement("li", {}, [
          createElement("strong", {}, [allocation.projectName]),
          createElement("p", { class: "allocation-note" }, [
            `${formatHours(allocation.hours)} required at ${competenceLabel(allocation.competence)}`,
          ]),
        ]),
      ),
    ),
  );
  return card;
}

function renderUnallocatedPlan(unallocated) {
  const card = createElement("article", { class: "staff-plan unallocated" }, [
    createElement("header", {}, [
      createElement("div", {}, [
        createElement("h3", {}, ["Unallocated demand"]),
        createElement("p", { class: "allocation-note" }, [
          `${formatHours(unallocated.reduce((sum, allocation) => sum + allocation.hours, 0))} without a qualified slot`,
        ]),
      ]),
    ]),
  ]);

  if (!unallocated.length) {
    card.append(createElement("p", { class: "allocation-note" }, ["All project hours are allocated."]));
    return card;
  }

  card.append(
    createElement(
      "ul",
      {},
      unallocated.map((allocation) =>
        createElement("li", {}, [
          createElement("strong", {}, [allocation.projectName]),
          createElement("p", { class: "allocation-note" }, [
            `${formatHours(allocation.hours)} still needs ${competenceLabel(allocation.competence)} or higher`,
          ]),
        ]),
      ),
    ),
  );
  return card;
}

function renderEmptyRow(tableBody, colspan) {
  const row = elements.emptyRowTemplate.content.firstElementChild.cloneNode(true);
  row.firstElementChild.colSpan = colspan;
  tableBody.replaceChildren(row);
}

function tableCell(content) {
  const cell = document.createElement("td");
  if (content instanceof Node) {
    cell.append(content);
  } else {
    cell.textContent = content;
  }
  return cell;
}

function removeButton(type, id) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "remove-button";
  button.textContent = "Remove";
  button.dataset[`remove${capitalize(type)}`] = id;
  return button;
}

function competenceBadge(level) {
  return createElement("span", { class: "badge" }, [competenceLabel(level)]);
}

function competenceLabel(level) {
  return COMPETENCE_LEVELS.find((competence) => competence.value === Number(level))?.label || "Level unknown";
}

function createElement(tagName, attributes = {}, children = []) {
  const element = document.createElement(tagName);

  Object.entries(attributes).forEach(([name, value]) => {
    if (name === "class") {
      element.className = value;
      return;
    }

    if (name === "style") {
      element.setAttribute("style", value);
      return;
    }

    element.setAttribute(name, value);
  });

  children.forEach((child) => {
    if (child instanceof Node) {
      element.append(child);
    } else {
      element.append(document.createTextNode(String(child)));
    }
  });

  return element;
}

function currentWeekValue() {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1);
  return dateToWeekValue(monday);
}

function dateToWeekValue(date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function normaliseWeek(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-W\d{2}$/.test(text)) {
    return text;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : dateToWeekValue(date);
}

function formatWeek(value) {
  return value.replace("-W", " week ");
}

function formatHours(value) {
  return `${Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  })}h`;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function createId(prefix) {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadState() {
  const fallbackState = {
    selectedWeek: currentWeekValue(),
    projects: [],
    staff: [],
  };

  try {
    return {
      ...fallbackState,
      ...JSON.parse(localStorage.getItem(STORAGE_KEY)),
    };
  } catch {
    return fallbackState;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
