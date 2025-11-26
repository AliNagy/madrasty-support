/**
 * Injects a preparation popup for lesson planning
 * This popup allows teachers to save and load lesson preparation data
 */
export function injectPreparationPopup() {
  const urlPattern =
    "https://schools.madrasati.sa/Teacher/Lessons/LessonDetailsNew";
  const urlPattern2 = "https://madrasati.sa/Teacher/Lessons/LessonDetailsNew";
  const urlPattern3 =
    "https://schools.madrasati.sa/Teacher/Droos/ViewDroosLectureDetails";
  const urlPattern4 =
    "https://madrasati.sa/Teacher/Droos/ViewDroosLectureDetails";
  const urlPattern5 =
    "https://schools.madrasati.sa/Teacher/Lessons/MultiLessonDetailsNew";

  if (
    !window.location.href.startsWith(urlPattern) &&
    !window.location.href.startsWith(urlPattern2) &&
    !window.location.href.startsWith(urlPattern3) &&
    !window.location.href.startsWith(urlPattern4) &&
    !window.location.href.startsWith(urlPattern5)
  ) {
    return;
  }

  const popup = document.createElement("div");
  popup.style.position = "fixed";
  popup.style.bottom = "20px";
  popup.style.right = "20px";
  popup.style.backgroundColor = "#fff";
  popup.style.padding = "10px";
  popup.style.border = "1px solid #ccc";
  popup.style.borderRadius = "5px";

  const uploadButton = document.createElement("button");
  uploadButton.textContent = "Upload";
  uploadButton.style.display = "block";
  uploadButton.style.width = "100%";
  uploadButton.style.marginBottom = "5px";
  uploadButton.style.backgroundColor = "#E33437";
  uploadButton.style.color = "white";

  uploadButton.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".txt";
    input.onchange = (event) => {
      const file = event.target.files[0];
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);

          // 1. Checkboxes
          const checkboxIds = ["goal", "chkbox", "strategy", "teachingTools"];
          const checkedCheckboxes = data[2] || [];
          checkboxIds.forEach((id) => {
            const checkboxes = document.querySelectorAll(
              `input[type="checkbox"][id^="${id}"]`
            );
            checkboxes.forEach((checkbox) => {
              if (
                checkbox.checked !== checkedCheckboxes.includes(checkbox.id)
              ) {
                checkbox.click();
              }
            });
          });

          // 2. Input Fields
          const inputIds = [
            "LectureClassPreparationText",
            "LessonVocabulary",
            "ThinkingSkills",
            "LectureClassCloseText",
            "TeacherNote",
          ];
          const inputValues = data[3] || [];
          inputValues.forEach(([id, value]) => {
            const input = document.getElementById(id);
            if (input) {
              input.value = value;
            }
          });
        } catch (error) {
          console.error("Error parsing file:", error);
          alert("Invalid file format. Please upload a valid text file.");
        }
      };

      reader.readAsText(file);
    };
    input.click();
  });

  const downloadButton = document.createElement("button");
  downloadButton.textContent = "Download";
  downloadButton.style.display = "block";
  downloadButton.style.width = "100%";
  downloadButton.style.backgroundColor = "#46C263";
  downloadButton.style.color = "white";

  downloadButton.addEventListener("click", () => {
    const filenameInput = document.getElementById("LessonIds[0].Name");
    const filename = filenameInput?.value || "data.txt";

    const data = [[filename], [[]]];

    // 1. Checkboxes
    const checkboxIds = ["goal", "chkbox", "strategy", "teachingTools"];
    const checkedCheckboxes = [];
    checkboxIds.forEach((id) => {
      const checkboxes = document.querySelectorAll(
        `input[type="checkbox"][id^="${id}"]:checked`
      );
      checkboxes.forEach((checkbox) => checkedCheckboxes.push(checkbox.id));
    });
    data.push(checkedCheckboxes);

    // 2. Input Fields
    const inputIds = [
      "LectureClassPreparationText",
      "LessonVocabulary",
      "ThinkingSkills",
      "LectureClassCloseText",
      "TeacherNote",
    ];
    const inputValues = [];
    inputIds.forEach((id) => {
      const input = document.getElementById(id);
      if (input) {
        inputValues.push([id, input.value]);
      }
    });
    data.push(inputValues);

    // Create and Save File
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "text/plain",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  });

  popup.appendChild(uploadButton);
  popup.appendChild(downloadButton);

  document.body.appendChild(popup);
}
