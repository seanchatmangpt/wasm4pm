from collections.abc import Sequence


def count_islands(grid: Sequence[Sequence[str]]) -> int:
    """Count four-directionally connected components of land cells."""
    if not grid:
        return 0

    rows = len(grid)
    columns = len(grid[0])
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
