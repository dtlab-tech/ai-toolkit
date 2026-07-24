# Ottimizzazione dell'uso dei token — AI Toolkit

> Report di analisi. Data: 2026-07-23.
> Fonti: misurazioni sul repo + documentazione ufficiale Claude Code (`code.claude.com/docs/en/costs`).
> Stato: **solo raccomandazioni** — nessuna modifica applicata.

## Come Claude Code fattura i token (il modello mentale corretto)

Il costo scala con la **dimensione del contesto processato a ogni turno**, non con
il numero di file nel toolkit. Tre meccanismi automatici mitigano già molto:

- **Prompt caching**: system prompt, CLAUDE.md e tool definitions ripetuti vengono
  cachati (cache read costa ~1/10 di un input token). Vita cache: 1h su subscription,
  5 min su API/usage-credits.
- **Auto-compaction**: la history lunga viene riassunta vicino al limite di contesto.
- **Subagent isolati**: l'output verboso resta nel contesto del subagent, al main
  loop torna solo un riassunto.

Conseguenza pratica: **le leve più grosse non sono "accorciare i prompt" ma
(a) non pagare due volte lo stesso contesto, (b) usare il modello giusto per ogni
agent, (c) tenere fuori dal contesto ciò che non serve al turno corrente.**

---

## Leva 1 — Deduplicare CLAUDE.md  ⭐ impatto alto / sforzo minimo / rischio zero

### Cosa ho misurato
- `CLAUDE.md` (progetto) e `~/.claude/CLAUDE.md` (globale) sono **byte-per-byte identici**
  (verificato con `diff -q`).
- 169 righe / 1.257 parole ciascuno (~1.700 token).
- Entrambi vengono caricati in **ogni** sessione → ~3.400 token di contesto base,
  di cui **metà è puro duplicato**.
- 55 delle 169 righe sono tabelle-catalogo (elenco skill/comandi/agent) — informazione
  di *scoperta*, non *istruzione operativa*.

### Raccomandazione
1. **Il globale non deve duplicare il progetto.** `~/.claude/CLAUDE.md` dovrebbe
   contenere solo preferenze cross-progetto (lingua, stile). Il catalogo del toolkit
   vive già nel `CLAUDE.md` di progetto + `docs/reference.md`.
2. **Spostare le tabelle-catalogo in `docs/reference.md`** (che già esiste ed è pensato
   come cheatsheet). CLAUDE.md tiene solo: dipendenze, Gate Protocol, override
   procedure. La doc ufficiale raccomanda **CLAUDE.md < 200 righe, solo essenziali**.
3. Il Gate Protocol (regole MANDATORY sul PM) **resta** in CLAUDE.md: è un vincolo
   operativo che deve essere sempre attivo.

### Risparmio stimato
~1.700 token di duplicato eliminati + ~600 token di catalogo spostato = **~2.300 token
risparmiati su ogni turno di ogni sessione**. Su sessioni lunghe (dove il contesto si
rimanda intero a ogni messaggio) è il risparmio con il miglior rapporto costo/beneficio.

---

## Leva 2 — Assegnare `model:` esplicito a ogni agent  ⭐ impatto altissimo

### Cosa ho misurato
Solo 7 agent su 22 hanno `model:` nel frontmatter (tutti `haiku`). Gli altri 15 —
**inclusi i due orchestratori `assessment-manager` e `project-manager`** — non lo
specificano e quindi ereditano il modello di sessione (spesso Opus).

### Perché conta più di tutto il resto
Dal listino in `docs/pricing.md`:

| Modello | Blended $/1k token | Rapporto vs Haiku |
|---|---|---|
| Opus 4.8 | $0.009000 | **5×** |
| Sonnet 5 | $0.005400 | 3× |
| Haiku 4.5 | $0.001800 | 1× |

Un agent che gira su Opus invece che su Sonnet costa **~1,7× in più a parità di token**.
La doc ufficiale è esplicita: *"Reserve Opus for complex architectural decisions or
multi-step reasoning. For simple subagent tasks, specify `model: haiku`."*

