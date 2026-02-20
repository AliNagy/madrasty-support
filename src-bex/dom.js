// Hooks added here have a bridge allowing communication between the Web Page and the BEX Content Script.
// More info: https://quasar.dev/quasar-cli/developing-browser-extensions/dom-hooks
import { bexDom } from "quasar/wrappers";
import { injectPreparationPopup } from "./features/preparation-popup";
import { injectGradingPopup } from "./features/grading-popup";
import { injectAssignmentsPopup } from "./features/assignments-popup";
import { injectProjectsPopup } from "./features/projects-popup";
import { injectLessonsPopup } from "./features/lessons-popup";

export default bexDom((bridge) => {
  const scope = "AssignmentsQC:DOM";
  let bridgeLogFailed = false;

  function emitDomLog(level, event, details = {}) {
    const payload = {
      scope,
      level,
      event,
      details,
      ts: Date.now(),
      href: window.location.href,
    };
    const message = `[${scope}] event=${event} level=${level}`;

    console.log(message, payload);
    if (level === "error") {
      console.error(message, payload);
    } else if (level === "warn") {
      console.warn(message, payload);
    }

    if (!bridge || typeof bridge.send !== "function") {
      return;
    }

    Promise.resolve(
      bridge.send("log", {
        message,
        data: [payload],
      })
    ).catch((error) => {
      if (bridgeLogFailed) return;
      bridgeLogFailed = true;
      console.warn(`[${scope}] event=bridge_log_send_failed`, {
        message: error?.message,
      });
    });
  }

  emitDomLog("info", "dom_init_start");

  const features = [
    { name: "grading", inject: injectGradingPopup },
    { name: "projects", inject: injectProjectsPopup },
    { name: "assignments", inject: () => injectAssignmentsPopup(bridge) },
    { name: "preparation", inject: injectPreparationPopup },
    { name: "lessons", inject: injectLessonsPopup },
  ];

  for (const feature of features) {
    try {
      emitDomLog("info", "feature_inject_start", { feature: feature.name });
      feature.inject();
      emitDomLog("info", "feature_inject_success", { feature: feature.name });
    } catch (error) {
      emitDomLog("error", "feature_inject_failed", {
        feature: feature.name,
        message: error?.message,
        stack: error?.stack,
      });
    }
  }
});
