// features/preparation-popup.js
import {
  log,
  writeHijri,
  formatLocaleDateTime,
  lightenColor,
  createItemObject,
  ensureFunctionOnWindow,
} from "./utils.js";

// --- Constants ---
const LOCAL_STORAGE_KEY = "userSavedPreparations_v2";
const PREPARATION_CONTAINER_SELECTOR = "#divSecondLessonDetailsPage";
const BUTTON_CONTAINER_ID = "refactored-prep-buttons-container";

/**
 * Displays a modal with an iframe preview and an 'Apply' button.
 * @param {string} url - The URL to load in the iframe.
 * @param {string} type - 'assignment', 'exam', or 'project'.
 * @param {string} actionFuncName - The name of the function to call when 'Apply' is clicked (e.g., 'checkAndAddAssignment').
 * @param {HTMLElement} sourceButton - The button element that triggered the modal (used for potential disabling).
 */
function showPreviewModal(url, type, actionFuncName, sourceButton) {
  // --- Create Modal Structure ---
  const modalId = `preview-modal-${type}-${Date.now()}`;
  const modalOverlay = document.createElement("div");
  modalOverlay.id = modalId;
  modalOverlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background-color: rgba(0,0,0,0.6); z-index: 100000; display: flex;
      align-items: center; justify-content: center;
  `;

  const modalContent = document.createElement("div");
  modalContent.style.cssText = `
      background-color: #fff; padding: 20px; border-radius: 8px;
      box-shadow: 0 5px 15px rgba(0,0,0,0.3); width: 80%; max-width: 800px;
      height: 70%; display: flex; flex-direction: column; position: relative;
  `;

  const modalHeader = document.createElement("div");
  modalHeader.style.cssText = `display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee;`;

  const applyButton = document.createElement("button");
  applyButton.textContent =
    "اعتماد وإضافة هذا الـ" +
    (type === "assignment" ? "واجب" : type === "exam" ? "اختبار" : "نشاط");
  applyButton.style.cssText = `background-color: #28a745; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer;`;
  applyButton.onclick = () => {
    log("info", `Apply button clicked for ${type}: ${url}`);
    if (typeof window[actionFuncName] === "function") {
      window[actionFuncName](url); // Call the specific add/clone function
      // Optionally disable the button that opened the modal
      if (sourceButton) {
        const parentItem = sourceButton.closest(".preparation-import-item");
        if (parentItem) {
          parentItem.style.opacity = "0.5";
          const buttonsToDisable = parentItem.querySelectorAll("button");
          buttonsToDisable.forEach((btn) => (btn.disabled = true));
        }
      }
    } else {
      log("error", `Action function ${actionFuncName} not found on window.`);
    }
    closeModal(); // Close modal after applying
  };

  const closeButton = document.createElement("button");
  closeButton.innerHTML = "×"; // X symbol
  closeButton.title = "إغلاق المعاينة";
  closeButton.style.cssText = `background: none; border: none; font-size: 1.8em; color: #888; cursor: pointer; padding: 0 5px; line-height: 1;`;
  closeButton.onclick = closeModal;

  modalHeader.appendChild(applyButton);
  modalHeader.appendChild(closeButton);

  const iframeContainer = document.createElement("div");
  iframeContainer.style.cssText = `flex-grow: 1; border: 1px solid #ccc; overflow: hidden;`; // Let iframe fill space

  const iframe = document.createElement("iframe");
  iframe.src = url;
  iframe.sandbox = "allow-scripts allow-same-origin"; // Keep sandbox
  iframe.style.cssText = `width: 100%; height: 100%; border: none;`;
  iframe.onerror = () => {
    iframeContainer.innerHTML =
      '<p style="padding: 20px; text-align: center; color: red;">فشل تحميل المعاينة.</p>';
  };

  // Append elements
  iframeContainer.appendChild(iframe);
  modalContent.appendChild(modalHeader);
  modalContent.appendChild(iframeContainer);
  modalOverlay.appendChild(modalContent);
  document.body.appendChild(modalOverlay);

  // Function to close the modal
  function closeModal() {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.remove();
      log("info", "Preview modal closed.");
    }
  }

  // Close modal if clicking outside the content area
  modalOverlay.addEventListener("click", (event) => {
    if (event.target === modalOverlay) {
      closeModal();
    }
  });

  // Add load listener for iframe styling (optional, less critical in modal)
  iframe.addEventListener("load", () => {
    setTimeout(() => {
      try {
        const iframeDoc =
          iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc?.head) {
          const style = iframeDoc.createElement("style");
          style.textContent = `.navbar-static-top, .main_container > .right_col > .page-title, .col-md-12.col-sm-12.col-xs-12.form-group:has(.control-label:contains('اسم المعلم')) { display:none !important; } body { padding-top: 0 !important; }`;
          iframeDoc.head.appendChild(style);
        }
      } catch (e) {
        log("warn", "Could not style modal iframe content:", url, e);
      }
    }, 250);
  });

  log("info", `Preview modal shown for ${type}: ${url}`);
}
// features/preparation-popup.js
// (Ensure necessary imports like 'log', 'createItemObject' are present)
// (Ensure cloneAndCreateAssignment and refreshAndAddLatestAssignment are defined)

/**
 * Checks if an assignment exists in the list for the current lesson context.
 * If it exists, adds it to the internal list (listOfAssignments).
 * If not, triggers the cloning process.
 * @param {string} assignmentViewUrl - The URL to view the assignment details (e.g., /Teacher/Assignments/ViewAssignment/...).
 */
async function checkAndAddAssignment(assignmentViewUrl) {
  log("info", "Checking/Adding assignment:", assignmentViewUrl);
  if (!assignmentViewUrl || !assignmentViewUrl.includes("ViewAssignment/")) {
    log("error", "Invalid assignment URL provided:", assignmentViewUrl);
    alert("خطأ: رابط الواجب غير صالح.");
    return;
  }
  const assignmentIdEnc = assignmentViewUrl.split("ViewAssignment/")[1];
  let treeId =
    document.querySelector("#SelectedTrees_4")?.value ||
    document.querySelector("#SelectedTrees_3")?.value;
  const timeTableId = document.querySelector("#TimeTableId")?.value; // Get TimeTableId from the page

  if (!treeId) {
    log("error", "Could not determine Tree ID for assignment check.");
    alert("خطأ: لم يتمكن من تحديد معرف الدرس الحالي.");
    return;
  }
  if (!timeTableId) {
    // Depending on the API, this might be critical or optional. Log a warning.
    log(
      "warn",
      "Could not find TimeTableId on the page. The request might fail."
    );
    // alert('تحذير: لم يتم العثور على معرف الجدول الدراسي (TimeTableId). قد لا تعمل الإضافة بشكل صحيح.');
    // Decide if you want to proceed without it or stop here. Let's proceed with caution for now.
  }

  const unitId = document.querySelector("#SelectedUnitId")?.value;
  const subjectChildId = document.querySelector("#SelectedTrees_2")?.value;
  const schoolId = document.querySelector("#hSchoolId")?.value;

  // Use URLSearchParams for form-urlencoded data
  const params = new URLSearchParams();
  params.append("title", "");
  params.append("lectureAssignmentsList", "");
  params.append("sumLectureAssignmentsGradeBook", "0");
  params.append("selectedUnitId", unitId || "");
  params.append("treeId", treeId); // Keep treeId as it might be used server-side
  params.append("lessonsId[]", treeId); // Use lessonsId[] as per payload structure
  params.append("childOfSubject", subjectChildId || "");
  params.append("schoolId", schoolId || "");
  params.append("accessType", "");
  params.append("createdByme", "false");
  // Parameter name changed from isApproved to isGradeBookApproved based on previous functions? Let's use isApproved based on payload example. Revert if needed.
  params.append("isApproved", "False");
  params.append("assignmentsName", "");
  params.append("IsMultiLectuer", "False");
  if (timeTableId) {
    params.append("TimeTableId", timeTableId);
  }

  try {
    const response = await fetch(
      "https://schools.madrasati.sa/Teacher/LectureTools/GetAssignmentsList",
      {
        // Corrected Endpoint? Original code used /Lessons/Get... let's assume /LectureTools/ is correct based on payload info
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        }, // Correct header
        body: params, // Send URLSearchParams object
      }
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const listData = await response.json(); // Response is JSON

    if (!listData || !listData.html) {
      throw new Error(
        "Invalid response format received from GetAssignmentsList."
      );
    }

    const parser = new DOMParser();
    const listDoc = parser.parseFromString(listData.html, "text/html");

    // Find the specific assignment item using the view URL's unique part
    const viewLink = listDoc.querySelector(`a[href*="${assignmentIdEnc}"]`);
    const assignmentItemDiv = viewLink?.closest(".list-group-item"); // Find the container div

    if (assignmentItemDiv) {
      log("info", "Assignment already exists in list. Adding to lesson.");
      // Find the "Select/Choose" button within this item to get the internal ID
      const selectButton = assignmentItemDiv.querySelector(
        "a.selectAssignment[id]"
      );
      const assignmentInternalId = selectButton?.id;
      // Find the hidden input for the name using the internal ID
      const assignmentNameInput = assignmentItemDiv.querySelector(
        `input[id="assignmentName_${assignmentInternalId}"]`
      );
      const assignmentName = assignmentNameInput?.value;
      // Find grade from the modal structure if needed, or use default
      const gradeInput = assignmentItemDiv.querySelector(
        `#selectAssignmentForm_${assignmentInternalId} input[name="gradeInAssignment_${assignmentInternalId}"]`
      );
      const assignmentGrade = gradeInput?.value ?? "2.00"; // Default grade

      if (assignmentInternalId && assignmentName && window.listOfAssignments) {
        const newAssignment = createItemObject(
          "assignment",
          assignmentInternalId,
          assignmentIdEnc,
          assignmentName,
          assignmentGrade
        );
        // Avoid adding duplicates to the list
        if (
          !window.listOfAssignments.some(
            (a) =>
              a.assignmentId === assignmentInternalId ||
              a.assignmentIdEnc === assignmentIdEnc
          )
        ) {
          window.listOfAssignments.push(newAssignment);
          if (typeof window.loadAssignmentsList === "function")
            window.loadAssignmentsList();
          else log("warn", "loadAssignmentsList not found");
          log(
            "info",
            "Added existing assignment to lesson list:",
            newAssignment
          );
          alert(`تمت إضافة الواجب "${assignmentName}" الموجود مسبقاً.`);
        } else {
          log(
            "info",
            "Assignment already present in the lesson list (listOfAssignments). Skipping add."
          );
          alert(`الواجب "${assignmentName}" مضاف بالفعل لهذه الحصة.`);
        }
      } else {
        log(
          "error",
          "Could not find required elements (select button id, name input) or listOfAssignments for existing assignment in response HTML."
        );
        alert("خطأ: لم يتم العثور على بيانات الواجب المطلوب في القائمة.");
      }
    } else {
      log("info", "Assignment not in list. Attempting to clone/create it.");
      // Ensure cloneAndCreateAssignment is defined and available
      if (typeof cloneAndCreateAssignment === "function") {
        await cloneAndCreateAssignment(assignmentViewUrl, treeId);
      } else {
        log("error", "cloneAndCreateAssignment function is not defined.");
        alert("خطأ: وظيفة استنساخ الواجب غير متاحة.");
      }
    }
  } catch (error) {
    log("error", "Failed to get/process assignments list:", error);
    alert(
      `فشل في التحقق من قائمة الواجبات الموجودة (${error.message}). سيتم محاولة إنشاء الواجب كنسخة جديدة.`
    );
    // Ensure cloneAndCreateAssignment is defined and available for fallback
    if (typeof cloneAndCreateAssignment === "function") {
      await cloneAndCreateAssignment(assignmentViewUrl, treeId); // Fallback
    } else {
      log(
        "error",
        "cloneAndCreateAssignment function is not defined for fallback."
      );
      alert("خطأ: وظيفة استنساخ الواجب غير متاحة للمحاولة كخطة بديلة.");
    }
  }
}

