(function () {
  "use strict";

  var storageKey = "hwplanner.scheduleRows";

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
  var navButtons = document.querySelectorAll("[data-page-target]");
  var pages = document.querySelectorAll(".page");

  function loadRows() {
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
      th.textContent = field.label;
      headerRow.appendChild(th);
    });

    var actionHeader = document.createElement("th");
    actionHeader.textContent = "Actions";
    headerRow.appendChild(actionHeader);
  }

  function renderRows() {
    var rows = loadRows();
    tableBody.innerHTML = "";
    emptyMessage.hidden = rows.length > 0;

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

  function escapeCsv(value) {
    var stringValue = String(value || "");

    if (/[",\n]/.test(stringValue)) {
      return '"' + stringValue.replace(/"/g, '""') + '"';
    }

    return stringValue;
  }

  function exportCsv() {
    var rows = loadRows();
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
      showPage(button.dataset.pageTarget);
    });
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

  buildHeader();
  renderRows();
})();
