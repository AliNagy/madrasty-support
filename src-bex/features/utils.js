// Shared utility functions

/**
 * Finds all link elements containing the specified text
 * @param {string} searchText - Text to search for in links
 * @param {Element} element - Optional parent element to search within (defaults to document)
 * @returns {Array} Array of matching link elements
 */
export function findLinksWithText(searchText, element) {
  const linkElements = (element ?? document).querySelectorAll("a");
  const matchingLinks = [];

  for (const link of linkElements) {
    if (link.textContent.includes(searchText)) {
      matchingLinks.push(link);
    }
  }

  return matchingLinks;
}

/**
 * Adds a sibling button next to the specified element
 * @param {Element} element - Element to add button next to
 * @param {string} buttonText - Text for the button
 * @param {Function} onClickEvent - Click event handler
 */
export function addSiblingButton(element, buttonText, onClickEvent) {
  const button = document.createElement("button");
  button.textContent = buttonText;
  button.style.marginRight = "8px";
  element.parentNode.insertBefore(button, element.nextSibling);
  button.addEventListener("click", onClickEvent);
}

/**
 * Fetches content from a URL
 * @param {string} url - URL to fetch
 * @returns {Promise<string>} The fetched content as text
 */
export async function fetchLinkContent(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP Error: Status ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    console.error("Error fetching content:", error);
    return null;
  }
}

/**
 * Gets a value by finding a label containing the specified text
 * @param {string} partialLabelText - Text to search for in labels
 * @param {Element} element - Optional parent element to search within (defaults to document)
 * @returns {string|null} The value associated with the label, or null if not found
 */
export function getValueByPartialLabel(partialLabelText, element) {
  const labelElements = (element ?? document).querySelectorAll("div label");

  for (const label of labelElements) {
    if (label.textContent.includes(partialLabelText)) {
      const valueDiv = label.parentNode.querySelector("div");
      if (valueDiv) {
        return valueDiv.textContent;
      }
    }
  }

  return null;
}

/**
 * Creates a loading overlay for the page
 */
export function createLoadingOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "loading-overlay";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  `;

  const loadingContainer = document.createElement("div");
  const loader = document.createElement("div");
  const loadingText = document.createElement("span");

  loader.classList.add("loader");
  loadingContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    color: white;
    font-size: 48px;
    direction: ltr;
  `;
  loadingText.textContent = "Loading...";

  loadingContainer.appendChild(loader);
  loadingContainer.appendChild(loadingText);
  overlay.appendChild(loadingContainer);

  document.body.appendChild(overlay);
}

/**
 * Removes the loading overlay from the page
 */
export function removeLoadingOverlay() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    overlay.remove();
  }
}

/**
 * Creates a popup with input fields
 * @returns {Promise} A promise that resolves with the input values
 */
export function createInputPopup() {
  return new Promise((resolve, reject) => {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.backgroundColor = "rgba(0, 0, 0, 0.5)";
    overlay.style.zIndex = "9999";

    const popup = document.createElement("div");
    popup.style.position = "fixed";
    popup.style.top = "50%";
    popup.style.left = "50%";
    popup.style.transform = "translate(-50%, -50%)";
    popup.style.backgroundColor = "white";
    popup.style.padding = "20px";
    popup.style.borderRadius = "5px";
    popup.style.zIndex = "10000";

    function createInputWithLabel(label, inputId, inputType = "text") {
      const container = document.createElement("div");
      container.style.marginBottom = "10px";

      const labelElement = document.createElement("label");
      labelElement.textContent = label;
      labelElement.setAttribute("for", inputId);
      container.appendChild(labelElement);

      const inputElement = document.createElement("input");
      inputElement.type = inputType;
      inputElement.id = inputId;
      container.appendChild(inputElement);

      return container;
    }

    popup.appendChild(createInputWithLabel("Where Grade is 0", "gradeZero"));
    popup.appendChild(
      createInputWithLabel("Where Grade is not 0 or full", "gradeOne")
    );
    popup.appendChild(createInputWithLabel("Where Grade is full", "gradeFull"));
    popup.appendChild(
      createInputWithLabel("Overwrite comments", "overwriteComment", "checkbox")
    );

    const buttonContainer = document.createElement("div");
    buttonContainer.style.display = "flex";
    buttonContainer.style.justifyContent = "space-between";

    const submitButton = document.createElement("button");
    submitButton.textContent = "Submit";
    submitButton.addEventListener("click", () => {
      const field1 = document.getElementById("gradeZero").value;
      const field2 = document.getElementById("gradeOne").value;
      const field3 = document.getElementById("gradeFull").value;
      const checkbox1 = document.getElementById("overwriteComment").checked;

      const data = {
        field1,
        field2,
        field3,
        checkbox1,
      };
      removePopup();
      resolve(data);
    });
    buttonContainer.appendChild(submitButton);

    const closeButton = document.createElement("button");
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", () => {
      removePopup();
      reject(new Error("Popup closed by user"));
    });
    buttonContainer.appendChild(closeButton);

    popup.appendChild(buttonContainer);

    document.body.appendChild(overlay);
    document.body.appendChild(popup);

    function removePopup() {
      document.body.removeChild(overlay);
      document.body.removeChild(popup);
    }
  });
}

