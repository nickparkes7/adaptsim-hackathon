# Defense Tech Hackathon: Project Brief

## Motivation

Modern military and industrial training relies on two broken paradigms. The first is physical simulation — wet trainers, live-fire ranges, and physical mockups that are expensive to build, geographically fixed, and limited to a small number of scripted scenarios. The second is digital simulation — pre-authored training modules that take months to develop per scenario, require deterministic specification of every threat vector, and can never cover the long tail of real-world situations a trainee will actually face.

The result is a training gap that is well-documented in the Navy and broader defense community. Current VR damage control training, for instance, certifies sailors for peacetime operations using isolated, evenly-distributed casualties where equipment always works and scenarios are predictable. Historical combat damage is nothing like this. The same dynamic applies to nuclear reactor operators, special forces teams, and shipyard workers — the most important training scenarios are often the ones that haven't been authored yet.

The core insight driving this project: **world reconstruction technology has matured to the point where any real physical environment can be digitized in minutes, and generative world models can now simulate physically plausible changes to that environment without deterministic authoring.** This makes it possible, for the first time, to generate novel training scenarios on demand for any location and any task.

---

## Problem Statement

Training scenario development is a bottleneck. For every high-priority training use case, there is a long tail of important but under-resourced scenarios that never get built — because deterministic module development is too expensive and slow to scale across the full diversity of real-world environments and tasks.

Concretely:

- A special forces team cannot train on the specific building they will enter tomorrow without someone authoring that scenario in advance.
- A nuclear reactor engineer cannot simulate an unexpected mid-procedure failure without a developer having anticipated and scripted that exact failure mode.
- A damage control team cannot train for simultaneous fire and flooding with equipment casualties unless someone built that specific multi-casualty scenario.

The status quo answer is to build fewer, higher-priority scenarios and accept that most real-world situations are undertrained. This project proposes a different answer.

---

## Proposed Demo

**AdaptSim: Non-Deterministic World Simulation for Military and Industrial Training**

A system that takes a real-world environment — captured in minutes with a phone or drone — and converts it into an interactive training simulation where an AI director introduces physically plausible, non-deterministic challenges that a human trainer did not have to author in advance.

### Demo Flow

**Scene Capture (pre-demo):** A real physical space (office corridor, machinery room, or similar available location) is photographed from multiple angles. fvdb-Reality-Capture reconstructs it into a navigable 3D Gaussian splat with an underlying collision mesh in under an hour on the demo hardware.

**Scenario Initialization:** The reconstructed environment is loaded. Cosmos Reason2 analyzes the scene and enumerates physically plausible threat categories given the environment geometry — pipe locations, exit routes, sight lines, structural features.

**Live Scenario Direction:** GPT-5.5 acts as a non-deterministic scenario director, selecting and sequencing threat events from Cosmos Reason2's scene analysis. It generates a natural language scene modification prompt: *"Smoke is beginning to fill from the eastern ventilation duct. Visibility drops to 4 meters. A secondary pipe failure opens at frame junction 7B."*

**Threat Injection:** Cosmos Transfer2.5 (Distilled Edge variant) takes a rendered view from the reconstructed scene and produces a photorealistic video clip showing the threat as it would appear in that specific environment — conditioned on the actual geometry, not a generic template.

**Trainee Response:** The trainee navigates the scenario and makes decisions.

**After-Action Review:** GPT-5.5 reviews the trainee's decision sequence against doctrine and produces a structured debrief — identifying delays, sequencing errors, and missed threat indicators — without requiring an instructor to be present.

### Two Use Cases Demonstrated

**Use Case 1 — Special Forces Training:** A reconstructed building interior. Cosmos Reason2 identifies threat positions based on room geometry. GPT-5.5 introduces non-deterministic adversary placement and environmental changes. The trainee cannot pattern-match to a known scenario because the scenario has never been run before.

**Use Case 2 — Nuclear/Industrial Workflow Training:** A reconstructed machinery space. A reactor engineer is walked through a procedure. Mid-workflow, GPT-5.5 introduces an unexpected system failure — coolant pressure anomaly, valve unresponsive — that was not scripted in advance. The trainee must adapt. GPT-5.5 reviews whether they followed correct casualty procedure.

---

## Tech Stack

### Hardware
- NVIDIA A100 40GB GPU (single node)
- Internet connectivity for GPT-5.5 API calls
- Phone or 360 camera for environment capture

### Environment Reconstruction
**fvdb-Reality-Capture** (NVIDIA, Apache 2.0)
- Converts multi-image captures into 3D Gaussian splats and high-quality meshes
- 50% better throughput than gsplat baseline, 30% lower runtime
- Fully local, no cloud dependency
- Requires COLMAP for structure-from-motion camera pose estimation
- Runs inside a Docker container with CUDA 12.8 base image (host is CUDA 12.2)

