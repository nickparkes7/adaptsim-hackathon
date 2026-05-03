import { useEffect } from "react";
import { FinalCheckStep, LocationStep } from "./components/ControlRail";
import { MapStage } from "./components/MapStage";
import { OutputPanels } from "./components/OutputPanels";
import {
  RunSimulationPage,
  SimulationWorkflowProvider,
  SourceSimulationPanel,
  ThreatWorkflowPanel
} from "./components/SimulationWorkflow";
import { SourceIntake } from "./components/SourceIntake";
import { SummaryStrip } from "./components/SummaryStrip";
import { Button } from "./components/ui/button";
import { initializeAdaptSimWorkbench } from "./lib/adaptsimWorkbench";
import "./styles.css";

const workflowSteps = [
  { id: "01", label: "Source", path: "/source" },
  { id: "02", label: "Scene", path: "/scene" },
  { id: "03", label: "Threats", path: "/threats" },
  { id: "04", label: "Run", path: "/run" }
];

function BrandLockup() {
  return (
    <div className="brand-block workflow-brand">
      <Button
        variant="ghost"
        className="brand-lockup workflow-home-button"
        type="button"
        data-workflow-home-step="01"
        aria-label="Return to Step 01 source intake"
      >
        <div className="brand-mark" aria-hidden="true">
          <span>ADAPT</span>
          <strong className="brand-mark-sim">SIM</strong>
        </div>
      </Button>
    </div>
  );
}

function WorkflowStepper() {
  return (
    <nav className="workflow-stepper" aria-label="Simulation steps">
      <SourceSimulationPanel />
      {workflowSteps.map((step) => (
        <Button
          key={step.id}
          variant="ghost"
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
          <strong>{step.label}</strong>
          <em className="sr-only" data-workflow-nav-status="">
            {step.id === "01" ? "Start" : "Locked"}
          </em>
        </Button>
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
      <SimulationWorkflowProvider>
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
              className="workflow-page workflow-page-stack snapshot-workflow-page threats-workflow-page"
              data-workflow-page="03"
              aria-label="Threat package workflow page"
              aria-hidden="true"
              tabIndex={-1}
            >
              <LocationStep />
              <SummaryStrip />
              <FinalCheckStep embedded step="03" title="Operation Context" />
              <ThreatWorkflowPanel />
              <OutputPanels />
              <div className="threat-generation-actions" aria-label="Threat database generation">
                <Button id="reason-note" className="primary-button threat-generate-button" type="button" disabled>
                  Generate Threat Database
                </Button>
              </div>
            </section>
            <RunSimulationPage />
          </main>
          <footer className="workflow-page-footer" aria-label="Step controls">
            <Button id="workflow-prev-step" className="quiet-button" variant="outline" type="button" disabled>
              Back
            </Button>
            <Button id="workflow-next-step" className="primary-button" type="button" disabled>
              Next Step
            </Button>
          </footer>
        </div>
      </SimulationWorkflowProvider>
    </>
  );
}
