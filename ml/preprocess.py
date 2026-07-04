"""Sliding windows, PCA fitting, and stratified dataset split.

Pipeline:
    1. Load raw clips from data/raw/ and augmented clips from data/augmented/
    2. Extract 30-frame sliding windows with stride 5
    3. Flatten each window to (28080,) vector
    4. Stratified 70/15/15 split at clip level
    5. PCA fit on training set, cumulative variance >= 97%
    6. Transform all splits
    7. Save PCA artifacts and processed arrays
"""

import argparse
import json
from pathlib import Path

import numpy as np
from sklearn.decomposition import PCA
from sklearn.model_selection import train_test_split


WINDOW_SIZE = 30
STRIDE = 5
N_LANDMARKS = 468
N_FEATURES_PER_FRAME = N_LANDMARKS * 2  # x, y
WINDOW_FLAT = WINDOW_SIZE * N_FEATURES_PER_FRAME  # 28080


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Preprocess landmark clips: sliding windows + PCA")
    parser.add_argument("--raw", type=str, default="data/raw",
                        help="Raw clips directory (default: data/raw)")
    parser.add_argument("--augmented", type=str, default="data/augmented",
                        help="Augmented clips directory (default: data/augmented)")
    parser.add_argument("--output", type=str, default="data/processed",
                        help="Output directory (default: data/processed)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument("--min-frames", type=int, default=WINDOW_SIZE,
                        help="Minimum clip frames for window extraction (default: 30)")
    return parser.parse_args()


def extract_windows(clip: np.ndarray) -> np.ndarray:
    n = clip.shape[0]
    windows: list[np.ndarray] = []
    for start in range(0, n - WINDOW_SIZE + 1, STRIDE):
        window = clip[start:start + WINDOW_SIZE]  # (30, 936)
        windows.append(window.reshape(1, -1))
    if not windows:
        return np.empty((0, WINDOW_FLAT), dtype=np.float32)
    return np.concatenate(windows, axis=0)


def label_from_filename(fname: str) -> str:
    return fname.split("_")[0]


def is_augmented(fname: str) -> bool:
    return "_aug" in fname