### Raccomandazione — mappatura per ruolo
| Ruolo | Modello suggerito | Motivo |
|---|---|---|
| Orchestratori (`assessment-manager`, `project-manager`) | **sonnet** | Coordinamento, non ragionamento profondo. La doc consiglia Sonnet per il coordinamento nei team. |
| Assessment read-only (già haiku) | haiku ✅ | Pattern-matching su codice |
| `generate-*`, `validate-*` (già haiku) | haiku ✅ | Trasformazione documentale |
| Developer (`developer-backend/frontend/testing`) | **sonnet** | Scrittura codice, buon compromesso |
| Refactoring (`god-class`, `domain-model`, `dependency-injection`) | **sonnet** | Modifiche strutturali con verifica build |
| `review-solution` | **opus** *(o sonnet)* | Unico punto dove il ragionamento profondo ripaga |
| `define-feature`, `init-agents-md` | sonnet | Interviste/analisi |

Regola: **default Sonnet, Haiku per il meccanico, Opus solo dove il giudizio architetturale ripaga.**

### Risparmio stimato
Se gli orchestratori giravano su Opus, passarli a Sonnet è **~40% sul loro costo**.
Dato che `assessment-manager` è l'agent più pesante (~6.700 token di solo prompt +
~3.000 di procedure lette a runtime), è il singolo intervento a maggior ritorno.

---

## Leva 3 — Estrarre la logica deterministica da `assessment-manager`  ⭐ impatto alto / sforzo medio

### Cosa ho misurato
`assessment-manager.md` = **5.052 parole (~6.700 token)**, il doppio del secondo agent.
Di queste, le sezioni righe **104–357** (calcolo Token/Effort Estimate) e **378–630**
(Data Contracts + Registry Write Algorithm) sono **~3.500 parole di pseudo-codice
deterministico**: somme, formule fisse, gestione errori I/O passo-passo, parsing tabelle.

### Il problema
Far *eseguire a un LLM* aritmetica e I/O deterministici è:
- **costoso** — quelle 3.500 parole entrano nel contesto dell'agent a ogni run;
- **fragile** — il modello può sbagliare una somma o un formato;
- **ridondante** — è esattamente il lavoro che uno script fa a costo ~zero.

### Raccomandazione
Spostare la logica meccanica fuori dal prompt in uno di questi modi (in ordine di preferenza):
1. **Script esterno** (Python/Node) invocato via Bash: prende i `<usage>` block +
   Interventions-Index e produce Token-Estimate.md / Effort-Estimate.md / registry.md.
   Il prompt dell'agent si riduce a "esegui `scripts/estimate.py` con questi input".
2. **Workflow script** (`Workflow` tool) se preferisci restare dentro Claude Code:
   fan-out degli assessment + fasi di calcolo deterministico in JS.
3. Se deve restare prosa, **comprimere** i Data Contract e la gestione errori in una
   procedura referenziata (`docs/procedures/`) letta solo quando serve, non inline.

Il prompt di `assessment-manager` potrebbe scendere da ~6.700 a ~2.500 token.

### Risparmio stimato
~4.000 token di prompt in meno per ogni invocazione dell'assessment-manager, **più**
eliminazione del rischio di errori aritmetici (che oggi costano ri-esecuzioni).

---

## Leva 4 — Procedure lette on-demand invece che all'avvio  ⭐ impatto medio

### Cosa ho misurato
`assessment-manager` legge all'avvio 4 procedure + `pricing.md`:
`process-log` (144w) + `issues-register` (140w) + `assessment-findings-gate` (629w)
+ `token-estimation` (1.283w) + `pricing` = **~2.900 parole (~3.900 token)** iniettate
nel contesto *prima* di iniziare. 7 agent hanno questo pattern "read these procedures".

### Raccomandazione
- Leggere ogni procedura **nel momento in cui serve**, non tutte all'inizio.
  Es. `token-estimation.md` serve solo in Phase 3/4, non in Phase 1.
- Se la Leva 3 estrae il calcolo token in uno script, `token-estimation.md` (1.283w,
  la procedura più grossa) **non serve più nel contesto dell'LLM**.
- Valutare la compressione delle procedure più lunghe: `token-estimation.md` e
  `approval-gates.md` contengono esempi ripetuti comprimibili.

### Risparmio stimato
~2.000 token per run dell'assessment-manager, cumulativo con la Leva 3.

---

## Leva 5 — Igiene di sessione (comportamentale, costo zero)

Dalla doc ufficiale, gli sprechi più comuni sono **sessioni mai pulite** e **modello
troppo grosso di default**:

- **`/clear` tra task non correlati.** Il contesto stantio si ri-invia a ogni messaggio.
  Prima di pulire, `/rename` per ritrovare la sessione, poi `/resume`.
