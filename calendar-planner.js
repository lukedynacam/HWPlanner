const SCHEDULE_STORAGE_KEY = "hwplanner.scheduleRows";
const IMPORTED_ROWS_KEY = "hwplanner.scheduleRows.importedVersion";
const CALENDAR_OVERRIDES_KEY = "hwplanner.calendarOverrides";

const elements = {
  month: document.querySelector("#calendar-month"),
  monthButtons: document.querySelectorAll("[data-months]"),
  months: document.querySelector("#calendar-months"),
  visibleJobs: document.querySelector("#calendar-visible-jobs"),
  visibleHours: document.querySelector("#calendar-visible-hours"),
  dailyCapacity: document.querySelector("#calendar-daily-capacity"),
  viewLabel: document.querySelector("#calendar-view-label"),
};

let viewMonths = 1;
let staffCapacity = {
  totalDailyHours: 0,
  staffCount: 0,
};

function loadOverrides() {
  try {
    return JSON.parse(window.localStorage.getItem(CALENDAR_OVERRIDES_KEY) || "{}");
  } catch (error) {
    return {};
  }
}

function saveOverrides(overrides) {
  window.localStorage.setItem(CALENDAR_OVERRIDES_KEY, JSON.stringify(overrides));
}

function rowKey(row) {
  return row.id || `${row.customer}-${row.partNumber}-${row.jobCard}-${row.dispatchDate}`;
}

function seedImportedRows() {
  const importedRows = window.HWPLANNER_IMPORTED_SCHEDULE_ROWS || [];
  const importedVersion = window.HWPLANNER_IMPORTED_SCHEDULE_VERSION || "";
  if (!importedRows.length || !importedVersion) {
    return;
  }

  if (window.localStorage.getItem(IMPORTED_ROWS_KEY) === importedVersion) {
    return;
  }

  const storedRows = window.localStorage.getItem(SCHEDULE_STORAGE_KEY);
  let existingRows = [];
  if (storedRows) {
    try {
      existingRows = JSON.parse(storedRows);
    } catch (error) {
      existingRows = [];
    }
  }

  const existingIds = new Set(existingRows.map((row) => row.id));
  const rowsToImport = importedRows.filter((row) => !existingIds.has(row.id));
  window.localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(existingRows.concat(rowsToImport)));
  window.localStorage.setItem(IMPORTED_ROWS_KEY, importedVersion);
}

function loadRows() {
  seedImportedRows();
  try {
    return JSON.parse(window.localStorage.getItem(SCHEDULE_STORAGE_KEY) || "[]").map(normaliseScheduleRow);
  } catch (error) {
    return [];
  }
}

function normaliseScheduleRow(row) {
  return {
    ...row,
    customer: normaliseCustomerName(row.customer),
  };
}

