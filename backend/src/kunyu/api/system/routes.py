"""Public liveness without business or credential information."""
from fastapi import APIRouter
from kunyu.settings import API_VERSION
router = APIRouter(prefix="/api/v1/system", tags=["system"])

@router.get("/health")
def get_health():
    return {"status": "healthy", "api_version": API_VERSION}