- **`/compact "focus su X"`** quando serve continuità ma il contesto è cresciuto.
- **`/context` e `/usage`** per vedere cosa occupa spazio; `/usage` segnala i
  comportamenti che superano il 10% (long context, cache miss).
- **Cache miss**: la prima richiesta dopo >1h (subscription) ri-processa tutto il
  contesto. Raggruppare il lavoro sul toolkit in finestre temporali serrate aiuta.
- **`/effort` più basso** per i task meccanici: i thinking token sono fatturati come
  output. Per gli agent Haiku (assessment pattern-matching) l'effort alto raramente ripaga.

---

## Leva 6 — Hook di pre-processing per output verbosi  ⭐ opzionale

Gli agent di assessment leggono molto codice. Un hook `PreToolUse` su Bash può
filtrare l'output dei comandi (es. solo righe `ERROR`/`FAIL`, o `grep` mirati) prima
che entri nel contesto — la doc mostra un esempio che riduce un log da decine di
migliaia a centinaia di token. Utile se in futuro gli assessment lanciano build/test.

---

## Riepilogo prioritizzato

| # | Leva | Impatto | Sforzo | Rischio | Risparmio stimato |
|---|---|---|---|---|---|
| 1 | Deduplicare CLAUDE.md globale/progetto | Alto | Minimo | Zero | ~2.300 tok / turno |
| 2 | `model:` esplicito su tutti gli agent | **Altissimo** | Basso | Basso | ~40% sugli orchestratori |
| 3 | Estrarre calcolo deterministico da assessment-manager | Alto | Medio | Medio | ~4.000 tok / run |
| 4 | Procedure on-demand | Medio | Medio | Basso | ~2.000 tok / run |
| 5 | Igiene di sessione (/clear, /compact, /effort) | Alto | Zero | Zero | variabile, cumulativo |
| 6 | Hook di filtro output | Medio | Basso | Basso | dipende dall'uso |

