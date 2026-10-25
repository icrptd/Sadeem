"""Sadeem (سديم) — Arabic-first text editor. Part of the Falak family.
Python + pywebview shell around the bundled web UI."""
import json
import os
import socket
import subprocess
import sys
import threading

import webview

import backend as B

VERSION = "1.0.0"
PORT = 47931


def resource_path(*parts):
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, *parts)


# ---------------------------------------------------------------- clipboard (Windows)
def _clip_set(text):
    if os.name != "nt":
        return False
    import ctypes
    from ctypes import wintypes
    k32, u32 = ctypes.windll.kernel32, ctypes.windll.user32
    k32.GlobalAlloc.restype = wintypes.HGLOBAL
    k32.GlobalAlloc.argtypes = [wintypes.UINT, ctypes.c_size_t]
    k32.GlobalLock.restype = ctypes.c_void_p
    k32.GlobalLock.argtypes = [wintypes.HGLOBAL]
    k32.GlobalUnlock.argtypes = [wintypes.HGLOBAL]
    u32.SetClipboardData.argtypes = [wintypes.UINT, wintypes.HANDLE]
    data = (text + "\0").encode("utf-16-le")
    u32.GetForegroundWindow.restype = wintypes.HWND
    u32.OpenClipboard.argtypes = [wintypes.HWND]
    # a NULL owner makes SetClipboardData fail after EmptyClipboard, so use the foreground window
    opened = False
    for _ in range(10):
        if u32.OpenClipboard(u32.GetForegroundWindow()):
            opened = True
            break
        import time
        time.sleep(0.02)
    if not opened:
        return False
    try:
        u32.EmptyClipboard()
        h = k32.GlobalAlloc(0x0002, len(data))
        p = k32.GlobalLock(h)
        ctypes.memmove(p, data, len(data))
        k32.GlobalUnlock(h)
        return bool(u32.SetClipboardData(13, h))
    finally:
        u32.CloseClipboard()


def _clip_get():
    if os.name != "nt":
        return None
    import ctypes
    from ctypes import wintypes
    k32, u32 = ctypes.windll.kernel32, ctypes.windll.user32
    u32.GetClipboardData.restype = wintypes.HANDLE
    k32.GlobalLock.restype = ctypes.c_void_p
    k32.GlobalLock.argtypes = [wintypes.HGLOBAL]
    k32.GlobalUnlock.argtypes = [wintypes.HGLOBAL]
    if not u32.OpenClipboard(None):
        return None
    try:
        h = u32.GetClipboardData(13)
        if not h:
            return ""
        p = k32.GlobalLock(h)
        try:
            return ctypes.wstring_at(p)
        finally:
            k32.GlobalUnlock(h)
    finally:
        u32.CloseClipboard()


# ---------------------------------------------------------------- api
class Api:
    def __init__(self, args):
        self.args = args
        self._window = None
        self.dirty = 0
        self.forced = False
        self.closing_asked = False

    # --- lifecycle
    def init(self):
        return {
            "settings": B.load_json("settings.json", {}),
            "session": B.load_json("session.json", None),
            "args": [a for a in self.args if os.path.isfile(a)],
            "version": VERSION,
            "dataDir": B.data_dir(),
            "platform": sys.platform,
        }

    def set_dirty(self, n):
        self.dirty = int(n or 0)

    def quit(self):
        self.forced = True
        threading.Thread(target=_watchdog, args=(2.5,), daemon=True).start()
        if self._window:
            self._window.destroy()

    # --- files
    def pick_open(self):
        r = self._window.create_file_dialog(webview.FileDialog.OPEN, allow_multiple=True, file_types=(
            "Text files (*.txt;*.md;*.log;*.json;*.csv;*.xml;*.html;*.css;*.js;*.py;*.sql;*.yml;*.yaml)",
            "All files (*.*)"))
        return list(r) if r else []

    def pick_save(self, suggested="", directory=""):
        r = self._window.create_file_dialog(webview.FileDialog.SAVE, directory=directory or "", save_filename=suggested or "")
        if not r:
            return None
        return r if isinstance(r, str) else r[0]

    def read_file(self, path, encoding=None, force=False):
        return B.read_file(path, encoding, force)

    def write_file(self, path, text, encoding="utf-8", eol="crlf"):
        return B.write_file(path, text, encoding, eol)

    def stat_files(self, paths):
        return B.stat_files(paths)

    def rename_file(self, path, new_name):
        return B.rename_file(path, new_name)

    def reveal(self, path):
        try:
            if os.name == "nt":
                subprocess.Popen("explorer /select,\"%s\"" % os.path.normpath(path))
            elif sys.platform == "darwin":
                subprocess.Popen(["open", "-R", path])
            else:
                subprocess.Popen(["xdg-open", os.path.dirname(path)])
        except OSError:
            pass

    def open_url(self, url):
        if str(url).lower().startswith(("http://", "https://")):
            import webbrowser
            webbrowser.open(url)

    def open_data_dir(self):
        d = B.data_dir()
        try:
            if os.name == "nt":
                os.startfile(d)  # noqa
            else:
                subprocess.Popen(["xdg-open", d])
        except OSError:
            pass

    # --- settings/session
    def save_settings(self, s):
        return B.save_json("settings.json", s)

    def save_session(self, s):
        return B.save_json("session.json", s)

    # --- window
    def window_op(self, op, value=None):
        w = self._window
        if not w:
            return
        try:
            if op == "title":
                w.set_title(str(value))
            elif op == "fullscreen":
                w.toggle_fullscreen()
            elif op == "on_top":
                w.on_top = bool(value)
            elif op == "minimize":
                w.minimize()
            elif op == "maximize":
                w.maximize()
        except Exception:
            pass

    def register_files(self):
        try:
            r = register_file_types()
            if r.get("ok") and os.name == "nt":
                os.startfile("ms-settings:defaultapps")  # noqa
            return r
        except Exception as e:
            return {"ok": False, "message": str(e)}

    # --- clipboard
    def copy_text(self, text):
        try:
            return bool(_clip_set(text))
        except Exception:
            return False

    def paste_text(self):
        try:
            return _clip_get()
        except Exception:
            return None


