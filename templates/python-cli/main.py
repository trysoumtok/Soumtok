#!/usr/bin/env python3
"""{{title}} — proven argparse CLI starter."""
import argparse
import sys


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="{{title}}")
    parser.add_argument("text", nargs="*", help="words to echo")
    parser.add_argument("-u", "--upper", action="store_true", help="uppercase output")
    parser.add_argument("--version", action="version", version="1.0.0")
    args = parser.parse_args(argv)
    line = " ".join(args.text) if args.text else sys.stdin.read().strip() or "hello"
    if args.upper:
        line = line.upper()
    print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
