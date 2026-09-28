# Historical snapshot — FTR-018 Gate 1 Review Actions (superseded 2026-09-20)

**Status:** Gate 1 BLOCCATO — OQ-01 sotto-punti aperti (1a, 1b); Punto 3 richiede decisione architetturale pm-phase3; Punto 4 residui rimossi dal Tech Spec
**Aperto:** 2026-09-15
**Prerequisito a Gate 1:** tutti e 10 i punti risolti; OQ-01 chiusa con evidenze di spike

---

## Riepilogo progresso

| # | Area | Stato | Note |
|---|------|-------|------|
| 1 | Requirements — AC-03 | **DONE** | Testo corretto: "dispatch bloccato se ANY precondizione NOT satisfied" |
| 2 | Requirements — Related UC refs | **DONE** | AC-14: `UC-08`; AC-16: `All UCs` |
| 3 | Requirements — comandi / OQ alignment | **DONE** | OQ-01 RESOLVED in Requirements; dependency table aggiornata; A-08 aggiornata |
| 4 | OQ-01 — Node bridge spike | **IN PROGRESS — 2 sotto-punti aperti** | Bridge principale dimostrato (exit 0, JSON, SIGTERM). Aperti: OQ-01a (prova completa con agente FTR-017 verificato + hash + worktree + persistenza), OQ-01b (async spawn, orfani, deduplicazione). Spike autorizzata entro budget esistente. |
| 5 | Piano — Markdown lossless parsing | **DONE** | Tech Spec §7.1: MD parsed losslessly (outcome, verifications, task-level deps); digest copre MD+CSV |
| 6 | Lock — identity / liveness / worktree | **DONE** | Tech Spec §8.2: PID+start-time identity, no age-based recovery, `.git` file vs directory in worktrees |
| 7 | Ledger — firme e identity reali | **DONE** | Tech Spec §6.1: `computeOperationId(prefix, agent, attempt)` reale; identità distinte per implementation/rework/review/skip |
| 8 | Recovery — gap commit / SHA | **DONE** | Tech Spec §9.3 resume table + §13.2: ricerca per commit message, verifica identity/plan/content/branch, caso integrazione non registrata |
| 9 | Durabilità / CLI — garanzie e limiti | **DONE** | Tech Spec §5.1: limiti espliciti (filesystem, network, Windows); `replan` con storia + --abandon; `diagnose` aggiunto (§9.6) |
| 10 | Bootstrap / gate contradiction | **DONE** | Tech Spec §14 e §17 Inc.1: spike pre-Gate 1 confermata; pm-phase3 bootstrap; no self-execution; production dopo Gate 2 |

---

## Point 1 — Requirements — AC-03 (precondizione)

**Issue:** La condizione di blocco è inversa: deve bloccare quando almeno una precondizione NON è soddisfatta (non "tutte non soddisfatte").

**Azione:** Correggere il testo di AC-03 in `FTR-018-Requirements.md`. Non toccare `feature.md`.

**Evidenza di verifica attesa:** testo AC-03 aggiornato; Validation Report conferma corrispondenza con feature.md AC-03.

**Stato:** PENDING

---

## Point 2 — Requirements — Related UC refs (AC-14, AC-16)

**Issue:** AC-14 cita `UC-08 (Integration)` e AC-16 cita `All` in formato non accettato dal parser. Usare riferimenti semanticamente corretti nel formato supportato, oppure `All UCs`.

**Azione:** Verificare il formato accettato dal parser reale (`wb-validate.js` o equivalente), correggere AC-14 e AC-16 di conseguenza.

**Evidenza di verifica attesa:** parsing senza errore; nessuna modifica a `feature.md`.

**Stato:** PENDING

---

## Point 3 — Requirements — allineamento comandi / OQ

**Issue:** L'elenco comandi e lo stato delle OQ nei Requirements devono riflettere le sole decisioni dimostrate da spike o documentate con evidenze. Non anticipare decisioni ancora aperte.

