from collections.abc import Iterable

MOVE_DELTAS: dict[str, tuple[int, int]] = {
    "N": (0, 1),
    "S": (0, -1),
    "E": (1, 0),
    "W": (-1, 0),
}


def final_position(commands: Iterable[str]) -> tuple[int, int]:
    """Return the final coordinate after applying every admitted command once."""
    x = 0
    y = 0

    for command in commands:
        try:
            dx, dy = MOVE_DELTAS[command]
        except KeyError as error:
            raise ValueError(f"unsupported direction: {command!r}") from error
        x += dx
        y += dy

    return x, y
