import { useEffect } from "react";
import { CaptureSimulationFlow } from "./components/CaptureSimulationFlow";
import { ControlRail } from "./components/ControlRail";
import { MapStage } from "./components/MapStage";
import { OutputPanels } from "./components/OutputPanels";
import { SourceIntake } from "./components/SourceIntake";
import { SummaryStrip } from "./components/SummaryStrip";
import { initializeAdaptSimWorkbench } from "./lib/adaptsimWorkbench";
import "./styles.css";

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
        <ControlRail />
        <main id="main-workspace" className="workspace">
          <CaptureSimulationFlow />
          <SourceIntake />
          <MapStage />
          <SummaryStrip />
          <OutputPanels />
        </main>
      </div>
    </>
  );
}
