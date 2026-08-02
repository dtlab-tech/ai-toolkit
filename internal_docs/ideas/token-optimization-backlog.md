# Token Optimization — Backlog di feature atomiche

> Deriva da `docs/token-optimization.md`. Data: 2026-07-24.
> Ogni voce è **atomica**: implementabile e verificabile in isolamento.
> "Criticità" = priorità di ottimizzazione (impatto/rischio), NON severità di difetto.
> Nessun intervento è un bug attivo → nessun `CRITICAL`.
> Sequenza consigliata = ordine degli ID.

## Quadro sintetico

| ID | Intervento | Criticità | Sforzo | Rischio | File toccati | Dipende da |
|----|-----------|-----------|--------|---------|--------------|-----------|
| OPT-01 ✅ | `model:` esplicito su ogni agent (→ FTR-007, PR #20) | **HIGH** | Basso | Basso | 15 agent (frontmatter) | — |
| OPT-02 | Deduplicare CLAUDE.md globale vs progetto | **HIGH** | Minimo | Zero | `~/.claude/CLAUDE.md` | — |
| OPT-03 | Blocco "Compact instructions" in CLAUDE.md | MEDIUM | Minimo | Zero | `CLAUDE.md` (progetto) | — |
| OPT-04 | Spostare i cataloghi da CLAUDE.md a reference.md | MEDIUM | Basso | Basso | `CLAUDE.md`, `docs/reference.md` | — |
| OPT-05 | Procedure on-demand — assessment-manager | MEDIUM | Medio | Basso | `assessment-manager.md` | — |
| OPT-06 | Procedure on-demand — project-manager | MEDIUM | Medio | Basso | `project-manager.md` | — |
| OPT-07 | Resource-budget testuale negli assessment agent | MEDIUM | Basso | Basso | 3+ assessment agent | — |
| OPT-08 | Summary/full split negli output di assessment | **HIGH** | Alto | Medio | assessment agents + int-doc + manager | OPT-07 |
| OPT-09 | Estrarre calcolo deterministico da assessment-manager | **HIGH** | Alto | Medio | `assessment-manager.md` + nuovo script | — |
| OPT-10 | generic-software-assessment → ruolo triage | MEDIUM | Medio | Medio | `generic-software-assessment.md` + manager | OPT-08 |
| OPT-11 | Delegation policy negli orchestratori | LOW | Basso | Basso | 2 orchestratori | — |
| OPT-12 | Hook di filtro output verboso (opzionale) | LOW | Basso | Basso | `settings.json` + script hook | — |

---

## Feature atomiche

### OPT-01 — `model:` esplicito su ogni agent
- **Criticità:** HIGH · **Sforzo:** Basso · **Rischio:** Basso
- **Obiettivo:** ogni agent dichiara il modello adatto al suo ruolo, così nessuno eredita Opus per default.
- **Scope (solo frontmatter):** aggiungere `model:` ai 15 agent che ne sono privi. Mappatura:
  - `sonnet`: `assessment-manager`, `project-manager`, `developer-backend`, `developer-frontend`, `developer-testing`, `god-class-decomposition`, `domain-model-refactoring`, `dependency-injection-refactoring`, `security-hardening`, `dependency-supply-chain-security`, `define-feature`, `init-agents-md`, `install-toolkit`, `intervention-documentation-standard`
  - `opus`: `review-solution` (unico ruolo con giudizio architetturale profondo)
- **Fuori scope:** i 7 agent già `haiku` restano invariati.
- **Criteri di accettazione:** `grep -L "^model:" .claude/agents/*.md` non restituisce nulla; ogni valore ∈ {haiku, sonnet, opus}.
- **Dipendenze:** nessuna.

### OPT-02 — Deduplicare CLAUDE.md globale vs progetto
- **Criticità:** HIGH · **Sforzo:** Minimo · **Rischio:** Zero
- **Obiettivo:** eliminare il duplicato caricato a ogni sessione; il `CLAUDE.md` di progetto resta la fonte unica del catalogo toolkit.
- **Scope:** ridurre `~/.claude/CLAUDE.md` alle sole preferenze cross-progetto (lingua, stile, convenzioni personali). Rimuovere il catalogo toolkit duplicato.
- **Criteri di accettazione:** `diff ~/.claude/CLAUDE.md ./CLAUDE.md` NON è più identico; il globale non contiene più le tabelle Skills/Commands/Agents; il Gate Protocol resta accessibile (nel progetto).
- **Dipendenze:** nessuna. ⚠️ File utente globale — confermare con l'utente prima di modificare.

### OPT-03 — Blocco "Compact instructions" in CLAUDE.md
- **Criticità:** MEDIUM · **Sforzo:** Minimo · **Rischio:** Zero
- **Obiettivo:** guidare l'auto-compaction a preservare ciò che conta (decisioni, file, finding IDs) e scartare rumore.
- **Scope:** aggiungere al `CLAUDE.md` di progetto una sezione `# Compact instructions` (preserva: obiettivo corrente, decisioni confermate, risposte utente, file modificati, errori aperti, finding/artifact IDs; scarta: risultati grep grezzi, output tool riusciti, spiegazioni ripetute, piani superati).
- **Criteri di accettazione:** la sezione esiste in `CLAUDE.md`; nessun'altra modifica.
- **Dipendenze:** nessuna. (Coordinare con OPT-04 se si tocca lo stesso file.)

### OPT-04 — Spostare i cataloghi da CLAUDE.md a reference.md
- **Criticità:** MEDIUM · **Sforzo:** Basso · **Rischio:** Basso
- **Obiettivo:** CLAUDE.md sotto ~200 righe, solo essenziali operativi; il catalogo di scoperta vive in reference.md.
- **Scope:** spostare le tabelle Skills / Commands / Agents / Procedures in `docs/reference.md`. In `CLAUDE.md` restano: Dependencies, How it works, override procedure, **Gate Protocol**. Aggiungere in CLAUDE.md un puntatore a reference.md.
- **Criteri di accettazione:** `CLAUDE.md` < 200 righe; nessuna tabella-catalogo persa (presente in reference.md); Gate Protocol ancora in CLAUDE.md.
- **Dipendenze:** nessuna.

### OPT-05 — Procedure on-demand (assessment-manager)
- **Criticità:** MEDIUM · **Sforzo:** Medio · **Rischio:** Basso
- **Obiettivo:** leggere ogni procedura nella fase in cui serve, non tutte all'avvio.
- **Scope:** in `assessment-manager.md`, spostare le istruzioni "read at startup" così che `token-estimation.md`/`pricing.md` si leggano in Phase 3-4, `assessment-findings-gate.md` in Phase 5, ecc.
- **Criteri di accettazione:** nessuna procedura letta prima della fase che la usa; il comportamento delle fasi resta invariato.
- **Dipendenze:** nessuna. (Se si fa OPT-09, `token-estimation.md` sparisce del tutto dal contesto LLM.)

### OPT-06 — Procedure on-demand (project-manager)
- **Criticità:** MEDIUM · **Sforzo:** Medio · **Rischio:** Basso
- **Obiettivo:** stesso principio di OPT-05 applicato al `project-manager` (che legge ancora più procedure).
- **Scope:** riorganizzare `project-manager.md` per caricare ogni procedura alla fase pertinente (PR-procedure alla fase PR, ecc.).
- **Criteri di accettazione:** nessuna procedura caricata anticipatamente; pipeline invariata.
- **Dipendenze:** nessuna.

### OPT-07 — Resource-budget testuale negli assessment agent
- **Criticità:** MEDIUM · **Sforzo:** Basso · **Rischio:** Basso
- **Obiettivo:** limiti di lettura/output come **istruzioni nel prompt** (NON frontmatter — `budget:` non è supportato dall'harness).
- **Scope:** aggiungere una sezione `## Resource budget` in prosa agli assessment agent (es. "Inspect at most ~25 files; ≤2 evidence snippets per finding; stop when evidence is sufficient — do not explore to increase coverage").
- **Criteri di accettazione:** la sezione è testo del prompt, non YAML; presente in `generic-software-assessment`, `layered-architecture-assessment`, `concurrency-safety-assessment`.
- **Dipendenze:** nessuna.

### OPT-08 — Summary/full split negli output di assessment
- **Criticità:** HIGH · **Sforzo:** Alto · **Rischio:** Medio
- **Obiettivo:** l'orchestratore legge un **summary compatto**, non il documento intero. Il guadagno reale (non il formato JSON in sé).
- **Scope:** ogni assessment agent produce `{PREFIX}-{area}.full.md` (dettagli) + `{PREFIX}-{area}.summary` (conteggi per severità, finding IDs, path del full). `assessment-manager` e `intervention-documentation-standard` consumano il summary; il full si apre solo per i finding accettati.
- **Criteri di accettazione:** ogni agent scrive entrambi i file; il manager non legge i `.full` in Phase 3; l'int-doc apre i full solo per i finding selezionati.
- **Dipendenze:** OPT-07 (budget di output coerente).

### OPT-09 — Estrarre calcolo deterministico da assessment-manager
- **Criticità:** HIGH · **Sforzo:** Alto · **Rischio:** Medio
- **Obiettivo:** togliere dal prompt ~3.500 parole di pseudo-codice (calcolo token/effort, registry write) che un LLM esegue in modo costoso e fragile.
- **Scope:** spostare Token-Estimate / Effort-Estimate / registry-write in uno script (`scripts/estimate.*`) invocato via Bash; il prompt dell'agent si riduce a "esegui lo script con questi input e verifica l'output".
- **Criteri di accettazione:** i tre file prodotti sono identici (per input noti) a prima; `assessment-manager.md` perde le sezioni di calcolo passo-passo; nessun errore aritmetico possibile lato LLM.
- **Dipendenze:** nessuna hard; sinergica con OPT-05.

### OPT-10 — generic-software-assessment → ruolo triage
- **Criticità:** MEDIUM · **Sforzo:** Medio · **Rischio:** Medio
- **Obiettivo:** evitare che il generic duplichi il lavoro degli specialisti (layer, security, concurrency) sullo stesso codebase.
- **Scope:** trasformare `generic-software-assessment` in triage: scansione superficiale che decide quali specialisti attivare e copre solo le aree non coperte (Opzione A della gap analysis).
- **Criteri di accettazione:** il generic non riesamina aree già coperte da uno specialista attivo; l'output indica gli specialisti raccomandati.
- **Dipendenze:** meglio dopo OPT-08 (contratto di output stabile).

### OPT-11 — Delegation policy negli orchestratori
- **Criticità:** LOW · **Sforzo:** Basso · **Rischio:** Basso
- **Obiettivo:** regola esplicita "delega un subagent solo se serve" (task indipendente/parallelo, output voluminoso, riuso multiplo); non delegare ciò che una grep/read risolve.
- **Scope:** aggiungere una sezione `## Delegation policy` a `assessment-manager` e `project-manager`.
- **Criteri di accettazione:** entrambi gli orchestratori contengono i criteri delega/non-delega.
- **Dipendenze:** nessuna.

### OPT-12 — Hook di filtro output verboso (opzionale)
- **Criticità:** LOW · **Sforzo:** Basso · **Rischio:** Basso
- **Obiettivo:** filtrare output verbosi (build/test/log) prima che entrino nel contesto.
- **Scope:** `PreToolUse` su Bash in `settings.json` + script che riduce l'output di test/build alle sole righe rilevanti.
- **Criteri di accettazione:** l'hook appare in `/hooks`; un comando di test mostra solo failures.
- **Dipendenze:** nessuna. Fare solo se gli assessment inizieranno a lanciare build/test.
