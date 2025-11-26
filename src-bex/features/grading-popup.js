/**
 * Injects a grading popup for quickly setting grades and comments
 */
export function injectGradingPopup() {
  const urlPattern =
    "https://schools.madrasati.sa/Teacher/Assignments/GradeAssignment/";
  const urlPattern2 =
    "https://schools.madrasati.sa/Projects/Projects/GradeProject";

  if (
    !window.location.href.startsWith(urlPattern) &&
    !window.location.href.startsWith(urlPattern2)
  ) {
    return;
  }

  const popupContainer = document.createElement("div");
  popupContainer.style.position = "fixed";
  popupContainer.style.top = "10px";
  popupContainer.style.right = "10px";
  popupContainer.style.backgroundColor = "white";
  popupContainer.style.padding = "10px";
  popupContainer.style.border = "1px solid #ccc";
  popupContainer.style.borderRadius = "5px";
  popupContainer.style.zIndex = "9999";

  const gradeInput = document.createElement("input");
  gradeInput.type = "text";
  gradeInput.placeholder = "Grade";
  gradeInput.style.marginBottom = "5px";
  gradeInput.style.display = "block";

  const commentInput = document.createElement("input");
  commentInput.type = "text";
  commentInput.placeholder = "Comment";
  commentInput.style.marginBottom = "5px";
  commentInput.style.display = "block";

  const button = document.createElement("button");
  button.textContent = "Submit";
  button.style.width = "100%";

  button.addEventListener("click", () => {
    const gradeValue = gradeInput.value.trim();
    const feedbackValue = commentInput.value.trim();

    if (gradeValue !== "") {
      const gradeInputs = document.querySelectorAll(
        'input[id^="List_"][id$="__Grade"]'
      );
      for (let i = 0; i < gradeInputs.length; i++) {
        gradeInputs[i].value = gradeValue;
      }
    }

    if (feedbackValue !== "") {
      const feedbackInputs = document.querySelectorAll(
        'textarea[id^="List_"][id$="__feedBack"]'
      );
      for (let i = 0; i < feedbackInputs.length; i++) {
        feedbackInputs[i].value = feedbackValue;
      }
    }

    // Scroll to the end of the page
    window.scrollTo(0, document.body.scrollHeight);
  });

  popupContainer.appendChild(gradeInput);
  popupContainer.appendChild(commentInput);
  popupContainer.appendChild(button);

  document.body.appendChild(popupContainer);
}
