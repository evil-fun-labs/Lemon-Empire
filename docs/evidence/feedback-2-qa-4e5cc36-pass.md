date: 2026-11-10
tested: Lemon Empire build/feedback-2, independent QA of the fixes to the findings in feedback-qa-9f80399-pass.md (HttpSink honesty, stage-matched questions, bottom toast, text cleaning, saves/clock)
version: 4e5cc36 (base main 6727efd)
result: pass
raw: npm-test.log (359 PASS across 16 suites, exit 0; per-suite counts: save 29, clock 11, economy 15, softlock 6, format 7, shop 10, rush 9, nohover 2, device 22, device-reveal 41, franchise 24, device-franchise 39, device-polish 19, feedback 46, stamp 3, device-feedback 76); net.log, stage.log, toast.log + shots/toast-*.png, text.log, happy.log, saves.log; hashes.txt (sha256 prefixes). All in the qa-feedback2 scratchpad folder.
depends-on: src/feedback.js src/feedback-ui.js src/main.js src/style.css index.html questions.json feedback-config.json
model: unknown
checked-by: QA role (did not build the feature)
Notes: script FAIL lines in net.log (console resource errors from the mock 500/refused), text.log (my expected string had two spaces) and saves.log (old builds lack shop/franchises fields so null vs false) are test artifacts, not product bugs. Minor findings: toast says "Sent, thanks!" on a 500 (no-cors cannot see it; the panel counts say "sent, not confirmed"); toast covers panel body text and the Export label for 2.2 s but has pointer-events none. Declared first: PLAN.md.