**Azione:** Aggiornare la sezione comandi e la sezione OQ in `FTR-018-Requirements.md` per distinguere `CLOSED` (con evidenze) da `OPEN` (ancora da risolvere). OQ-01 deve risultare `OPEN` fino a prova contraria.

**Evidenza di verifica attesa:** OQ-01 marcata `OPEN`; comandi non contraddittori con feature.md.

**Stato:** PENDING

---

## Point 4 — OQ-01 — Node bridge spike (BLOCKER)

**Issue:** Il primo spike ha dimostrato che `agent()` è disponibile all'interno di un workflow script. Non ha dimostrato il percorso completo richiesto:

```
decisione Node → dispatch nativeName verificato nel worktree assegnato
              → ricezione risultato
              → persistenza Node
```

senza intermediario LLM per le operazioni deterministiche (lock, stato, ledger).

### Evidenze della spike (2026-09-15)

**Ledger entry:** `node-bridge-spike:pre-gate1` — done — null token (puro JS, 0 agent() calls, 24ms)

**Globals disponibili nella runtime del workflow** (da `Object.getOwnPropertyNames(globalThis)`):

| Categoria | Disponibili |
|-----------|-------------|
| Toolkit-injected | `agent`, `parallel`, `pipeline`, `phase`, `log`, `budget`, `args` |
| Promise interno | `then`, `__wRg$resolve` |
| JS standard | `console`, `setTimeout`, `clearTimeout`, `Date`, `Math`, `Promise`, `Object`, `Function`, `Array`, `RegExp`, `String`, `BigInt`, `Symbol`, `Intl`, `Temporal`, errori standard |
| NOT disponibili | `process`, `fetch`, `Atomics`, `require()`, `import()`, `__dirname`, `__filename`, `globalThis.binding` |

**Risultati chiave:**

- `process` → `UNDEFINED` — la runtime NON espone il runtime Node.js
- `fetch` → `NO` — nessun HTTP diretto
- `Atomics` → `NO` — non è un Worker/browser environment completo
- `import()` → bloccato a parse-time dal runtime (non eseguito)
- `require()` → bloccato a runtime (confermato dalla spike precedente)
- `__dirname` → `UNDEFINED` — nessun CommonJS context
- CLI (`ai-toolkit agents run`, `agents dispatch`) → NON ESISTE nel CLI toolkit v0.13.0

**`agent` function:** oggetto plain function con sole proprietà `length` e `name` — nessun sub-metodo `agent.exec`, `agent.dispatch`, `agent.shell`, etc.

### Diagnosi

Il runtime del workflow è una **sandbox ECMAScript isolata**. Non è Node.js. Il suo unico meccanismo di I/O con l'esterno è `agent()`, che per definizione richiede un dispatch LLM.

**Il percorso "Node → agent() → Node" non esiste:**
- Node.js non può chiamare `agent()` (funzione disponibile solo nella sandbox del workflow)
- La sandbox del workflow non può chiamare Node.js (nessun `process`, nessun module system, nessun shell access)
- Non esiste un comando CLI `ai-toolkit agents run` o equivalente che Node.js possa invocare per triggherare un singolo `agent()` call

**Pattern attuale di pm-phase3 (unica alternativa verificata):**
- Tutto l'I/O del workflow (lettura file, ledger, resolve) passa attraverso `agent(haiku)`
- Il codice deterministico (parsing CSV, wave building) è puro JS inline nella sandbox
- Ogni operazione di stato → LLM → shell command → stato

Questo pattern **viola** il requisito "nessun intermediario LLM per operazioni deterministiche".

### Implicazione architetturale

FTR-018 deve scegliere tra due percorsi, nessuno dei quali era nel Tech Spec corrente:

**Percorso A — Accettare LLM-mediated I/O (come pm-phase3)**
- Tutto l'I/O deterministico (ledger, stato, lock) passa per `agent(haiku)` calls nella sandbox
- Conseguenze: latenza aggiuntiva per ogni operazione di stato; consumo token per operazioni banali; comportamento non garantito per crash mid-operation
- Questa scelta deve essere esplicita nel Tech Spec, non tacita

