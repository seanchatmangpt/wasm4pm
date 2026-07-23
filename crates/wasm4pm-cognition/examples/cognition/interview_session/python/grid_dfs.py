from collections.abc import Sequence


def count_islands(grid: Sequence[Sequence[str]]) -> int:
    """Count four-directionally connected components of land cells.

    The grid must be rectangular and contain only ``"0"`` and ``"1"`` cells.
    """
    if not grid:
        return 0

    columns = len(grid[0])
    if any(len(row) != columns for row in grid):
        raise ValueError("grid must be rectangular")
    if any(cell not in {"0", "1"} for row in grid for cell in row):
        raise ValueError('grid cells must be "0" or "1"')

    rows = len(grid)
    visited: set[tuple[int, int]] = set()

    def visit(start_row: int, start_column: int) -> None:
        stack = [(start_row, start_column)]
        while stack:
            row, column = stack.pop()
            if (
                row < 0
                or row >= rows
                or column < 0
                or column >= columns
                or grid[row][column] != "1"
                or (row, column) in visited
            ):
                continue
            visited.add((row, column))
            stack.extend(
                [
                    (row - 1, column),
                    (row + 1, column),
                    (row, column - 1),
                    (row, column + 1),
                ]
            )

    islands = 0
    for row in range(rows):
        for column in range(columns):
            if grid[row][column] == "1" and (row, column) not in visited:
                islands += 1
                visit(row, column)
    return islands
