import {
  findLinksWithText,
  addSiblingButton,
  fetchLinkContent,
  getValueByPartialLabel,
  createLoadingOverlay,
  removeLoadingOverlay,
  createInputPopup,
} from "./utils";

/**
 * Injects functionality for bulk grading of assignments
 */
export function injectAssignmentsPopup(bridge) {
  const assignmentsButtonText = "الواجبات المرسلة";
  const assignmentsAutoCorrectButtonText = "تصحيح سريع";
  const assignmentsAddButtonText = "إضافة واجب";
  const assignmentsMassCorrectButtonText = "تصحيح كل ما بالصحفة";
  const assignmentsAnswersButtonText = "إجابات الطلاب";
  const assignmentsAnswersButtonTextAlt = "رصد الدرجات";
  const finishedAssignmentsButtonText = "الواجبات المنتهية";
  const assignmentsErrorText = "لا توجد واجبات مرسلة منشأة في النظام حاليا";
  const assignmentsCorrectionTypeLabelText = "مصدر الواجب";
  const assignmentsCorrectionFromBankText = "بنك الأسئلة";
  const assignmentsMaxGradingLabelText = "درجة الواجب";
  const debugPanelId = "assignments-qc-debug-panel";
  const debugPanelStoreKey = "__AssignmentsQCLogs";
  const debugPanelVisibilityKey = "__AssignmentsQCDebugPanelVisible";
  const debugPanelApiKey = "__AssignmentsQCLoggerApi";
  const debugPanelMaxEntries = 1000;
  const debugPanelMaxRenderedEntries = 250;

  function hasAnsweredFields(formData) {
    for (const [key, value] of formData.entries()) {
      const normalizedValue = String(value).trim().toLowerCase();
      if (key.endsWith(".hasAnswer") && normalizedValue === "true") {
        return true; // At least one field is answered
      }
    }
    return false; // No fields are marked as answered
  }

  function toWesternDigits(value) {
    if (!value) return "";
    const arabicIndicDigits = "٠١٢٣٤٥٦٧٨٩";
    const easternArabicDigits = "۰۱۲۳۴۵۶۷۸۹";

    return String(value)
      .replace(/[٠-٩]/g, (digit) => arabicIndicDigits.indexOf(digit))
      .replace(/[۰-۹]/g, (digit) => easternArabicDigits.indexOf(digit));
  }

  function parseTotalPagesFromContainer(paginationText) {
    if (!paginationText) return null;

    const compactText = paginationText.replace(/\s+/g, " ").trim();
    const normalizedText = toWesternDigits(compactText);

    const fromMatch = normalizedText.match(/من\s*(\d+)/);
    if (fromMatch) {
      const pages = parseInt(fromMatch[1], 10);
      return Number.isNaN(pages) || pages < 1 ? null : pages;
    }

    const allNumbers = normalizedText.match(/\d+/g);
    if (!allNumbers?.length) return null;

    const pages = parseInt(allNumbers[allNumbers.length - 1], 10);
    return Number.isNaN(pages) || pages < 1 ? null : pages;
  }

  function buildListingPageUrl(baseUrl, pageNumber, isDue) {
    const listingUrl = new URL(baseUrl);
    listingUrl.searchParams.set("pageNumber", String(pageNumber));
    listingUrl.searchParams.set("searchClassRoom", "0");
    listingUrl.searchParams.set("isDue", String(isDue));
    listingUrl.searchParams.delete("type");
    return listingUrl.toString();
  }

  function toLogValue(value) {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value === "string") {
      const compact = value.replace(/\s+/g, " ").trim();
      return `"${compact.replace(/"/g, "'")}"`;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map((item) => toLogValue(item)).join(",")}]`;
    }
    return toLogValue(JSON.stringify(value));
  }

  function safeConsole(method, ...args) {
    try {
      const logger =
        typeof console?.[method] === "function"
          ? console[method]
          : typeof console?.log === "function"
          ? console.log
          : null;

      if (!logger) {
        return;
      }

      logger.apply(console, args);
    } catch {
      // Keep logging non-blocking even if page scripts tamper with console.
    }
  }

  function safeStringify(value) {
    try {
      return JSON.stringify(value);
    } catch {
      return "\"[unserializable]\"";
    }
  }

  function ensureDebugStore() {
    const win = window;
    if (!Array.isArray(win[debugPanelStoreKey])) {
      win[debugPanelStoreKey] = [];
    }
    return win[debugPanelStoreKey];
  }

  function isDebugPanelVisible() {
    return window[debugPanelVisibilityKey] === true;
  }

  function setDebugPanelVisible(isVisible) {
    window[debugPanelVisibilityKey] = Boolean(isVisible);
  }

  function removeDebugPanelElement() {
    const panel = document.getElementById(debugPanelId);
    if (panel) {
      panel.remove();
    }
  }

  function createDebugEntryLine(entry) {
    const line = document.createElement("div");
    line.style.padding = "4px 6px";
    line.style.borderRadius = "4px";
    line.style.border = "1px solid rgba(148, 163, 184, 0.2)";
    line.style.background = "rgba(2, 6, 23, 0.6)";
    line.style.whiteSpace = "pre-wrap";
    line.style.wordBreak = "break-word";

    const time = new Date(entry.ts).toLocaleTimeString("en-GB", {
      hour12: false,
    });
    const detailsStr =
      entry.details && Object.keys(entry.details).length
        ? ` ${safeStringify(entry.details)}`
        : "";
    line.textContent = `${time} [${entry.level}] ${entry.event}${detailsStr}`;
    return line;
  }

  function ensureDebugPanel(options = {}) {
    const forceCreate = Boolean(options.forceCreate);
    const existing = document.getElementById(debugPanelId);
    if (existing) {
      return existing.querySelector('[data-role="body"]');
    }

    if (!forceCreate && !isDebugPanelVisible()) {
      return null;
    }

    if (!document.body) {
      return null;
    }

    const panel = document.createElement("div");
    panel.id = debugPanelId;
    panel.style.position = "fixed";
    panel.style.bottom = "16px";
    panel.style.right = "16px";
    panel.style.width = "420px";
    panel.style.maxWidth = "92vw";
    panel.style.maxHeight = "42vh";
    panel.style.zIndex = "2147483647";
    panel.style.background = "rgba(15, 23, 42, 0.95)";
    panel.style.color = "#e2e8f0";
    panel.style.border = "1px solid #334155";
    panel.style.borderRadius = "8px";
    panel.style.boxShadow = "0 10px 25px rgba(0, 0, 0, 0.35)";
    panel.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, monospace";
    panel.style.fontSize = "11px";
    panel.style.lineHeight = "1.35";
    panel.style.display = "flex";
    panel.style.flexDirection = "column";
    panel.style.overflow = "hidden";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    header.style.padding = "8px 10px";
    header.style.background = "rgba(30, 41, 59, 0.92)";
    header.style.borderBottom = "1px solid #334155";
    header.style.fontWeight = "600";
    header.textContent = "AssignmentsQC Debug";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "6px";

    const clearButton = document.createElement("button");
    clearButton.textContent = "Clear";
    clearButton.type = "button";
    clearButton.style.cursor = "pointer";
    clearButton.style.padding = "2px 6px";
    clearButton.style.fontSize = "10px";

    const hideButton = document.createElement("button");
    hideButton.textContent = "Close";
    hideButton.type = "button";
    hideButton.style.cursor = "pointer";
    hideButton.style.padding = "2px 6px";
    hideButton.style.fontSize = "10px";

    controls.appendChild(clearButton);
    controls.appendChild(hideButton);
    header.appendChild(controls);

    const body = document.createElement("div");
    body.setAttribute("data-role", "body");
    body.style.overflow = "auto";
    body.style.padding = "8px 10px";
    body.style.display = "flex";
    body.style.flexDirection = "column";
    body.style.gap = "4px";

    clearButton.addEventListener("click", () => {
      const store = ensureDebugStore();
      store.length = 0;
      body.innerHTML = "";
    });

    hideButton.addEventListener("click", () => {
      setDebugPanelVisible(false);
      removeDebugPanelElement();
    });

    panel.appendChild(header);
    panel.appendChild(body);
    document.body.appendChild(panel);
    return body;
  }

  function renderDebugPanelEntries() {
    const body = ensureDebugPanel({ forceCreate: true });
    if (!body) return false;

    body.innerHTML = "";
    const store = ensureDebugStore();
    for (
      let index = store.length - 1;
      index >= 0 && body.children.length < debugPanelMaxRenderedEntries;
      index--
    ) {
      body.appendChild(createDebugEntryLine(store[index]));
    }
    return true;
  }

  function showDebugPanel() {
    setDebugPanelVisible(true);
    const rendered = renderDebugPanelEntries();
    safeConsole("log", "[AssignmentsQC] debug_panel_shown", {
      rendered,
      entries: ensureDebugStore().length,
      ts: Date.now(),
    });
    return rendered;
  }

  function hideDebugPanel() {
    setDebugPanelVisible(false);
    removeDebugPanelElement();
    safeConsole("log", "[AssignmentsQC] debug_panel_hidden", {
      ts: Date.now(),
    });
    return true;
  }

  function clearDebugStore() {
    const store = ensureDebugStore();
    store.length = 0;
    const body = ensureDebugPanel();
    if (body) {
      body.innerHTML = "";
    }
    return true;
  }

  function setupDebugPanelGlobals() {
    setDebugPanelVisible(false);
    removeDebugPanelElement();

    const api = {
      show: showDebugPanel,
      hide: hideDebugPanel,
      toggle: () => (isDebugPanelVisible() ? hideDebugPanel() : showDebugPanel()),
      clear: clearDebugStore,
      logs: () => [...ensureDebugStore()],
      isVisible: () => isDebugPanelVisible(),
    };

    window[debugPanelApiKey] = api;
    window.showAssignmentsQCLogger = api.show;
    window.hideAssignmentsQCLogger = api.hide;
    window.toggleAssignmentsQCLogger = api.toggle;
    window.getAssignmentsQCLogs = api.logs;
    window.clearAssignmentsQCLogs = api.clear;

    safeConsole("log", "[AssignmentsQC] debug_panel_controls_ready", {
      visible: api.isVisible(),
      commands: [
        "showAssignmentsQCLogger()",
        "hideAssignmentsQCLogger()",
        "toggleAssignmentsQCLogger()",
        "getAssignmentsQCLogs()",
        "clearAssignmentsQCLogs()",
      ],
      ts: Date.now(),
    });
  }

  function appendDebugEntry(entry) {
    const store = ensureDebugStore();
    store.push(entry);
    if (store.length > debugPanelMaxEntries) {
      store.splice(0, store.length - debugPanelMaxEntries);
    }

    if (!isDebugPanelVisible()) return;

    const body = ensureDebugPanel({ forceCreate: true });
    if (!body) return;

    body.prepend(createDebugEntryLine(entry));
    while (body.children.length > debugPanelMaxRenderedEntries) {
      body.removeChild(body.lastChild);
    }
  }

  function rawConsoleLog(event, details = {}) {
    const entry = {
      scope: "AssignmentsQC",
      runId: "raw",
      level: "info",
      event,
      details: {
        href: window.location.href,
        ...details,
      },
      ts: Date.now(),
    };
    appendDebugEntry(entry);
    safeConsole("log", "[AssignmentsQC] raw_trace", entry);
  }

  function createAssignmentsLogger(runId) {
    const scope = "AssignmentsQC";
    const canUseBridge = Boolean(bridge && typeof bridge.send === "function");
    const canUseRuntime =
      typeof chrome !== "undefined" &&
      chrome?.runtime &&
      typeof chrome.runtime.sendMessage === "function";
    let bridgeUnavailableLogged = false;
    let runtimeUnavailableLogged = false;
    let bridgeEmitCount = 0;

    function sendToBridge(entry) {
      if (!canUseBridge) return;

      Promise.resolve(
        bridge.send("log", {
          message: `[${scope}] event=${entry.event} level=${entry.level} runId=${runId}`,
          data: [entry],
        })
      )
        .then(() => {
          bridgeEmitCount += 1;
          if (bridgeEmitCount % 25 === 0) {
            const heartbeat = {
              scope,
              runId,
              level: "info",
              event: "logger_emit_success",
              details: { emittedCount: bridgeEmitCount },
              ts: Date.now(),
            };
            appendDebugEntry(heartbeat);
            safeConsole("log", "[AssignmentsQC] logger_emit_success", heartbeat);
            Promise.resolve(
              bridge.send("log", {
                message: `[${scope}] event=logger_emit_success runId=${runId}`,
                data: [heartbeat],
              })
            ).catch(() => {
              // Keep logging non-blocking and silent for heartbeat failures.
            });
          }
        })
        .catch((error) => {
          if (bridgeUnavailableLogged) return;
          bridgeUnavailableLogged = true;
          const bridgeUnavailableEntry = {
            scope,
            runId,
            level: "warn",
            event: "logger_bridge_unavailable",
            details: { message: error?.message },
            ts: Date.now(),
          };
          appendDebugEntry(bridgeUnavailableEntry);
          safeConsole("log", "[AssignmentsQC] logger_bridge_unavailable", {
            runId,
            message: error?.message,
            ts: Date.now(),
          });
          safeConsole("warn", "[AssignmentsQC] logger_bridge_unavailable", {
            runId,
            message: error?.message,
          });
        });
    }

    function sendToRuntime(entry) {
      if (!canUseRuntime) return;

      try {
        chrome.runtime.sendMessage({ type: "assignments_qc_log", entry }, () => {
          const runtimeError = chrome.runtime?.lastError;
          if (!runtimeError || runtimeUnavailableLogged) return;

          runtimeUnavailableLogged = true;
          const runtimeUnavailableEntry = {
            scope,
            runId,
            level: "warn",
            event: "logger_runtime_unavailable",
            details: { message: runtimeError.message },
            ts: Date.now(),
          };
          appendDebugEntry(runtimeUnavailableEntry);
          safeConsole("log", "[AssignmentsQC] logger_runtime_unavailable", {
            runId,
            message: runtimeError.message,
            ts: Date.now(),
          });
          safeConsole("warn", "[AssignmentsQC] logger_runtime_unavailable", {
            runId,
            message: runtimeError.message,
          });
        });
      } catch (error) {
        if (runtimeUnavailableLogged) return;
        runtimeUnavailableLogged = true;
        const runtimeUnavailableEntry = {
          scope,
          runId,
          level: "warn",
          event: "logger_runtime_unavailable",
          details: { message: error?.message },
          ts: Date.now(),
        };
        appendDebugEntry(runtimeUnavailableEntry);
        safeConsole("log", "[AssignmentsQC] logger_runtime_unavailable", {
          runId,
          message: error?.message,
          ts: Date.now(),
        });
        safeConsole("warn", "[AssignmentsQC] logger_runtime_unavailable", {
          runId,
          message: error?.message,
        });
      }
    }

    function sendToBackground(entry) {
      sendToBridge(entry);
      sendToRuntime(entry);
    }

    const loggerCreatedEntry = {
      scope,
      runId,
      level: "info",
      event: "logger_created",
      details: {
        href: window.location.href,
      },
      ts: Date.now(),
    };
    appendDebugEntry(loggerCreatedEntry);
    safeConsole("log", "[AssignmentsQC] logger_created", loggerCreatedEntry);
    sendToBackground(loggerCreatedEntry);

    const bridgeStatusEntry = {
      scope,
      runId,
      level: canUseBridge ? "info" : "warn",
      event: canUseBridge ? "logger_bridge_enabled" : "logger_bridge_unavailable",
      details: {},
      ts: Date.now(),
    };
    appendDebugEntry(bridgeStatusEntry);
    safeConsole(
      "log",
      `[AssignmentsQC] ${
        canUseBridge ? "logger_bridge_enabled" : "logger_bridge_unavailable"
      }`,
      {
        runId,
        ts: Date.now(),
      }
    );
    sendToBackground(bridgeStatusEntry);

    const runtimeStatusEntry = {
      scope,
      runId,
      level: canUseRuntime ? "info" : "warn",
      event: canUseRuntime ? "logger_runtime_enabled" : "logger_runtime_unavailable",
      details: {},
      ts: Date.now(),
    };
    appendDebugEntry(runtimeStatusEntry);
    safeConsole(
      "log",
      `[AssignmentsQC] ${
        canUseRuntime ? "logger_runtime_enabled" : "logger_runtime_unavailable"
      }`,
      {
        runId,
        ts: Date.now(),
      }
    );
    sendToBackground(runtimeStatusEntry);

    return function writeLog(level, event, details = {}) {
      safeConsole("log", "[AssignmentsQC] writeLog_invoked", {
        runId,
        level,
        event,
        details,
        ts: Date.now(),
      });

      const entries = Object.entries(details)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${toLogValue(value)}`)
        .join(" ");

      const message = `[AssignmentsQC] level=${level} feature=assignments_quick_correction runId=${runId} event=${event}${
        entries ? ` ${entries}` : ""
      }`;
      const entry = {
        scope,
        runId,
        level,
        event,
        details,
        ts: Date.now(),
      };
      appendDebugEntry(entry);
      safeConsole("log", message);
      if (level === "warn") {
        safeConsole("warn", message);
      } else if (level === "error") {
        safeConsole("error", message);
      }

      sendToBackground(entry);
    };
  }

  function createRunId(prefix = "run") {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function parseHtmlContent(content, writeLog, successEvent, failureEvent, details) {
    const contentAsDiv = document.createElement("div");
    try {
      contentAsDiv.innerHTML = content ?? "";
      writeLog("info", successEvent, details);
      return contentAsDiv;
    } catch (error) {
      writeLog("error", failureEvent, {
        ...details,
        message: error?.message,
        stack: error?.stack,
      });
      return null;
    }
  }

  function normalizeTextValue(value) {
    if (value === null || value === undefined) return null;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
  }

  function resolveAssignmentMetadata(pageContentAsDiv) {
    const sourceTypeLabelValue = normalizeTextValue(
      getValueByPartialLabel(assignmentsCorrectionTypeLabelText, pageContentAsDiv)
    );
    const maximumGradeLabelValue = normalizeTextValue(
      getValueByPartialLabel(assignmentsMaxGradingLabelText, pageContentAsDiv)
    );

    let maximumGrade = maximumGradeLabelValue;
    let maxGradeSource = maximumGrade ? "label" : "missing";

    if (!maximumGrade) {
      const totalGradeInput = pageContentAsDiv.querySelector(
        'input[id$="__TotalGrade"]'
      );
      const totalGradeInputValue = normalizeTextValue(totalGradeInput?.value);
      if (totalGradeInputValue) {
        maximumGrade = totalGradeInputValue;
        maxGradeSource = "total_grade_input";
      }
    }

    if (!maximumGrade) {
      const gradeInput = pageContentAsDiv.querySelector(
        'input[id^="List_"][id$="__Grade"]'
      );
      const gradeInputMaxValue = normalizeTextValue(
        gradeInput?.getAttribute("data-val-range-max")
      );
      if (gradeInputMaxValue) {
        maximumGrade = gradeInputMaxValue;
        maxGradeSource = "grade_input_data_val_range_max";
      }
    }

    const sourceType = sourceTypeLabelValue;
    const sourceTypeSource = sourceType ? "label" : "unknown";
    const isQuestionBank = sourceType === assignmentsCorrectionFromBankText;

    return {
      sourceType,
      sourceTypeSource,
      isQuestionBank,
      maximumGrade,
      maxGradeSource,
    };
  }

  function resolveSubmissionContext(pageContentAsDiv, pageURL) {
    let form = pageContentAsDiv.querySelector("#GradeAssignment");
    let strategy = form ? "grade_assignment_id" : "fallback_post_with_has_answer";

    if (!form) {
      const postForms = Array.from(pageContentAsDiv.querySelectorAll("form")).filter(
        (candidateForm) =>
          candidateForm.method?.trim().toLowerCase() === "post" &&
          candidateForm.querySelector('input[name$=".hasAnswer"]')
      );
      form = postForms[0] ?? null;
    }

    if (!form) {
      strategy = "missing_form";
    }

    const formURLInput = pageContentAsDiv.querySelector("#gradeAssignmentUrl");
    const gradeAssignmentUrl = normalizeTextValue(formURLInput?.value);
    const formAction = normalizeTextValue(form?.action);
    const fallbackPageUrl = normalizeTextValue(pageURL);
    const submitUrl = gradeAssignmentUrl ?? formAction ?? fallbackPageUrl;
    const submitUrlSource = gradeAssignmentUrl
      ? "grade_assignment_url_input"
      : formAction
      ? "form_action"
      : fallbackPageUrl
      ? "page_url"
      : "missing";

    const formData = form ? new FormData(form) : null;

    return {
      form,
      formData,
      submitUrl,
      strategy,
      submitUrlSource,
    };
  }

  function parseObjectLiteralValue(rawValue) {
    const value = String(rawValue ?? "").trim();
    if (!value) return null;

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }

    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return value;
    }

    if (/^(true|false)$/i.test(value)) {
      return value.toLowerCase();
    }

    if (value.includes(".val()")) {
      return null;
    }

    return value;
  }

  function parseObjectLiteralContent(rawObjectContent) {
    const objectContent = rawObjectContent ?? "";
    const parsed = {};
    const propertyPattern = /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^,\n]+)\s*,?/g;
    let propertyMatch = propertyPattern.exec(objectContent);

    while (propertyMatch) {
      const propertyKey = propertyMatch[1];
      const parsedValue = parseObjectLiteralValue(propertyMatch[2]);
      if (parsedValue !== null && parsedValue !== undefined) {
        parsed[propertyKey] = parsedValue;
      }
      propertyMatch = propertyPattern.exec(objectContent);
    }

    return parsed;
  }

  function resolveStudentsListContext(pageHtml, pageContentAsDiv, pageURL) {
    const loadStudentsBlockMatch = pageHtml.match(
      /function\s+loadStudents\s*\(\)\s*{([\s\S]*?)searchFunction\s*\(/m
    );
    if (!loadStudentsBlockMatch) {
      return null;
    }

    const loadStudentsBlock = loadStudentsBlockMatch[1];
    const searchUrlMatch = loadStudentsBlock.match(
      /(?:const|let|var)\s+SearchURL\s*=\s*["']([^"']+)["']/m
    );
    const paramsMatch = loadStudentsBlock.match(
      /(?:const|let|var)\s+param\s*=\s*{([\s\S]*?)}\s*;/m
    );

    if (!searchUrlMatch || !paramsMatch) {
      return null;
    }

    const staticParams = parseObjectLiteralContent(paramsMatch[1]);
    const studentsFilterElement = pageContentAsDiv.querySelector("#studentsFilter");
    const statusElement = pageContentAsDiv.querySelector("#Status");
    const sortOrderElement = pageContentAsDiv.querySelector("#SortOrder");

    const selectedStudentIds = studentsFilterElement
      ? Array.from(studentsFilterElement.querySelectorAll("option:checked"))
          .map((option) => option.value)
          .filter(Boolean)
      : [];
    const statusValue =
      normalizeTextValue(statusElement?.value) ??
      normalizeTextValue(statusElement?.querySelector("option")?.value) ??
      "All";
    const sortByValue =
      normalizeTextValue(sortOrderElement?.value) ??
      normalizeTextValue(sortOrderElement?.querySelector("option")?.value) ??
      "name_asc";

    const parsedPageSize = parseInt(String(staticParams.pageSize ?? ""), 10);
    const pageSize =
      Number.isNaN(parsedPageSize) || parsedPageSize < 1 ? 10 : parsedPageSize;

    const baseParams = {
      ...staticParams,
      status: statusValue,
      sortBy: sortByValue,
      pageNumber: "1",
      pageSize: String(pageSize),
    };

    if (selectedStudentIds.length) {
      baseParams.studentIds = selectedStudentIds;
    } else {
      delete baseParams.studentIds;
    }

    let searchUrl;
    try {
      searchUrl = new URL(searchUrlMatch[1], pageURL).toString();
    } catch {
      return null;
    }

    return {
      searchUrl,
      httpMethodCandidates: ["POST", "GET"],
      baseParams,
      pageSize,
      contextSource: "script",
    };
  }

  function buildRequestSearchParams(paramsObject) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(paramsObject ?? {})) {
      if (value === undefined || value === null) {
        continue;
      }

      if (Array.isArray(value)) {
        if (!value.length) {
          continue;
        }
        for (const item of value) {
          if (item === undefined || item === null || item === "") continue;
          searchParams.append(key, String(item));
        }
        continue;
      }

      searchParams.append(key, String(value));
    }

    return searchParams;
  }

  function toPositiveInteger(value) {
    if (value === null || value === undefined) return null;
    const normalized = toWesternDigits(String(value).trim());
    if (!normalized) return null;

    const numericMatch = normalized.match(/-?\d+(\.\d+)?/);
    if (!numericMatch) return null;

    const parsed = parseInt(numericMatch[0], 10);
    if (Number.isNaN(parsed) || parsed < 1) return null;
    return parsed;
  }

  function parseBooleanFieldValue(value) {
    if (value === null || value === undefined) return null;
    const normalizedValue = String(value).trim().toLowerCase();
    if (!normalizedValue) return null;

    if (["true", "1", "yes", "on"].includes(normalizedValue)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalizedValue)) {
      return false;
    }
    return null;
  }

  function parseNumericGradeValue(value) {
    if (value === null || value === undefined) return null;

    let normalizedValue = toWesternDigits(String(value))
      .replace(/٫/g, ".")
      .replace(/٬/g, "")
      .trim();
    if (!normalizedValue) return null;

    if (normalizedValue.includes(",") && !normalizedValue.includes(".")) {
      normalizedValue = normalizedValue.replace(/,/g, ".");
    } else {
      normalizedValue = normalizedValue.replace(/,/g, "");
    }

    const parsedValue = Number.parseFloat(normalizedValue);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  function resolveRowGradeContext(group, maximumGrade) {
    const epsilon = 0.0001;
    const hasAnswerInput = getGroupField(group, "hasanswer", {
      tagName: "input",
    });
    const hasAnswer = parseBooleanFieldValue(hasAnswerInput?.value);

    const gradeInput =
      getGroupField(group, "grade", {
        tagName: "input",
        excludeType: "hidden",
      }) ?? getGroupField(group, "grade");
    const gradeValue = parseNumericGradeValue(gradeInput?.value);

    const totalGradeInput = getGroupField(group, "totalgrade", {
      tagName: "input",
    });
    const rowMaxGrade =
      parseNumericGradeValue(totalGradeInput?.value) ??
      parseNumericGradeValue(maximumGrade);

    let gradeBand = "unknown";
    if (gradeValue !== null) {
      if (Math.abs(gradeValue) <= epsilon) {
        gradeBand = "zero";
      } else if (rowMaxGrade !== null) {
        gradeBand = Math.abs(gradeValue - rowMaxGrade) <= epsilon ? "full" : "partial";
      }
    }

    return {
      hasAnswer,
      gradeInput,
      gradeValue,
      rowMaxGrade,
      gradeBand,
    };
  }

  function getNumericValueFromKeys(payload, keys) {
    if (!payload || typeof payload !== "object") {
      return { value: null, key: null };
    }

    for (const key of keys) {
      if (!(key in payload)) continue;
      const parsedValue = toPositiveInteger(payload[key]);
      if (parsedValue !== null) {
        return { value: parsedValue, key };
      }
    }

    return { value: null, key: null };
  }

  function collectPaginationMetaCandidates(payload, candidates, depth = 0, path = "root") {
    if (depth > 6 || payload === null || payload === undefined) {
      return;
    }

    if (Array.isArray(payload)) {
      for (let index = 0; index < payload.length; index++) {
        collectPaginationMetaCandidates(
          payload[index],
          candidates,
          depth + 1,
          `${path}[${index}]`
        );
      }
      return;
    }

    if (typeof payload !== "object") {
      return;
    }

    const exactTotalPages = getNumericValueFromKeys(payload, [
      "totalPages",
      "TotalPages",
    ]);
    const variantTotalPages = getNumericValueFromKeys(payload, [
      "pageCount",
      "PageCount",
      "pagesCount",
      "PagesCount",
      "pageTotal",
      "PageTotal",
    ]);
    const totalCount = getNumericValueFromKeys(payload, [
      "totalCount",
      "TotalCount",
      "recordsCount",
      "RecordsCount",
      "itemsCount",
      "ItemsCount",
      "count",
      "Count",
    ]);
    const pageSize = getNumericValueFromKeys(payload, [
      "pageSize",
      "PageSize",
      "size",
      "Size",
      "perPage",
      "PerPage",
    ]);
    const currentPage = getNumericValueFromKeys(payload, [
      "pageNumber",
      "PageNumber",
      "currentPage",
      "CurrentPage",
      "page",
      "Page",
    ]);

    let totalPages = exactTotalPages.value ?? variantTotalPages.value;
    let sourceKey = exactTotalPages.key ?? variantTotalPages.key ?? null;
    let rank = exactTotalPages.value ? 4 : variantTotalPages.value ? 3 : 0;

    if (!totalPages && totalCount.value && pageSize.value) {
      totalPages = Math.ceil(totalCount.value / pageSize.value);
      sourceKey = "derived_totalCount_pageSize";
      rank = 2;
    }

    if (totalPages || totalCount.value || pageSize.value || currentPage.value) {
      candidates.push({
        totalPages,
        totalCount: totalCount.value,
        pageSize: pageSize.value,
        currentPage: currentPage.value,
        sourceKey,
        sourcePath: path,
        rank,
        depth,
      });
    }

    const preferredNestedKeys = [
      "result",
      "Result",
      "data",
      "Data",
      "meta",
      "Meta",
      "pagination",
      "Pagination",
      "pager",
      "Pager",
      "model",
      "Model",
    ];

    for (const preferredKey of preferredNestedKeys) {
      if (!(preferredKey in payload)) continue;
      collectPaginationMetaCandidates(
        payload[preferredKey],
        candidates,
        depth + 1,
        `${path}.${preferredKey}`
      );
    }

    for (const [nestedKey, nestedValue] of Object.entries(payload)) {
      if (preferredNestedKeys.includes(nestedKey)) continue;
      collectPaginationMetaCandidates(
        nestedValue,
        candidates,
        depth + 1,
        `${path}.${nestedKey}`
      );
    }
  }

  function extractPaginationMetaFromJsonPayload(payload) {
    const candidates = [];
    collectPaginationMetaCandidates(payload, candidates);
    if (!candidates.length) {
      return null;
    }

    candidates.sort((a, b) => b.rank - a.rank || a.depth - b.depth);
    const best = candidates[0];
    return {
      totalPages: best.totalPages ?? null,
      totalCount: best.totalCount ?? null,
      pageSize: best.pageSize ?? null,
      currentPage: best.currentPage ?? null,
      sourceKey: best.sourceKey ?? null,
      sourcePath: best.sourcePath ?? null,
    };
  }

  function extractHtmlFromJsonPayload(payload, depth = 0) {
    if (depth > 4 || payload === null || payload === undefined) {
      return null;
    }

    if (typeof payload === "string") {
      return payload.includes("<") ? payload : null;
    }

    if (Array.isArray(payload)) {
      for (const item of payload) {
        const htmlCandidate = extractHtmlFromJsonPayload(item, depth + 1);
        if (htmlCandidate) return htmlCandidate;
      }
      return null;
    }

    if (typeof payload === "object") {
      const preferredKeys = [
        "html",
        "Html",
        "content",
        "Content",
        "result",
        "Result",
        "data",
        "Data",
        "partialView",
        "PartialView",
        "view",
        "View",
      ];

      for (const key of preferredKeys) {
        if (!(key in payload)) continue;
        const htmlCandidate = extractHtmlFromJsonPayload(payload[key], depth + 1);
        if (htmlCandidate) return htmlCandidate;
      }

      for (const nestedValue of Object.values(payload)) {
        const htmlCandidate = extractHtmlFromJsonPayload(nestedValue, depth + 1);
        if (htmlCandidate) return htmlCandidate;
      }
    }

    return null;
  }

  function extractStudentsListHtml(responseText) {
    const trimmedResponse = String(responseText ?? "").trim();
    if (!trimmedResponse) {
      return { html: "", fromJson: false, paginationMeta: null };
    }

    if (
      (trimmedResponse.startsWith("{") && trimmedResponse.endsWith("}")) ||
      (trimmedResponse.startsWith("[") && trimmedResponse.endsWith("]"))
    ) {
      try {
        const parsedJson = JSON.parse(trimmedResponse);
        const paginationMeta = extractPaginationMetaFromJsonPayload(parsedJson);
        const htmlCandidate = extractHtmlFromJsonPayload(parsedJson);
        if (htmlCandidate) {
          return { html: htmlCandidate, fromJson: true, paginationMeta };
        }

        return {
          html: responseText ?? "",
          fromJson: true,
          paginationMeta,
        };
      } catch {
        // Keep raw response fallback.
      }
    }

    return { html: responseText ?? "", fromJson: false, paginationMeta: null };
  }

  async function fetchStudentsListPage(
    context,
    studentPageNumber,
    writeLog,
    pageURL,
    methodCandidates
  ) {
    const methods = methodCandidates?.length
      ? methodCandidates
      : context.httpMethodCandidates;
    const paramsObject = {
      ...context.baseParams,
      pageNumber: String(studentPageNumber),
      pageSize: String(context.pageSize ?? 10),
    };

    for (const method of methods) {
      const requestMethod = method.toUpperCase();
      const searchParams = buildRequestSearchParams(paramsObject);
      const requestUrl =
        requestMethod === "GET"
          ? `${context.searchUrl}${
              context.searchUrl.includes("?") ? "&" : "?"
            }${searchParams.toString()}`
          : context.searchUrl;

      writeLog("info", "students_endpoint_fetch_start", {
        pageURL,
        studentPageNumber,
        method: requestMethod,
        requestUrl,
      });

      try {
        const response = await fetch(requestUrl, {
          method: requestMethod,
          headers:
            requestMethod === "POST"
              ? {
                  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                  "X-Requested-With": "XMLHttpRequest",
                }
              : {
                  "X-Requested-With": "XMLHttpRequest",
                },
          body: requestMethod === "POST" ? searchParams.toString() : undefined,
          credentials: "include",
        });

        if (!response.ok) {
          writeLog("warn", "students_endpoint_fetch_failed", {
            pageURL,
            studentPageNumber,
            method: requestMethod,
            status: response.status,
          });
          continue;
        }

        const responseText = await response.text();
        const extracted = extractStudentsListHtml(responseText);
        if (!normalizeTextValue(extracted.html)) {
          writeLog("warn", "students_endpoint_fetch_failed", {
            pageURL,
            studentPageNumber,
            method: requestMethod,
            reason: "empty_response",
          });
          continue;
        }

        writeLog("info", "students_endpoint_fetch_success", {
          pageURL,
          studentPageNumber,
          method: requestMethod,
          status: response.status,
          fromJson: extracted.fromJson,
          metadataTotalPages: extracted.paginationMeta?.totalPages ?? null,
        });

        return {
          content: extracted.html,
          paginationMeta: extracted.paginationMeta ?? null,
          effectiveMethod: requestMethod,
          responseStatus: response.status,
        };
      } catch (error) {
        writeLog("warn", "students_endpoint_fetch_failed", {
          pageURL,
          studentPageNumber,
          method: requestMethod,
          message: error?.message,
        });
      }
    }

    return null;
  }

  function buildRowFieldGroups(listDiv) {
    const namedElements = Array.from(listDiv.querySelectorAll('[name^="List["]'));
    const groupsByIndex = new Map();

    for (const element of namedElements) {
      const fieldName = element.getAttribute("name");
      const fieldMatch = fieldName?.match(/^List\[(\d+)\]\.(.+)$/);
      if (!fieldMatch) continue;

      const index = fieldMatch[1];
      const fieldPath = fieldMatch[2];
      const fieldKey = fieldPath.split(/[.[\]]/)[0];
      if (!fieldKey) continue;

      if (!groupsByIndex.has(index)) {
        groupsByIndex.set(index, {
          index,
          allElements: [],
          fieldLookup: {},
        });
      }

      const group = groupsByIndex.get(index);
      group.allElements.push(element);

      const lookupKey = fieldKey.toLowerCase();
      if (!Array.isArray(group.fieldLookup[lookupKey])) {
        group.fieldLookup[lookupKey] = [];
      }
      group.fieldLookup[lookupKey].push(element);
    }

    return Array.from(groupsByIndex.values()).sort(
      (a, b) => Number(a.index) - Number(b.index)
    );
  }

  function parseStudentsListPagination(listDiv) {
    const paginationElement = listDiv.querySelector("#paginationId, ul.pagination");
    if (!paginationElement) {
      return { totalPages: null, rawPagination: null };
    }

    const rawPagination = normalizeTextValue(paginationElement.textContent);
    let totalPages = parseTotalPagesFromContainer(rawPagination ?? "");

    if (!totalPages) {
      const tokenValues = [];
      const paginatedNodes = paginationElement.querySelectorAll(
        "a,button,span,li,[data-page],[data-value]"
      );
      for (const node of paginatedNodes) {
        tokenValues.push(node.getAttribute("data-page") ?? "");
        tokenValues.push(node.getAttribute("data-value") ?? "");
        tokenValues.push(node.textContent ?? "");
      }

      const numericValues = tokenValues
        .map((token) => toWesternDigits(token))
        .flatMap((token) => token.match(/\d+/g) ?? [])
        .map((value) => parseInt(value, 10))
        .filter((value) => !Number.isNaN(value) && value > 0);
      if (numericValues.length) {
        totalPages = Math.max(...numericValues);
      }
    }

    return {
      totalPages: totalPages && totalPages > 0 ? totalPages : null,
      rawPagination,
    };
  }

  function parseStudentsListPage(listHtml, writeLog, details, paginationMeta) {
    const listDiv = parseHtmlContent(
      listHtml,
      writeLog,
      "students_page_parse_success",
      "students_page_parse_failed",
      details
    );
    if (!listDiv) return null;

    const rowFieldGroups = buildRowFieldGroups(listDiv);
    const pagination = parseStudentsListPagination(listDiv);
    const metadataTotalPages = toPositiveInteger(paginationMeta?.totalPages);
    const htmlTotalPages = pagination.totalPages;
    const totalPages = metadataTotalPages ?? htmlTotalPages ?? null;
    const totalPagesSource = metadataTotalPages
      ? "metadata"
      : htmlTotalPages
      ? "html"
      : "fallback";
    return {
      listDiv,
      rowFieldGroups,
      totalPages,
      totalPagesSource,
      htmlTotalPages,
      paginationMeta: paginationMeta ?? null,
      rawPagination: pagination.rawPagination,
    };
  }

  function getGroupField(group, fieldKey, options = {}) {
    const lookupKey = fieldKey.toLowerCase();
    const allCandidates = group.fieldLookup[lookupKey] ?? [];
    let candidates = allCandidates;

    if (options.tagName) {
      const targetTagName = options.tagName.toLowerCase();
      candidates = candidates.filter(
        (element) => element.tagName?.toLowerCase() === targetTagName
      );
    }

    if (options.type) {
      const targetType = options.type.toLowerCase();
      candidates = candidates.filter(
        (element) =>
          (element.type ?? element.getAttribute("type") ?? "").toLowerCase() ===
          targetType
      );
    }

    if (options.excludeType) {
      const excludedType = options.excludeType.toLowerCase();
      candidates = candidates.filter(
        (element) =>
          (element.type ?? element.getAttribute("type") ?? "").toLowerCase() !==
          excludedType
      );
    }

    return candidates[0] ?? null;
  }

  function applyQuickCorrectionToRowGroups({
    rowFieldGroups,
    isQuestionBank,
    maximumGrade,
    field1,
    field2,
    field3,
    checkbox1,
  }) {
    const counts = {
      feedbackFieldsCount: 0,
      commentsUpdated: 0,
      commentsSkipped: 0,
      gradesSet: 0,
      gradeInputsMissing: 0,
      outsideSystemFieldsMissing: 0,
      answeredRows: 0,
      unansweredRows: 0,
      unansweredRowsSkipped: 0,
      answeredRowsMissingGrade: 0,
      commentsWhitespaceOnlyTreatedAsEmpty: 0,
      fullGradeRows: 0,
      zeroGradeRows: 0,
      partialGradeRows: 0,
      unknownGradeRows: 0,
    };

    for (const group of rowFieldGroups) {
      const feedbackInput =
        getGroupField(group, "feedback", { tagName: "textarea" }) ??
        getGroupField(group, "feedback");
      if (!feedbackInput) {
        continue;
      }

      counts.feedbackFieldsCount += 1;

      const rowGradeContext = resolveRowGradeContext(group, maximumGrade);
      const gradeInput = rowGradeContext.gradeInput;
      const rawFeedbackValue = String(feedbackInput.value ?? "");
      const trimmedFeedbackValue = rawFeedbackValue.trim();
      if (!checkbox1 && rawFeedbackValue && !trimmedFeedbackValue) {
        counts.commentsWhitespaceOnlyTreatedAsEmpty += 1;
      }

      if (rowGradeContext.hasAnswer === true) {
        counts.answeredRows += 1;
      } else if (rowGradeContext.hasAnswer === false) {
        counts.unansweredRows += 1;
      }

      if (isQuestionBank && rowGradeContext.hasAnswer === false) {
        counts.unansweredRowsSkipped += 1;
        continue;
      }

      if (!gradeInput) {
        counts.gradeInputsMissing += 1;
        if (isQuestionBank && rowGradeContext.hasAnswer === true) {
          counts.answeredRowsMissingGrade += 1;
        }
        continue;
      }

      if (isQuestionBank && rowGradeContext.hasAnswer === true) {
        if (rowGradeContext.gradeValue === null) {
          counts.answeredRowsMissingGrade += 1;
          continue;
        }
        if (rowGradeContext.gradeBand === "zero") {
          counts.zeroGradeRows += 1;
        } else if (rowGradeContext.gradeBand === "full") {
          counts.fullGradeRows += 1;
        } else if (rowGradeContext.gradeBand === "partial") {
          counts.partialGradeRows += 1;
        } else {
          counts.unknownGradeRows += 1;
        }
      }

      if (!isQuestionBank) {
        const outsideSystemCheckbox = getGroupField(group, "isoutsidesystem", {
          tagName: "input",
          type: "checkbox",
        });
        if (!outsideSystemCheckbox) {
          counts.outsideSystemFieldsMissing += 1;
        } else if (!outsideSystemCheckbox.checked) {
          outsideSystemCheckbox.checked = true;
        }
      }

      if (!isQuestionBank && maximumGrade) {
        gradeInput.value = maximumGrade;
        counts.gradesSet += 1;
      }

      if (trimmedFeedbackValue && !checkbox1) {
        counts.commentsSkipped += 1;
        continue;
      }

      if (isQuestionBank) {
        if (rowGradeContext.gradeBand === "zero") {
          feedbackInput.value = field1;
        } else if (rowGradeContext.gradeBand === "full") {
          feedbackInput.value = field3;
        } else {
          feedbackInput.value = field2;
        }
      } else if (gradeInput.value == 0) {
        feedbackInput.value = field1;
      } else if (maximumGrade && gradeInput.value == maximumGrade) {
        feedbackInput.value = field3;
      } else {
        feedbackInput.value = field2;
      }

      counts.commentsUpdated += 1;
    }

    return counts;
  }

  function appendControlToFormData(formData, control) {
    if (!control?.name || control.disabled) {
      return;
    }

    const tagName = control.tagName?.toLowerCase();
    const controlType = (
      control.type ??
      control.getAttribute?.("type") ??
      ""
    ).toLowerCase();

    if (controlType === "file") {
      return;
    }

    if ((controlType === "checkbox" || controlType === "radio") && !control.checked) {
      return;
    }

    if (tagName === "select" && control.multiple) {
      const selectedOptions = Array.from(control.selectedOptions ?? []);
      if (!selectedOptions.length) {
        return;
      }

      for (const option of selectedOptions) {
        formData.append(control.name, option.value ?? "");
      }
      return;
    }

    formData.append(control.name, control.value ?? "");
  }

  function buildSubmissionFormData(mainFormDiv, rowFieldGroups, pageNumber) {
    const formData = new FormData();

    if (mainFormDiv) {
      const mainControls = mainFormDiv.querySelectorAll(
        "input[name], select[name], textarea[name]"
      );
      for (const control of mainControls) {
        if (control.name.startsWith("List[")) {
          continue;
        }
        appendControlToFormData(formData, control);
      }
    }

    for (const group of rowFieldGroups) {
      for (const control of group.allElements) {
        appendControlToFormData(formData, control);
      }
    }

    formData.delete("pageNumber");
    formData.append("pageNumber", String(pageNumber));
    return formData;
  }

  function recordGradingPageCounts(pageURL, counts, writeLog, stats, isQuestionBank) {
    const answeredRows = counts.answeredRows ?? 0;
    const unansweredRows = counts.unansweredRows ?? 0;
    const unansweredRowsSkipped = counts.unansweredRowsSkipped ?? 0;
    const answeredRowsMissingGrade = counts.answeredRowsMissingGrade ?? 0;
    const commentsWhitespaceOnlyTreatedAsEmpty =
      counts.commentsWhitespaceOnlyTreatedAsEmpty ?? 0;
    const fullGradeRows = counts.fullGradeRows ?? 0;
    const zeroGradeRows = counts.zeroGradeRows ?? 0;
    const partialGradeRows = counts.partialGradeRows ?? 0;
    const unknownGradeRows = counts.unknownGradeRows ?? 0;

    if (counts.feedbackFieldsCount) {
      safeConsole("log", "[AssignmentsQC] grading_feedback_fields_found_raw", {
        pageURL,
        fieldsCount: counts.feedbackFieldsCount,
        ts: Date.now(),
      });
      writeLog("info", "grading_feedback_fields_found", {
        pageURL,
        fieldsCount: counts.feedbackFieldsCount,
      });
    } else {
      safeConsole("log", "[AssignmentsQC] grading_feedback_fields_missing_raw", {
        pageURL,
        ts: Date.now(),
      });
      writeLog("warn", "grading_feedback_fields_missing", { pageURL });
    }

    stats.gradingPagesProcessed += 1;
    if (!counts.feedbackFieldsCount) {
      stats.gradingPagesWithNoFeedbackFields += 1;
    }
    stats.gradingGradeInputsMissing += counts.gradeInputsMissing;
    stats.gradingOutsideSystemFieldsMissing += counts.outsideSystemFieldsMissing;
    stats.studentsTotal += counts.feedbackFieldsCount;
    stats.gradesSet += counts.gradesSet;
    stats.commentsUpdated += counts.commentsUpdated;
    stats.commentsSkipped += counts.commentsSkipped;
    stats.bankAnsweredRows += answeredRows;
    stats.bankUnansweredRows += unansweredRows;
    stats.bankUnansweredRowsSkipped += unansweredRowsSkipped;
    stats.bankAnsweredRowsMissingGrade += answeredRowsMissingGrade;
    stats.commentsWhitespaceOnlyTreatedAsEmpty += commentsWhitespaceOnlyTreatedAsEmpty;
    stats.bankFullGradeRows += fullGradeRows;
    stats.bankZeroGradeRows += zeroGradeRows;
    stats.bankPartialGradeRows += partialGradeRows;
    stats.bankUnknownGradeRows += unknownGradeRows;

    writeLog("info", "grading_grade_inputs_missing_count", {
      pageURL,
      count: counts.gradeInputsMissing,
    });
    writeLog("info", "grading_outside_system_fields_missing_count", {
      pageURL,
      count: counts.outsideSystemFieldsMissing,
    });
    writeLog("info", "grades_set_count", {
      pageURL,
      count: counts.gradesSet,
    });
    writeLog("info", "comments_updated_count", {
      pageURL,
      count: counts.commentsUpdated,
    });
    writeLog("info", "comments_skipped_existing_count", {
      pageURL,
      count: counts.commentsSkipped,
    });
    writeLog("info", "comments_whitespace_only_treated_as_empty_count", {
      pageURL,
      count: commentsWhitespaceOnlyTreatedAsEmpty,
    });
    writeLog("info", "grading_students_processed", {
      pageURL,
      totalStudents: counts.feedbackFieldsCount,
      gradesSet: counts.gradesSet,
      commentsUpdated: counts.commentsUpdated,
      commentsSkipped: counts.commentsSkipped,
    });

    if (isQuestionBank) {
      writeLog("info", "bank_rows_classified", {
        pageURL,
        studentPageNumber: null,
        isQuestionBank: true,
        answeredRows,
        unansweredRows,
      });
      writeLog("info", "bank_unanswered_rows_skipped", {
        pageURL,
        studentPageNumber: null,
        isQuestionBank: true,
        count: unansweredRowsSkipped,
      });
      writeLog("info", "bank_answered_rows_missing_grade", {
        pageURL,
        studentPageNumber: null,
        isQuestionBank: true,
        count: answeredRowsMissingGrade,
      });
      writeLog("info", "bank_grade_note_distribution", {
        pageURL,
        studentPageNumber: null,
        isQuestionBank: true,
        zero: zeroGradeRows,
        partial: partialGradeRows,
        full: fullGradeRows,
        unknown: unknownGradeRows,
      });
      writeLog("info", "bank_comments_updated", {
        pageURL,
        studentPageNumber: null,
        isQuestionBank: true,
        count: counts.commentsUpdated,
      });
      writeLog("info", "bank_comments_skipped_existing", {
        pageURL,
        studentPageNumber: null,
        isQuestionBank: true,
        count: counts.commentsSkipped,
      });
    }
  }

  async function submitGradingFormData({
    pageURL,
    submissionContext,
    formData,
    writeLog,
    stats,
    studentPageNumber,
  }) {
    const pageDetails =
      studentPageNumber === undefined ? {} : { studentPageNumber };
    if (!hasAnsweredFields(formData)) {
      safeConsole("log", "[AssignmentsQC] submit_skipped_no_answered_fields_raw", {
        pageURL,
        ...pageDetails,
        ts: Date.now(),
      });
      stats.submitsSkippedNoAnswers += 1;
      writeLog("info", "submit_skipped_no_answered_fields", {
        pageURL,
        ...pageDetails,
      });
      return;
    }

    const submitMethod = submissionContext.form?.method || "POST";
    stats.submitsAttempted += 1;
    safeConsole("log", "[AssignmentsQC] submit_before", {
      pageURL,
      ...pageDetails,
      submitMethod,
      submitUrl: submissionContext.submitUrl,
      ts: Date.now(),
    });
    writeLog("info", "submit_attempt_started", {
      pageURL,
      ...pageDetails,
      submitUrl: submissionContext.submitUrl,
      submitUrlSource: submissionContext.submitUrlSource,
      submitMethod,
    });
    if (studentPageNumber !== undefined) {
      writeLog("info", "students_page_submit_attempt", {
        pageURL,
        studentPageNumber,
        submitMethod,
        submitUrlSource: submissionContext.submitUrlSource,
      });
    }

    try {
      const response = await fetch(submissionContext.submitUrl, {
        method: submitMethod,
        body: formData,
      });
      safeConsole("log", "[AssignmentsQC] submit_after", {
        pageURL,
        ...pageDetails,
        status: response?.status,
        ok: response?.ok,
        ts: Date.now(),
      });

      if (response && !response.ok) {
        stats.submitsFailed += 1;
        writeLog("error", "submit_failed_http", {
          pageURL,
          ...pageDetails,
          status: response.status,
          submitUrlSource: submissionContext.submitUrlSource,
          submitMethod,
        });
        if (studentPageNumber !== undefined) {
          writeLog("error", "students_page_submit_failed", {
            pageURL,
            studentPageNumber,
            status: response.status,
            submitMethod,
          });
        }
        return;
      }

      stats.submitsSucceeded += 1;
      writeLog("info", "submit_success", {
        pageURL,
        ...pageDetails,
        status: response?.status,
        submitUrlSource: submissionContext.submitUrlSource,
        submitMethod,
      });
      if (studentPageNumber !== undefined) {
        writeLog("info", "students_page_submit_success", {
          pageURL,
          studentPageNumber,
          status: response?.status,
          submitMethod,
        });
      }
    } catch (error) {
      safeConsole("log", "[AssignmentsQC] submit_exception_raw", {
        pageURL,
        ...pageDetails,
        message: error?.message,
        ts: Date.now(),
      });
      stats.submitsFailed += 1;
      writeLog("error", "submit_failed_exception", {
        pageURL,
        ...pageDetails,
        message: error?.message,
        stack: error?.stack,
      });
      if (studentPageNumber !== undefined) {
        writeLog("error", "students_page_submit_failed", {
          pageURL,
          studentPageNumber,
          message: error?.message,
        });
      }
    }
  }

  async function processGradingPageUsingShellSelectors({
    pageContentAsDiv,
    pageURL,
    field1,
    field2,
    field3,
    checkbox1,
    writeLog,
    stats,
    isQuestionBank,
    maximumGrade,
    submissionContext,
  }) {
    const rowFieldGroups = buildRowFieldGroups(pageContentAsDiv);
    const counts = applyQuickCorrectionToRowGroups({
      rowFieldGroups,
      isQuestionBank,
      maximumGrade,
      field1,
      field2,
      field3,
      checkbox1,
    });

    recordGradingPageCounts(pageURL, counts, writeLog, stats, isQuestionBank);

    if (!submissionContext.form) {
      return;
    }
    const formData = new FormData(submissionContext.form);
    await submitGradingFormData({
      pageURL,
      submissionContext,
      formData,
      writeLog,
      stats,
    });
  }

  async function onQuickCorrection(element, quickConfig) {
    safeConsole("log", "[AssignmentsQC] onQuickCorrection_enter", {
      href: element?.href,
      text: element?.textContent,
      hasQuickConfig: Boolean(quickConfig),
      ts: Date.now(),
    });

    const runId = createRunId("quick");
    const writeLog = createAssignmentsLogger(runId);
    const startedAt = Date.now();
    let runState = "started";
    let overlayCreated = false;
    const stats = {
      listingBranches: 0,
      listingPagesFetched: 0,
      listingUrlsCollected: 0,
      listingUrlsUnique: 0,
      gradingPagesProcessed: 0,
      gradingPagesWithNoFeedbackFields: 0,
      gradingGradeInputsMissing: 0,
      gradingOutsideSystemFieldsMissing: 0,
      studentsTotal: 0,
      gradesSet: 0,
      commentsUpdated: 0,
      commentsSkipped: 0,
      submitsAttempted: 0,
      submitsSucceeded: 0,
      submitsSkippedNoAnswers: 0,
      submitsSkippedMissingFormOrUrl: 0,
      submitsFailed: 0,
      bankAnsweredRows: 0,
      bankUnansweredRows: 0,
      bankUnansweredRowsSkipped: 0,
      bankAnsweredRowsMissingGrade: 0,
      commentsWhitespaceOnlyTreatedAsEmpty: 0,
      bankFullGradeRows: 0,
      bankZeroGradeRows: 0,
      bankPartialGradeRows: 0,
      bankUnknownGradeRows: 0,
    };

    writeLog("info", "quick_correction_start", {
      mode: quickConfig ? "preconfigured" : "popup",
      elementText: element.textContent,
      pageUrl: element.href,
    });
    rawConsoleLog("quick_correction_start_raw", {
      runId,
      mode: quickConfig ? "preconfigured" : "popup",
      pageUrl: element.href,
    });

    try {
      let field1;
      let field2;
      let field3;
      let checkbox1;

      if (quickConfig) {
        field1 = quickConfig.field1;
        field2 = quickConfig.field2;
        field3 = quickConfig.field3;
        checkbox1 = quickConfig.checkbox1;
        rawConsoleLog("config_preconfigured_received", {
          runId,
          overwriteComments: checkbox1,
        });
        writeLog("info", "config_received", {
          configSource: "preconfigured",
          overwriteComments: checkbox1,
          field1Length: (field1 ?? "").length,
          field2Length: (field2 ?? "").length,
          field3Length: (field3 ?? "").length,
        });
      } else {
        safeConsole("log", "[AssignmentsQC] popup_before_open", { runId, ts: Date.now() });
        writeLog("info", "popup_opened");
        let config;
        try {
          config = await createInputPopup();
          safeConsole("log", "[AssignmentsQC] popup_after_submit", {
            runId,
            ts: Date.now(),
          });
          writeLog("info", "popup_submitted");
        } catch (error) {
          runState = "popup_cancelled";
          safeConsole("log", "[AssignmentsQC] popup_cancelled_raw", {
            runId,
            message: error?.message,
            ts: Date.now(),
          });
          writeLog("warn", "popup_cancelled", {
            message: error?.message,
          });
          return;
        }

        field1 = config.field1;
        field2 = config.field2;
        field3 = config.field3;
        checkbox1 = config.checkbox1;
        writeLog("info", "config_received", {
          configSource: "popup",
          overwriteComments: checkbox1,
          field1Length: (field1 ?? "").length,
          field2Length: (field2 ?? "").length,
          field3Length: (field3 ?? "").length,
        });
      }

      safeConsole("log", "[AssignmentsQC] overlay_before_create", { runId, ts: Date.now() });
      createLoadingOverlay();
      overlayCreated = true;
      safeConsole("log", "[AssignmentsQC] overlay_after_create", { runId, ts: Date.now() });
      writeLog("info", "overlay_created");

      const url = element.href;
      const autoCorrectionPageURLSet = new Set();
      rawConsoleLog("listing_phase_start", { runId, url });

      if (element.textContent.includes(assignmentsAnswersButtonText)) {
        autoCorrectionPageURLSet.add(url);
        stats.listingUrlsCollected += 1;
        writeLog("info", "listing_complete", {
          directEntry: true,
          totalCollected: stats.listingUrlsCollected,
          totalUnique: autoCorrectionPageURLSet.size,
        });
      } else {
        for (const isDue of [true, false]) {
          stats.listingBranches += 1;
          writeLog("info", "listing_branch_start", { isDue });

          const firstPageUrl = buildListingPageUrl(url, 1, isDue);
          safeConsole("log", "[AssignmentsQC] listing_fetch_before", {
            runId,
            isDue,
            pageNumber: 1,
            url: firstPageUrl,
            ts: Date.now(),
          });
          writeLog("info", "listing_page_fetch_start", {
            isDue,
            pageNumber: 1,
            url: firstPageUrl,
          });

          const firstPageContent = await fetchLinkContent(firstPageUrl);
          safeConsole("log", "[AssignmentsQC] listing_fetch_after", {
            runId,
            isDue,
            pageNumber: 1,
            url: firstPageUrl,
            success: Boolean(firstPageContent),
            ts: Date.now(),
          });
          stats.listingPagesFetched += 1;
          if (!firstPageContent) {
            writeLog("warn", "listing_page_fetch_failed", {
              isDue,
              pageNumber: 1,
              url: firstPageUrl,
            });
            continue;
          }

          writeLog("info", "listing_page_fetch_success", {
            isDue,
            pageNumber: 1,
            url: firstPageUrl,
          });
          const firstPageDiv = parseHtmlContent(
            firstPageContent,
            writeLog,
            "listing_page_parse_success",
            "listing_page_parse_failed",
            { isDue, pageNumber: 1, url: firstPageUrl }
          );
          if (!firstPageDiv) {
            continue;
          }

          const firstPageAlerts = Array.from(
            firstPageDiv.querySelectorAll("div.alert")
          );
          const noResultsInFirstPage = firstPageAlerts.some((alertDiv) =>
            alertDiv.innerText.includes(assignmentsErrorText)
          );
          if (noResultsInFirstPage) {
            writeLog("info", "listing_no_results", { isDue, pageNumber: 1 });
            continue;
          }

          const paginationContainer = firstPageDiv.querySelector(
            "#pagination-container"
          );
          const rawPaginationText = paginationContainer?.textContent ?? "";
          const parsedTotalPages = parseTotalPagesFromContainer(rawPaginationText);
          const totalPages = parsedTotalPages ?? 1;

          if (parsedTotalPages) {
            writeLog("info", "listing_page_count_parsed", {
              isDue,
              rawText: rawPaginationText,
              totalPages,
            });
          } else {
            writeLog("warn", "listing_page_count_fallback", {
              isDue,
              rawText: rawPaginationText || null,
              defaultTotalPages: 1,
            });
          }

          for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
            let parentContent = firstPageContent;
            let parentContentAsDiv = firstPageDiv;

            if (pageNumber > 1) {
              const pageUrl = buildListingPageUrl(url, pageNumber, isDue);
              safeConsole("log", "[AssignmentsQC] listing_fetch_before", {
                runId,
                isDue,
                pageNumber,
                url: pageUrl,
                ts: Date.now(),
              });
              writeLog("info", "listing_page_fetch_start", {
                isDue,
                pageNumber,
                url: pageUrl,
              });

              parentContent = await fetchLinkContent(pageUrl);
              safeConsole("log", "[AssignmentsQC] listing_fetch_after", {
                runId,
                isDue,
                pageNumber,
                url: pageUrl,
                success: Boolean(parentContent),
                ts: Date.now(),
              });
              stats.listingPagesFetched += 1;
              if (!parentContent) {
                writeLog("warn", "listing_page_fetch_failed", {
                  isDue,
                  pageNumber,
                  url: pageUrl,
                });
                continue;
              }

              writeLog("info", "listing_page_fetch_success", {
                isDue,
                pageNumber,
                url: pageUrl,
              });
              parentContentAsDiv = parseHtmlContent(
                parentContent,
                writeLog,
                "listing_page_parse_success",
                "listing_page_parse_failed",
                { isDue, pageNumber, url: pageUrl }
              );
              if (!parentContentAsDiv) {
                continue;
              }
            }

            const pageAlerts = Array.from(
              parentContentAsDiv.querySelectorAll("div.alert")
            );
            const noResultsOnPage = pageAlerts.some((alertDiv) =>
              alertDiv.innerText.includes(assignmentsErrorText)
            );
            if (noResultsOnPage) {
              writeLog("info", "listing_no_results", { isDue, pageNumber });
              break;
            }

            const autoCorrectionPageURLsOnPage = findLinksWithText(
              assignmentsAnswersButtonText,
              parentContentAsDiv
            );

            const autoCorrectionPageURLsOnPageAlt = findLinksWithText(
              assignmentsAnswersButtonTextAlt,
              parentContentAsDiv
            );

            const urlsOnPage = [
              ...autoCorrectionPageURLsOnPage.map((link) => link.href),
              ...autoCorrectionPageURLsOnPageAlt.map((link) => link.href),
            ];
            const pageCollected = urlsOnPage.length;
            stats.listingUrlsCollected += pageCollected;

            for (const pageUrl of urlsOnPage) {
              autoCorrectionPageURLSet.add(pageUrl);
            }

            writeLog("info", "listing_urls_collected", {
              isDue,
              pageNumber,
              pageCollected,
              cumulativeCollected: stats.listingUrlsCollected,
              cumulativeUnique: autoCorrectionPageURLSet.size,
            });
          }
        }

        writeLog("info", "listing_complete", {
          directEntry: false,
          totalCollected: stats.listingUrlsCollected,
          totalUnique: autoCorrectionPageURLSet.size,
        });
      }

      const autoCorrectionPageURLs = [...autoCorrectionPageURLSet];
      stats.listingUrlsUnique = autoCorrectionPageURLs.length;
      rawConsoleLog("grading_queue_urls_resolved", {
        runId,
        urlsCount: autoCorrectionPageURLs.length,
      });
      if (!autoCorrectionPageURLs.length) {
        runState = "completed_no_urls";
        safeConsole("log", "[AssignmentsQC] early_return_no_urls", {
          runId,
          ts: Date.now(),
        });
        writeLog("warn", "listing_complete_no_urls", {
          directEntry: element.textContent.includes(assignmentsAnswersButtonText),
        });
      }

      writeLog("info", "grading_queue_start", {
        queuedPages: autoCorrectionPageURLs.length,
      });

      for (const pageURL of autoCorrectionPageURLs) {
        safeConsole("log", "[AssignmentsQC] grading_page_before", {
          runId,
          pageURL,
          ts: Date.now(),
        });
        await processGradingPage(
          pageURL,
          field1,
          field2,
          field3,
          checkbox1,
          writeLog,
          stats
        );
        safeConsole("log", "[AssignmentsQC] grading_page_after", {
          runId,
          pageURL,
          ts: Date.now(),
        });

        // Check for additional pages via pagination
        const initialPageContent = await fetchLinkContent(pageURL);
        if (!initialPageContent) {
          writeLog("warn", "grading_pagination_fetch_failed", { pageURL });
          continue;
        }
        writeLog("info", "grading_pagination_fetch_success", { pageURL });
        const initialPageContentAsDiv = parseHtmlContent(
          initialPageContent,
          writeLog,
          "grading_pagination_parse_success",
          "grading_pagination_parse_failed",
          { pageURL }
        );
        if (!initialPageContentAsDiv) {
          continue;
        }

        // Check for pagination
        const paginationElement =
          initialPageContentAsDiv.querySelector("ul.pagination");
        if (paginationElement) {
          const pageLinks = paginationElement.querySelectorAll(
            "li.page-item a.page-link"
          );
          const pageUrls = new Set(); // Use Set to avoid duplicates

          // Extract all page URLs
          for (const pageLink of pageLinks) {
            const href = pageLink.getAttribute("href");
            if (href && !pageLink.classList.contains("disabled")) {
              // Make sure we have the full URL
              const fullPageUrl = href.startsWith("http")
                ? href
                : href.startsWith("/")
                ? window.location.origin + href
                : pageURL;
              pageUrls.add(fullPageUrl);
            }
          }

          // Process each pagination page (excluding the first page which we already processed)
          for (const additionalPageUrl of pageUrls) {
            if (additionalPageUrl !== pageURL) {
              await processGradingPage(
                additionalPageUrl,
                field1,
                field2,
                field3,
                checkbox1,
                writeLog,
                stats
              );
            }
          }
        }
      }
      writeLog("info", "grading_queue_complete", {
        queuedPages: autoCorrectionPageURLs.length,
        gradingPagesProcessed: stats.gradingPagesProcessed,
      });
      if (runState === "started") {
        runState = "completed";
      }
    } catch (error) {
      runState = "failed";
      safeConsole("log", "[AssignmentsQC] onQuickCorrection_catch", {
        runId,
        message: error?.message,
        ts: Date.now(),
      });
      writeLog("error", "quick_correction_failed", {
        message: error?.message,
        stack: error?.stack,
      });
      safeConsole("log", error);
    } finally {
      safeConsole("log", "[AssignmentsQC] onQuickCorrection_finally_before_remove_overlay", {
        runId,
        runState,
        ts: Date.now(),
      });
      removeLoadingOverlay();
      if (overlayCreated) {
        safeConsole("log", "[AssignmentsQC] overlay_after_remove", { runId, ts: Date.now() });
        writeLog("info", "overlay_removed");
      }
      writeLog("info", "quick_correction_complete", {
        runState,
        elapsedMs: Date.now() - startedAt,
        ...stats,
      });
    }
  }

  // Helper function to process a single grading page
  async function processGradingPage(
    pageURL,
    field1,
    field2,
    field3,
    checkbox1,
    writeLog,
    stats
  ) {
    safeConsole("log", "[AssignmentsQC] processGradingPage_enter", {
      pageURL,
      ts: Date.now(),
    });
    writeLog("info", "grading_page_start", { pageURL });
    safeConsole("log", "[AssignmentsQC] grading_fetch_before", { pageURL, ts: Date.now() });
    const pageContent = await fetchLinkContent(pageURL);
    safeConsole("log", "[AssignmentsQC] grading_fetch_after", {
      pageURL,
      success: Boolean(pageContent),
      ts: Date.now(),
    });
    if (!pageContent) {
      writeLog("warn", "grading_page_fetch_failed", { pageURL });
      return;
    }
    writeLog("info", "grading_page_fetch_success", { pageURL });

    const pageContentAsDiv = parseHtmlContent(
      pageContent,
      writeLog,
      "grading_page_parse_success",
      "grading_page_parse_failed",
      { pageURL }
    );
    if (!pageContentAsDiv) {
      return;
    }

    const {
      sourceType,
      sourceTypeSource,
      isQuestionBank,
      maximumGrade,
      maxGradeSource,
    } = resolveAssignmentMetadata(pageContentAsDiv);
    safeConsole("log", "[AssignmentsQC] grading_metadata_raw", {
      pageURL,
      sourceType,
      sourceTypeSource,
      maximumGrade,
      maxGradeSource,
      isQuestionBank,
      ts: Date.now(),
    });

    writeLog("info", "grading_metadata_resolved", {
      pageURL,
      sourceType: sourceType ?? "unknown",
      sourceTypeSource,
      maximumGrade: maximumGrade ?? "unknown",
      maxGradeSource,
      isQuestionBank,
    });

    if (!sourceType) {
      writeLog("warn", "grading_source_type_missing", { pageURL });
    }

    if (maxGradeSource !== "label" || sourceTypeSource !== "label") {
      writeLog("info", "grading_metadata_fallback_used", {
        pageURL,
        sourceTypeSource,
        maxGradeSource,
      });
    }

    if (!maximumGrade) {
      writeLog("warn", "grading_max_grade_missing", { pageURL });
    }

    const submissionContext = resolveSubmissionContext(pageContentAsDiv, pageURL);
    writeLog("info", "submission_context_resolved", {
      pageURL,
      strategy: submissionContext.strategy,
      submitUrlSource: submissionContext.submitUrlSource,
      hasForm: Boolean(submissionContext.form),
      hasFormData: Boolean(submissionContext.formData),
      hasSubmitUrl: Boolean(submissionContext.submitUrl),
    });

    if (!submissionContext.form || !submissionContext.submitUrl) {
      safeConsole("log", "[AssignmentsQC] submit_context_missing_raw", {
        pageURL,
        hasForm: Boolean(submissionContext.form),
        hasFormData: Boolean(submissionContext.formData),
        hasSubmitUrl: Boolean(submissionContext.submitUrl),
        ts: Date.now(),
      });
      stats.submitsSkippedMissingFormOrUrl += 1;
      writeLog("warn", "submit_skipped_missing_form_or_url", {
        pageURL,
        strategy: submissionContext.strategy,
        submitUrlSource: submissionContext.submitUrlSource,
      });
      return;
    }

    const studentsContext = resolveStudentsListContext(
      pageContent,
      pageContentAsDiv,
      pageURL
    );
    if (!studentsContext) {
      writeLog("warn", "students_endpoint_context_missing", { pageURL });
      await processGradingPageUsingShellSelectors({
        pageContentAsDiv,
        pageURL,
        field1,
        field2,
        field3,
        checkbox1,
        writeLog,
        stats,
        isQuestionBank,
        maximumGrade,
        submissionContext,
      });
      return;
    }

    writeLog("info", "students_endpoint_context_resolved", {
      pageURL,
      searchUrl: studentsContext.searchUrl,
      methods: studentsContext.httpMethodCandidates,
      pageSize: studentsContext.pageSize,
      contextSource: studentsContext.contextSource,
      baseParamsCount: Object.keys(studentsContext.baseParams).length,
    });

    let firstPageResult = await fetchStudentsListPage(
      studentsContext,
      1,
      writeLog,
      pageURL
    );
    if (!firstPageResult) {
      writeLog("warn", "students_endpoint_rows_missing_all_pages", {
        pageURL,
        reason: "first_page_fetch_failed",
      });
      recordGradingPageCounts(
        pageURL,
        {
          feedbackFieldsCount: 0,
          commentsUpdated: 0,
          commentsSkipped: 0,
          gradesSet: 0,
          gradeInputsMissing: 0,
          outsideSystemFieldsMissing: 0,
        },
        writeLog,
        stats,
        isQuestionBank
      );
      return;
    }

    let firstPageParsed = parseStudentsListPage(
      firstPageResult.content,
      writeLog,
      {
        pageURL,
        studentPageNumber: 1,
        method: firstPageResult.effectiveMethod,
      },
      firstPageResult.paginationMeta
    );
    if (!firstPageParsed) {
      writeLog("warn", "students_endpoint_rows_missing_all_pages", {
        pageURL,
        reason: "first_page_parse_failed",
      });
      recordGradingPageCounts(
        pageURL,
        {
          feedbackFieldsCount: 0,
          commentsUpdated: 0,
          commentsSkipped: 0,
          gradesSet: 0,
          gradeInputsMissing: 0,
          outsideSystemFieldsMissing: 0,
        },
        writeLog,
        stats,
        isQuestionBank
      );
      return;
    }

    let effectiveMethod = firstPageResult.effectiveMethod;
    if (
      firstPageParsed.rowFieldGroups.length === 0 &&
      firstPageResult.effectiveMethod === "POST" &&
      studentsContext.httpMethodCandidates.includes("GET")
    ) {
      writeLog("info", "students_endpoint_method_fallback_used", {
        pageURL,
        fromMethod: "POST",
        toMethod: "GET",
        reason: "no_rows_on_first_page",
      });

      const getFallbackResult = await fetchStudentsListPage(
        studentsContext,
        1,
        writeLog,
        pageURL,
        ["GET"]
      );
      if (getFallbackResult) {
        const parsedGetFallback = parseStudentsListPage(
          getFallbackResult.content,
          writeLog,
          {
            pageURL,
            studentPageNumber: 1,
            method: getFallbackResult.effectiveMethod,
          },
          getFallbackResult.paginationMeta
        );
        if (parsedGetFallback) {
          firstPageResult = getFallbackResult;
          firstPageParsed = parsedGetFallback;
          effectiveMethod = getFallbackResult.effectiveMethod;
        }
      }
    }

    const totalStudentPages = firstPageParsed.totalPages ?? 1;
    if (
      firstPageParsed.totalPages &&
      firstPageParsed.totalPagesSource === "metadata"
    ) {
      writeLog("info", "students_page_count_from_metadata", {
        pageURL,
        totalPages: totalStudentPages,
        currentPage: firstPageParsed.paginationMeta?.currentPage ?? null,
        sourceKey: firstPageParsed.paginationMeta?.sourceKey ?? null,
        sourcePath: firstPageParsed.paginationMeta?.sourcePath ?? null,
      });
    } else if (firstPageParsed.totalPages) {
      writeLog("info", "students_page_count_parsed", {
        pageURL,
        totalPages: totalStudentPages,
        rawPagination: firstPageParsed.rawPagination,
      });
    } else {
      writeLog("warn", "students_page_count_fallback", {
        pageURL,
        defaultTotalPages: 1,
        rawPagination: firstPageParsed.rawPagination,
      });
    }

    const aggregateCounts = {
      feedbackFieldsCount: 0,
      commentsUpdated: 0,
      commentsSkipped: 0,
      gradesSet: 0,
      gradeInputsMissing: 0,
      outsideSystemFieldsMissing: 0,
      answeredRows: 0,
      unansweredRows: 0,
      unansweredRowsSkipped: 0,
      answeredRowsMissingGrade: 0,
      commentsWhitespaceOnlyTreatedAsEmpty: 0,
      fullGradeRows: 0,
      zeroGradeRows: 0,
      partialGradeRows: 0,
      unknownGradeRows: 0,
    };
    let foundRows = false;

    for (
      let studentPageNumber = 1;
      studentPageNumber <= totalStudentPages;
      studentPageNumber++
    ) {
      let parsedPage = firstPageParsed;
      if (studentPageNumber > 1) {
        const pageResult = await fetchStudentsListPage(
          studentsContext,
          studentPageNumber,
          writeLog,
          pageURL,
          [effectiveMethod]
        );
        if (!pageResult) {
          continue;
        }

        parsedPage = parseStudentsListPage(
          pageResult.content,
          writeLog,
          {
            pageURL,
            studentPageNumber,
            method: pageResult.effectiveMethod,
          },
          pageResult.paginationMeta
        );
        if (!parsedPage) {
          continue;
        }
      }

      if (!parsedPage.rowFieldGroups.length) {
        writeLog("warn", "students_rows_missing", {
          pageURL,
          studentPageNumber,
        });
        continue;
      }

      foundRows = true;
      writeLog("info", "students_rows_found", {
        pageURL,
        studentPageNumber,
        rowGroupsCount: parsedPage.rowFieldGroups.length,
      });

      const pageCounts = applyQuickCorrectionToRowGroups({
        rowFieldGroups: parsedPage.rowFieldGroups,
        isQuestionBank,
        maximumGrade,
        field1,
        field2,
        field3,
        checkbox1,
      });
      aggregateCounts.feedbackFieldsCount += pageCounts.feedbackFieldsCount;
      aggregateCounts.commentsUpdated += pageCounts.commentsUpdated;
      aggregateCounts.commentsSkipped += pageCounts.commentsSkipped;
      aggregateCounts.gradesSet += pageCounts.gradesSet;
      aggregateCounts.gradeInputsMissing += pageCounts.gradeInputsMissing;
      aggregateCounts.outsideSystemFieldsMissing +=
        pageCounts.outsideSystemFieldsMissing;
      aggregateCounts.answeredRows += pageCounts.answeredRows;
      aggregateCounts.unansweredRows += pageCounts.unansweredRows;
      aggregateCounts.unansweredRowsSkipped += pageCounts.unansweredRowsSkipped;
      aggregateCounts.answeredRowsMissingGrade += pageCounts.answeredRowsMissingGrade;
      aggregateCounts.commentsWhitespaceOnlyTreatedAsEmpty +=
        pageCounts.commentsWhitespaceOnlyTreatedAsEmpty;
      aggregateCounts.fullGradeRows += pageCounts.fullGradeRows;
      aggregateCounts.zeroGradeRows += pageCounts.zeroGradeRows;
      aggregateCounts.partialGradeRows += pageCounts.partialGradeRows;
      aggregateCounts.unknownGradeRows += pageCounts.unknownGradeRows;

      if (isQuestionBank) {
        writeLog("info", "bank_rows_classified", {
          pageURL,
          studentPageNumber,
          isQuestionBank: true,
          answeredRows: pageCounts.answeredRows,
          unansweredRows: pageCounts.unansweredRows,
        });
        writeLog("info", "bank_unanswered_rows_skipped", {
          pageURL,
          studentPageNumber,
          isQuestionBank: true,
          count: pageCounts.unansweredRowsSkipped,
        });
        writeLog("info", "bank_answered_rows_missing_grade", {
          pageURL,
          studentPageNumber,
          isQuestionBank: true,
          count: pageCounts.answeredRowsMissingGrade,
        });
        writeLog("info", "bank_grade_note_distribution", {
          pageURL,
          studentPageNumber,
          isQuestionBank: true,
          zero: pageCounts.zeroGradeRows,
          partial: pageCounts.partialGradeRows,
          full: pageCounts.fullGradeRows,
          unknown: pageCounts.unknownGradeRows,
        });
        writeLog("info", "bank_comments_updated", {
          pageURL,
          studentPageNumber,
          isQuestionBank: true,
          count: pageCounts.commentsUpdated,
        });
        writeLog("info", "bank_comments_skipped_existing", {
          pageURL,
          studentPageNumber,
          isQuestionBank: true,
          count: pageCounts.commentsSkipped,
        });
      }

      const formData = buildSubmissionFormData(
        submissionContext.form,
        parsedPage.rowFieldGroups,
        studentPageNumber
      );
      await submitGradingFormData({
        pageURL,
        submissionContext,
        formData,
        writeLog,
        stats,
        studentPageNumber,
      });
    }

    if (!foundRows) {
      writeLog("warn", "students_endpoint_rows_missing_all_pages", {
        pageURL,
        totalStudentPages,
      });
    }

    recordGradingPageCounts(
      pageURL,
      aggregateCounts,
      writeLog,
      stats,
      isQuestionBank
    );
  }

  setupDebugPanelGlobals();

  const assignmentIndexUrlMarkers = [
    "https://schools.madrasati.sa/Teacher/Assignments/Index",
    "https://madrasati.sa/Teacher/Assignments/Index",
  ];
  const injectorRunId = createRunId("injector");
  const writeInjectorLog = createAssignmentsLogger(injectorRunId);

  safeConsole("log", "[AssignmentsQC] injector_enter", {
    injectorRunId,
    currentUrl: window.location.href,
    ts: Date.now(),
  });
  writeInjectorLog("info", "assignments_injector_start", {
    currentUrl: window.location.href,
  });

  const matchedUrlMarker = assignmentIndexUrlMarkers.find((urlMarker) =>
    window.location.href.startsWith(urlMarker)
  );

  if (!matchedUrlMarker) {
    safeConsole("log", "[AssignmentsQC] injector_url_skip", {
      injectorRunId,
      currentUrl: window.location.href,
      ts: Date.now(),
    });
    writeInjectorLog("info", "assignments_injector_url_skip", {
      currentUrl: window.location.href,
    });
    return;
  }
  safeConsole("log", "[AssignmentsQC] injector_url_match", {
    injectorRunId,
    currentUrl: window.location.href,
    matchedUrlMarker,
    ts: Date.now(),
  });
  writeInjectorLog("info", "assignments_injector_url_match", {
    currentUrl: window.location.href,
    matchedUrlMarker,
  });

  const elements = findLinksWithText(assignmentsButtonText);

  const anchors = document.querySelectorAll("a");
  const massButton = Array.from(anchors).find((anchor) =>
    anchor.textContent.includes(assignmentsAddButtonText)
  );

  writeInjectorLog("info", "assignments_links_discovered", {
    assignmentsButtonsCount: elements.length,
    anchorsCount: anchors.length,
  });
  safeConsole("log", "[AssignmentsQC] injector_links_discovered_raw", {
    injectorRunId,
    assignmentsButtonsCount: elements.length,
    anchorsCount: anchors.length,
    ts: Date.now(),
  });
  if (massButton) {
    writeInjectorLog("info", "assignments_mass_button_found", {
      text: massButton.textContent,
    });
  } else {
    writeInjectorLog("warn", "assignments_mass_button_missing");
  }

  function delay(seconds) {
    return new Promise((resolve) => {
      setTimeout(() => resolve(), seconds * 1000);
    });
  }

  function safeAddSiblingButton(
    element,
    buttonText,
    onClickEvent,
    contextDetails = {}
  ) {
    if (!element) {
      safeConsole("log", "[AssignmentsQC] button_injection_missing_anchor_raw", {
        injectorRunId,
        buttonText,
        contextDetails,
        ts: Date.now(),
      });
      writeInjectorLog("warn", "button_injection_skipped_missing_anchor", {
        buttonText,
        ...contextDetails,
      });
      return false;
    }

    try {
      safeConsole("log", "[AssignmentsQC] button_injection_before", {
        injectorRunId,
        buttonText,
        contextDetails,
        ts: Date.now(),
      });
      addSiblingButton(element, buttonText, onClickEvent);
      safeConsole("log", "[AssignmentsQC] button_injection_after_success", {
        injectorRunId,
        buttonText,
        contextDetails,
        ts: Date.now(),
      });
      writeInjectorLog("info", "button_injected", {
        buttonText,
        ...contextDetails,
      });
      return true;
    } catch (error) {
      safeConsole("log", "[AssignmentsQC] button_injection_after_failure", {
        injectorRunId,
        buttonText,
        contextDetails,
        message: error?.message,
        ts: Date.now(),
      });
      writeInjectorLog("error", "button_injection_failed", {
        buttonText,
        ...contextDetails,
        message: error?.message,
        stack: error?.stack,
      });
      return false;
    }
  }

  safeAddSiblingButton(
    massButton,
    assignmentsMassCorrectButtonText,
    async () => {
      safeConsole("log", "[AssignmentsQC] mass_button_clicked", {
        injectorRunId,
        elementsCount: elements.length,
        ts: Date.now(),
      });
      writeInjectorLog("info", "mass_correction_click_start", {
        elementsCount: elements.length,
      });
      let config;
      try {
        writeInjectorLog("info", "popup_opened", { mode: "mass_correction" });
        config = await createInputPopup();
        writeInjectorLog("info", "popup_submitted", { mode: "mass_correction" });
      } catch (error) {
        writeInjectorLog("warn", "popup_cancelled", {
          mode: "mass_correction",
          message: error?.message,
        });
        return;
      }

      for (const element of elements) {
        await onQuickCorrection(element, config);
        await delay(1);
      }

      const finishedButton = findLinksWithText(finishedAssignmentsButtonText)[0];
      if (finishedButton) {
        writeInjectorLog("info", "finished_assignments_button_found");
        finishedButton.click();
        await delay(2);

        const finishedElements = findLinksWithText(assignmentsAnswersButtonText);
        writeInjectorLog("info", "finished_assignments_links_discovered", {
          count: finishedElements.length,
        });

        for (const element of finishedElements) {
          await onQuickCorrection(element, config);
          await delay(1);
        }
      } else {
        writeInjectorLog("warn", "finished_assignments_button_missing");
      }

      writeInjectorLog("info", "mass_correction_click_complete");
    },
    { buttonType: "mass" }
  );

  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    safeAddSiblingButton(
      element,
      assignmentsAutoCorrectButtonText,
      () => {
        safeConsole("log", "[AssignmentsQC] quick_button_clicked", {
          injectorRunId,
          index: i,
          href: element.href,
          text: element.textContent,
          ts: Date.now(),
        });
        writeInjectorLog("info", "quick_correction_click_start", {
          index: i,
          elementText: element.textContent,
          href: element.href,
        });
        return onQuickCorrection(element);
      },
      { buttonType: "quick", index: i }
    );
  }

  if (!elements.length) {
    writeInjectorLog("warn", "button_injection_skipped_missing_anchor", {
      buttonText: assignmentsAutoCorrectButtonText,
      buttonType: "quick",
      reason: "no_assignment_links_found",
    });
  }
  writeInjectorLog("info", "assignments_injector_complete", {
    quickButtonsTargetCount: elements.length,
    massButtonInjected: Boolean(massButton),
  });
}
