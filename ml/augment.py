"""Augment landmark clips with noise, time-stretch, and left-right flip.

3 augmentations per clip, applied only to the training set.
Output: data/augmented/{label}_{orig_id:03d}_aug{N}.npy
"""

import argparse
import random
from pathlib import Path

import numpy as np
from scipy.interpolate import interp1d


# Symmetry pairs for MediaPipe Face Mesh 468 landmarks.
# (left_idx, right_idx) where left is the person's left side.
# These cover: face oval, eyebrows, eyes, nose, mouth, lips.
SYMMETRY_PAIRS: list[tuple[int, int]] = [
    (0, 16), (1, 15), (2, 14), (3, 13), (4, 12), (5, 11), (6, 10), (7, 9),
    (17, 265), (18, 264), (19, 263), (20, 262), (21, 261), (22, 260), (23, 259), (24, 258), (25, 257), (26, 256),
    (27, 255), (28, 254), (29, 253), (30, 252), (31, 251), (32, 250),
    (33, 247), (34, 248), (35, 249), (36, 243), (37, 244), (38, 245), (39, 246),
    (46, 276), (47, 277), (48, 278), (49, 279), (50, 280), (51, 281), (52, 282), (53, 283), (54, 284), (55, 285),
    (56, 286), (57, 287), (58, 288), (59, 289), (60, 290),
    (61, 291), (62, 292), (63, 293), (64, 294), (65, 295), (66, 296), (67, 297),
    (68, 298), (69, 299), (70, 300), (71, 301), (72, 302), (73, 303), (74, 304), (75, 305),
    (76, 306), (77, 307), (78, 308), (79, 309), (80, 310), (81, 311), (82, 312), (83, 313), (84, 314), (85, 315),
    (86, 316), (87, 317), (88, 318), (89, 319), (90, 320), (91, 321), (92, 322), (93, 323), (94, 324), (95, 325),
    (96, 326), (97, 327), (98, 328), (99, 329), (100, 330), (101, 331), (102, 332), (103, 333), (104, 334), (105, 335),
    (106, 336), (107, 337), (108, 338), (109, 339), (110, 340), (111, 341), (112, 342), (113, 343), (114, 344), (115, 345),
    (116, 346), (117, 347), (118, 348), (119, 349), (120, 350), (121, 351), (122, 352), (123, 353), (124, 354), (125, 355),
    (126, 356), (127, 357), (128, 358), (129, 359), (130, 360), (131, 361),
    (132, 362), (133, 363), (134, 364), (135, 365), (136, 366), (137, 367), (138, 368), (139, 369),
    (140, 370), (141, 371), (142, 372), (143, 373), (144, 374), (145, 375), (146, 376), (147, 377),
    (148, 378), (149, 379), (150, 380), (151, 381), (152, 382), (153, 383), (154, 384), (155, 385),
    (156, 386), (157, 387), (158, 388), (159, 389), (160, 390), (161, 391),
    (162, 392), (163, 393), (164, 394), (165, 395), (166, 396), (167, 397),
    (168, 398), (169, 399), (170, 400), (171, 401),
    (172, 402), (173, 403), (174, 404), (175, 405), (176, 406), (177, 407), (178, 408), (179, 409),
    (180, 410), (181, 411), (182, 412), (183, 413), (184, 414), (185, 415), (186, 416), (187, 417),
    (188, 418), (189, 419), (190, 420), (191, 421), (192, 422), (193, 423), (194, 424), (195, 425),
    (196, 426), (197, 427), (198, 428), (199, 429), (200, 430), (201, 431), (202, 432), (203, 433),
    (204, 434), (205, 435), (206, 436), (207, 437), (208, 438), (209, 439), (210, 440), (211, 441),
    (212, 442), (213, 443), (214, 444), (215, 445), (216, 446), (217, 447), (218, 448), (219, 449),
    (220, 450), (221, 451), (222, 452), (223, 453), (224, 454), (225, 455), (226, 456), (227, 457),
    (228, 458), (229, 459), (230, 460), (231, 461), (232, 462), (233, 463), (234, 464), (235, 465),
    (236, 466), (237, 467),
]

AUGMENTATIONS = ["noise", "stretch", "flip"]
GAUSSIAN_NOISE_SIGMA = 0.002
STRETCH_FACTORS = (0.8, 1.2)


def add_gaussian_noise(clip: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    noise = rng.normal(0, GAUSSIAN_NOISE_SIGMA, clip.shape).astype(np.float32)
    return np.clip(clip + noise, 0.0, 1.0)


def time_stretch(clip: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    factor = rng.choice(STRETCH_FACTORS)
    t_in = clip.shape[0]
    t_out = max(2, int(round(t_in * factor)))
    x_old = np.linspace(0, 1, t_in)
    x_new = np.linspace(0, 1, t_out)
    stretched = np.zeros((t_out, clip.shape[1]), dtype=np.float32)
    for i in range(clip.shape[1]):
        interpolator = interp1d(x_old, clip[:, i], kind="linear",
                                bounds_error=False, fill_value=(clip[0, i], clip[-1, i]))
        stretched[:, i] = interpolator(x_new)
    return stretched


def left_right_flip(clip: np.ndarray) -> np.ndarray:
    flipped = clip.copy()
    for left_idx, right_idx in SYMMETRY_PAIRS:
        lx = 2 * left_idx
        ly = 2 * left_idx + 1
        rx = 2 * right_idx
        ry = 2 * right_idx + 1
        flipped[:, lx], flipped[:, rx] = 1.0 - flipped[:, rx], 1.0 - flipped[:, lx]
        flipped[:, ly], flipped[:, ry] = flipped[:, ry], flipped[:, ly].copy()
    return flipped


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Augment landmark clips for ProctorIQ")
    parser.add_argument("--input", type=str, default="data/raw",
                        help="Input directory with raw .npy clips (default: data/raw)")
    parser.add_argument("--output", type=str, default="data/augmented",
                        help="Output directory for augmented clips (default: data/augmented)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_dir = Path(args.input)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    rng = np.random.default_rng(args.seed)
    random.seed(args.seed)

    npy_files = sorted(input_dir.glob("*.npy"))
    if not npy_files:
        print(f"No .npy files found in {input_dir.resolve()}")
        return

    total_generated = 0
    for fpath in npy_files:
        clip = np.load(str(fpath)).astype(np.float32)
        label = fpath.stem.split("_")[0]

        for aug_name in AUGMENTATIONS:
            if aug_name == "noise":
                aug_clip = add_gaussian_noise(clip, rng)
            elif aug_name == "stretch":
                aug_clip = time_stretch(clip, rng)
            elif aug_name == "flip":
                aug_clip = left_right_flip(clip)
            else:
                continue

            out_path = output_dir / f"{label}_{fpath.stem.split('_')[1]}_aug{aug_name}.npy"
            np.save(str(out_path), aug_clip)
            total_generated += 1
            print(f"  Created {out_path} ({aug_clip.shape[0]} frames)")

    print(f"Augmentation complete. Generated {total_generated} clips in {output_dir.resolve()}")


if __name__ == "__main__":
    main()
