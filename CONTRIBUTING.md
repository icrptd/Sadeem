# Contributing / المساهمة

Thanks for helping! / شكرًا لمساهمتك!

1. Fork the repo and create a branch.
2. UI sources are in `ui-src/` (rebuild with `cd ui-src && npm install && node build.mjs`, output goes to `ui/`). Python shell: `sadeem.py`, file IO: `backend.py`.
3. Run the tests before opening a PR:
   - `node --test ui-src/test/core.test.mjs`
   - `python -m unittest tests.test_backend`
4. Keep UI strings bilingual: use `L('عربي', 'English')`.
5. Describe what you changed and attach a screenshot for visual changes.
