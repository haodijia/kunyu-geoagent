"""Receive transient map rendering state, separate from persistent layer contents."""

from fastapi import APIRouter, Request, Response

from kunyu.domain.geospatial.map_status import MapRenderStatus

router = APIRouter(prefix="/api/v1/sessions/{session_id}/map", tags=["maps"])


@router.put("/clients/{client_id}/status", status_code=204)
def report_status(
    session_id: str, client_id: str, body: MapRenderStatus, request: Request
):
    # Ownership and layer revisions are checked against the session's actual stack.
    layers = request.app.state.map_repository.layers(session_id)
    valid = {(layer.id, layer.revision) for layer in layers}
    filtered = body.model_copy(
        update={
            "layers": [
                layer
                for layer in body.layers
                if (layer.layer_id, layer.revision) in valid
            ]
        }
    )
    request.app.state.map_capture_service.report_status(session_id, client_id, filtered)
    return Response(status_code=204)