function normaliseCustomerName(customer) {
  const value = String(customer || "").replace(/\s+/g, " ").trim();
  if (/red\s*bull/i.test(value) && /power\s*trains?/i.test(value)) {
    return "Red Bull Powertrains";
  }

  return value;
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonth(value) {
  const [year, month] = String(value || currentMonthValue()).split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function addMonths(date, offset) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function dateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function monthTitle(date) {
  return date.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const isoMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isWorkingDay(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function viewEndDate(startMonth) {
  return new Date(startMonth.getFullYear(), startMonth.getMonth() + viewMonths, 0);
}

async function loadStaffCapacity() {
  try {
    const response = await fetch("/api/staff-capacity");
    if (!response.ok) {
      return;
    }

    staffCapacity = await response.json();
  } catch (error) {
    staffCapacity = {
      totalDailyHours: 0,
      staffCount: 0,
    };
  }
}

function buildCapacityPlan(rows, startMonth) {
  const endDate = viewEndDate(startMonth);
  const dailyCapacity = Number(staffCapacity.totalDailyHours || 0);
  const dayPlans = {};
  const scheduledRows = new Set();
  const overrides = loadOverrides();
  let scheduledHours = 0;

  for (let date = new Date(startMonth); date <= endDate; date.setDate(date.getDate() + 1)) {
    const key = dateKey(date);
    dayPlans[key] = {
      date: new Date(date),
      capacity: isWorkingDay(date) ? dailyCapacity : 0,
      used: 0,
      jobs: [],
    };
  }

  const jobs = rows
    .map((row) => ({
      ...row,
      shippingDate: parseDate(row.dispatchDate),
      plannedDate: parseDate(overrides[rowKey(row)]),
      hoursValue: Number(row.hours || 0),
    }))
    .filter((row) => row.shippingDate && row.shippingDate >= startMonth && row.shippingDate <= endDate)
    .sort((first, second) => {
      const dateDelta = first.shippingDate - second.shippingDate;
      if (dateDelta) {
        return dateDelta;
      }

      return String(first.customer || "").localeCompare(String(second.customer || ""), undefined, {
        sensitivity: "base",
      });
    });

  let workingDate = new Date(startMonth);
  jobs.forEach((job) => {
    if (job.plannedDate && job.plannedDate >= startMonth && job.plannedDate <= endDate) {
      const key = dateKey(job.plannedDate);
      if (dayPlans[key]) {
        const jobHours = Math.max(0, Number(job.hoursValue || 0));
        dayPlans[key].used += jobHours;
        dayPlans[key].jobs.push({
          row: job,
          hours: jobHours,
          dueDate: job.shippingDate,
          isLate: job.plannedDate > job.shippingDate,
          isManual: true,
        });
        scheduledHours += jobHours;
        scheduledRows.add(rowKey(job));
      }
      return;
    }

    const jobHours = Math.max(0, Number(job.hoursValue || 0));
    if (!jobHours) {
      const key = dateKey(job.shippingDate);
      if (dayPlans[key]) {
        dayPlans[key].jobs.push({ row: job, hours: 0, dueDate: job.shippingDate });
        scheduledRows.add(rowKey(job));
      }
      return;
    }

    let remainingHours = jobHours;
    while (remainingHours > 0 && workingDate <= endDate) {
      if (!isWorkingDay(workingDate)) {
        workingDate.setDate(workingDate.getDate() + 1);
        continue;
      }

      const key = dateKey(workingDate);
      const dayPlan = dayPlans[key];
      const remainingDayCapacity = Math.max(0, dayPlan.capacity - dayPlan.used);
      if (!remainingDayCapacity) {
        workingDate.setDate(workingDate.getDate() + 1);
        continue;
      }

      const assignedHours = Math.min(remainingHours, remainingDayCapacity);
      dayPlan.used += assignedHours;
      dayPlan.jobs.push({
        row: job,
        hours: assignedHours,
        dueDate: job.shippingDate,
        isLate: workingDate > job.shippingDate,
      });
      scheduledHours += assignedHours;
      scheduledRows.add(rowKey(job));
      remainingHours -= assignedHours;
    }
  });

  return {
    dayPlans,
    scheduledJobCount: scheduledRows.size,
    scheduledHours,
    dailyCapacity,
  };
}

function renderCalendar() {
  const startMonth = parseMonth(elements.month.value);
  const rows = loadRows();
  const plan = buildCapacityPlan(rows, startMonth);
  elements.months.classList.toggle("calendar-months-three", viewMonths === 3);

  elements.months.replaceChildren(
    ...Array.from({ length: viewMonths }, (_, index) => {
      const monthDate = addMonths(startMonth, index);
      const monthElement = renderMonth(monthDate, plan.dayPlans);
      return monthElement;
    }),
  );

  elements.visibleJobs.textContent = String(plan.scheduledJobCount);
  elements.visibleHours.textContent = formatHours(plan.scheduledHours);
  elements.dailyCapacity.textContent = formatHours(plan.dailyCapacity);
  elements.viewLabel.textContent = viewMonths === 1 ? "1 month" : "3 months";
}

function renderMonth(monthDate, dayPlans) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
  const monthSection = document.createElement("article");
  monthSection.className = "calendar-month";

  const heading = document.createElement("header");
  heading.innerHTML = `<h2>${monthTitle(monthDate)}</h2>`;

  const grid = document.createElement("div");
  grid.className = "calendar-grid";
  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].forEach((dayName) => {
    const dayHeader = document.createElement("strong");
    dayHeader.className = "calendar-day-name";
    dayHeader.textContent = dayName;
    grid.append(dayHeader);
  });

  for (let cellIndex = 0; cellIndex < totalCells; cellIndex += 1) {
    const dayNumber = cellIndex - startOffset + 1;
    const cell = document.createElement("div");
    cell.className = "calendar-day";

    if (dayNumber < 1 || dayNumber > lastDay.getDate()) {
      cell.classList.add("calendar-day-empty");
      grid.append(cell);
      continue;
    }

    const currentDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), dayNumber);
    const key = dateKey(currentDate);
    cell.dataset.date = key;
    cell.addEventListener("dragover", handleDragOver);
    cell.addEventListener("dragleave", handleDragLeave);
    cell.addEventListener("drop", handleDrop);
    cell.append(renderDayContent(dayNumber, dayPlans[key]));
    grid.append(cell);
  }

  monthSection.append(heading, grid);
  return monthSection;
}