# ---------------------------------------------------------------- single instance
HELLO = "sadeem-single-instance-v1"


def send_to_running(paths):
    """Hand the paths to an already running Sadeem. Returns True only if that instance confirmed (so an
    unrelated program on the port, or a hung old instance, never swallows the launch)."""
    try:
        with socket.create_connection(("127.0.0.1", PORT), timeout=0.6) as s:
            s.settimeout(7)
            s.sendall((json.dumps({"hello": HELLO, "open": paths}) + "\n").encode("utf-8"))
            reply = b""
            while not reply.endswith(b"\n") and len(reply) < 64:
                chunk = s.recv(64)
                if not chunk:
                    break
                reply += chunk
            return reply.strip() == b"ok:" + HELLO.encode()
    except OSError:
        return False


def _handle_client(c, api):
    ok = False
    try:
        with c:
            c.settimeout(2)
            buf = b""
            while not buf.endswith(b"\n") and len(buf) < 65536:
                chunk = c.recv(4096)
                if not chunk:
                    break
                buf += chunk
            msg = json.loads(buf.decode("utf-8"))
            if msg.get("hello") != HELLO:
                return
            paths = [p for p in msg.get("open", []) if isinstance(p, str) and os.path.isfile(p)]
            w = api._window
            if w:
                # wait until the UI has finished booting (a second launch can arrive while the first is starting)
                import time
                for _ in range(24):
                    try:
                        if w.evaluate_js("!!(window.App && window.App.openPaths)"):
                            ok = True
                            break
                    except Exception:
                        pass
                    time.sleep(0.25)
                if ok:
                    try:
                        w.restore()
                        w.show()
                    except Exception:
                        pass
                    if paths:
                        w.evaluate_js("window.App.openPaths(%s)" % json.dumps(paths))
            if ok:
                c.sendall(("ok:" + HELLO + "\n").encode())
    except Exception:
        pass


def listen(api):
    srv = socket.socket()
    try:
        srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        srv.bind(("127.0.0.1", PORT))
        srv.listen(8)
    except OSError:
        return

    def loop():
        while True:
            try:
                c, _ = srv.accept()
            except OSError:
                return
            threading.Thread(target=_handle_client, args=(c, api), daemon=True).start()

    threading.Thread(target=loop, daemon=True).start()


DEFAULT_EXTS = [".txt", ".md", ".log"]
OPENWITH_EXTS = [".txt", ".md", ".log", ".csv", ".ini", ".cfg", ".json", ".xml", ".yml", ".yaml", ".sql", ".py", ".js", ".css", ".html"]


