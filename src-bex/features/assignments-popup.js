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
export function injectAssignmentsPopup() {
  const assignmentsButtonText = "الواجبات المرسلة";
  const assignmentsAutoCorrectButtonText = "تصحيح سريع";
  const assignmentsAddButtonText = "إضافة واجب";
  const assignmentsMassCorrectButtonText = "تصحيح كل ما بالصحفة";
  const assignmentsAnswersButtonText = "إجابات الطلاب";
  const assignmentsAnswersButtonTextAlt = "رصد الدرجات";
  const assignmentsErrorText = "لا توجد واجبات مرسلة منشأة في النظام حاليا";
  const assignmentsCorrectionTypeLabelText = "مصدر الواجب";
  const assignmentsCorrectionFromBankText = "بنك الأسئلة";
  const assignmentsMaxGradingLabelText = "درجة الواجب";

  function hasAnsweredFields(formData) {
    for (const [key, value] of formData.entries()) {
      if (key.endsWith(".hasAnswer") && value === "True") {
        return true; // At least one field is answered
      }
    }
    return false; // No fields are marked as answered
  }

  async function onQuickCorrection(element, quickConfig) {
    try {
      // Add prompt to get values and comments.
      let field1;
      let field2;
      let field3;
      let checkbox1;

      if (quickConfig) {
        field1 = quickConfig.field1;
        field2 = quickConfig.field2;
        field3 = quickConfig.field3;
        checkbox1 = quickConfig.checkbox1;
      } else {
        const config = await createInputPopup();

        field1 = config.field1;
        field2 = config.field2;
        field3 = config.field3;
        checkbox1 = config.checkbox1;
      }

      createLoadingOverlay();

      let pageNumber = 1;

      const url = element.href;

      const autoCorrectionPageURLs = [];

      for (let type = 1; type <= 3; type++) {
        pageNumber = 1;
        while (true) {
          const parentContent = await fetchLinkContent(
            `${url}&pageNumber=${pageNumber}&searchClassRoom=0&type=${type}`
          );

          const parentContentAsDiv = document.createElement("div");
          parentContentAsDiv.innerHTML = parentContent;

          const alertDivs = Array.from(
            parentContentAsDiv.querySelectorAll("div.alert")
          );
          const alertDiv = alertDivs.find((alertDiv) =>
            alertDiv.innerText.includes(assignmentsErrorText)
          );
          if (alertDiv) break;

          const autoCorrectionPageURLsOnPage = findLinksWithText(
            assignmentsAnswersButtonText,
            parentContentAsDiv
          );

          const autoCorrectionPageURLsOnPageAlt = findLinksWithText(
            assignmentsAnswersButtonTextAlt,
            parentContentAsDiv
          );

          autoCorrectionPageURLs.push(
            ...autoCorrectionPageURLsOnPage.map((el) => el.href)
          );

          autoCorrectionPageURLs.push(
            ...autoCorrectionPageURLsOnPageAlt.map((el) => el.href)
          );

          pageNumber++;

          break;
        }
      }

      for (const pageURL of autoCorrectionPageURLs) {
        // Process first page
        await processGradingPage(pageURL, field1, field2, field3, checkbox1);

        // Check for additional pages via pagination
        const initialPageContent = await fetchLinkContent(pageURL);
        const initialPageContentAsDiv = document.createElement("div");
        initialPageContentAsDiv.innerHTML = initialPageContent;

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
                checkbox1
              );
            }
          }
        }
      }
    } catch (error) {
      console.log(error);
    } finally {
      removeLoadingOverlay();
    }
  }

  // Helper function to process a single grading page
  async function processGradingPage(
    pageURL,
    field1,
    field2,
    field3,
    checkbox1
  ) {
    const pageContent = await fetchLinkContent(pageURL);
    const pageContentAsDiv = document.createElement("div");
    pageContentAsDiv.innerHTML = pageContent;

    const maximumGrade = getValueByPartialLabel(
      assignmentsMaxGradingLabelText,
      pageContentAsDiv
    ).trim();
    const isQuestionBank =
      getValueByPartialLabel(
        assignmentsCorrectionTypeLabelText,
        pageContentAsDiv
      ).trim() == assignmentsCorrectionFromBankText;

    const feedbackInputs = pageContentAsDiv.querySelectorAll(
      'textarea[id^="List_"][id$="__feedBack"]'
    );

    for (let i = 0; i < feedbackInputs.length; i++) {
      const studentIndex = feedbackInputs[i].id.split("__feedBack")[0];
      const gradeInput = pageContentAsDiv.querySelector(
        `#${studentIndex}__Grade`
      );

      const isOutsideSystem = pageContentAsDiv.querySelector(
        `#${studentIndex}__IsOutSideSystem`
      );

      if (isOutsideSystem && !isOutsideSystem.checked) {
        isOutsideSystem.click();
      }

      if (!isQuestionBank) {
        gradeInput.value = maximumGrade;
      }

      if (feedbackInputs[i].value && !checkbox1) continue;

      if (gradeInput.value == 0) feedbackInputs[i].value = field1;
      else if (gradeInput.value == maximumGrade)
        feedbackInputs[i].value = field3;
      else feedbackInputs[i].value = field2;
    }

    const form = pageContentAsDiv.querySelector("#GradeAssignment");
    if (!form) {
      throw new Error("Form not found in the fetched HTML");
    }

    const formData = new FormData(form);

    const formURLInput = pageContentAsDiv.querySelector("#gradeAssignmentUrl");
    const formURL = formURLInput.value;

    if (hasAnsweredFields(formData)) {
      await fetch(formURL, {
        method: form.method, // Default to GET if not specified
        body: formData,
      });
    }
  }

  const urlPattern = "https://schools.madrasati.sa/Teacher/Assignments/Index/";
  const urlPattern2 = "https://madrasati.sa/Teacher/Assignments/Index/";

  if (
    !window.location.href.startsWith(urlPattern) &&
    !window.location.href.startsWith(urlPattern2)
  ) {
    return;
  }

  const elements = findLinksWithText(assignmentsButtonText);

  const anchors = document.querySelectorAll("a");
  const massButton = Array.from(anchors).find((anchor) =>
    anchor.textContent.includes(assignmentsAddButtonText)
  );

  function delay(seconds) {
    return new Promise((resolve) => {
      setTimeout(() => resolve(), seconds * 1000);
    });
  }

  addSiblingButton(massButton, assignmentsMassCorrectButtonText, async () => {
    const config = await createInputPopup();

    for (const element of elements) {
      await onQuickCorrection(element, config);
      delay(1);
    }
  });

  for (let element of elements) {
    addSiblingButton(element, assignmentsAutoCorrectButtonText, () =>
      onQuickCorrection(element)
    );
  }
}
