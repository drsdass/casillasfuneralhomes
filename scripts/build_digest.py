"""Builds supabase/functions/morning-digest/index.ts by copying src/lib/workflow.ts into the template,
so the phone notification uses exactly the same "what is missing" rules as the screens.
Run from the project folder:  python3 scripts/build_digest.py"""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
wf = (root / 'src/lib/workflow.ts').read_text()
tpl = (root / 'supabase/functions/morning-digest/index.template.ts').read_text()
assert '// @@WORKFLOW@@' in tpl
(root / 'supabase/functions/morning-digest/index.ts').write_text(tpl.replace('// @@WORKFLOW@@', '// ---- copied from src/lib/workflow.ts ----\n' + wf + '\n// ---- end of copied code ----'))
print('wrote supabase/functions/morning-digest/index.ts')
