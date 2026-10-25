import os, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import backend as B


class T(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()

    def p(self, n):
        return os.path.join(self.d, n)

    def roundtrip(self, enc, eol, text="مرحبا بالعالم\nسطر ثان\n"):
        r = B.write_file(self.p("a.txt"), text, enc, eol)
        self.assertTrue(r.get("ok"), r)
        got = B.read_file(self.p("a.txt"))
        self.assertTrue(got.get("ok"), got)
        self.assertEqual(got["text"], text)
        return got

    def test_utf8(self):
        g = self.roundtrip("utf-8", "lf")
        self.assertEqual((g["encoding"], g["eol"]), ("utf-8", "lf"))

    def test_utf8_bom(self):
        g = self.roundtrip("utf-8-sig", "crlf")
        self.assertEqual((g["encoding"], g["eol"]), ("utf-8-sig", "crlf"))

    def test_utf16(self):
        for e in ("utf-16-le", "utf-16-be"):
            g = self.roundtrip(e, "crlf")
            self.assertEqual(g["encoding"], e)

    def test_cp1256_detected(self):
        g = self.roundtrip("cp1256", "crlf")
        self.assertEqual(g["encoding"], "cp1256")

    def test_encode_error(self):
        r = B.write_file(self.p("b.txt"), "مرحبا", "cp1252", "lf")
        self.assertEqual(r, {"error": "encode"})
        self.assertFalse(os.path.exists(self.p("b.txt")))

    def test_binary(self):
        open(self.p("x.bin"), "wb").write(b"\x00\x01\x02" * 100)
        self.assertEqual(B.read_file(self.p("x.bin"))["error"], "binary")
        self.assertTrue(B.read_file(self.p("x.bin"), force=True).get("ok"))

    def test_notfound(self):
        self.assertEqual(B.read_file(self.p("nope"))["error"], "notfound")

    def test_reopen_with_encoding(self):
        B.write_file(self.p("c.txt"), "سلام", "cp1256", "lf")
        self.assertEqual(B.read_file(self.p("c.txt"), "cp1256")["text"], "سلام")

    def test_mixed_eol_majority(self):
        open(self.p("m.txt"), "wb").write(b"a\r\nb\r\nc\nd")
        g = B.read_file(self.p("m.txt"))
        self.assertEqual((g["eol"], g["text"]), ("crlf", "a\nb\nc\nd"))

    def test_rename_and_stat(self):
        B.write_file(self.p("r.txt"), "x", "utf-8", "lf")
        r = B.rename_file(self.p("r.txt"), "s.txt")
        self.assertTrue(r["ok"])
        st = B.stat_files([self.p("s.txt"), self.p("r.txt")])
        self.assertTrue(st[self.p("s.txt")]["exists"])
        self.assertFalse(st[self.p("r.txt")]["exists"])


if __name__ == "__main__":
    unittest.main()
