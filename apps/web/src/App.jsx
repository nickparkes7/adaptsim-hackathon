import { useEffect } from "react";
import { CaptureSimulationFlow } from "./components/CaptureSimulationFlow";
import { FinalCheckStep, LocationStep } from "./components/ControlRail";
import { MapStage } from "./components/MapStage";
import { OutputPanels } from "./components/OutputPanels";
import { SourceIntake } from "./components/SourceIntake";
import { SummaryStrip } from "./components/SummaryStrip";
import { initializeAdaptSimWorkbench } from "./lib/adaptsimWorkbench";
import "./styles.css";

const workflowSteps = [
  { id: "01", label: "Intake", path: "/intake" },
  { id: "02", label: "Map", path: "/map" },
  { id: "03", label: "Snapshot", path: "/snapshot" },
  { id: "04", label: "Launch", path: "/launch" }
];

function BrandLockup() {
  return (
    <div className="brand-block workflow-brand">
      <button
        className="brand-lockup workflow-home-button"
        type="button"
        data-workflow-home-step="01"
        aria-label="Return to Step 01 source intake"
      >
        <div className="brand-mark" aria-hidden="true">
          <span>Adapt</span>
          <strong>Sim</strong>
        </div>
        <div className="army-mark" aria-label="U.S. Army">
          <svg className="army-star" viewBox="0 0 100 95" aria-hidden="true" focusable="false">
            <path d="M50 2 61.9 35.8H97L68.7 56.9 79.2 91 50 70.3 20.8 91 31.3 56.9 3 35.8h35.1L50 2Z" />
            <path d="M50 28.5 56.5 46.6h19L60.1 58.1l5.8 18.5L50 65.3 34.1 76.6l5.8-18.5L24.5 46.6h19L50 28.5Z" />
          </svg>
          <span>U.S. ARMY</span>
        </div>
      </button>
    </div>
  );
}

function WorkflowStepper() {
  return (
    <nav className="workflow-stepper" aria-label="Simulation steps">
      {workflowSteps.map((step) => (
        <button
          key={step.id}
          className="workflow-step-tab"
          type="button"
          data-workflow-nav-step={step.id}
          data-workflow-route={step.path}
          aria-controls={`workflow-page-${step.id}`}
          aria-current={step.id === "01" ? "step" : undefined}
          aria-label={`${step.id} ${step.label}`}
          disabled={step.id !== "01"}
        >
          <span aria-hidden="true">{step.id}</span>
          <em className="sr-only" data-workflow-nav-status="">
            {step.id === "01" ? "Start" : "Locked"}
          </em>
        </button>
      ))}
    </nav>
  );
}

export default function App() {
  useEffect(() => {
    void initializeAdaptSimWorkbench();
  }, []);

  return (
    <>
      <a className="skip-link" href="#main-workspace">
        Skip to Workbench
      </a>
      <div className="app-shell">
        <header className="workflow-header">
          <BrandLockup />
          <WorkflowStepper />
        </header>
        <main id="main-workspace" className="workspace workflow-pages" data-active-step="01">
          <SourceIntake />
          <MapStage />
          <section
            id="workflow-page-03"
            className="workflow-page workflow-page-stack snapshot-workflow-page"
            data-workflow-page="03"
            aria-label="Generate snapshot workflow page"
            aria-hidden="true"
            tabIndex={-1}
          >
            <LocationStep />
            <SummaryStrip />
            <OutputPanels />
          </section>
          <FinalCheckStep />
        </main>
        <footer className="workflow-page-footer" aria-label="Step controls">
          <button id="workflow-prev-step" className="quiet-button" type="button" disabled>
            Back
          </button>
          <button id="workflow-next-step" className="primary-button" type="button" disabled>
            Next Step
          </button>
        </footer>
        <details className="capture-pipeline-disclosure">
          <summary>Capture pipeline</summary>
          <CaptureSimulationFlow />
        </details>
      </div>
    </>
  );
}
