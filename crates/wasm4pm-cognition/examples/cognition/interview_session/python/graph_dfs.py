from collections.abc import Hashable, Mapping, Sequence
from typing import TypeVar

Node = TypeVar("Node", bound=Hashable)


def depth_first_order(
    graph: Mapping[Node, Sequence[Node]],
    start: Node,
) -> list[Node]:
    """Return deterministic depth-first visitation order from ``start``.

    Neighbors are visited in the order supplied by each adjacency sequence.
    Nodes absent from ``graph`` are treated as leaves.
    """
    order: list[Node] = []
    visited: set[Node] = set()
    stack = [start]

    while stack:
        node = stack.pop()
        if node in visited:
            continue
        visited.add(node)
        order.append(node)
        stack.extend(reversed(graph.get(node, ())))

    return order