// features/preparation-popup.js
// (Ensure necessary imports like 'log' are present)

/** Clones an assignment by fetching its details and POSTing to Manage */
async function cloneAndCreateAssignment(assignmentViewUrl, currentTreeId) {
  log("info", "Cloning assignment from URL:", assignmentViewUrl);
  try {
    const response = await fetch(assignmentViewUrl);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const assignmentHtml = await response.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(assignmentHtml, "text/html");

    // Helper to find specific labeled text without :has()
    const findTextByLabel = (doc, labelText) => {
      const labels = doc.querySelectorAll(".control-label, .smalltitle"); // Common label classes
      // Find the label element that contains the desired text
      const targetLabel = Array.from(labels).find((label) =>
        label.textContent.includes(labelText)
      );
      // Find the value element, assuming it's a '.col-md-10' sibling or within the parent's '.col-md-10'
      let valueElement =
        targetLabel?.parentElement?.querySelector(".col-md-10");
      if (
        !valueElement &&
        targetLabel?.nextElementSibling?.matches(".col-md-10")
      ) {
        // Check immediate sibling
        valueElement = targetLabel.nextElementSibling;
      }
      return valueElement?.textContent.trim() ?? ""; // Return text content or empty string
    };

    // Extract data using querySelector (assuming order) and the helper
    const getText = (selector, index = 0) =>
      doc.querySelectorAll(selector)[index]?.textContent.trim() ?? "";

    const name = getText(".col-md-10", 0); // Assuming first .col-md-10 is name
    const description = getText(".col-md-10", 1); // Assuming second is description
    const sourceText = getText(".col-md-10", 2); // Assuming third is source

    let assignmentType = 3; // Default: بنك الأسئلة
    if (sourceText.includes("كتاب الطالب")) assignmentType = 1;
    else if (sourceText.includes("نشاط خارجي")) assignmentType = 2;
    else if (sourceText.includes("كتاب النشاط")) assignmentType = 4;

    // Find solving type using the helper
    const solvingTypeText = findTextByLabel(doc, "طريقة تسليم الواجب");
    let solvingType = 4; // Default: آلي
    if (solvingTypeText.includes("ملف")) solvingType = 1;
    else if (solvingTypeText.includes("كتابة")) solvingType = 2;
    else if (solvingTypeText.includes("خارج النظام")) solvingType = 3;

    // Find page and question number using the helper
    const pageNumber = findTextByLabel(doc, "رقم الصفحة");
    const questionNumber = findTextByLabel(doc, "رقم السؤال");

    let filePath = "";
    if (assignmentType === 2) {
      // Find file path link more robustly
      const fileLabel = Array.from(
        doc.querySelectorAll(".control-label, .smalltitle")
      ).find((label) => label.textContent.includes("الملف"));
      const fileLink = fileLabel?.parentElement?.querySelector(
        ".col-md-10 a[onclick*='DownloadTempFile']"
      );
      const onclickAttr = fileLink?.getAttribute("onclick");
      if (onclickAttr) {
        try {
          filePath = onclickAttr.split("'")[1];
        } catch (e) {
          log("warn", "Could not parse file path");
        }
      }
    }

    // --- Handle Quran Type ---
    const quranTypeElement = Array.from(
      doc.querySelectorAll(".control-label, .smalltitle")
    ).find((label) => label.textContent.includes("نوع الدرس"));
    const isQuranLesson = !!quranTypeElement;
    let quranType = 1; // 1=حفظ, 2=تلاوة
    let isQuranFlag = false;
    if (isQuranLesson) {
      isQuranFlag = true;
      const quranTypeText =
        quranTypeElement.parentElement?.querySelector(".col-md-10")
          ?.textContent ?? "";
      if (quranTypeText.includes("تلاوة")) quranType = 2;
      log(
        "warn",
        "Quran lesson detected, cloning specific Quran Lesson ID is not fully implemented."
      );
    }

    // --- Prepare data for POST ---
    const params = new URLSearchParams();
    params.append("SaveButton", "");
    params.append("IdEnc", "");
    params.append("Id", "0");
    params.append("TreeId", currentTreeId);
    params.append("IsTreeLevel", "");
    params.append("IsQuran", isQuranFlag);
    params.append("txt_UploadUrl", "/Teacher/Assignments/UploadFile");
    params.append(
      "SelectedUnitId",
      document.querySelector("#SelectedUnitId")?.value || ""
    );
    params.append(
      "SelectedTrees_2",
      document.querySelector("#SelectedTrees_2")?.value || ""
    );
    params.append(
      "SelectedTrees_3",
      document.querySelector("#SelectedTrees_3")?.value || ""
    );
    const tree4 = document.querySelector("#SelectedTrees_4");
    if (tree4?.value) params.append("SelectedTrees_4", tree4.value);
    params.append("Name", name);
    params.append("QuranLessonType", quranType);
    params.append("QuranLessonId", ""); // Needs value from Quran AJAX if implemented
    params.append("AssignmentType", assignmentType);
    params.append("filePath", filePath);
    params.append("Description", description);
    params.append("PageNumber", pageNumber);
    params.append("QuestionsNumber", questionNumber);
    params.append("SolvingType", solvingType);
    params.append("AccessType", "False");
    params.append(
      "schoolId",
      document.querySelector("#hSchoolId")?.value || ""
    );
    params.append("hfLevelsCount", tree4?.value ? "4" : "3");
    params.append("hfDrawTree", "/Teacher/Assignments/DrawTreeToClassLesson");

    doc.querySelectorAll(".qid").forEach((qInput, index) => {
      params.append(`AssignmentQuestionsList[${index}].Id`, qInput.value);
      params.append(`AssignmentQuestionsList[${index}].Grade`, "1"); // Default grade
      params.append(`AssignmentQuestionsList[${index}].IsIenQuestion`, "True"); // Assume True
    });
    params.append("X-Requested-With", "XMLHttpRequest");

    log("info", "Submitting cloned assignment data...");
    const manageResponse = await fetch(
      "https://schools.madrasati.sa/Teacher/Assignments/Manage?Length=11",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: params,
      }
    );

    if (!manageResponse.ok) {
      const errorText = await manageResponse.text();
      throw new Error(
        `Manage request failed: ${manageResponse.status} - ${errorText}`
      );
    }

    log("info", "Assignment cloned successfully. Refreshing list...");
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for server
    // Ensure refreshAndAddLatestAssignment is defined and available
    if (typeof refreshAndAddLatestAssignment === "function") {
      await refreshAndAddLatestAssignment(currentTreeId);
    } else {
      log("error", "refreshAndAddLatestAssignment function is not defined.");
      alert("تم استنساخ الواجب بنجاح، ولكن فشلت عملية تحديث القائمة تلقائياً.");
    }
  } catch (error) {
    log("error", "Error cloning assignment:", error);
    // Provide more specific error message if possible
    const userMessage = error.message.includes("valid selector")
      ? "حدث خطأ داخلي أثناء قراءة بيانات الواجب (Selector Error)."
      : `حدث خطأ أثناء استنساخ الواجب: ${error.message}`;
    alert(userMessage);
  }
}

