from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from filterpy.kalman import KalmanFilter as _KalmanFilter  # type: ignore[import-untyped]


@dataclass
class EarKalman:
    dim_x: int = 2
    dim_z: int = 1
    dt: float = 1.0 / 30.0
    _kf: _KalmanFilter = field(init=False)

    def __post_init__(self) -> None:
        self._kf = _KalmanFilter(dim_x=self.dim_x, dim_z=self.dim_z)
        self._kf.x = np.array([[0.3], [0.0]])
        self._kf.F = np.array([[1.0, self.dt], [0.0, 1.0]])
        self._kf.H = np.array([[1.0, 0.0]])
        self._kf.P = np.eye(self.dim_x) * 100.0
        self._kf.R = np.array([[0.05]])
        self._kf.Q = np.array([[0.01, 0.0], [0.0, 0.01]])

    def predict(self) -> float:
        self._kf.predict()
        return float(self._kf.x[0, 0])

    def update(self, measurement: float) -> float:
        self._kf.update(np.array([[measurement]]))
        return float(self._kf.x[0, 0])

    @property
    def ear(self) -> float:
        return float(self._kf.x[0, 0])


@dataclass
class HeadPoseKalman:
    dim_x: int = 6
    dim_z: int = 3
    dt: float = 1.0 / 30.0
    _kf: _KalmanFilter = field(init=False)

    def __post_init__(self) -> None:
        self._kf = _KalmanFilter(dim_x=self.dim_x, dim_z=self.dim_z)
        self._kf.x = np.zeros((self.dim_x, 1))
        self._kf.F = np.eye(self.dim_x)
        for i in range(3):
            self._kf.F[i, i + 3] = self.dt
        self._kf.H = np.zeros((self.dim_z, self.dim_x))
        for i in range(self.dim_z):
            self._kf.H[i, i] = 1.0
        self._kf.P = np.eye(self.dim_x) * 100.0
        self._kf.R = np.eye(self.dim_z) * 0.5
        self._kf.Q = np.eye(self.dim_x) * 0.01

    def predict(self) -> np.ndarray:
        self._kf.predict()
        result: np.ndarray = self._kf.x[:3, 0].copy()
        return result

    def update(self, measurement: np.ndarray) -> np.ndarray:
        self._kf.update(measurement.reshape(-1, 1))
        result: np.ndarray = self._kf.x[:3, 0].copy()
        return result

    @property
    def angles(self) -> np.ndarray:
        result: np.ndarray = self._kf.x[:3, 0].copy()
        return result
