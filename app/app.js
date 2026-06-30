(function () {
  "use strict";

  var storageKey = "hwplanner.scheduleRows";
  var importedRowsKey = "hwplanner.scheduleRows.importedVersion";

  var fields = [
    { key: "customer", label: "Customer" },
    { key: "partNumber", label: "Part No." },
    { key: "description", label: "Description" },
    { key: "hours", label: "Hours" },
    { key: "pick", label: "Pick" },
    { key: "jobCard", label: "Job Card" },
    { key: "assetNumber", label: "Asset No." },
    { key: "quantity", label: "Qty" },
    { key: "tech", label: "Tech" },
    { key: "status", label: "Status" },
    { key: "notes", label: "Notes" },
    { key: "poNumber", label: "PO Number" },
    { key: "startDate", label: "Start Date" },
    { key: "inspectionDate", label: "Insp Date" },
    { key: "dispatchDate", label: "Disp Date" },
    { key: "docNumber", label: "Doc No." },
    { key: "shipDue", label: "Ship Due" }
  ];

  var form = document.getElementById("schedule-form");
  var recordIdInput = document.getElementById("record-id");
  var saveButton = document.getElementById("save-button");
  var clearFormButton = document.getElementById("clear-form-button");
  var clearScheduleButton = document.getElementById("clear-schedule-button");
  var exportButton = document.getElementById("export-button");
  var headerRow = document.getElementById("schedule-header-row");
  var tableBody = document.getElementById("schedule-table-body");
  var emptyMessage = document.getElementById("empty-message");
  var scheduleSearchInput = document.getElementById("schedule-search");
  var scheduleStatusFilter = document.getElementById("schedule-status-filter");
  var scheduleTechFilter = document.getElementById("schedule-tech-filter");
  var resetScheduleFiltersButton = document.getElementById("reset-schedule-filters");
  var scheduleFilterCount = document.getElementById("schedule-filter-count");
  var navButtons = document.querySelectorAll("[data-page-target]");
  var pages = document.querySelectorAll(".page");
  var sortState = {
    key: "",
    direction: "asc"
  };

  function loadRows() {
    seedImportedRows();
    var storedRows = window.localStorage.getItem(storageKey);

    if (!storedRows) {
      return [];
    }

    try {
      return JSON.parse(storedRows);
    } catch (error) {
      console.error("Unable to load saved schedule rows.", error);
      return [];
    }
  }

  function saveRows(rows) {
    window.localStorage.setItem(storageKey, JSON.stringify(rows));
  }

  function seedImportedRows() {
    var importedRows = window.HWPLANNER_IMPORTED_SCHEDULE_ROWS || [];
    var importedVersion = window.HWPLANNER_IMPORTED_SCHEDULE_VERSION || "";

    if (!importedRows.length || !importedVersion) {
      return;
    }

    if (window.localStorage.getItem(importedRowsKey) === importedVersion) {
      return;
    }

    var existingRows = [];
    var storedRows = window.localStorage.getItem(storageKey);
    if (storedRows) {
      try {
        existingRows = JSON.parse(storedRows);
      } catch (error) {
        console.error("Unable to merge imported schedule rows.", error);
      }
    }

    var existingIds = new Set(existingRows.map(function (row) {
      return row.id;
    }));
    var rowsToImport = importedRows.filter(function (row) {
      return !existingIds.has(row.id);
    });

    saveRows(existingRows.concat(rowsToImport));
    window.localStorage.setItem(importedRowsKey, importedVersion);
  }

  function makeId() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }

    return String(Date.now()) + "-" + String(Math.random()).slice(2);
  }

  function getFormData() {
    return fields.reduce(function (record, field) {
      var input = form.elements[field.key];
      record[field.key] = input ? input.value.trim() : "";
      return record;
    }, {});
  }

  function fillForm(row) {
    fields.forEach(function (field) {
      var input = form.elements[field.key];

      if (input) {
        input.value = row[field.key] || "";
      }
    });

    recordIdInput.value = row.id;
    saveButton.textContent = "Update Schedule Row";
    showPage("input-page");
    form.elements.customer.focus();
  }

  function resetForm() {
    form.reset();
    recordIdInput.value = "";
    saveButton.textContent = "Add to Schedule";
  }

  function buildHeader() {
    headerRow.innerHTML = "";

    fields.forEach(function (field) {
      var th = document.createElement("th");
      var sortButton = document.createElement("button");
      sortButton.className = "sort-button";
      sortButton.type = "button";
      sortButton.dataset.sortKey = field.key;
      sortButton.textContent = field.label + sortIndicator(field.key);
      th.appendChild(sortButton);
      headerRow.appendChild(th);
    });

    var actionHeader = document.createElement("th");
    actionHeader.textContent = "Actions";
    headerRow.appendChild(actionHeader);
  }

  function renderRows() {
    var allRows = loadRows();
    var rows = visibleRows(allRows);
    tableBody.innerHTML = "";
    emptyMessage.hidden = rows.length > 0;
    emptyMessage.textContent = allRows.length
      ? "No schedule rows match the current filters."
      : "No schedule rows yet. Add a job on the input data page.";

    populateStatusFilter(allRows);
    updateFilterCount(rows.length, allRows.length);
    buildHeader();

    rows.forEach(function (row) {
      var tr = document.createElement("tr");

      fields.forEach(function (field) {
        var td = document.createElement("td");
        td.textContent = row[field.key] || "";
        tr.appendChild(td);
      });

      var actionCell = document.createElement("td");
      var actions = document.createElement("div");
      var editButton = document.createElement("button");
      var deleteButton = document.createElement("button");

      actions.className = "row-actions";

      editButton.className = "edit-row-button";
      editButton.type = "button";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", function () {
        fillForm(row);
      });

      deleteButton.className = "delete-row-button";
      deleteButton.type = "button";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", function () {
        deleteRow(row.id);
      });

      actions.appendChild(editButton);
      actions.appendChild(deleteButton);
      actionCell.appendChild(actions);
      tr.appendChild(actionCell);
      tableBody.appendChild(tr);
    });
  }

  function visibleRows(rows) {
    var filteredRows = rows.filter(matchesFilters);

    if (!sortState.key) {
      return filteredRows;
    }

    return filteredRows.slice().sort(function (first, second) {
      var result = compareValues(first[sortState.key], second[sortState.key], sortState.key);
      return sortState.direction === "asc" ? result : -result;
    });
  }

  function matchesFilters(row) {
    var search = normaliseFilterValue(scheduleSearchInput ? scheduleSearchInput.value : "");
    var status = normaliseFilterValue(scheduleStatusFilter ? scheduleStatusFilter.value : "");
    var tech = normaliseFilterValue(scheduleTechFilter ? scheduleTechFilter.value : "");
    var rowValues = fields.map(function (field) {
      return normaliseFilterValue(row[field.key]);
    });

    if (search && !rowValues.some(function (value) { return value.includes(search); })) {
      return false;
    }

    if (status && normaliseFilterValue(row.status) !== status) {
      return false;
    }

    if (tech && !normaliseFilterValue(row.tech).includes(tech)) {
      return false;
    }

    return true;
  }

  function normaliseFilterValue(value) {
    return String(value || "").trim().toLowerCase();
  }

  function compareValues(firstValue, secondValue, key) {
    var first = String(firstValue || "").trim();
    var second = String(secondValue || "").trim();

    if (["hours", "quantity"].includes(key)) {
      return numericCompare(first, second);
    }

    if (["startDate", "inspectionDate", "dispatchDate"].includes(key)) {
      return dateCompare(first, second);
    }

    return first.localeCompare(second, undefined, {
      numeric: true,
      sensitivity: "base"
    });
  }

  function numericCompare(first, second) {
    var firstNumber = Number(first);
    var secondNumber = Number(second);

    if (Number.isFinite(firstNumber) && Number.isFinite(secondNumber)) {
      return firstNumber - secondNumber;
    }

    return first.localeCompare(second, undefined, { numeric: true, sensitivity: "base" });
  }

  function dateCompare(first, second) {
    var firstTime = Date.parse(first);
    var secondTime = Date.parse(second);

    if (!Number.isNaN(firstTime) && !Number.isNaN(secondTime)) {
      return firstTime - secondTime;
    }

    return first.localeCompare(second, undefined, { numeric: true, sensitivity: "base" });
  }

  function sortIndicator(key) {
    if (sortState.key !== key) {
      return "";
    }

    return sortState.direction === "asc" ? " ↑" : " ↓";
  }

  function populateStatusFilter(rows) {
    if (!scheduleStatusFilter) {
      return;
    }

    var currentValue = scheduleStatusFilter.value;
    var statuses = Array.from(new Set(rows.map(function (row) {
      return String(row.status || "").trim();
    }).filter(Boolean))).sort(function (first, second) {
      return first.localeCompare(second, undefined, { sensitivity: "base" });
    });

    scheduleStatusFilter.replaceChildren(
      new Option("All statuses", ""),
      ...statuses.map(function (status) {
        return new Option(status, status);
      })
    );
    scheduleStatusFilter.value = statuses.includes(currentValue) ? currentValue : "";
  }

  function updateFilterCount(visibleCount, totalCount) {
    if (!scheduleFilterCount) {
      return;
    }

    scheduleFilterCount.textContent = visibleCount === totalCount
      ? "Showing all " + totalCount + " rows"
      : "Showing " + visibleCount + " of " + totalCount + " rows";
  }

  function deleteRow(id) {
    var rows = loadRows().filter(function (row) {
      return row.id !== id;
    });

    saveRows(rows);
    renderRows();
  }

  function upsertRow(event) {
    event.preventDefault();

    var rows = loadRows();
    var existingId = recordIdInput.value;
    var record = getFormData();

    if (existingId) {
      rows = rows.map(function (row) {
        if (row.id !== existingId) {
          return row;
        }

        return Object.assign({}, row, record);
      });
    } else {
      rows.push(Object.assign({ id: makeId() }, record));
    }

    saveRows(rows);
    resetForm();
    renderRows();
    showPage("schedule-page");
  }

  function showPage(pageId) {
    pages.forEach(function (page) {
      page.classList.toggle("active", page.id === pageId);
    });

    navButtons.forEach(function (button) {
      button.classList.toggle("active", button.dataset.pageTarget === pageId);
    });
  }

  function pageFromHash() {
    var hash = window.location.hash.replace("#", "");
    return hash === "schedule-page" || hash === "input-page" ? hash : "input-page";
  }

  function escapeCsv(value) {
    var stringValue = String(value || "");

    if (/[",\n]/.test(stringValue)) {
      return '"' + stringValue.replace(/"/g, '""') + '"';
    }

    return stringValue;
  }

  function exportCsv() {
    var rows = visibleRows(loadRows());
    var header = fields.map(function (field) {
      return escapeCsv(field.label);
    });

    var lines = rows.map(function (row) {
      return fields.map(function (field) {
        return escapeCsv(row[field.key]);
      }).join(",");
    });

    var csv = [header.join(",")].concat(lines).join("\n");
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");

    link.href = url;
    link.download = "hwplanner-schedule.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  navButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      var pageId = button.dataset.pageTarget;
      showPage(pageId);
      window.history.replaceState(null, "", "#" + pageId);
    });
  });

  window.addEventListener("hashchange", function () {
    showPage(pageFromHash());
  });

  form.addEventListener("submit", upsertRow);
  clearFormButton.addEventListener("click", resetForm);
  clearScheduleButton.addEventListener("click", function () {
    if (window.confirm("Clear all schedule rows?")) {
      saveRows([]);
      resetForm();
      renderRows();
    }
  });
  exportButton.addEventListener("click", exportCsv);
  headerRow.addEventListener("click", function (event) {
    var sortButton = event.target.closest("[data-sort-key]");
    if (!sortButton) {
      return;
    }

    var key = sortButton.dataset.sortKey;
    if (sortState.key === key) {
      sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
    } else {
      sortState.key = key;
      sortState.direction = "asc";
    }

    renderRows();
  });

  [scheduleSearchInput, scheduleStatusFilter, scheduleTechFilter].forEach(function (input) {
    if (!input) {
      return;
    }

    input.addEventListener("input", renderRows);
    input.addEventListener("change", renderRows);
  });

  resetScheduleFiltersButton.addEventListener("click", function () {
    scheduleSearchInput.value = "";
    scheduleStatusFilter.value = "";
    scheduleTechFilter.value = "";
    sortState.key = "";
    sortState.direction = "asc";
    renderRows();
  });

  buildHeader();
  renderRows();
  showPage(pageFromHash());
})();