**Percorso B — Introdurre un meccanismo CLI (`ai-toolkit executor-dispatch`)**
- Aggiungere un comando CLI che permetta a Node.js di triggherare un singolo `agent()` dispatch nel contesto del workflow runtime
- Questo è un prerequisito che richiederebbe una feature separata (o un increment esplicito di FTR-018)
- Nessuna evidenza che questo sia tecnicamente fattibile senza modifiche al Claude Code SDK

**Percorso A rifiutato dall'utente (2026-09-17).** Percorso B non perseguibile senza modifiche SDK.

### Evidenze spike Percorso C (2026-09-17 / 2026-09-18)

**Ledger entries:**
- `percorso-c-spike:pre-gate1` — done — null token (spike usava Bash e Workflow nel main session; costo non separatamente attribuibile)

#### Test 1 — Bridge principale (SUCCESSO)

Script `spike-test.mjs` — `spawnSync(claude.exe, ['--print', '--output-format', 'json', '--json-schema', <schema>, '--model', 'haiku', '--max-budget-usd', '0.05', '--permission-mode', 'auto', '--permission-prompts', 'none', <prompt>], { cwd: worktreeDir })`

| Campo | Valore |
|-------|--------|
| exit | 0 |
| terminal_reason | completed |
| is_error | false |
| total_cost_usd | 0.0332045 |
| duration_ms | 10373 |
| input_tokens | 10 |
| cache_creation_input_tokens | 24918 |
| output_tokens | 209 |
| structured_output | ✅ validato contro schema |
| auth provider | foundry (third_party — Azure) |

**Nessuna dipendenza aggiuntiva attivata. Nessun nuovo servizio o pagamento.** Auth = `third_party/foundry` = sottoscrizione Azure esistente.

#### Test 2 — Caricamento agente verificato `--agent gaia-developer-backend` (SUCCESSO con budget insufficiente)

| Campo | Valore | Interpretazione |
|-------|--------|----------------|
| exit | 1 | budget_exhausted (non agent-not-found) |
| terminal_reason | budget_exhausted | budget $0.02 troppo basso |
| subtype | error_max_budget_usd | — |
| total_cost_usd | 0.02851925 | agente ha elaborato prima del cut-off |
| cacheCreationInputTokens | 19,537 | **definizione gaia-developer-backend caricata** (diverso dai 24,918 del session default) |
| thinkingTokens | 321 | **thinking attivato** (caratteristico del frontmatter gaia) |
| inputTokens / outputTokens | 913 / 637 | elaborazione reale avvenuta |
| auth provider | foundry | stessa sottoscrizione ✓ |

**Conclusione:** `--agent gaia-developer-backend` carica correttamente la definizione dalla directory `~/.claude/agents/`. L'exit code 1 è causato esclusivamente dal budget `$0.02` insufficiente per un task reale. L'agente viene risolto, caricato e attivato con le sue capabilities (thinking) prima della terminazione per budget.

#### Test 3 — Timeout e terminazione subprocess (SUCCESSO)

| Campo | Valore |
|-------|--------|
| exit | null |
| error.code | ETIMEDOUT |
| signal | SIGTERM |

Il subprocess è **terminato** al timeout di Node.js — nessun processo orfano.

### Sintesi vincoli verificati (dall'autorizzazione utente)

| Vincolo | Evidenza | Stato |
|---------|----------|-------|
| 1. Documentazione e capacità | claude.exe v2.1.260 `--print --output-format json --json-schema` | ✅ VERIFICATO |
| 2. Auth, fatturazione, dipendenze | provider=foundry; nessun nuovo servizio; nessuna lib aggiuntiva | ✅ VERIFICATO |
| 3. Selezione esplicita agente FTR-017 | `--agent gaia-developer-backend` → cacheCreationTokens differenti + thinking attivato | ✅ VERIFICATO |
| 4. Node → task → worktree → risultato → persistenza | spawnSync exit 0, structured_output, writeFileSync | ✅ VERIFICATO |
| 5a. Timeout + terminazione | SIGTERM sul timeout, exit null (non orfano) | ✅ VERIFICATO |
| 5b. Deduplicazione worker attivo al resume | PID tracciato dallo stesso spawnSync (sync=già terminato); per async: `spawn().pid` → store in state → `process.kill(pid, 0)` su resume | ⚠️ DA SPECIFICARE IN TECH SPEC (non richiede nuovi spike) |