**Ordine consigliato di attacco:** 2 → 1 → 5 (tutti a basso sforzo e alto ritorno),
poi 3 → 4 (refactoring più impegnativo dell'assessment-manager), infine 6 se necessario.

---

## Riconciliazione con l'analisi ChatGPT del repo

ChatGPT ha analizzato il repo pubblico `dtlab-tech/ai-toolkit` e prodotto ~15
raccomandazioni. Ecco il giudizio critico su ciascuna, alla luce di **come funziona
realmente Claude Code** (non un framework generico) e di cosa ho verificato sul codice.

### Convergenze — GPT ha ragione, e coincide con le mie leve

| Raccomandazione GPT | Mio giudizio | Nota |
|---|---|---|
| Modelli differenziati per ruolo (haiku/sonnet/opus) | ✅ **Valida, priorità #1** | = mia Leva 2. Allineata alla doc ufficiale. |
| Effort basso per task meccanici | ✅ Valida | Thinking token = output token. `/effort` o `MAX_THINKING_TOKENS`. |
| Summary + full split (orchestratore legge solo il summary) | ✅ **Valida, alto ROI** | La doc Anthropic lo raccomanda esplicitamente per i subagent. |
| Procedure caricate on-demand per fase | ✅ Valida | = mia Leva 4. |
| `/clear`, `/compact`, compact-instructions in CLAUDE.md | ✅ Valida | = mia Leva 5. Confermato dalla doc. |
| CLAUDE.md breve | ✅ **Valida** | = mia Leva 1 — ma GPT non poteva vedere il duplicato globale/progetto. |
| generic-assessment → triage (non duplicare gli specialisti) | ✅ Valida | Riduce sovrapposizione di scope. Buon punto. |
| Delegation policy (subagent solo se serve) | ✅ Valida | Allineata alla doc sui subagent. |
| Scope a livello di file, non solo di agente | 🟡 Utile | Vero che `--scope` seleziona agent, non file. Ma vedi caveat sotto. |

### Caveat e correzioni — dove GPT ragiona da "framework tradizionale"

1. **"Aggiungi `budget:` nel frontmatter dell'agent" — ❌ tecnicamente errato.**
   Lo schema frontmatter degli agent Claude Code (`name`, `description`, `model`,
   `tools`) **non ha un campo `budget:`**. Metterlo lì non fa nulla: non è *enforced*
   dall'harness. Un `max_files: 25` in YAML è ignorato.
   → *Correzione:* i limiti vanno espressi come **istruzioni testuali nel corpo del
   prompt** ("Inspect at most ~25 files; stop when evidence is sufficient"). Sono
   linee guida che il modello segue, non vincoli hard. Un budget di token *reale*
   esiste solo dentro i **Workflow script** (`budget.total`), che è un altro meccanismo.

2. **"Repository Scanner unico + `repository-index.json`" (P0 di GPT) — 🟡 valido come
   principio, sopravvalutato nell'impatto.** GPT assume che ogni agent "riceva/riscansioni
   l'intero repository". In realtà un subagent Claude Code parte con **contesto minimo**
   e legge on-demand via Grep/Glob/Read: ricevere il *path* ≠ ricevere tutto il repo.
   La duplicazione di lettura esiste (N agent che grep-ano gli stessi file), ma è meno
   drammatica del quadro dipinto. Inoltre, su un toolkit *generico* che gira su codebase
   arbitrarie, l'indice va **rigenerato a ogni run** (= una scansione comunque). Il
   risparmio reale c'è **solo se molti agent condividono lo stesso indice** — va misurato,
   non assunto. Buona idea per l'assessment parallelo; ROI da verificare.

3. **"Output JSON compatti invece di Markdown" (P0 di GPT) — 🟡 il punto giusto è un
   altro.** JSON non è intrinsecamente più economico del Markdown: virgolette, parentesi
   e chiavi ripetute spesso lo rendono *più* verboso. Il guadagno vero non è "JSON vs MD"
   ma **il summary/full split** (l'orchestratore legge il riassunto, non il documento
   intero). Adottare lo split: sì. Farlo *perché* è JSON: irrilevante.

4. **"Cache hash-based (commit_sha + agent_version + …)" (P1 di GPT) — 🟡 chiarire il
   livello.** Questo è caching **applicativo** (evitare di *ri-eseguire* un agent se
   l'input non è cambiato), NON il **prompt caching** di Claude (che riduce il costo
   input a ogni turno ed è già automatico). Sono complementari. La cache hash-based è
   utile ma va capito che agisce su un asse diverso dal costo per-turno.

5. **"Skill progressive per Clean Code / Clean Architecture" (P1 di GPT) — 🟡 premessa
   parz. sovrastimata.** GPT ipotizza "300 righe di regole Clean Code nei prompt".
   Verificato: gli agent **non** contengono quel volume — `god-class-decomposition` e
   `domain-model-refactoring` citano i concetti brevemente. L'idea di skill progressive
   resta buona in generale, ma il risparmio su *questo* repo è minore di quanto stimato.

6. **"agent-registry.json per evitare la discovery ripetuta" (P1) — 🟢 basso ROI.**
   GPT stesso ammette che "il costo non è enorme". Micro-ottimizzazione: leggere i
   frontmatter di ~22 file è economico. Farlo solo se si tocca comunque l'installer.

7. **"Handbook di 120-150 pagine" — ⚠️ attenzione al paradosso token.** Un manuale
   umano va benissimo *come documentazione*. Ma se lo si referenzia da CLAUDE.md o lo si
   fa leggere agli agent, **aumenta** i token — l'opposto dell'obiettivo. Tenerlo come
   riferimento per umani, mai in contesto automatico.

### Suggerimenti "generici" (non da questa chat) che comunque NON valgono per Claude Code

- **"Abbassa `max_tokens` / `temperature`"** — non esposti nella CLI; la lunghezza
  dell'output è guidata dal task.
- **"Manda meno messaggi"** — irrilevante: costa il *contesto per turno*, non il numero
  di messaggi.
- **"Usa un modello piccolo per tutto"** — controproducente: un modello troppo debole
  sbaglia e forza ri-esecuzioni. La regola è *modello adatto al task*.

### Sintesi del giudizio

La base del toolkit è solida (GPT dà 6,5/10, ragionevole). Le raccomandazioni a **più
alto ritorno e più basso rischio**, su cui io e GPT convergiamo, sono:
**(1) modelli differenziati, (2) summary/full split, (3) procedure on-demand, (4) igiene
di sessione.** A queste aggiungo la **deduplicazione del CLAUDE.md globale/progetto**
(che GPT non poteva vedere). Le idee più "architetturali" di GPT (repository-scanner,
budget, cache hash-based) sono valide come *direzione* ma vanno (a) tradotte nei
meccanismi reali di Claude Code e (b) **misurate con `/usage` prima e dopo**, non
adottate sulla fiducia.
