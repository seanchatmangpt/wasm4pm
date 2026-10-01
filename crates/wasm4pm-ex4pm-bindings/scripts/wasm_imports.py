#!/usr/bin/env python3
"""Stdlib-only wasm import/export section reporter.

Usage: wasm_imports.py [--require-zero-imports] [--quiet] FILE.wasm
Prints `imports N` / `exports M` followed by the names. Exit 1 when
--require-zero-imports is given and N > 0; exit 2 on malformed input.
"""
import sys


def leb(b, i):
    r = s = 0
    while True:
        x = b[i]
        i += 1
        r |= (x & 0x7F) << s
        s += 7
        if not x & 0x80:
            return r, i


def name(b, i):
    n, i = leb(b, i)
    return b[i:i + n].decode("utf-8", "replace"), i + n


def limits(b, i):
    flag, i = leb(b, i)
    _, i = leb(b, i)
    if flag & 1:
        _, i = leb(b, i)
    return i


def parse(b):
    if b[:4] != b"\0asm":
        raise ValueError("not a wasm module")
    i, imports, exports = 8, [], []
    while i < len(b):
        sid = b[i]
        size, i = leb(b, i + 1)
        end = i + size
        if sid == 2:
            n, j = leb(b, i)
            for _ in range(n):
                mod, j = name(b, j)
                nm, j = name(b, j)
                kind = b[j]
                j += 1
                if kind == 0:
                    _, j = leb(b, j)
                elif kind == 1:
                    j += 1
                    j = limits(b, j)
                elif kind == 2:
                    j = limits(b, j)
                elif kind == 3:
                    j += 2
                elif kind == 4:
                    j += 1
                    _, j = leb(b, j)
                else:
                    raise ValueError("unknown import kind %d" % kind)
                imports.append((mod, nm))
        elif sid == 7:
            n, j = leb(b, i)
            for _ in range(n):
                nm, j = name(b, j)
                j += 1
                _, j = leb(b, j)
                exports.append(nm)
        i = end
    return imports, exports


def main(argv):
    req = "--require-zero-imports" in argv
    quiet = "--quiet" in argv
    files = [a for a in argv if not a.startswith("--")]
    if len(files) != 1:
        print(__doc__, file=sys.stderr)
        return 2
    try:
        imports, exports = parse(open(files[0], "rb").read())
    except (ValueError, IndexError) as e:
        print("malformed wasm: %s" % e, file=sys.stderr)
        return 2
    print("imports %d" % len(imports))
    print("exports %d" % len(exports))
    if not quiet:
        for m, n in imports:
            print("  import %s.%s" % (m, n))
        for n in exports:
            print("  export %s" % n)
    return 1 if req and imports else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