### Limiti documentati (da riflettere nel Tech Spec)

- **`--bare` mode**: richiede `ANTHROPIC_API_KEY` — NON compatibile con auth `third_party/foundry`. Non utilizzare.
- **Budget**: `$0.02` insufficiente per task reali; il coordinatore Node deve configurare budget adeguato per tipo di task (es. `$0.20–$1.00`).
- **Ricerca agente**: claude.exe cerca in `~/.claude/agents/` (globale utente) e nella project dir — FTR-017 `resolveAgent` deve fornire `nativeName` verificato + hash per controllo integrità prima dell'invocazione.
- **spawnSync vs spawn**: per task lunghi usare `spawn` (asincrono) per non bloccare Node; PID disponibile immediatamente per liveness tracking.

**OQ-01 Bridge principale dimostrato.** Rimangono aperti due sotto-punti richiesti dal Gate 1:

### OQ-01a — Prova completa con agente verificato (APERTO)

**Requisito:** Dimostrare il percorso completo: FTR-017 `resolveAgent` → nativeName + hash verificato → `--agent nativeName` in subprocess → exit 0 con output schema-valido → persistenza diretta a file nel worktree assegnato. Verificare quale definizione viene effettivamente caricata (hash file vs hash FTR-017) e assenza di contaminazione da configurazioni locali/globali.

**Limite autorizzato:** Budget ≤ $0.05 (pari al test bridge principale già eseguito). Non aumentare senza autorizzazione esplicita.

**Pendente:** Spike da eseguire.

### OQ-01b — Dispatch asincrono, orfani e deduplicazione (APERTO)

**Requisito:** Dimostrare che:
1. `spawn` (asincrono) — non `spawnSync` — è il percorso selezionato per produzione (stop cooperativo, osservabilità, N>1)
2. Al crash del coordinatore, il subprocess `claude.exe` e i suoi eventuali figli non diventano orfani irrecuperabili
3. Al resume, se il PID è ancora attivo, non viene avviato un attempt sostitutivo

**Pendente:** Spike da eseguire in ambiente temporaneo isolato.

**Stato:** **IN PROGRESS** — Bridge dimostrato; OQ-01a e OQ-01b aperti; spike autorizzata entro budget esistente

---

## Point 5 — Piano — Markdown lossless parsing

**Issue:** Il Markdown del Work Breakdown non è solo informativo: contiene outcome, verifiche e dipendenze task-level. Il CSV attuale aggrega solo dipendenze di fase. Il Tech Spec deve specificare:

- parsing lossless del Markdown (outcome, verifiche, dipendenze task-level)
- confronto con CSV per coerenza
- digest di entrambi (Markdown + CSV), verificato su output reali del renderer

**Azione:** Aggiornare Tech Spec sezione OQ-04 e modulo `plan-parser`. Verificare su output reale di `gaia-generate-work-breakdown` o equivalente.

**Evidenza di verifica attesa:** schema digest include entrambi i file; parser non perde campi Markdown; test su sample reale.

**Stato:** PENDING

---

## Point 6 — Lock — identity / liveness / worktree

**Issue:**
- Eliminare il recupero del lock basato su sola anzianità quando il proprietario non è verificabile.
- Definire identità del lock owner (PID + start-time per protezione da PID recycling).
- Definire liveness check reale (controlla che il processo sia ancora vivo, non solo che il lock esista).
- Risolvere percorsi Git correttamente anche nei worktree, dove `.git` può essere un file (pointer al repo principale), non una directory.

**Azione:** Aggiornare Tech Spec `lock-manager` e sezione OQ-05.

