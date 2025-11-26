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
 * Injects functionality for bulk grading of projects
 */
export function injectProjectsPopup() {
  const assignmentsButtonText = "الأنشطة المرسلة";
  const assignmentsAutoCorrectButtonText = "تصحيح سريع";
  const assignmentsAddButtonText = "إضافة نشاط";
  const assignmentsMassCorrectButtonText = "تصحيح كل ما بالصحفة";
  const assignmentsAnswersButtonText = "إجابات الطلاب";
  const assignmentsAnswersButtonTextAlt = "رصد الدرجات";
  const assignmentsAnswersButtonTextAlt2 = "ملاحظات المعلم";
  const assignmentsCorrectionTypeLabelText = "طريقة تسليم النشاط";
  const assignmentsAnswersType = "خارج النظام";
  const assignmentsMaxGradingLabelText = "درجة النشاط";

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

          const alertDiv = parentContentAsDiv.querySelector(
            "div.col-md-12.alert.alert-warning.text-center"
          );
          console.log("ALERT DIV >> ", alertDiv);
          if (alertDiv) break;

          const autoCorrectionPageURLsOnPage = findLinksWithText(
            assignmentsAnswersButtonText,
            parentContentAsDiv
          );

          const autoCorrectionPageURLsOnPageAlt = findLinksWithText(
            assignmentsAnswersButtonTextAlt,
            parentContentAsDiv
          );

          const autoCorrectionPageURLsOnPageAlt2 = findLinksWithText(
            assignmentsAnswersButtonTextAlt2,
            parentContentAsDiv
          );

          autoCorrectionPageURLs.push(
            ...autoCorrectionPageURLsOnPage.map((el) => el.href)
          );

          autoCorrectionPageURLs.push(
            ...autoCorrectionPageURLsOnPageAlt.map((el) => el.href)
          );

          autoCorrectionPageURLs.push(
            ...autoCorrectionPageURLsOnPageAlt2.map((el) => el.href)
          );

          pageNumber++;
        }
      }

      console.log("AUTO CORRECT PAGE URLS >> ", autoCorrectionPageURLs);

      for (const pageURL of autoCorrectionPageURLs) {
        const pageContent = await fetchLinkContent(pageURL);
        const pageContentAsDiv = document.createElement("div");
        pageContentAsDiv.innerHTML = pageContent;

        const maximumGrade = getValueByPartialLabel(
          assignmentsMaxGradingLabelText,
          pageContentAsDiv
        ).trim();
        const requiresAnswer =
          getValueByPartialLabel(
            assignmentsCorrectionTypeLabelText,
            pageContentAsDiv
          ).trim() == assignmentsAnswersType;

        console.log(maximumGrade, requiresAnswer);

        const feedbackInputs = pageContentAsDiv.querySelectorAll(
          'textarea[id^="List_"][id$="__feedBack"]'
        );

        for (let i = 0; i < feedbackInputs.length; i++) {
          const studentIndex = feedbackInputs[i].id.split("__feedBack")[0];
          const gradeInput = pageContentAsDiv.querySelector(
            `#${studentIndex}__Grade`
          );
          const answeredInput = pageContentAsDiv.querySelector(
            `#${studentIndex}__hasAnswer`
          );

          gradeInput.value = maximumGrade;

          if (feedbackInputs[i].value && !checkbox1) continue;

          if (gradeInput.value == 0) feedbackInputs[i].value = field1;
          else if (gradeInput.value == maximumGrade)
            feedbackInputs[i].value = field3;
          else feedbackInputs[i].value = field2;
        }

        const forms = pageContentAsDiv.querySelectorAll("form");
        const form = Array.from(forms).find(
          (form) => form.method.trim().toLowerCase() == "post"
        );
        if (!form) {
          throw new Error("Form not found in the fetched HTML");
        }

        const formData = new FormData(form);

        await fetch(form.action, {
          method: form.method, // Default to GET if not specified
          body: formData,
        });

        let extraPages = 2;

        while (true) {
          console.log("PAGE >> ", `${pageURL}&pageNumber=${extraPages}`);
          const extraPageContent = await fetchLinkContent(
            `${pageURL}&pageNumber=${extraPages}`
          );
          const extraPageContentAsDiv = document.createElement("div");
          extraPageContentAsDiv.innerHTML = extraPageContent;

          let alertDiv = false;
          const alertDivs = extraPageContentAsDiv.querySelectorAll("div.alert");

          for (let i = 0; i < alertDivs.length; i++) {
            if (
              alertDivs[i].textContent.includes(
                "لم يتم الإجابة على هذا النشاط من قِبل الطلاب"
              )
            ) {
              alertDiv = true;
              break;
            }
          }

          if (alertDiv) break;

          const extraFeedbackInputs = extraPageContentAsDiv.querySelectorAll(
            'textarea[id^="List_"][id$="__feedBack"]'
          );

          for (let i = 0; i < extraFeedbackInputs.length; i++) {
            const studentIndex =
              extraFeedbackInputs[i].id.split("__feedBack")[0];
            const gradeInput = extraPageContentAsDiv.querySelector(
              `#${studentIndex}__Grade`
            );

            gradeInput.value = maximumGrade;

            if (extraFeedbackInputs[i].value && !checkbox1) continue;

            if (gradeInput.value == 0) extraFeedbackInputs[i].value = field1;
            else if (gradeInput.value == maximumGrade)
              extraFeedbackInputs[i].value = field3;
            else extraFeedbackInputs[i].value = field2;
          }

          const extraForms = extraPageContentAsDiv.querySelectorAll("form");
          const extraForm = Array.from(extraForms).find(
            (form) => form.method.trim().toLowerCase() == "post"
          );
          if (!extraForm) {
            throw new Error("Form not found in the fetched HTML");
          }

          const extraFormData = new FormData(extraForm);

          extraFormData.set("pageNumber", extraPages);

          if (extraPages == 2) {
            console.log(extraForm);
            console.log(...extraFormData.entries());
          }

          await fetch(extraForm.action, {
            method: extraForm.method, // Default to GET if not specified
            body: extraFormData,
          });

          extraPages++;
        }
      }
    } catch (error) {
      console.log(error);
    } finally {
      removeLoadingOverlay();
    }
  }

  const urlPattern = "https://schools.madrasati.sa/Projects";
  const urlPattern2 = "https://madrasati.sa/Projects";

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

  addSiblingButton(massButton, assignmentsMassCorrectButtonText, async () => {
    const config = await createInputPopup();

    for (const element of elements) {
      await onQuickCorrection(element, config);
    }
  });

  for (let element of elements) {
    addSiblingButton(element, assignmentsAutoCorrectButtonText, () =>
      onQuickCorrection(element)
    );
  }
}
