# Number firewall, step 1 (Lorenzo, 27 Oct; report only): every figure in a model-written, delivered sentence, traced to
# a source. Usage: python3 evals/number-firewall/trace.py <corpus root with *.turns.jsonl.gz> <flags out.json>
# Model-written = a sentence of the model's own say/question (parsedTurn) that was delivered. Skipped: years, bare
# integers 0-10, exhibit numbers, number words. Match: within 0.5% (or 0.05), raw or scaled (M, bn, k).
import json,gzip,glob,os,re,sys,collections,itertools
CASES='/Users/lorenzo/coding/personal-projects/CaseTester/.claude/worktrees/phase2-design/cases'
ROOT=sys.argv[1]; OUT=sys.argv[2]
NUM=re.compile(r"(?<![\w.])(\$)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*(%|percent|x\b|×|million|billion|bn\b|m\b|M\b|k\b|K\b|B\b)?",re.I)
SCALE={'million':1e6,'m':1e6,'billion':1e9,'bn':1e9,'b':1e9,'k':1e3}
def figs(text):
  out=[]
  for m in NUM.finditer(text or ''):
    raw=float((m.group(2)+(m.group(3) or '')).replace(',',''))
    unit=(m.group(4) or '').lower(); dollar=bool(m.group(1))
    out.append({'raw':raw,'unit':unit,'dollar':dollar,'text':m.group(0).strip(),'scaled':raw*SCALE.get(unit,1)})
  return out
def trivial(f,sentence):
  if not f['unit'] and not f['dollar'] and f['raw'].is_integer():
    if 1990<=f['raw']<=2035: return True
    if f['raw']<=10: return True
  if re.search(r'(?i)exhibit\s+'+re.escape(f['text']),sentence): return True
  return False
def vals(text): return {v for f in figs(text) for v in (f['raw'],f['scaled'])}
def close(a,b): return abs(a-b)<=max(0.005*max(abs(a),abs(b)),0.051)
def has(x,S): return any(close(x,s) for s in S)
def derived(x,S):
  L=sorted({s for s in S if s!=0})[:160]
  for a,b in itertools.permutations(L,2):
    for y in (a-b,a+b,a*b,a/b,100*(a-b)/b,100*a/b):
      if close(x,y): return True
  return False
cases={}
def case(cid):
  if cid not in cases:
    c=json.load(open(f'{CASES}/{cid}.json'))
    led={i['id']:i['value'] for i in c['dataLedger']}
    exh={e['id']:json.dumps(e.get('data'))+' '+e.get('title','') for e in c['exhibits']}
    prompt=c['prompt']+' '+' '.join(p.get('say','') for p in (c.get('factAnchors') or {}).get('promptFacts',[]))
    answers={a for s in c.get('mathSteps',[]) for a in [s.get('answer'),*(s.get('altAnswers') or [])] if a is not None}
    cases[cid]=(led,exh,prompt,answers)
  return cases[cid]
CHECKS=('recompute','verified_figures','checker_line','math_checker','arithmetic_check','pricing_check','unit_check','recompute_report_only','math_challenge')
rows=[];per=collections.Counter();interviews=0
for f in glob.glob(ROOT+'/**/*.turns.jsonl.gz',recursive=True):
  js=f.replace('.turns.jsonl.gz','.json')
  try: cid=json.load(open(js))['session']['caseId']
  except Exception: continue
  led,exh,prompt,answers=case(cid); interviews+=1
  P=vals(prompt); cand=set(); code=set(); run=os.path.basename(f).split('-')[-1].split('.')[0]
  for line in gzip.open(f,'rt'):
    d=json.loads(line)
    if 'delivered' not in d: continue
    st=d.get('stateBefore') or {}
    revealed=set(st.get('revealedIds') or [])|{i for s in d['delivered'] for i in (s.get('revealIds') or [])}
    shown=set(st.get('shownExhibitIds') or [])|{s['exhibitId'] for s in d['delivered'] if s.get('exhibitId')}
    cand|=vals(d.get('candidateText'))
    L=set().union(*[vals(led[i]) for i in revealed if i in led]) if revealed else set()
    E=set().union(*[vals(exh[e]) for e in shown if e in exh]) if shown else set()
    C=set()
    for c in d['checks']:
      if c['check'] in CHECKS: C|=vals(json.dumps(c.get('detail')))
    delivered=' '.join(s['text'] for s in d['delivered'])
    pt=d.get('parsedTurn') or {}
    model=[s.strip() for s in re.split(r'(?<=[.!?])\s+',' '.join([pt.get('say') or '',pt.get('question') or ''])) if s.strip()]
    model=[s for s in model if s in delivered]
    hidden_led=set().union(*[vals(v) for i,v in led.items() if i not in revealed]) if led else set()
    hidden_exh=set().union(*[vals(v) for e,v in exh.items() if e not in shown]) if exh else set()
    known=L|E|P|cand|code|C
    for s in model:
      for g in figs(s):
        if trivial(g,s): continue
        xs=(g['raw'],g['scaled'])
        if any(has(x,L|E) for x in xs): src='ledger_out'
        elif any(has(x,P) for x in xs): src='prompt'
        elif any(has(x,cand) for x in xs): src='candidate'
        elif any(has(x,code|C) for x in xs): src='code_or_checker'
        elif any(derived(x,known) for x in xs): src='derivation'
        elif any(has(x,hidden_led|hidden_exh) for x in xs): src='LEAK'
        else: src='UNTRACED'
        per[src]+=1
        if src in ('LEAK','UNTRACED'): rows.append({'run':run,'case':cid,'turn':d['turnIndex']+1,'src':src,'fig':g['text'],'sentence':s,'mathAnswer':any(has(x,answers) for x in xs),'cand':d.get('candidateText','')[-300:]})
    for s in d['delivered']:
      if s['kind']=='data' or not any(s['text'].strip() in m or m in s['text'] for m in model): code|=vals(s['text'])
json.dump(rows,open(OUT,'w'),indent=1)
print('interviews',interviews,'figures by source',dict(per))