**Evidenza di verifica attesa:** procedura stale-lock senza recupero per anzianità; identità owner con anti-recycling; `.git` file vs directory gestito.

**Stato:** PENDING

---

## Point 7 — Ledger — firme e identity reali

**Issue:**
- Usare le firme reali di `lib/execution-ledger.js` (`open/close/fail/skip`) e `computeOperationId` reale, senza hash autonomi dichiarati compatibili.
- Definire identità distinte per: run, task, attempt; e per attività di implementazione, review, rework.
- Un solo conteggio token per attività; persistenza tempestiva; riconciliazione idempotente.
- Non attribuire delta globali sovrapposti a singoli attempt.

**Azione:** Aggiornare Tech Spec sezione OQ-03 e `ledger-integration`. Verificare firme reali da `lib/execution-ledger.js`.

**Evidenza di verifica attesa:** nessun hash inventato; firme corrispondenti a codice reale; identity non ambigue.

**Stato:** PENDING

---

## Point 8 — Recovery — gap commit / SHA

**Issue:** Il Tech Spec non copre il caso: commit creato ma SHA non registrato (crash tra `git commit` e la scrittura del SHA nel file di stato). Il recovery deve:

- ricercare il SHA dall'intenzione persistita (messaggio di commit pianificato)
- verificare: identità del commit, piano, contenuto, raggiungibilità sul branch corretto
- coprire anche: integrazione riuscita ma non registrata

Non è sufficiente verificare stato `integrated` o `git show` senza i controlli sopra.

**Azione:** Aggiornare Tech Spec `resume-reconciler`, sezione Recovery e tabella evidenze.

**Evidenza di verifica attesa:** percorso recovery gap commit/SHA documentato; verifica identità/piano/contenuto/branch; caso integrazione non registrata coperto.

**Stato:** PENDING

---

## Point 9 — Durabilità / CLI — garanzie e limiti

**Issue:**
- Specificare garanzie **e limiti** di atomic write / flush per OS e filesystem, senza promesse assolute (es. power loss non coperto da rename atomico su tutti i filesystem).
- CLI: definire avvio, stop, selezione repository/feature/run e `diagnose`.
- Eliminare flag `--force` indefiniti.
- `replan`: deve preservare la storia della run precedente e richiedere approvazione del piano sostitutivo; non limitarsi ad abbandonare la run.

**Azione:** Aggiornare Tech Spec sezione OQ-06 (CLI), `state-manager` (durabilità), e sezione Risks.

**Evidenza di verifica attesa:** garanzie con limiti espliciti (non assolute); `replan` con storia preservata; `--force` eliminato o ridefinito; `diagnose` specificato.

**Stato:** PENDING

---

## Point 10 — Bootstrap e gate contradiction

**Issue:** Il Tech Spec prevede lo spike dopo Gate 2 e usa il vecchio `pm-phase3` come bootstrap, contraddicendo `feature.md`:

- spike **prima** di Gate 1 (OQ-01 aperta)
- implementazione produttiva solo **dopo** Gate 2
- bootstrap: FTR-018 si consegna attraverso il percorso esistente (`pm-phase3`); il nuovo executor diventa disponibile solo dopo il completamento di FTR-018

Eliminare la contraddizione. Definire il percorso di bootstrap autorizzato senza presumere già disponibile il nuovo executor.

**Azione:** Aggiornare Tech Spec sezione Bootstrap e Implementation Order. Allineare con feature.md Increment 1 (spike pre-Gate 1) e Gate Protocol.

**Evidenza di verifica attesa:** nessuna contraddizione con feature.md; spike dichiarato pre-Gate 1; bootstrap documentato senza assumere il nuovo executor.

**Stato:** PENDING

---

## Istruzioni operative

- `feature.md` approvato: non modificare
- Ledger: preservare tutta la storia; nuove entry per spike / remediation / validazione
- Token: reali quando osservabili, `null` con motivo altrimenti
- Nessun Work Breakdown, approvazione automatica, push o merge
- Validation Report da rigenerare dopo tutte le correzioni, con verifiche puntuali (non solo copertura nominale)
