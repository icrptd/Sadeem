"""Sadeem backend helpers: file IO with encoding/EOL handling, settings and session storage.
Pure Python (no GUI imports) so it can be unit-tested anywhere."""
import codecs
import json
import os
import sys
import tempfile

MAX_SOFT = 30 * 1024 * 1024
APP_NAME = "Sadeem"


def data_dir():
    if os.name == "nt":
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
    else:
        base = os.environ.get("XDG_CONFIG_HOME") or os.path.join(os.path.expanduser("~"), ".config")
    p = os.path.join(base, APP_NAME)
    os.makedirs(p, exist_ok=True)
    return p


def atomic_write(path, data: bytes):
    d = os.path.dirname(os.path.abspath(path))
    fd, tmp = tempfile.mkstemp(prefix=".sdm-", dir=d)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            try:
                os.fsync(f.fileno())
            except OSError:
                pass
        try:
            mode = os.stat(path).st_mode
            os.chmod(tmp, mode)
        except OSError:
            pass
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def detect_eol(text):
    crlf = text.count("\r\n")
    lf = text.count("\n") - crlf
    cr = text.count("\r") - crlf
    if crlf == 0 and lf == 0 and cr == 0:
        return None
    best = max((crlf, "crlf"), (lf, "lf"), (cr, "cr"))
    return best[1]


def normalize_eol(text):
    return text.replace("\r\n", "\n").replace("\r", "\n")


def detect_encoding(raw: bytes):
    """Return (encoding_id, bom_length)."""
    if raw.startswith(codecs.BOM_UTF8):
        return "utf-8-sig", 3
    if raw.startswith(codecs.BOM_UTF16_LE):
        return "utf-16-le", 2
    if raw.startswith(codecs.BOM_UTF16_BE):
        return "utf-16-be", 2
    sample = raw[:65536]
    if sample:
        nul_even = sample[0::2].count(0)
        nul_odd = sample[1::2].count(0)
        half = max(1, len(sample) // 2)
        if nul_odd > half * 0.3 and nul_even < half * 0.05:
            return "utf-16-le", 0
        if nul_even > half * 0.3 and nul_odd < half * 0.05:
            return "utf-16-be", 0
    try:
        raw.decode("utf-8")
        return "utf-8", 0
    except UnicodeDecodeError as e:
        # a cut multi-byte sequence at the very end of a huge file is still utf-8
        if e.start >= len(raw) - 3 and e.reason == "unexpected end of data":
            return "utf-8", 0
    return "cp1256", 0


def looks_binary(raw: bytes, enc: str):
    if enc.startswith("utf-16"):
        return False
    return b"\x00" in raw[:8192]


def decode_bytes(raw: bytes, enc: str):
    bom = 0
    if enc == "utf-8-sig":
        if raw.startswith(codecs.BOM_UTF8):
            bom = 3
        return raw[bom:].decode("utf-8", errors="replace")
    if enc == "utf-16-le" and raw.startswith(codecs.BOM_UTF16_LE):
        bom = 2
    if enc == "utf-16-be" and raw.startswith(codecs.BOM_UTF16_BE):
        bom = 2
    if enc == "utf-8" and raw.startswith(codecs.BOM_UTF8):
        bom = 3
    return raw[bom:].decode(enc, errors="replace")


def read_file(path, encoding=None, force=False):
    try:
        st = os.stat(path)
    except FileNotFoundError:
        return {"error": "notfound"}
    except OSError as e:
        return {"error": "io", "message": str(e)}
    if os.path.isdir(path):
        return {"error": "io", "message": "directory"}
    if st.st_size > MAX_SOFT and not force:
        return {"error": "toolarge", "size": st.st_size}
    try:
        with open(path, "rb") as f:
            raw = f.read()
    except OSError as e:
        return {"error": "io", "message": str(e)}
    enc = encoding
    if not enc:
        enc, _ = detect_encoding(raw)
    if not force and looks_binary(raw, enc):
        return {"error": "binary", "size": st.st_size}
    try:
        codecs.lookup(enc)
    except LookupError:
        return {"error": "io", "message": "unknown encoding " + str(enc)}
    text = decode_bytes(raw, enc)
    eol = detect_eol(text)
    return {"ok": True, "text": normalize_eol(text), "encoding": enc, "eol": eol,
            "mtime": st.st_mtime, "size": st.st_size}


def encode_text(text, encoding, eol):
    nl = {"crlf": "\r\n", "lf": "\n", "cr": "\r"}.get(eol, "\r\n")
    t = text.replace("\n", nl) if nl != "\n" else text
    if encoding == "utf-16-le":
        return codecs.BOM_UTF16_LE + t.encode("utf-16-le")
    if encoding == "utf-16-be":
        return codecs.BOM_UTF16_BE + t.encode("utf-16-be")
    return t.encode(encoding)


def write_file(path, text, encoding="utf-8", eol="crlf"):
    try:
        data = encode_text(text, encoding, eol)
    except (UnicodeEncodeError, LookupError):
        return {"error": "encode"}
    try:
        atomic_write(path, data)
        st = os.stat(path)
    except OSError as e:
        return {"error": "io", "message": str(e)}
    return {"ok": True, "mtime": st.st_mtime, "size": st.st_size}


def stat_files(paths):
    out = {}
    for p in paths:
        try:
            st = os.stat(p)
            out[p] = {"exists": True, "mtime": st.st_mtime, "size": st.st_size}
        except OSError:
            out[p] = {"exists": False}
    return out


def rename_file(path, new_name):
    new = os.path.join(os.path.dirname(path), new_name)
    if os.path.exists(new) and os.path.normcase(new) != os.path.normcase(path):
        return {"error": "exists", "message": "A file with this name already exists"}
    try:
        os.rename(path, new)
    except OSError as e:
        return {"error": "io", "message": str(e)}
    return {"ok": True, "path": new}


def load_json(name, default=None):
    p = os.path.join(data_dir(), name)
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save_json(name, obj):
    p = os.path.join(data_dir(), name)
    try:
        atomic_write(p, json.dumps(obj, ensure_ascii=False).encode("utf-8"))
        return True
    except OSError:
        return False