function renderDayContent(dayNumber, dayPlan) {
  const fragment = document.createDocumentFragment();
  const label = document.createElement("span");
  label.className = "calendar-date";
  label.textContent = String(dayNumber);
  fragment.append(label);

  if (!dayPlan) {
    return fragment;
  }

  const capacity = document.createElement("span");
  capacity.className = "calendar-capacity";
  capacity.textContent = dayPlan.capacity
    ? `${formatHours(dayPlan.used)} / ${formatHours(dayPlan.capacity)}`
    : "No planned capacity";
  fragment.append(capacity);

  if (!dayPlan.jobs.length) {
    return fragment;
  }

  const list = document.createElement("ul");
  list.className = "calendar-job-list";
  dayPlan.jobs.slice(0, 4).forEach((entry) => {
    const job = entry.row;
    const item = document.createElement("li");
    item.draggable = true;
    item.dataset.rowKey = rowKey(job);
    item.addEventListener("dragstart", handleDragStart);
    if (entry.isLate) {
      item.classList.add("calendar-job-late");
    }
    if (entry.isManual) {
      item.classList.add("calendar-job-manual");
    }
    item.innerHTML = `
      <strong>${job.customer || "Unknown customer"}</strong>
      <span>${job.partNumber || ""} ${job.description || ""}</span>
      <em>${formatHours(entry.hours)} | ships ${dateKey(entry.dueDate)}${entry.isManual ? " | moved" : ""}</em>
    `;
    list.append(item);
  });

  if (dayPlan.jobs.length > 4) {
    const more = document.createElement("li");
    more.className = "calendar-more";
    more.textContent = `+ ${dayPlan.jobs.length - 4} more`;
    list.append(more);
  }

  fragment.append(list);
  return fragment;
}

function handleDragStart(event) {
  event.dataTransfer.setData("text/plain", event.currentTarget.dataset.rowKey);
  event.dataTransfer.effectAllowed = "move";
}

function handleDragOver(event) {
  event.preventDefault();
  event.currentTarget.classList.add("calendar-day-drop-target");
}

function handleDragLeave(event) {
  event.currentTarget.classList.remove("calendar-day-drop-target");
}

function handleDrop(event) {
  event.preventDefault();
  const target = event.currentTarget;
  target.classList.remove("calendar-day-drop-target");
  const key = event.dataTransfer.getData("text/plain");
  const date = target.dataset.date;
  if (!key || !date) {
    return;
  }

  const overrides = loadOverrides();
  overrides[key] = date;
  saveOverrides(overrides);
  renderCalendar();
}

function formatHours(value) {
  return `${Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  })}h`;
}

function setViewMonths(monthCount) {
  viewMonths = monthCount;
  elements.monthButtons.forEach((button) => {
    const isActive = Number(button.dataset.months) === viewMonths;
    button.classList.toggle("primary", isActive);
    button.classList.toggle("secondary", !isActive);
  });
  renderCalendar();
}

async function initialiseCalendar() {
  await loadStaffCapacity();
  elements.month.value = currentMonthValue();
  elements.month.addEventListener("change", renderCalendar);
  elements.monthButtons.forEach((button) => {
    button.addEventListener("click", () => setViewMonths(Number(button.dataset.months)));
  });
  setViewMonths(1);
}

initialiseCalendar();
