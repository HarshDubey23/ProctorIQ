# LinkedIn Post — ProctorIQ Launch

---

**Post text (copy & paste):**

---

I built an AI proctoring system that runs entirely in the browser — no server-side video processing, no privacy concerns, no expensive cloud bills.

**The problem:** Existing proctoring tools (ProctorU, ExamSoft, Respondus) stream webcam footage to their servers. That means latency, privacy risks, and recurring costs.

**My approach:** A 1D-CNN attention classifier that runs on-device via ONNX Runtime + MediaPipe FaceMesh. Face landmarks (468 points per frame, fully anonymized) are the only thing ever computed — raw video never leaves the device.

**What the system does:**
- WebSocket-based exam room orchestration with real-time face tracking
- Server-side scoring with cryptographically signed session logs (tamper-proof reports)
- A question-paper builder for customizable assessments
- Incremental model training pipeline with regression gating
- Crowdsourced data collection portal with GitHub-based persistence

**Tech stack:** FastAPI + React (Neo-Brutalist design) + PyTorch + ONNX + WebSockets + GitHub API

**What I learned:**
- Deploying ML models to the browser via ONNX is surprisingly straightforward
- WebSocket-based real-time systems need careful state management (singleton stores, deep-copy semantics)
- A regression gate (CV F1 drop < 0.005) prevents bad model updates from reaching production
- You can run a "serverless" data collection pipeline using GitHub as a storage backend

**No gimmicks:** 135 backend tests, 12 frontend tests, strict mypy, ruff-clean. No broken CI.

**Next:** Training the classifier on real crowdsourced data to move beyond simulation.

Code: github.com/HarshDubey23/ProctorIQ

---

**Suggested hashtags:**
#AI #MachineLearning #EdTech #Proctoring #ComputerVision #WebML #ONNX #Python #React #OpenSource

---

**Tips:**
- Post with a screenshot of the Studio dashboard or the Neo-Brutalist UI
- Tag the repo link in the first comment for better reach
- If you have a demo video, include it as the main media
