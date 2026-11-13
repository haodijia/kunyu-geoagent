"""Server storage information. Deployment owns the mounted directory."""

import shutil

from fastapi import APIRouter

from kunyu.settings import get_app_data_directory

router = APIRouter(prefix="/api/v1/storage", tags=["storage"])


@router.get("")
def storage_status():
    directory = get_app_data_directory()
    usage = shutil.disk_usage(directory)
    return {
        "data_directory": str(directory),
        "total_bytes": usage.total,
        "free_bytes": usage.free,
    }
