from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class WprPaths:
    data_dir: Path
    workspace_root: Path
    wpr_root: Path
    sales_root: Path
    monitoring_root: Path


def resolve_wpr_paths() -> WprPaths:
    value = os.environ.get("WPR_DATA_DIR")
    if value is None:
        raise RuntimeError("WPR_DATA_DIR is required.")

    trimmed = value.strip()
    if trimmed == "":
        raise RuntimeError("WPR_DATA_DIR is required.")

    data_dir = Path(trimmed).expanduser().resolve()
    workspace_root = data_dir.parent
    wpr_root = workspace_root.parent
    sales_root = wpr_root.parent
    monitoring_root = sales_root / "Monitoring"
    return WprPaths(
        data_dir=data_dir,
        workspace_root=workspace_root,
        wpr_root=wpr_root,
        sales_root=sales_root,
        monitoring_root=monitoring_root,
    )