**COLMAP**
- Open-source structure-from-motion pipeline
- Provides camera poses to fvdb from raw image captures
- GPU-accelerated SIFT on Ampere architecture

### Scene Understanding
**Cosmos Reason2** (NVIDIA, NVIDIA Open Model License)
- Physical AI reasoning vision-language model
- 2B parameter variant (~6GB VRAM), served via vllm on port 8001
- Analyzes reconstructed environment to enumerate physically plausible threat categories
- Chain-of-thought reasoning over spatial and physical scene properties
- Pulled from `nvidia/Cosmos-Reason2-2B` on Hugging Face

### Threat Injection / World Modification
**Cosmos Transfer2.5 — Distilled Edge** (NVIDIA, Apache 2.0)
- Multi-controlnet world-to-world translation model
- Conditions on depth, segmentation, and edge maps extracted from the reconstructed scene
- Single-step distilled inference — fast enough for interactive demo pacing
- Produces photorealistic video clips of threat conditions in the specific reconstructed environment
- Pulled from `nvidia/Cosmos-Transfer2.5-2B` on Hugging Face, runs inside Docker

**Cosmos Predict2.5 2B** (NVIDIA, Apache 2.0)
- Video2World model for scene continuation
- Extends generated threat clips forward in time
- Pulled from `nvidia/Cosmos-Predict2.5-2B` on Hugging Face, runs inside Docker

### Scenario Direction and After-Action Review
**GPT-5.5 API** (OpenAI)
- Model string: `gpt-5.5`
- Used for non-deterministic scenario direction and structured after-action review
- API available as of April 24, 2026 at $5/1M input tokens, $30/1M output tokens
- Stateless API calls — no local VRAM consumed
- Architected as a swappable interface so a local model (e.g. Gemma 4 27B) can replace it in an airgapped deployment

### VRAM Allocation (40GB A100)

| Component | VRAM | Notes |
|---|---|---|
| Cosmos Reason2 2B (vllm) | ~6GB | Persistent scene analysis server |
| Cosmos Transfer2.5 2B | ~24GB | Loaded for threat injection, then unloaded |
| Cosmos Predict2.5 2B | ~24GB | Loaded for scene continuation, then unloaded |
| fvdb reconstruction | ~8–20GB | Spikes during capture processing only |
| GPT-5.5 | 0GB | API call, no local VRAM |

Transfer2.5 and Predict2.5 are run sequentially, not simultaneously. Reason2 stays resident as a lightweight server. Total peak: ~30GB.

### Key Dependencies and Licenses

| Tool | License | Source |
|---|---|---|
| fvdb-Reality-Capture | Apache 2.0 | GitHub + pip (CUDA 12.8 container) |
| COLMAP | BSD | GitHub |
| Cosmos Reason2 | NVIDIA Open Model License | Hugging Face: `nvidia/Cosmos-Reason2-2B` |
| Cosmos Transfer2.5 | Apache 2.0 + NVIDIA OML | Hugging Face: `nvidia/Cosmos-Transfer2.5-2B` |
| Cosmos Predict2.5 | Apache 2.0 + NVIDIA OML | Hugging Face: `nvidia/Cosmos-Predict2.5-2B` |
| GPT-5.5 | OpenAI API ToS | `api.openai.com` |
| uv | Apache 2.0 | `astral.sh/uv` |

### Intentional Architecture Decision: Airgap Path

The demo uses GPT-5.5 via API for speed and quality. The scenario direction and after-action review interfaces are designed as clean abstractions so that in a forward-deployed, airgapped context, the API call can be replaced with a locally-hosted model — Gemma 4 27B (Q4, ~20GB VRAM) being the natural choice given its benchmark performance and fit on 40GB hardware. Cosmos and fvdb are both fully offline. The only internet dependency in the demo stack is the GPT-5.5 API call.

---

## Why This Wins

**The problem is real and documented.** Current damage control and industrial training is certified, not realistic. The gap between scripted training scenarios and combat conditions is acknowledged in Naval Institute Proceedings and active NATO damage control conferences. The judge audience for a defense hackathon will recognize the problem immediately.

**The tech is novel but not speculative.** Every component in the stack is available today and open-weight. Cosmos Transfer2.5, fvdb, and Cosmos Reason2 are all production-grade NVIDIA tools, which plays well in an NVIDIA-focused hackathon context.

**The demo is visually compelling.** Taking a photo of a real room and watching it flood with smoke 20 minutes later is a more powerful demo than any slide deck.

**The architecture is honest.** The airgap story is real — this could genuinely run on a ruggedized DGX workstation aboard a ship. That matters to defense evaluators more than it would to a consumer tech judge.
