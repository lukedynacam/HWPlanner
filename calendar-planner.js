const SCHEDULE_STORAGE_KEY = "hwplanner.scheduleRows";
const IMPORTED_ROWS_KEY = "hwplanner.scheduleRows.importedVersion";

const elements = {
  month: document.querySelector("#calendar-month"),
  monthButtons: document.querySelectorAll("[data-months]"),
  months: document.querySelector("#calendar-months"),
  visibleJobs: document.querySelector("#calendar-visible-jobs"),
  visibleHours: document.querySelector("#calendar-visible-hours"),
  viewLabel: document.querySelector("#calendar-view-label"),
};

let viewMonths = 1;

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
    return JSON.parse(window.localStorage.getItem(SCHEDULE_STORAGE_KEY) || "[]");
  } catch (error) {
    return [];
  }
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

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function jobsByDispatchDate(rows) {
  return rows.reduce((groups, row) => {
    const dispatchDate = parseDate(row.dispatchDate);
    if (!dispatchDate) {
      return groups;
    }

    const key = dateKey(dispatchDate);
    groups[key] = groups[key] || [];
    groups[key].push(row);
    return groups;
  }, {});
}

function renderCalendar() {
  const startMonth = parseMonth(elements.month.value);
  const rows = loadRows();
  const groupedJobs = jobsByDispatchDate(rows);
  const visibleRows = [];
  elements.months.classList.toggle("calendar-months-three", viewMonths === 3);

  elements.months.replaceChildren(
    ...Array.from({ length: viewMonths }, (_, index) => {
      const monthDate = addMonths(startMonth, index);
      const monthElement = renderMonth(monthDate, groupedJobs, visibleRows);
      return monthElement;
    }),
  );

  const visibleHours = visibleRows.reduce((sum, row) => sum + Number(row.hours || 0), 0);
  elements.visibleJobs.textContent = String(visibleRows.length);
  elements.visibleHours.textContent = `${visibleHours.toLocaleString(undefined, {
    maximumFractionDigits: 1,
  })}h`;
  elements.viewLabel.textContent = viewMonths === 1 ? "1 month" : "3 months";
}

function renderMonth(monthDate, groupedJobs, visibleRows) {
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
    const jobs = groupedJobs[key] || [];
    visibleRows.push(...jobs);
    cell.append(renderDayContent(dayNumber, jobs));
    grid.append(cell);
  }

  monthSection.append(heading, grid);
  return monthSection;
}

function renderDayContent(dayNumber, jobs) {
  const fragment = document.createDocumentFragment();
  const label = document.createElement("span");
  label.className = "calendar-date";
  label.textContent = String(dayNumber);
  fragment.append(label);

  if (!jobs.length) {
    return fragment;
  }

  const list = document.createElement("ul");
  list.className = "calendar-job-list";
  jobs.slice(0, 4).forEach((job) => {
    const item = document.createElement("li");
    item.innerHTML = `
      <strong>${job.customer || "Unknown customer"}</strong>
      <span>${job.partNumber || ""} ${job.description || ""}</span>
    `;
    list.append(item);
  });

  if (jobs.length > 4) {
    const more = document.createElement("li");
    more.className = "calendar-more";
    more.textContent = `+ ${jobs.length - 4} more`;
    list.append(more);
  }

  fragment.append(list);
  return fragment;
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

function initialiseCalendar() {
  elements.month.value = currentMonthValue();
  elements.month.addEventListener("change", renderCalendar);
  elements.monthButtons.forEach((button) => {
    button.addEventListener("click", () => setViewMonths(Number(button.dataset.months)));
  });
  setViewMonths(1);
}

initialiseCalendar();