def register_file_types():
    """Per-user file association (no admin needed): Sadeem document icon + 'Open with'."""
    if os.name != "nt":
        return {"ok": False, "message": "Windows only"}
    import winreg
    if getattr(sys, "frozen", False):
        exe = sys.executable
        cmd = '"%s" "%%1"' % exe
    else:
        exe = os.path.abspath(__file__)
        cmd = '"%s" "%s" "%%1"' % (sys.executable.replace("python.exe", "pythonw.exe"), exe)
    icon = resource_path("ui", "doc.ico")
    if not os.path.exists(icon):
        icon = exe
    root = winreg.HKEY_CURRENT_USER

    def setv(path, value, name=""):
        k = winreg.CreateKeyEx(root, "Software\\Classes\\" + path, 0, winreg.KEY_SET_VALUE)
        winreg.SetValueEx(k, name, 0, winreg.REG_SZ, value)
        winreg.CloseKey(k)

    prog = "Sadeem.TextFile"
    setv(prog, "ملف نصي — سديم")
    setv(prog + "\\DefaultIcon", icon)
    setv(prog + "\\shell\\open\\command", cmd)
    app = "Applications\\" + os.path.basename(exe)
    setv(app + "\\shell\\open\\command", cmd)
    setv(app, "Sadeem", "FriendlyAppName")
    setv(app + "\\DefaultIcon", icon)
    for ext in OPENWITH_EXTS:
        k = winreg.CreateKeyEx(root, "Software\\Classes\\" + ext + "\\OpenWithProgids", 0, winreg.KEY_SET_VALUE)
        winreg.SetValueEx(k, prog, 0, winreg.REG_NONE, b"")
        winreg.CloseKey(k)
    for ext in DEFAULT_EXTS:
        try:
            setv(ext, prog)
        except OSError:
            pass
    try:
        import ctypes
        ctypes.windll.shell32.SHChangeNotify(0x08000000, 0, None, None)
    except Exception:
        pass
    return {"ok": True}


def heal_registration():
    """Windows remembers 'Open with' per exe name. Repoint stale paths and make sure the document icon is used."""
    if os.name != "nt" or not getattr(sys, "frozen", False):
        return
    try:
        import winreg
        exe = sys.executable
        cmd = '"%s" "%%1"' % exe
        icon = resource_path("ui", "doc.ico")
        changed = False
        for sub in ("Applications\\" + os.path.basename(exe), "Sadeem.TextFile"):
            base = "Software\\Classes\\" + sub
            try:
                k = winreg.OpenKey(winreg.HKEY_CURRENT_USER, base + "\\shell\\open\\command", 0, winreg.KEY_READ | winreg.KEY_SET_VALUE)
            except OSError:
                continue
            try:
                if winreg.QueryValueEx(k, "")[0] != cmd:
                    winreg.SetValueEx(k, "", 0, winreg.REG_SZ, cmd)
                    changed = True
            finally:
                winreg.CloseKey(k)
            if os.path.exists(icon):
                ik = winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, base + "\\DefaultIcon", 0, winreg.KEY_READ | winreg.KEY_SET_VALUE)
                try:
                    try:
                        cur = winreg.QueryValueEx(ik, "")[0]
                    except OSError:
                        cur = None
                    if cur != icon:
                        winreg.SetValueEx(ik, "", 0, winreg.REG_SZ, icon)
                        changed = True
                finally:
                    winreg.CloseKey(ik)
        if changed:
            import ctypes
            ctypes.windll.shell32.SHChangeNotify(0x08000000, 0, None, None)
    except Exception:
        pass


def _watchdog(seconds):
    import time
    time.sleep(seconds)
    os._exit(0)  # session/settings are already saved; never leave a zombie process


# ---------------------------------------------------------------- main
def main():
    args = [os.path.abspath(a) for a in sys.argv[1:] if not a.startswith("-")]
    dev = "--dev" in sys.argv
    if not dev and send_to_running(args):
        return
    heal_registration()
    api = Api(args)
    settings = B.load_json("settings.json", {}) or {}
    win = webview.create_window(
        "سديم — Sadeem", resource_path("ui", "index.html"), js_api=api,
        width=1180, height=760, min_size=(640, 420), background_color="#0b0815",
        text_select=True, zoomable=False, on_top=bool(settings.get("alwaysOnTop")),
    )
    api._window = win

    def on_closing():
        if api.forced:
            return True
        def ask():
            need_confirm = bool((B.load_json("settings.json", {}) or {}).get("askBeforeExit")) and api.dirty > 0
            if not need_confirm:
                threading.Thread(target=_watchdog, args=(4,), daemon=True).start()
            try:
                win.evaluate_js("window.App ? window.App.onCloseRequested() : null")
            except Exception:
                api.quit()
        threading.Thread(target=ask, daemon=True).start()
        return False

    win.events.closing += on_closing

    def on_drop(e):
        files = (e.get("dataTransfer") or {}).get("files") or []
        paths = [f.get("pywebviewFullPath") for f in files if f.get("pywebviewFullPath")]
        if paths:
            win.evaluate_js("window.App && window.App.openPaths(%s)" % json.dumps(paths))

    def on_loaded():
        try:
            from webview.dom import DOMEventHandler
            win.dom.document.events.drop += DOMEventHandler(on_drop, True, True)
        except Exception:
            pass

    win.events.loaded += on_loaded
    if not dev:
        listen(api)
    icon = resource_path("ui", "icon.ico")
    webview.start(debug=dev, icon=icon if os.path.exists(icon) else None, storage_path=os.path.join(B.data_dir(), "webview"), private_mode=False)


if __name__ == "__main__":
    main()