def main() -> None:
    args = parse_args()
    raw_dir = Path(args.raw)
    aug_dir = Path(args.augmented)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    raw_files = sorted(raw_dir.glob("*.npy"))
    if not raw_files:
        print(f"No raw .npy files found in {raw_dir.resolve()}")
        return

    aug_files = sorted(aug_dir.glob("*.npy")) if aug_dir.exists() else []

    all_clips: dict[str, np.ndarray] = {}
    clip_labels: dict[str, str] = {}
    clip_is_aug: dict[str, bool] = {}

    for fpath in raw_files:
        name = fpath.stem
        clip = np.load(str(fpath)).astype(np.float32)
        if clip.shape[0] < args.min_frames:
            print(f"  Skipping {name}: {clip.shape[0]} frames < {args.min_frames}")
            continue
        all_clips[name] = clip
        clip_labels[name] = label_from_filename(name)
        clip_is_aug[name] = False

    for fpath in aug_files:
        name = fpath.stem
        clip = np.load(str(fpath)).astype(np.float32)
        if clip.shape[0] < args.min_frames:
            print(f"  Skipping augmented {name}: {clip.shape[0]} frames < {args.min_frames}")
            continue
        all_clips[name] = clip
        clip_labels[name] = label_from_filename(name)
        clip_is_aug[name] = True

    print(f"Loaded {len(all_clips)} clips ({len(raw_files)} raw, {len(aug_files)} augmented)")

    raw_clip_names = [n for n, a in clip_is_aug.items() if not a]
    aug_clip_names = [n for n, a in clip_is_aug.items() if a]

    labels = sorted(set(clip_labels.values()))
    label_to_int = {lbl: i for i, lbl in enumerate(labels)}
    print(f"Labels: {label_to_int}")

    # Stratified split of raw clips: 70% train, 15% val, 15% test
    raw_labels = [clip_labels[n] for n in raw_clip_names]
    train_raw, temp_names, train_labels, temp_labels = train_test_split(
        raw_clip_names, raw_labels,
        test_size=0.3, stratify=raw_labels, random_state=args.seed,
    )
    val_raw, test_raw = train_test_split(
        temp_names,
        test_size=0.5, stratify=temp_labels, random_state=args.seed,
    )

    # Only include augmented clips whose base raw clip is in the training set
    train_raw_base = set(train_raw)
    filtered_aug: list[str] = []
    for name in aug_clip_names:
        base = name.rsplit("_aug", 1)[0]
        if base in train_raw_base:
            filtered_aug.append(name)
    if filtered_aug:
        print(f"Filtered augmented clips: kept {len(filtered_aug)}/{len(aug_clip_names)} "
              f"(excluded {len(aug_clip_names) - len(filtered_aug)} from non-training raw clips)")
    else:
        print(f"No augmented clips kept (all {len(aug_clip_names)} excluded)")

    train_names = train_raw + filtered_aug

    print(f"Split: {len(train_names)} train ({len(train_raw)} raw + {len(filtered_aug)} aug), "
          f"{len(val_raw)} val, {len(test_raw)} test")

    # Extract windows
    X_train_list: list[np.ndarray] = []
    y_train_list: list[int] = []
    X_val_list: list[np.ndarray] = []
    y_val_list: list[int] = []
    X_test_list: list[np.ndarray] = []
    y_test_list: list[int] = []

    split_map: dict[str, str] = {}

    for name in train_names:
        windows = extract_windows(all_clips[name])
        if windows.shape[0] == 0:
            continue
        label_int = label_to_int[clip_labels[name]]
        X_train_list.append(windows)
        y_train_list.extend([label_int] * windows.shape[0])
        split_map[name] = "train"

    for name in val_raw:
        windows = extract_windows(all_clips[name])
        if windows.shape[0] == 0:
            continue
        label_int = label_to_int[clip_labels[name]]
        X_val_list.append(windows)
        y_val_list.extend([label_int] * windows.shape[0])
        split_map[name] = "val"

    for name in test_raw:
        windows = extract_windows(all_clips[name])
        if windows.shape[0] == 0:
            continue
        label_int = label_to_int[clip_labels[name]]
        X_test_list.append(windows)
        y_test_list.extend([label_int] * windows.shape[0])
        split_map[name] = "test"

    X_train = np.concatenate(X_train_list, axis=0) if X_train_list else np.empty((0, WINDOW_FLAT), dtype=np.float32)
    y_train = np.array(y_train_list, dtype=np.int64)
    X_val = np.concatenate(X_val_list, axis=0) if X_val_list else np.empty((0, WINDOW_FLAT), dtype=np.float32)
    y_val = np.array(y_val_list, dtype=np.int64)
    X_test = np.concatenate(X_test_list, axis=0) if X_test_list else np.empty((0, WINDOW_FLAT), dtype=np.float32)
    y_test = np.array(y_test_list, dtype=np.int64)

    print(f"Train windows: {X_train.shape}, val: {X_val.shape}, test: {X_test.shape}")

    # PCA fit on training set, choose n where cumvar >= 97%
    max_n = min(X_train.shape[0] - 1, 200)
    max_n = min(max_n, X_train.shape[1])
    print(f"Fitting PCA (max components: {max_n}) on {X_train.shape[0]} training samples...")

    pca = PCA(n_components=max_n, random_state=args.seed)
    pca.fit(X_train)

    cumvar = np.cumsum(pca.explained_variance_ratio_)
    n_components = int(np.searchsorted(cumvar, 0.97) + 1)
    n_components = min(n_components, max_n)
    n_components = max(n_components, min(64, max_n))
    print(f"PCA: {n_components} components explain {cumvar[n_components - 1]:.4f} cumulative variance")

    # Transform all splits
    components = pca.components_[:n_components]
    mean = pca.mean_

    def pca_transform(X: np.ndarray) -> np.ndarray:
        centered = X - mean.reshape(1, -1)
        return centered @ components.T  # (n, n_components)

    X_train_pca = pca_transform(X_train)
    X_val_pca = pca_transform(X_val) if X_val.shape[0] > 0 else np.empty((0, n_components), dtype=np.float32)
    X_test_pca = pca_transform(X_test) if X_test.shape[0] > 0 else np.empty((0, n_components), dtype=np.float32)

    print(f"PCA dimensions — train: {X_train_pca.shape}, val: {X_val_pca.shape}, test: {X_test_pca.shape}")

    # Save processed arrays
    for name, X, y in [("train", X_train_pca, y_train),
                        ("val", X_val_pca, y_val),
                        ("test", X_test_pca, y_test)]:
        if X.shape[0] > 0:
            np.save(str(output_dir / f"X_{name}.npy"), X)
            np.save(str(output_dir / f"y_{name}.npy"), y)
            print(f"  Saved X_{name}.npy {X.shape}, y_{name}.npy {y.shape}")

    # Save PCA artifacts for Python
    np.save(str(output_dir / "pca_mean.npy"), mean)
    np.save(str(output_dir / "pca_components.npy"), components)

    n_components_path = output_dir / "n_components.json"
    with open(n_components_path, "w") as f:
        json.dump({"n_components": int(n_components)}, f)

    # Save compact browser PCA artifacts.
    mean_f32 = mean.astype(np.float32)
    comp_f32 = components.astype(np.float32)
    pca_binary_path = output_dir / "pca_components.bin"
    with open(pca_binary_path, "wb") as f:
        f.write(mean_f32.tobytes())
        f.write(comp_f32.reshape(-1).tobytes())

    pca_meta_path = output_dir / "pca_meta.json"
    pca_meta = {
        "dtype": "float32",
        "n_components": int(n_components),
        "n_features": int(WINDOW_FLAT),
        "mean_offset": 0,
        "components_offset": int(mean_f32.shape[0]),
        "binary": "pca_components.bin",
    }
    with open(pca_meta_path, "w") as f:
        json.dump(pca_meta, f)
    print(f"Saved browser PCA artifacts: {pca_binary_path}, {pca_meta_path}")

    # Save split mapping
    split_path = output_dir / "clip_split.json"
    with open(split_path, "w") as f:
        json.dump(split_map, f, indent=2)

    # Save label mapping
    label_path = output_dir / "labels.json"
    with open(label_path, "w") as f:
        json.dump(label_to_int, f, indent=2)

    print("Preprocessing complete.")


if __name__ == "__main__":
    main()