// src/features/utils.js

/**
 * Basic console logger with prefix.
 * @param {'info' | 'warn' | 'error'} level - Log level.
 * @param {...any} args - Arguments to log.
 */
export function log(level, ...args) {
  const prefix = "[PrepSaverLoader]";
  switch (level) {
    case "error":
      console.error(prefix, ...args);
      break;
    case "warn":
      console.warn(prefix, ...args);
      break;
    default:
      console.log(prefix, ...args);
      break;
  }
}

/**
 * Converts a Gregorian date to Hijri date string (Umm al-Qura).
 * @param {Date} [date=new Date()] - The Gregorian date object.
 * @returns {string} - The formatted Hijri date string or Gregorian fallback.
 */
export function writeHijri(date = new Date()) {
  try {
    const options = {
      calendar: "islamic-umalqura",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    };
    return date.toLocaleDateString("ar-SA", options);
  } catch (e) {
    log("warn", "Hijri conversion failed, returning Gregorian date string:", e);
    return date.toLocaleDateString("ar-SA");
  }
}

/**
 * Formats a date to 'M/D/YYYY, H:MM:SS AM/PM' format (en-US), removing comma.
 * Provides a fallback if Intl fails.
 * @param {Date} date
 * @returns {string}
 */
export function formatLocaleDateTime(date) {
  try {
    return date.toLocaleString("en-US", { hour12: true }).replace(",", "");
  } catch (e) {
    log("warn", `formatLocaleDateTime failed for ${date}`, e);
    return date.toISOString(); // Fallback
  }
}

/**
 * Lightens or darkens a HEX color. Negative lum darkens.
 * @param {string} hex - HEX color string (e.g., '#RRGGBB').
 * @param {number} [lum=0] - Luminance factor (-100 to 100).
 * @returns {string} - Adjusted HEX color string.
 */
export function lightenColor(hex, lum = 0) {
  hex = String(hex).replace(/[^0-9a-f]/gi, "");
  if (hex.length < 6) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  let rgb = "#",
    c,
    i;
  for (i = 0; i < 3; i++) {
    c = parseInt(hex.substr(i * 2, 2), 16);
    c = Math.round(Math.min(Math.max(0, c + (c * lum) / 100), 255)).toString(
      16
    );
    rgb += ("00" + c).substr(c.length);
  }
  return rgb;
}

/**
 * Creates a standard object structure for items (assignments, exams, projects).
 * @param {'assignment' | 'exam' | 'project'} type
 * @param {string} internalId - Page's internal ID.
 * @param {string} idEnc - Encrypted view URL ID.
 * @param {string} name - Item name.
 * @param {string} [grade] - Grade (optional).
 * @returns {object}
 */
export function createItemObject(type, internalId, idEnc, name, grade) {
  let startDate = new Date();
  let endDate = new Date();
  const startDateInput = document.querySelector('input[name="StartDate"]');
  try {
    if (startDateInput?.value) {
      startDate = new Date(startDateInput.value);
      endDate = new Date(startDateInput.value);
    }
  } catch (e) {
    log("warn", `Could not parse StartDate input for ${type} dates.`);
  }

  endDate.setDate(startDate.getDate() + 20); // Default 20 days duration

  const item = {
    [`${type}Id`]: internalId,
    [`${type}IdEnc`]: idEnc,
    [`${type}Name`]: name,
    startDateTime: formatLocaleDateTime(startDate),
    endDateTime: formatLocaleDateTime(endDate),
    startDateTimeHijri: writeHijri(startDate),
    endDateTimeHijri: writeHijri(endDate),
    grade: grade ?? (type === "exam" ? "0" : "2.00"), // Default grade
  };
  return item;
}

/**
 * Helper to ensure a function exists on the window object for inline handlers.
 * @param {string} funcName - Name for the function on the window object.
 * @param {Function} funcRef - The actual function reference.
 */
export function ensureFunctionOnWindow(funcName, funcRef) {
  if (typeof window[funcName] === "undefined") {
    window[funcName] = funcRef;
    log("info", `Function ${funcName} injected into window object.`);
  }
}

/**
 * Dispatches multiple events on an element.
 * @param {Element} element
 * @param {string[]} eventTypes - Array of event names (e.g., ['click', 'change'])
 */
export function dispatchEvents(element, eventTypes) {
  if (!element || !Array.isArray(eventTypes)) return;
  eventTypes.forEach((type) => {
    element.dispatchEvent(new Event(type, { bubbles: true }));
  });
}