// features/preparation-popup.js
// (Ensure necessary imports like 'log', 'createItemObject' are present)

/**
 * Refreshes the assignment list from the server and attempts to add the
 * most recently created one (assumed to be the first in the list)
 * to the internal list (listOfAssignments).
 * @param {string} treeId - The current lesson's Tree ID.
 */
async function refreshAndAddLatestAssignment(treeId) {
  log("info", "Refreshing assignment list to add the newest one.");
  const timeTableId = document.querySelector("#TimeTableId")?.value;

  if (!treeId) {
    log("error", "Missing treeId for refresh.");
    return;
  }
  // if (!timeTableId) { log('warn', 'Missing TimeTableId for refresh.'); /* Consider stopping */ }

  const unitId = document.querySelector("#SelectedUnitId")?.value;
  const subjectChildId = document.querySelector("#SelectedTrees_2")?.value;
  const schoolId = document.querySelector("#hSchoolId")?.value;

  // Use URLSearchParams for form-urlencoded data
  const params = new URLSearchParams();
  params.append("title", "");
  params.append("lectureAssignmentsList", "");
  params.append("sumLectureAssignmentsGradeBook", "0");
  params.append("selectedUnitId", unitId || "");
  params.append("treeId", treeId);
  params.append("lessonsId[]", treeId);
  params.append("childOfSubject", subjectChildId || "");
  params.append("schoolId", schoolId || "");
  params.append("accessType", "");
  params.append("createdByme", "false"); // Assume we are adding one created by someone else or cloned
  params.append("isApproved", "False");
  params.append("assignmentsName", "");
  params.append("IsMultiLectuer", "False");
  if (timeTableId) {
    params.append("TimeTableId", timeTableId);
  }

  try {
    const response = await fetch(
      "https://schools.madrasati.sa/Teacher/LectureTools/GetAssignmentsList",
      {
        // Assuming /LectureTools/ endpoint
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: params,
      }
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const listData = await response.json();

    if (!listData || !listData.html) {
      throw new Error(
        "Invalid response format received from GetAssignmentsList during refresh."
      );
    }

    const parser = new DOMParser();
    const listDoc = parser.parseFromString(listData.html, "text/html");

    // Find the *first* assignment item in the list
    const firstItemDiv = listDoc.querySelector(".list-group-item");
    if (!firstItemDiv) {
      log("warn", "No assignment items found in the refreshed list.");
      alert(
        "تم إنشاء الواجب بنجاح، ولكن لم يتم العثور عليه في القائمة المحدثة لإضافته تلقائياً."
      );
      // Still try to trigger UI update in case internal list changed elsewhere
      if (typeof window.loadAssignmentsList === "function")
        window.loadAssignmentsList();
      return;
    }

    log("info", "Found first assignment item, attempting to extract data...");
    const viewLink = firstItemDiv.querySelector("a[href*='/ViewAssignment/']");
    const selectButton = firstItemDiv.querySelector("a.selectAssignment[id]");
    const assignmentInternalId = selectButton?.id;
    const nameInput = firstItemDiv.querySelector(
      `input[id="assignmentName_${assignmentInternalId}"]`
    );
    const assignmentName = nameInput?.value;
    const gradeInput = firstItemDiv.querySelector(
      `#selectAssignmentForm_${assignmentInternalId} input[name="gradeInAssignment_${assignmentInternalId}"]`
    );
    const assignmentGrade = gradeInput?.value ?? "2.00"; // Default grade

    const href = viewLink?.getAttribute("href");
    const assignmentIdEnc = href?.includes("/ViewAssignment/")
      ? href.split("/ViewAssignment/")[1]
      : null;

    if (
      assignmentInternalId &&
      assignmentName &&
      assignmentIdEnc &&
      window.listOfAssignments
    ) {
      const newAssignment = createItemObject(
        "assignment",
        assignmentInternalId,
        assignmentIdEnc,
        assignmentName,
        assignmentGrade
      );
      // Avoid adding duplicates
      if (
        !window.listOfAssignments.some(
          (a) =>
            a.assignmentId === assignmentInternalId ||
            a.assignmentIdEnc === assignmentIdEnc
        )
      ) {
        window.listOfAssignments.push(newAssignment);
        if (typeof window.loadAssignmentsList === "function")
          window.loadAssignmentsList();
        log(
          "info",
          "Added newly created/refreshed assignment to lesson list:",
          newAssignment
        );
        alert(`تمت إضافة الواجب "${assignmentName}" بنجاح.`);
      } else {
        log(
          "info",
          "Refreshed assignment already in lesson list. Skipping add."
        );
        alert(`الواجب "${assignmentName}" مضاف بالفعل.`);
        // Still refresh UI in case other details changed
        if (typeof window.loadAssignmentsList === "function")
          window.loadAssignmentsList();
      }
    } else {
      log(
        "warn",
        "Could not extract required data (internalId, name, encId) from the first assignment item in the refreshed list or listOfAssignments missing."
      );
      alert(
        "تم إنشاء الواجب، ولكن لم نتمكن من قراءة بياناته من القائمة المحدثة لإضافته تلقائياً."
      );
      // Still try to trigger UI update
      if (typeof window.loadAssignmentsList === "function")
        window.loadAssignmentsList();
    }
  } catch (error) {
    log("error", "Failed to refresh assignments list after clone:", error);
    alert(`فشل في تحديث قائمة الواجبات بعد الإنشاء (${error.message}).`);
  }
}

/**
 * Adds an existing exam to the current lesson or clones if not found.
 */
async function addExamFromExport(examViewUrl) {
  log("info", "Attempting to add exam:", examViewUrl);
  if (
    !examViewUrl ||
    !(examViewUrl.includes("ViewDetails/") || examViewUrl.includes("ViewExam"))
  ) {
    log("error", "Invalid exam URL:", examViewUrl);
    alert("خطأ: رابط الاختبار غير صالح.");
    return;
  }
  const examIdEnc = examViewUrl.split(/ViewDetails\/|ViewExam\//)[1];
  let treeId, parentTreeId, treeLevel;
  const tree4 = document.querySelector("#SelectedTrees_4");
  const tree3 = document.querySelector("#SelectedTrees_3");
  const tree2 = document.querySelector("#SelectedTrees_2");

  if (tree4?.value) {
    treeId = tree4.value;
    parentTreeId = tree3?.value;
    treeLevel = 4;
  } else if (tree3?.value) {
    treeId = tree3.value;
    parentTreeId = tree2?.value;
    treeLevel = 3;
  } else {
    log("error", "Could not determine Tree ID for exam.");
    alert("خطأ: لم يتمكن من تحديد معرف الدرس الحالي.");
    return;
  }

  const unitId = document.querySelector("#SelectedUnitId")?.value;
  const subjectChildId = document.querySelector("#SelectedTrees_2")?.value;
  const schoolId = document.querySelector("#hSchoolId")?.value;

  const listPayload = {
    /* ... payload for GetExamsList ... */ title: "",
    lectureExamsList: "",
    sumLectureExamsGradeBook: "0",
    selectedUnitId: unitId,
    treeId: treeId,
    lessonId: treeId,
    childOfSubject: subjectChildId,
    schoolId: schoolId,
    accessType: "",
    createdByme: false,
    isGradeBookApproved: "False",
  };

  try {
    const response = await fetch(
      "https://schools.madrasati.sa/Teacher/Lessons/GetExamsList",
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(listPayload),
      }
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const listData = await response.json();

    const parser = new DOMParser();
    const listDoc = parser.parseFromString(listData.html, "text/html");
    const existingLink = listDoc.querySelector(`a[href*="${examIdEnc}"]`); // Find link by unique ID part

    if (existingLink) {
      log("info", "Exam exists. Adding to lesson list.");
      const examRow = existingLink.closest("tr");
      const addButton = examRow?.querySelector('a[id^="examAddBtn_"]'); // Check selector pattern
      const examInternalId = addButton?.id;
      const examName = examRow?.querySelector('input[id^="Name_"]')?.value; // Check selector pattern
      const examGrade = examRow?.querySelector('input[id^="egrade"]')?.value; // Check selector pattern

      if (examInternalId && window.listOfExams) {
        const newExam = createItemObject(
          "exam",
          examInternalId,
          examIdEnc,
          examName,
          examGrade
        );
        window.listOfExams.push(newExam);
        if (typeof window.loadExamsList === "function") window.loadExamsList();
        else log("warn", "loadExamsList not found");
        log("info", "Added existing exam to lesson list:", newExam);
      } else {
        log(
          "error",
          "Could not find required elements/list for existing exam."
        );
      }
    } else {
      log("info", "Exam not found. Cloning...");
      await cloneAndCreateExam(examViewUrl, treeId, parentTreeId, treeLevel);
    }
  } catch (error) {
    log("error", "Failed to get/process exams list:", error);
    alert(
      "فشل في التحقق من قائمة الاختبارات. سيتم محاولة إنشاء الاختبار كنسخة جديدة."
    );
    await cloneAndCreateExam(examViewUrl, treeId, parentTreeId, treeLevel); // Fallback
  }
}

async function cloneAndCreateExam(
  examViewUrl,
  currentTreeId,
  parentTreeId,
  treeLevel
) {
  log("info", "Cloning exam from URL:", examViewUrl);
  try {
    const response = await fetch(examViewUrl);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const examHtml = await response.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(examHtml, "text/html");

    // Helper to find specific labeled text without :has()
    const findTextByLabel = (doc, labelText) => {
      const labels = doc.querySelectorAll(".control-label, .smalltitle");
      const targetLabel = Array.from(labels).find((label) =>
        label.textContent.includes(labelText)
      );
      // Sometimes the value is directly in the next sibling, sometimes nested
      let valueElement =
        targetLabel?.parentElement?.querySelector(".col-md-10");
      // Fallback check if the structure is different (e.g., label and value are direct siblings in a container)
      if (
        !valueElement &&
        targetLabel?.nextElementSibling?.classList.contains("col-md-10")
      ) {
        valueElement = targetLabel.nextElementSibling;
      }
      return valueElement?.textContent.trim() ?? "";
    };

    // Extract data
    const name = findTextByLabel(doc, "عنوان الاختبار");
    const description = findTextByLabel(doc, "الوصف");
    const categoryText = findTextByLabel(doc, "تصنيف");
    // Get total grade - assuming it's the second element with this class
    const totalGradeText =
      doc.querySelectorAll(".result-lablel-grade")[1]?.textContent.trim() ??
      "0";

    let examCategory = 1; // 1=فترة, 2=نهائي, 3=قصير
    if (categoryText.includes("نهائي")) examCategory = 2;
    else if (categoryText.includes("قصير")) examCategory = 3;

    const questions = doc.querySelectorAll(".qid");
    let examType = questions.length > 0 ? 1 : 3; // 1=آلي (Ien), 3=يدوي

    // --- Prepare data for POST ---
    const requestVerificationToken = document.querySelector(
      '[name="__RequestVerificationToken"]'
    )?.value;
    if (!requestVerificationToken)
      throw new Error("Missing RequestVerificationToken");

    const params = new URLSearchParams();
    // ... (append all parameters as before - no changes needed here) ...
    params.append("__RequestVerificationToken", requestVerificationToken);
    params.append("Id", "0");
    params.append("LessonParentId", parentTreeId || "");
    params.append("TreeId", currentTreeId);
    params.append("LessonId", currentTreeId);
    params.append("IsTreeLevel", "");
    params.append("ExamId", "");
    params.append(
      "SchoolId",
      document.querySelector("#hSchoolId")?.value || ""
    );
    params.append("ExamCategory", examCategory);
    params.append(
      "SelectedUnitId",
      document.querySelector("#SelectedUnitId")?.value || ""
    );
    params.append(
      "SelectedTrees_2",
      document.querySelector("#SelectedTrees_2")?.value || ""
    );
    params.append(
      "SelectedTrees_3",
      document.querySelector("#SelectedTrees_3")?.value || ""
    );
    const tree4 = document.querySelector("#SelectedTrees_4");
    if (tree4?.value) params.append("SelectedTrees_4", tree4.value);
    params.append("Name", name);
    params.append("ExamType", examType);
    params.append("ExamQuestionSource", examType === 1 ? "ien" : "manual");
    params.append("TotalGrade", totalGradeText);
    params.append("Description", description);
    params.append("AccessType", "False");
    params.append("AllowLessonContent", "true");
    params.append("hfLevelsCount", treeLevel);
    params.append("hfDrawTree", "/Teacher/Exams/DrawTreeToClassLesson");
    if (examType === 1) {
      questions.forEach((qInput, index) => {
        params.append(`ExamQuestionsList[${index}].Id`, qInput.value);
        params.append(`ExamQuestionsList[${index}].Grade`, "1");
        params.append(`ExamQuestionsList[${index}].IsIenQuestion`, "true");
      });
    }
    params.append("X-Requested-With", "XMLHttpRequest");

    log("info", "Submitting cloned exam data...");
    const manageResponse = await fetch(
      "https://schools.madrasati.sa/Teacher/Exams/Manage?Length=5",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: params,
      }
    );

    if (!manageResponse.ok) {
      const errorText = await manageResponse.text();
      throw new Error(
        `Manage request failed: ${manageResponse.status} - ${errorText}`
      );
    }

    log("info", "Exam cloned successfully. Refreshing list...");
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait
    await refreshAndAddLatestExam(currentTreeId);
  } catch (error) {
    log("error", "Error cloning exam:", error);
    const userMessage = error.message.includes("valid selector")
      ? "حدث خطأ داخلي أثناء قراءة بيانات الاختبار (Selector Error)."
      : `حدث خطأ أثناء استنساخ الاختبار: ${error.message}`;
    alert(userMessage);
  }
}

/** Refreshes exam list and adds the latest one */
async function refreshAndAddLatestExam(treeId) {
  log("info", "Refreshing exam list to add the newest one.");
  const listPayload = {
    /* ... same payload as addExamFromExport ... */ title: "",
    lectureExamsList: "",
    sumLectureExamsGradeBook: "0",
    selectedUnitId: document.querySelector("#SelectedUnitId")?.value,
    treeId: treeId,
    lessonId: treeId,
    childOfSubject: document.querySelector("#SelectedTrees_2")?.value,
    schoolId: document.querySelector("#hSchoolId")?.value,
    accessType: "",
    createdByme: false,
    isGradeBookApproved: "False",
  };
  try {
    const response = await fetch(
      "https://schools.madrasati.sa/Teacher/Lessons/GetExamsList",
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(listPayload),
      }
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const listData = await response.json();

    const parser = new DOMParser();
    const listDoc = parser.parseFromString(listData.html, "text/html");
    const firstRow = listDoc.querySelector("table tr:first-child");
    const viewLink = firstRow?.querySelector("td:nth-child(3) a:nth-child(1)");
    const addButton = firstRow?.querySelector("td:nth-child(3) a:nth-child(2)");
    const nameInput = firstRow?.querySelector('input[id^="Name_"]');
    const gradeInput = firstRow?.querySelector('input[id^="egrade"]'); // Check ID pattern

    const href = viewLink?.getAttribute("href");
    const examIdEnc = href ? href.split(/ViewDetails\/|ViewExam\//)[1] : null;
    const examInternalId = addButton?.id;
    const examName = nameInput?.value;
    const examGrade = gradeInput?.value ?? "0";

    if (examIdEnc && examInternalId && examName && window.listOfExams) {
      const newExam = createItemObject(
        "exam",
        examInternalId,
        examIdEnc,
        examName,
        examGrade
      );
      window.listOfExams.push(newExam);
      if (typeof window.loadExamsList === "function") window.loadExamsList();
      log("info", "Added newly created exam to lesson list:", newExam);
      alert("تمت إضافة الاختبار بنجاح.");
    } else {
      log(
        "warn",
        "Could not find the latest exam in the refreshed list or listOfExams missing."
      );
      if (typeof window.loadExamsList === "function") window.loadExamsList();
      alert("تم إنشاء الاختبار، ولكن قد تحتاج لتحديث القائمة يدويًا لإضافته.");
    }
  } catch (error) {
    log("error", "Failed to refresh exams list after clone:", error);
    alert("فشل في تحديث قائمة الاختبارات بعد الإنشاء.");
  }
}

/**
 * Adds an existing project/activity to the current lesson or clones if not found.
 */
async function addProjectFromExport(projectViewUrl) {
  log("info", "Attempting to add project/activity:", projectViewUrl);
  if (!projectViewUrl || !projectViewUrl.includes("ViewProject/")) {
    log("error", "Invalid project URL:", projectViewUrl);
    alert("خطأ: رابط النشاط غير صالح.");
    return;
  }
  const projectIdEnc = projectViewUrl.split("ViewProject/")[1];
  let treeId, parentTreeId, treeLevel;
  const tree4 = document.querySelector("#SelectedTrees_4");
  const tree3 = document.querySelector("#SelectedTrees_3");
  const tree2 = document.querySelector("#SelectedTrees_2");

  if (tree4?.value) {
    treeId = tree4.value;
    parentTreeId = tree3?.value;
    treeLevel = 4;
  } else if (tree3?.value) {
    treeId = tree3.value;
    parentTreeId = tree2?.value;
    treeLevel = 3;
  } else {
    log("error", "Could not determine Tree ID for project.");
    alert("خطأ: لم يتمكن من تحديد معرف الدرس الحالي.");
    return;
  }

  const unitId = document.querySelector("#SelectedUnitId")?.value;
  const subjectChildId = document.querySelector("#SelectedTrees_2")?.value;
  const schoolId = document.querySelector("#hSchoolId")?.value;

  const listPayload = {
    /* ... payload for GetProjectsList ... */ title: "",
    lectureProjectsList: "",
    sumLectureProjectsGradeBook: "0",
    selectedUnitId: unitId,
    treeId: treeId,
    lessonId: treeId,
    childOfSubject: subjectChildId,
    schoolId: schoolId,
    accessType: "",
    createdByme: false,
    isGradeBookApproved: "False",
  };

  try {
    const response = await fetch(
      "https://schools.madrasati.sa/Teacher/Lessons/GetProjectsList",
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(listPayload),
      }
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const listData = await response.json();

    const parser = new DOMParser();
    const listDoc = parser.parseFromString(listData.html, "text/html");
    const existingLink = listDoc.querySelector(`a[href*="${projectIdEnc}"]`);

    if (existingLink) {
      log("info", "Project exists. Adding to lesson list.");
      const projectRow = existingLink.closest("tr");
      const addButton = projectRow?.querySelector('a[id^="projectAddBtn_"]'); // Check selector
      const projectInternalId = addButton?.id;
      const projectName = projectRow?.querySelector(
        'input[id^="ProjectName_"]'
      )?.value; // Check selector

      if (projectInternalId && projectName && window.listOfProjects) {
        const newProject = createItemObject(
          "project",
          projectInternalId,
          projectIdEnc,
          projectName
        );
        window.listOfProjects.push(newProject);
        if (typeof window.loadProjectsList === "function")
          window.loadProjectsList();
        else log("warn", "loadProjectsList not found");
        log("info", "Added existing project to lesson list:", newProject);
      } else {
        log(
          "error",
          "Could not find required elements/list for existing project."
        );
      }
    } else {
      log("info", "Project not found. Cloning...");
      await cloneAndCreateProject(
        projectViewUrl,
        treeId,
        parentTreeId,
        treeLevel
      );
    }
  } catch (error) {
    log("error", "Failed to get/process projects list:", error);
    alert(
      "فشل في التحقق من قائمة الأنشطة. سيتم محاولة إنشاء النشاط كنسخة جديدة."
    );
    await cloneAndCreateProject(
      projectViewUrl,
      treeId,
      parentTreeId,
      treeLevel
    ); // Fallback
  }
}

async function cloneAndCreateProject(
  projectViewUrl,
  currentTreeId,
  parentTreeId,
  treeLevel
) {
  log("info", "Cloning project/activity from URL:", projectViewUrl);
  try {
    const response = await fetch(projectViewUrl);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const projectHtml = await response.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(projectHtml, "text/html");

    // Helper to find specific labeled text without :has()
    const findTextByLabel = (doc, labelText) => {
      const labels = doc.querySelectorAll(".control-label, .smalltitle");
      const targetLabel = Array.from(labels).find((label) =>
        label.textContent.includes(labelText)
      );
      return (
        targetLabel?.parentElement
          ?.querySelector(".col-md-10")
          ?.textContent.trim() ?? ""
      );
    };

    // Extract data
    const name = findTextByLabel(doc, "اسم النشاط");
    const description = findTextByLabel(doc, "الوصف");
    const sourceText = findTextByLabel(doc, "مصدر النشاط");
    const solvingTypeText = findTextByLabel(doc, "طريقة تسليم النشاط");

    let projectType = 1; // 1=كتاب الطالب, 2=خارجي, 3=كتاب النشاط
    if (sourceText.includes("خارجي")) projectType = 2;
    else if (sourceText.includes("كتاب النشاط")) projectType = 3;

    let solvingType = 1; // 1=ملف, 2=كتابة, 3=خارج النظام
    if (solvingTypeText.includes("كتابة")) solvingType = 2;
    else if (solvingTypeText.includes("خارج النظام")) solvingType = 3;

    const pageNumber = findTextByLabel(doc, "رقم الصفحة");
    const questionNumber = findTextByLabel(doc, "رقم السؤال");

    let filePath = "";
    if (projectType === 2) {
      const fileLabel = Array.from(
        doc.querySelectorAll(".control-label, .smalltitle")
      ).find((label) => label.textContent.includes("الملف"));
      const fileLink = fileLabel?.parentElement?.querySelector(
        ".col-md-10 a[onclick*='DownloadTempFile']"
      );
      const onclickAttr = fileLink?.getAttribute("onclick");
      if (onclickAttr) {
        try {
          filePath = onclickAttr.split("'")[1];
        } catch (e) {
          log("warn", "Could not parse file path for project");
        }
      }
    }

    // --- Prepare data for POST ---
    const requestVerificationToken = document.querySelector(
      '[name="__RequestVerificationToken"]'
    )?.value;
    if (!requestVerificationToken)
      throw new Error("Missing RequestVerificationToken");

    const params = new URLSearchParams();
    // ... (append all parameters as before - no changes needed here) ...
    params.append("TypeId", "1");
    params.append("__RequestVerificationToken", requestVerificationToken);
    params.append("Id", "");
    params.append(
      "schoolId",
      document.querySelector("#hSchoolId")?.value || ""
    );
    params.append(
      "SelectedUnitId",
      document.querySelector("#SelectedUnitId")?.value || ""
    );
    params.append(
      "SelectedTrees_2",
      document.querySelector("#SelectedTrees_2")?.value || ""
    );
    params.append(
      "SelectedTrees_3",
      document.querySelector("#SelectedTrees_3")?.value || ""
    );
    const tree4 = document.querySelector("#SelectedTrees_4");
    if (tree4?.value) params.append("SelectedTrees_4", tree4.value);
    params.append("Name", name);
    params.append("CategoryId", "4");
    params.append("ClassificationLevel", "1");
    params.append("ProjectType", projectType);
    params.append("Description", description);
    params.append("PageNumber", pageNumber);
    params.append("QuestionsNumber", questionNumber);
    params.append("SolvingType", solvingType);
    params.append("filepath", filePath);
    params.append("AccessType", "False");
    params.append("hfLevelsCount", treeLevel);
    params.append("hfDrawTree", "/Projects/Projects/DrawTreeToClassLesson");

    log("info", "Submitting cloned project/activity data...");
    const createResponse = await fetch(
      "https://schools.madrasati.sa/Projects/Projects/Create",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: params,
      }
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(
        `Create request failed: ${createResponse.status} - ${errorText}`
      );
    }

    log("info", "Project/Activity cloned successfully. Refreshing list...");
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait
    await refreshAndAddLatestProject(currentTreeId);
  } catch (error) {
    log("error", "Error cloning project/activity:", error);
    const userMessage = error.message.includes("valid selector")
      ? "حدث خطأ داخلي أثناء قراءة بيانات النشاط (Selector Error)."
      : `حدث خطأ أثناء استنساخ النشاط: ${error.message}`;
    alert(userMessage);
  }
}

/** Refreshes project list and adds the latest one */
async function refreshAndAddLatestProject(treeId) {
  log("info", "Refreshing project list to add the newest one.");
  const listPayload = {
    /* ... same payload as addProjectFromExport ... */ title: "",
    lectureProjectsList: "",
    sumLectureProjectsGradeBook: "0",
    selectedUnitId: document.querySelector("#SelectedUnitId")?.value,
    treeId: treeId,
    lessonId: treeId,
    childOfSubject: document.querySelector("#SelectedTrees_2")?.value,
    schoolId: document.querySelector("#hSchoolId")?.value,
    accessType: "",
    createdByme: false,
    isGradeBookApproved: "False",
  };
  try {
    const response = await fetch(
      "https://schools.madrasati.sa/Teacher/Lessons/GetProjectsList",
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(listPayload),
      }
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const listData = await response.json();

    const parser = new DOMParser();
    const listDoc = parser.parseFromString(listData.html, "text/html");
    const firstRow = listDoc.querySelector("table tr:first-child");
    const viewLink = firstRow?.querySelector("td:nth-child(3) a:nth-child(1)");
    const addButton = firstRow?.querySelector("td:nth-child(3) a:nth-child(2)");
    const nameInput = firstRow?.querySelector('input[id^="ProjectName_"]');

    const href = viewLink?.getAttribute("href");
    const projectIdEnc = href?.includes("/ViewProject/")
      ? href.split("/ViewProject/")[1]
      : null;
    const projectInternalId = addButton?.id;
    const projectName = nameInput?.value;

    if (
      projectIdEnc &&
      projectInternalId &&
      projectName &&
      window.listOfProjects
    ) {
      const newProject = createItemObject(
        "project",
        projectInternalId,
        projectIdEnc,
        projectName
      );
      window.listOfProjects.push(newProject);
      if (typeof window.loadProjectsList === "function")
        window.loadProjectsList();
      log("info", "Added newly created project to lesson list:", newProject);
      alert("تمت إضافة النشاط بنجاح.");
    } else {
      log(
        "warn",
        "Could not find the latest project in the refreshed list or listOfProjects missing."
      );
      if (typeof window.loadProjectsList === "function")
        window.loadProjectsList();
      alert("تم إنشاء النشاط، ولكن قد تحتاج لتحديث القائمة يدويًا لإضافته.");
    }
  } catch (error) {
    log("error", "Failed to refresh projects list after clone:", error);
    alert("فشل في تحديث قائمة الأنشطة بعد الإنشاء.");
  }
}

// --- Core Data Scraping & Applying Functions ---

function getCurrentPreparationData(preparationName) {
  const prepContainer = document.querySelector(PREPARATION_CONTAINER_SELECTOR);
  if (!prepContainer) {
    log(
      "error",
      "Preparation container not found:",
      PREPARATION_CONTAINER_SELECTOR
    );
    return null;
  }

  const data = {
    name: preparationName || "Untitled Preparation",
    version: 2,
    savedTimestamp: new Date().toISOString(),
    treeIds: [],
    attachments: [],
    checkedOptions: [],
    textInputs: [],
    namedInputs: [],
    activities: [],
    assignments: [],
    exams: [],
    projects: [],
  };

  // Tree IDs
  [
    "#SelectedUnitId",
    "#SelectedTrees_2",
    "#SelectedTrees_3",
    "#SelectedTrees_4",
  ].forEach((selector) => {
    const element = document.querySelector(selector);
    if (element?.value) data.treeIds.push(element.value);
  });

  // Attachments (from jsModel)
  if (window.jsModel && Array.isArray(window.jsModel.files)) {
    try {
      data.attachments = JSON.parse(JSON.stringify(window.jsModel.files));
    } catch (e) {
      log("error", "Failed to clone jsModel.files", e);
    }
  } else {
    log("warn", "jsModel.files not found. Attachments might be incomplete.");
  }

  // Checked Options
  prepContainer
    .querySelectorAll(
      'input[type="checkbox"]:checked, input[type="radio"]:checked'
    )
    .forEach((el) => {
      if (el.id) data.checkedOptions.push(el.id);
    });

  // Text Inputs
  [
    "LectureClassPreparationText",
    "LessonVocabulary",
    "ThinkingSkills",
    "LectureClassCloseText",
    "TeacherNote",
  ].forEach((id) => {
    const element = document.getElementById(id);
    if (element) data.textInputs.push([id, element.value]);
  });

  // Named Inputs
  ["teachingToolExtraData", "strategyExtraData"].forEach((name) => {
    const element = prepContainer.querySelector(`[name="${name}"]`);
    if (element) data.namedInputs.push([name, element.value]);
  });

  // Activities, Assignments, Exams, Projects (Currently Added)
  prepContainer
    .querySelectorAll("#ActivitiesDiv .thumbnail")
    .forEach((thumb) => {
      const link = thumb.querySelector("a");
      const caption = thumb.querySelector(".caption");
      const href = link?.getAttribute("href");
      const text = caption?.textContent.trim();
      if (href && text) data.activities.push([href, text]);
    });
  prepContainer
    .querySelectorAll("#AssignmentsDiv .thumbnail a[href*='/ViewAssignment/']")
    .forEach((a) => data.assignments.push(a.getAttribute("href")));
  prepContainer
    .querySelectorAll(
      "#ExamsDiv .thumbnail a[href*='/ViewDetails/'], #ExamsDiv .thumbnail a[href*='/ViewExam/']"
    )
    .forEach((a) => data.exams.push(a.getAttribute("href")));
  prepContainer
    .querySelectorAll("#ProjectsDiv .thumbnail a[href*='/ViewProject/']")
    .forEach((a) => data.projects.push(a.getAttribute("href")));

  log("info", "Scraped Preparation Data:", data);
  return data;
}

function convertOldFormatToObject(oldData) {
  log("info", "Attempting conversion from old array format.");
  if (!Array.isArray(oldData) || oldData.length < 7) {
    // Check minimum expected length
    log(
      "error",
      "Data is not a valid array or has unexpected length for old format."
    );
    return null;
  }

  try {
    const newData = {
      name: oldData[0]?.[0] || "Converted Preparation", // [0][0] = Name
      version: 1, // Mark as converted from old version
      savedTimestamp: new Date().toISOString(), // Add timestamp during conversion
      treeIds: Array.isArray(oldData[6]?.[0]) ? oldData[6][0] : [], // [6][0] = Tree IDs
      attachments: Array.isArray(oldData[1]?.[0]) ? oldData[1][0] : [], // [1][0] = Attachments array
      checkedOptions: Array.isArray(oldData[2]) ? oldData[2] : [], // [2] = Checked Options
      textInputs: Array.isArray(oldData[3]) ? oldData[3] : [], // [3] = Text Inputs [[id, value],...]
      namedInputs: Array.isArray(oldData[4]) ? oldData[4] : [], // [4] = Named Inputs [[name, value],...]
      // [5] contains added items
      activities: Array.isArray(oldData[5]?.[0]) ? oldData[5][0] : [], // [5][0] = Activities [[url, name],...]
      assignments: Array.isArray(oldData[5]?.[1]) ? oldData[5][1] : [], // [5][1] = Assignment URLs [url,...]
      exams: Array.isArray(oldData[5]?.[2]) ? oldData[5][2] : [], // [5][2] = Exam URLs [url,...]
      projects: Array.isArray(oldData[5]?.[3]) ? oldData[5][3] : [], // [5][3] = Project URLs [url,...]
    };

    // Perform basic validation/cleanup if needed (e.g., ensure URLs are strings)
    newData.assignments = newData.assignments.filter(
      (url) => typeof url === "string" && url
    );
    newData.exams = newData.exams.filter(
      (url) => typeof url === "string" && url
    );
    newData.projects = newData.projects.filter(
      (url) => typeof url === "string" && url
    );
    newData.activities = newData.activities.filter(
      (act) =>
        Array.isArray(act) &&
        typeof act[0] === "string" &&
        typeof act[1] === "string"
    );

    log("info", "Successfully converted old format to new object format.");
    return newData;
  } catch (error) {
    log("error", "Error during old format conversion:", error);
    return null;
  }
}

function applyPreparationData(loadedData) {
  log("info", "Applying Preparation Data (checking format)...");

  let prepData; // This will hold the data in the standard object format

  // --- Format Detection and Conversion ---
  if (Array.isArray(loadedData)) {
    log(
      "warn",
      "Loaded data is in Array format (likely old version). Converting..."
    );
    // Assuming convertOldFormatToObject is defined elsewhere in this file or imported
    prepData = convertOldFormatToObject(loadedData);
    if (!prepData) {
      alert(
        "فشل تحويل بيانات التحضير القديمة. قد يكون الملف تالفًا أو بصيغة غير متوقعة."
      );
      return;
    }
  } else if (
    typeof loadedData === "object" &&
    loadedData !== null &&
    loadedData.name
  ) {
    // Assume it's the new object format if it's an object with a 'name' property
    log("info", "Loaded data seems to be in the new object format.");
    prepData = loadedData; // Use directly
    // Optional: Add more checks for new format validity if needed
    if (!prepData.version || prepData.version < 2) {
      log(
        "warn",
        "Applying data with missing or older version number. Compatibility issues may occur."
      );
    }
  } else {
    log("error", "Loaded data format is unrecognized.");
    alert("صيغة بيانات التحضير غير معروفة أو تالفة.");
    return;
  }

  // --- Proceed with applying the data (now guaranteed to be in 'prepData' object format) ---
  log("info", "Applying Data:", prepData);
  const prepContainer = document.querySelector(PREPARATION_CONTAINER_SELECTOR);
  if (!prepContainer) {
    log(
      "error",
      "Preparation container not found:",
      PREPARATION_CONTAINER_SELECTOR
    );
    alert("Error: Could not find the preparation area.");
    return;
  }

  // --- Clear Existing Dynamic Content ---
  log("info", "Clearing existing dynamic content...");
  // Clear page's internal lists (assuming they exist on window)
  if (window.listOfActivities) window.listOfActivities = [];
  if (window.listOfAssignments) window.listOfAssignments = [];
  if (window.listOfExams) window.listOfExams = [];
  if (window.listOfProjects) window.listOfProjects = [];
  // Trigger page functions to update UI from cleared lists
  if (typeof window.loadActivitiesList === "function")
    window.loadActivitiesList();
  if (typeof window.loadAssignmentsList === "function")
    window.loadAssignmentsList();
  if (typeof window.loadExamsList === "function") window.loadExamsList();
  if (typeof window.loadProjectsList === "function") window.loadProjectsList();
  // Remove any markers/UI added by previous imports
  document
    .querySelectorAll(".preparation-import-item")
    .forEach((el) => el.remove());
  // Clear attachments managed by the page's jsModel
  if (window.jsModel) window.jsModel.files = [];
  if (typeof window.fillJsModelFile === "function") window.fillJsModelFile();

  // --- Apply Data ---

  // 1. Attachments
  if (Array.isArray(prepData.attachments)) {
    if (window.jsModel) {
      try {
        // Deep clone attachments to avoid modifying original loaded data
        window.jsModel.files = JSON.parse(JSON.stringify(prepData.attachments));
      } catch (e) {
        log("error", "Failed to clone attachments for jsModel", e);
        // Fallback: shallow copy (might cause issues if page modifies jsModel.files items)
        window.jsModel.files = [...prepData.attachments];
      }
      // Trigger page function to render attachments from jsModel
      if (typeof window.fillJsModelFile === "function")
        window.fillJsModelFile();
      log("info", "Applied", prepData.attachments.length, "attachments.");
    } else {
      log("warn", "jsModel not available on window to apply attachments.");
    }
  }

  // 2. Checked Options (Checkboxes/Radios)
  // Uncheck all first to handle cases where previously checked items are no longer checked
  prepContainer
    .querySelectorAll('input[type="checkbox"], input[type="radio"]')
    .forEach((el) => {
      el.checked = false;
      el.dispatchEvent(new Event("change", { bubbles: true })); // Trigger change after unchecking
    });
  if (Array.isArray(prepData.checkedOptions)) {
    prepData.checkedOptions.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.checked = true;
        // Trigger both click and change events for max compatibility with page listeners
        element.dispatchEvent(new Event("click", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        log("warn", `Checkbox/Radio ID "${id}" not found during apply.`);
      }
    });
    log("info", "Applied", prepData.checkedOptions.length, "checked options.");
  }

  // 3. Text Inputs (Textareas, specific inputs)
  if (Array.isArray(prepData.textInputs)) {
    prepData.textInputs.forEach(([id, value]) => {
      const element = document.getElementById(id);
      // Check if the value is actually defined before setting
      if (element && typeof value !== "undefined" && value !== null) {
        element.value = value;
        // Trigger change event for potential page listeners
        element.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (!element) {
        log("warn", `Text input ID "${id}" not found during apply.`);
      }
    });
    log("info", "Applied", prepData.textInputs.length, "text inputs.");
  }

  // 4. Named Inputs (Inputs identified by name attribute)
  if (Array.isArray(prepData.namedInputs)) {
    prepData.namedInputs.forEach(([name, value]) => {
      const element = prepContainer.querySelector(`[name="${name}"]`);
      if (element && typeof value !== "undefined" && value !== null) {
        element.value = value;
        // Trigger change event
        element.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (!element) {
        log("warn", `Input with name "${name}" not found during apply.`);
      }
    });
    log("info", "Applied", prepData.namedInputs.length, "named inputs.");
  }

  // 5. Assignments, Exams, Projects (Add UI for import trigger - MODIFIED FOR MODAL)
  const addImportButton = (targetDivId, url, type, index) => {
    const targetDiv = document.getElementById(targetDivId);
    if (!targetDiv) {
      log(
        "warn",
        `Target div "${targetDivId}" for adding import button not found.`
      );
      return;
    }
    if (!url || typeof url !== "string") {
      log(
        "warn",
        `Invalid URL provided for import item type ${type} at index ${index}:`,
        url
      );
      return; // Skip invalid entries
    }

    let buttonText, actionFuncName, viewText;

    // Determine button text and action function based on type
    switch (type) {
      case "assignment":
        buttonText = "إضافة الواجب وإرساله";
        actionFuncName = "checkAndAddAssignment";
        viewText = "استعراض الواجب";
        break;
      case "exam":
        buttonText = "إضافة الاختبار وإرساله";
        actionFuncName = "addExamFromExport";
        viewText = "استعراض الاختبار";
        break;
      case "project":
        buttonText = "إضافة النشاط وإرساله";
        actionFuncName = "addProjectFromExport";
        viewText = "استعراض النشاط";
        break;
      default:
        log("warn", `Unknown import item type: ${type}`);
        return; // Skip unknown types
    }

    // Ensure the action functions and modal function are accessible from the global scope
    // This is necessary because the onclick handlers run in the page's context, not the content script's isolated world.
    ensureFunctionOnWindow("checkAndAddAssignment", checkAndAddAssignment);
    ensureFunctionOnWindow("addExamFromExport", addExamFromExport);
    ensureFunctionOnWindow("addProjectFromExport", addProjectFromExport);
    ensureFunctionOnWindow("showPreviewModal", showPreviewModal); // Ensure modal function is accessible

    // Create the container for the buttons
    const container = document.createElement("div");
    container.className = "preparation-import-item"; // Add class for potential later cleanup/styling
    // Style for horizontal layout
    container.style.cssText = `
          float: right;
          margin: 10px;
          padding: 8px;
          background-color: #e0f2f1; /* Light teal background */
          border: 1px solid #00796b; /* Teal border */
          border-radius: 5px;
          display: flex; /* Arrange buttons horizontally */
          gap: 8px; /* Space between buttons */
          align-items: center; /* Align buttons vertically */
          width: auto; /* Adjust width based on content */
       `;

    // Create the "Add Directly" button
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.textContent = buttonText;
    addButton.title =
      "إضافة هذا العنصر مباشرة إلى تحضير الدرس الحالي بدون معاينة";
    addButton.style.cssText = `
          background-color: #00796b; /* Teal */
          color: white;
          border: none;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
       `;
    // On click, disable buttons in this group and call the action function
    addButton.onclick = () => {
      const parentItem = addButton.closest(".preparation-import-item");
      if (parentItem) {
        parentItem.style.opacity = "0.5"; // Visual feedback
        parentItem
          .querySelectorAll("button")
          .forEach((btn) => (btn.disabled = true)); // Disable all buttons in this item
      }
      // Call the appropriate function (checkAndAddAssignment, etc.) from the window scope
      if (typeof window[actionFuncName] === "function") {
        window[actionFuncName](url);
      } else {
        log("error", `Action function ${actionFuncName} not found on window.`);
        // Re-enable buttons if function fails?
        if (parentItem) {
          parentItem.style.opacity = "1";
          parentItem
            .querySelectorAll("button")
            .forEach((btn) => (btn.disabled = false));
        }
      }
    };

    // Create the "Show Preview" button
    const previewButton = document.createElement("button");
    previewButton.type = "button";
    previewButton.className = "show-preview-modal-btn";
    previewButton.textContent = viewText;
    previewButton.title = "فتح نافذة معاينة لهذا العنصر قبل إضافته";
    previewButton.style.cssText = `
          background-color: #4db6ac; /* Lighter teal */
          color: white;
          border: none;
          padding: 5px 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
       `;
    // On click, call the function to show the preview modal
    previewButton.onclick = () => {
      // Call showPreviewModal, passing necessary info including the action function name
      // and a reference to the button container (for potential disabling from modal)
      if (typeof window.showPreviewModal === "function") {
        window.showPreviewModal(url, type, actionFuncName, container);
      } else {
        log("error", "showPreviewModal function not found on window.");
        alert("فشل فتح نافذة المعاينة.");
      }
    };

    // Add buttons to the container
    container.appendChild(addButton);
    container.appendChild(previewButton);

    // Add the container to the target div (e.g., assignmentAddbtn)
    // Prepend to show newest items at the top
    targetDiv.prepend(container);
  };

  // Loop through assignments, exams, projects and add their import buttons
  (prepData.assignments || []).forEach((url, i) =>
    addImportButton("assignmentAddbtn", url, "assignment", i)
  );
  (prepData.exams || []).forEach((url, i) =>
    addImportButton("examAddbtn", url, "exam", i)
  );
  (prepData.projects || []).forEach((url, i) =>
    addImportButton("projectAddbtn", url, "project", i)
  );
  log("info", "Added UI buttons for importing items (with modal preview).");

  // 6. Activities (Add directly using page functions)
  if (Array.isArray(prepData.activities)) {
    // Check for new activity format
    if (prepData.activities.length > 0 && prepData.activities[0].activityId) {
      prepData.activities.forEach(activity => {
        let param = {
          activityId: activity.activityId,
          SchoolId: activity.SchoolId,
          selectedUnitId: activity.selectedUnitId,
          TimeTableId: activity.TimeTableId,
          activityName: activity.activityName,
          activityType: activity.activityType
        };

        if (activity.activityType === 'url') {
          param.ActivityURL = activity.url;
        } else {
          param.filePath = activity.filePath;
        }

        ajaxPost('/Teacher/LectureTools/AddActivityToLecture', param, '').done(function (data) {
          log("info", "Successfully added activity via API: ", activity.activityName);
        });
      });
    } else {
    let activitiesAdded = 0;
    prepData.activities.forEach(([urlOrPath, name]) => {
      // Skip if essential data is missing
      if (!urlOrPath || !name) {
        log("warn", "Skipping activity with missing URL or name:", [
          urlOrPath,
          name,
        ]);
        return;
      }
      try {
        // Check if required global variables/functions from the page exist
        if (
          typeof window.ActivityType === "undefined" ||
          typeof window.ActivityName === "undefined" ||
          typeof window.ActivityURL === "undefined"
        ) {
          log(
            "error",
            "Activity popup elements (ActivityType, ActivityName, ActivityURL) not found globally. Cannot add activity."
          );
          return;
        }
        if (
          typeof window.showpopup !== "function" ||
          typeof window.checkActivityType !== "function" ||
          typeof window.checkValues !== "function"
        ) {
          log(
            "error",
            "Required activity popup functions (showpopup, checkActivityType, checkValues) not found. Cannot add activity."
          );
          return;
        }

        // Open the page's "Add Activity" popup
        window.showpopup("btnAddActivity");

        // Get references to elements *after* the popup is shown (they might be dynamic)
        const activityTypeSelect = document.getElementById("ActivityType");
        const activityNameInput = document.getElementById("ActivityName");
        const activityUrlInput = document.getElementById("ActivityURL");

        // Proceed only if elements were found inside the popup
        if (activityTypeSelect && activityNameInput && activityUrlInput) {
          activityTypeSelect.value = "1"; // Type 1 corresponds to 'رابط' (URL/Link) based on original code
          window.checkActivityType(); // Trigger page logic associated with changing the type

          activityNameInput.value = name; // Set activity name

          // Ensure the URL is absolute if it's a relative path
          let fullUrl = urlOrPath;
          if (
            urlOrPath &&
            !urlOrPath.startsWith("http") &&
            !urlOrPath.startsWith("/")
          ) {
            fullUrl = "https://schools.madrasati.sa/" + urlOrPath; // Prepend domain if needed
          } else if (urlOrPath && urlOrPath.startsWith("/")) {
            fullUrl = "https://schools.madrasati.sa" + urlOrPath; // Prepend domain if relative from root
          }
          activityUrlInput.value = fullUrl; // Set the URL

          window.checkValues(); // Trigger the page's validation/submit logic for the activity popup
          activitiesAdded++;
        } else {
          log(
            "warn",
            "Activity popup elements not found even after calling showpopup."
          );
          // Attempt to close the popup gracefully if elements weren't found
          document
            .querySelector(
              '#activityModal .close, #btnAddActivity .close, #btnAddActivity [data-dismiss="modal"]'
            )
            ?.click();
        }
      } catch (e) {
        log("error", "Error occurred while trying to add activity:", name, e);
        // Attempt to close the popup in case of error
        document
          .querySelector(
            '#activityModal .close, #btnAddActivity .close, #btnAddActivity [data-dismiss="modal"]'
          )
          ?.click();
      }
    });
    log(
      "info",
      "Attempted to add",
      activitiesAdded,
      "activities directly using page functions."
    );
  }
}

  // Final confirmation message
  alert("تم تطبيق بيانات التحضير بنجاح!");
}
// --- Button Action Handlers ---
function saveCurrentPreparationLocally() {
  log("info", "Save button clicked.");
  const titleElement = document.querySelector("#Title"); // Assuming #Title holds lesson title
  const defaultName =
    titleElement?.value || `تحضير ${new Date().toLocaleDateString("ar-SA")}`;
  const prepName = prompt("يرجى إدخال اسم مميز لحفظ هذا التحضير:", defaultName);
  if (!prepName) {
    alert("تم إلغاء الحفظ.");
    return;
  }

  const currentData = getCurrentPreparationData(prepName);
  if (!currentData) {
    alert("حدث خطأ أثناء جمع بيانات التحضير.");
    return;
  }

  try {
    let savedPreparations = JSON.parse(
      localStorage.getItem(LOCAL_STORAGE_KEY) || "[]"
    );
    const existingIndex = savedPreparations.findIndex(
      (p) => p.name === prepName
    );
    if (existingIndex > -1) {
      if (
        !confirm(`يوجد تحضير محفوظ بنفس الاسم "${prepName}". هل تريد استبداله؟`)
      ) {
        alert("تم إلغاء الحفظ.");
        return;
      }
      savedPreparations[existingIndex] = currentData;
    } else {
      savedPreparations.push(currentData);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedPreparations));
    alert(`تم حفظ التحضير باسم "${prepName}" بنجاح.`);
  } catch (e) {
    log("error", "Failed to save preparation to localStorage:", e);
    alert(`فشل حفظ التحضير: ${e.message}`);
  }
}

function loadPreparationFromFile() {
  log("info", "Load button clicked.");
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json, .txt"; // Accept both extensions
  fileInput.style.display = "none";

  fileInput.onchange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    log("info", "File selected:", file.name, "Type:", file.type); // Log file type

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const fileContent = e.target.result;
        log(
          "info",
          "File content read successfully (type: text). Attempting JSON parse..."
        );
        const preparationData = JSON.parse(fileContent); // Parse the text content as JSON

        // **Crucially, applyPreparationData will now handle format detection**
        applyPreparationData(preparationData);
      } catch (err) {
        log("error", "Error reading or parsing file:", err);
        alert(
          `فشل قراءة ملف التحضير. تأكد من أن الملف يحتوي على بيانات JSON صحيحة بالصيغة المتوقعة.\n${err.message}`
        );
      } finally {
        event.target.value = null;
        try {
          document.body.removeChild(fileInput);
        } catch (e) {}
      }
    };
    reader.onerror = (e) => {
      log("error", "FileReader error:", reader.error);
      alert(`خطأ قراءة الملف: ${reader.error.name}`);
      try {
        document.body.removeChild(fileInput);
      } catch (e) {}
    };

    reader.readAsText(file); // Read the file *as text*
  };

  document.body.appendChild(fileInput);
  fileInput.click();
}

