# Data Collection Guide — Crowdsourced Face Landmarks

## Quick Start

```bash
# Local collection (no web server needed)
cd ml
python collect.py --label focused --clips 10 --duration 5
python collect.py --label distracted --clips 10 --duration 5
```

---

## Web-Based Collection (Phase 6)

### For Contributors

1. **Open** the deployed frontend at `/collect`
2. **Read** the consent screen — no video is saved, only anonymized landmark patterns
3. **Perform** 8 short webcam tasks (~3 minutes total):
   - Focused (20s): read normally
   - Eyes off (15s): move only eyes off screen
   - Neck turn (15s): turn head away
   - Look up (15s): look above camera
   - Look down (15s): look at lap/desk
   - Drowsy (20s): slow blinks, half-closed eyes
   - No face (12s): move fully out of frame
   - Lean away (15s): lean far back/side
4. **Done** — your landmarks are committed to the `collected-data` branch

### For Project Owner

1. **Set environment** on deployed backend:
   ```
   COLLECT_GITHUB_TOKEN=ghp_your_token
   COLLECT_GITHUB_REPO=YourUser/ProctorIQ
   COLLECT_GITHUB_BRANCH=collected-data
   ```
2. **Share** the `/collect` URL with friends/classmates
3. **Monitor** progress at `GET /api/collect/status`
4. **Cap**: max 30 contributors, 8 clips each (240 clips total)

### Get Collected Data

```bash
git fetch origin collected-data
git checkout collected-data
# Clips are in ml/data/raw/<contributor>_<date>/<label>/*.json
git checkout main  # return to main branch
```

### Integrate Into Training

```bash
# 1. Pull collected clips from the collected-data branch
git fetch origin collected-data
git checkout collected-data -- ml/data/raw
git checkout main

# 2. Process all data (new + existing)
python ml/preprocess.py

# 3. Incrementally train
python ml/train_incremental.py --new-batch <contributor_folder>

# Or train from scratch
python ml/train.py
python ml/export.py
```

---

## Local Collection (MediaPipe)

For higher-quality data collection on your own machine:

```bash
cd ml
pip install mediapipe opencv-python

# Collect specific labels
python collect.py --label focused --clips 20 --duration 5
python collect.py --label distracted --clips 20 --duration 5
python collect.py --label drowsy --clips 15 --duration 5
python collect.py --label absent --clips 10 --duration 5

# Use a different camera
python collect.py --label focused --device 1

# Output is flat: data/raw/<label>_<n>.npy (sequential numbering)
# Use --tag <name> to create a subfolder for your clips,
# e.g. --tag priya → data/raw/priya/<label>_<n>.npy
```

### Tips

- Good lighting — face fully visible
- Consistent distance from camera (arms-length)
- Vary the specific movements within each label
- Aim for at least 100 clips per label before training
