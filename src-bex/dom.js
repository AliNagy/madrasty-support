// Hooks added here have a bridge allowing communication between the Web Page and the BEX Content Script.
// More info: https://quasar.dev/quasar-cli/developing-browser-extensions/dom-hooks
import { bexDom } from "quasar/wrappers";
import { injectPreparationPopup } from "./features/preparation-popup";
import { injectGradingPopup } from "./features/grading-popup";
import { injectAssignmentsPopup } from "./features/assignments-popup";
import { injectProjectsPopup } from "./features/projects-popup";
import { injectLessonsPopup } from "./features/lessons-popup";

export default bexDom((/* bridge */) => {
  // Initialize all features
  injectGradingPopup();
  injectProjectsPopup();
  injectAssignmentsPopup();
  injectPreparationPopup();
  injectLessonsPopup();
});