// --- Create and Append Buttons UI ---
function createControlButtons() {
  if (document.getElementById(BUTTON_CONTAINER_ID)) {
    log("info", "Buttons already exist.");
    return;
  }

  const buttonContainer = document.createElement("div");
  buttonContainer.id = BUTTON_CONTAINER_ID;
  buttonContainer.style.cssText = `
        position: fixed;
        bottom: 15px;
        left: 15px;
        z-index: 99999;
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-family: Tahoma, Arial, sans-serif;
    `;

  const createButton = (text, title, color, onClickAction) => {
    const button = document.createElement("button");
    button.textContent = text;
    button.title = title;
    button.style.cssText = `
            padding: 8px 12px;
            background-color: ${color};
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            text-align: right;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            transition: background-color 0.2s ease;
        `;
    button.onmouseover = () => {
      button.style.backgroundColor = lightenColor(color, -20);
    };
    button.onmouseout = () => {
      button.style.backgroundColor = color;
    };
    button.onclick = onClickAction;
    return button;
  };

  const saveButton = createButton(
    "💾 حفظ التحضير الحالي (للجهاز)",
    "حفظ التحضير لاستيراده في تحضير حصة أخرى (خاص على الجهاز)",
    "#039d8f",
    saveCurrentPreparationLocally
  );
  const loadButton = createButton(
    "📤 تحميل تحضير من ملف",
    "رفع تحضير تم حفظه مسبقًا أو مشاركته معك",
    "#3aa79d",
    loadPreparationFromFile
  );

  buttonContainer.appendChild(saveButton);
  buttonContainer.appendChild(loadButton);
  document.body.appendChild(buttonContainer);
  log("info", "Control buttons created.");

  // Hide buttons if lesson date is in the past
  const startDateInput = document.querySelector('input[name="StartDate"]');
  if (startDateInput?.value) {
    try {
      const lessonDate = new Date(startDateInput.value);
      const now = new Date();
      lessonDate.setHours(0, 0, 0, 0);
      now.setHours(0, 0, 0, 0);
      if (lessonDate < now) {
        log("info", "Lesson date passed. Hiding buttons.");
        buttonContainer.style.display = "none";
      }
    } catch (e) {
      log("error", "Error parsing lesson date:", e);
    }
  } else {
    log("warn", "StartDate input not found.");
  }
}

// --- Initialization function to be exported ---
export function injectLessonsPopup() {
  log("info", "Initializing Preparation Popup Feature...");

  // Wait for the main preparation container.
  let attempts = 0;
  const maxAttempts = 30; // ~15 seconds
  const checkInterval = setInterval(() => {
    attempts++;
    const containerReady = !!document.querySelector(
      PREPARATION_CONTAINER_SELECTOR
    );
    // Also check for a global function that indicates page scripts have likely run
    const pageScriptsReady = typeof window.loadActivitiesList === "function";

    if (containerReady && pageScriptsReady) {
      clearInterval(checkInterval);
      log("info", "Page ready. Creating control buttons.");
      createControlButtons();
    } else if (attempts > maxAttempts) {
      clearInterval(checkInterval);
      log(
        "warn",
        "Page did not become ready in time. Preparation buttons not added."
      );
    }
  }, 500);
}
