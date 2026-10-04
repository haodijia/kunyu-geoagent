"""Harness request projection geometry, preserving its integer rounding rules."""

import math


def long_edge(width: int, height: int, edge: int) -> tuple[int, int]:
    if edge >= max(width, height):
        return width, height
    if width >= height:
        return edge, max(1, math.floor(edge * height / width + 0.5))
    return max(1, math.floor(edge * width / height + 0.5)), edge


def pixel_dimensions(width: int, height: int, budget: int) -> tuple[int, int]:
    scale = min(1, math.sqrt(budget / (width * height)))
    if scale == 1:
        return width, height
    landscape = width >= height
    major, minor = (width, height) if landscape else (height, width)
    projected_major = max(1, math.floor(major * scale))
    projected_minor = max(1, math.floor(projected_major * minor / major + 0.5))
    while projected_major * projected_minor > budget and projected_major > 1:
        projected_major -= 1
        projected_minor = max(1, math.floor(projected_major * minor / major + 0.5))
    return (
        (projected_major, projected_minor)
        if landscape
        else (projected_minor, projected_major)
    )


def grid_dimensions(width: int, height: int) -> tuple[int, int]:
    grid_width, grid_height = (width + 41) // 42, (height + 41) // 42
    if grid_height * (grid_width + 1) + 2 <= 1024:
        return width, height
    aspect = height / width
    ideal_width = math.sqrt(1022 / aspect + 0.25) - 0.5
    ideal_height = ideal_width * aspect
    if ideal_width < 1:
        best_width, best_height = 42, 511 * 42
    elif ideal_height < 1:
        best_width, best_height = 1021 * 42, 42
    else:
        scale = min(int(ideal_width) * 42 / width, int(ideal_height) * 42 / height)
        best_width = int(width * scale / 14) * 14
        best_height = int(height * scale / 14) * 14
    return long_edge(width, height, best_width if width >= height else best_height)
