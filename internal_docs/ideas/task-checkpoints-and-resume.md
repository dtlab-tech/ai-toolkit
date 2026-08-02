# Task Checkpoints and Resume

## Sequenza

Questa è la terza di tre idee dipendenti:

```text
1. Atomic Work Breakdown
2. Execution Ledger
3. Task Checkpoints and Resume
```

Dipende dal contratto strutturato dei task e dal modulo execution ledger. Introduce l'esecuzione seriale, la verifica, il commit e il recovery al livello del singolo task.

## Contesto

Una pipeline può lavorare per ore ed essere interrotta poco prima della conclusione, perdendo progresso, telemetria e conoscenza dello stato quando i risultati restano soltanto nella memoria dell'orchestratore o in un worktree non riconciliato.

Il commit di fase attuale protegge soltanto il confine tra User Story o fasi. Task completati all'interno di una fase possono non avere checkpoint autonomi.

Questo comportamento non è accettabile. La pipeline deve poter essere fermata dopo qualsiasi task e riprendere senza rieseguire i task già consolidati.

## Obiettivo

Rendere il task l'unità atomica condivisa:

```text
Work Breakdown task
    = singola invocazione di agente
    = singola misurazione nell'execution ledger
    = singola verifica mirata
    = singola review mirata
    = singolo commit Git
    = singolo checkpoint recuperabile
```

La perdita massima dopo un'interruzione deve essere limitata al solo task `active`.

## Decisione sul parallelismo

La prima versione esegue i task sequenzialmente nello stesso worktree.

```text
Task 1 → verifica → review → commit
Task 2 → verifica → review → commit
Task 3 → verifica → review → commit
```

Questa scelta sacrifica throughput ma garantisce:

- attribuzione non ambigua delle modifiche;
- staging atomico;
- nessuna concorrenza sul Git index;
- misurazione reale per task;
- review con contesto ridotto;
- recovery deterministico;
- assenza di scritture concorrenti sul ledger.

Il parallelismo potrà essere reintrodotto in futuro tramite worktree Git isolati.

## Modello di stato

```text
pending
   ↓
active
   ↓ implementazione, verifica e review mirata
checkpointing
   ↓ commit Git
resolved
   ↓ review di integrazione della User Story
closed
```

Stati aggiuntivi:

```text
blocked      dipendenza o decisione mancante
failed       attempt concluso con errore
interrupted  esecuzione terminata mentre il task era active
skipped      nessuna modifica necessaria, con evidenza
superseded   task sostituito mediante replan
```

Lo stato viene ricostruito dagli eventi dell'execution ledger e, per `resolved` e `closed`, verificato contro Git.

## Protocollo del task

### 1. Selezione

L'orchestratore seleziona il primo task `pending` con dipendenze soddisfatte.

### 2. Presa in carico

Prima dello spawn dell'agente, il ledger deve ricevere e sincronizzare:

```text
task_activated
agent_started
```

Dati minimi:

- task ID;
- phase/User Story ID;
- agent type;
- attempt number;
- timestamp;
- branch;
- base commit;
- dipendenze verificate.

Lo spawn avviene soltanto dopo la rilettura positiva dell'evento persistito.

### 3. Implementazione

Una sola invocazione agente riceve:

- feature e documenti approvati;
- definizione completa del task;
- outcome;
- scope;
- verifica richiesta;
- file di riferimento;
- eventuale diff proveniente da un attempt interrotto.

### 4. Telemetria

Alla conclusione vengono registrati:

- esito;
- token;
- durata;
- file dichiarati come modificati;
- warning o errori;
- completion summary.

Se il consumo non è disponibile dopo un'interruzione:

```json
{
  "tokens": null,
  "tokenStatus": "unavailable_due_to_interruption"
}
```

Mai registrare zero come sostituto di un dato sconosciuto.

### 5. Verifica mirata

Eseguire i controlli dichiarati nel Work Breakdown:

- test mirati;
- build del modulo;
- lint;
- validazione strutturale;
- controllo dei file attesi.

Fallimento della verifica significa attempt fallito, non task risolto.

### 6. Review mirata

`review-solution` riceve soltanto:

- task;
- acceptance criterion collegato;
- diff del task;
- verifiche eseguite;
- file di riferimento strettamente necessari.

La review deve avvenire prima del commit per evitare checkpoint tecnici contenenti una soluzione già nota come non valida.

### 7. Checkpoint Git

Dopo verifica e review positive:

```text
checkpoint_prepared
→ staging controllato
→ git commit
→ commit_created
→ task_resolved
```

## Protocollo Git riconciliabile

Filesystem e Git non costituiscono una transazione unica. Il protocollo deve quindi essere a due fasi e recuperabile.

1. Appendere `checkpoint_prepared` e sincronizzare il ledger.
2. Aggiungere allo staging soltanto file attribuiti al task e ledger.
3. Creare il commit con trailer standard.
4. Leggere lo SHA.
5. Appendere `commit_created` e `task_resolved`.

Se il processo si interrompe dopo il commit ma prima degli ultimi eventi, la recovery trova il commit tramite trailer e ricostruisce gli eventi mancanti.

## Commit message e trailer

```text
feat(FTR-020): implement TASK-BE-01 order creation API

AI-Toolkit-Feature: FTR-020
AI-Toolkit-Task: TASK-BE-01
AI-Toolkit-Phase: US-01
AI-Toolkit-Attempt: 1
```

Rework:

```text
fix(FTR-020): remediate TASK-BE-01 review findings

AI-Toolkit-Feature: FTR-020
AI-Toolkit-Task: TASK-BE-01
AI-Toolkit-Phase: US-01
AI-Toolkit-Attempt: 2
AI-Toolkit-Rework: 1
```

I trailer sono gli identificatori autorevoli. Lo SHA viene ricavato dalla cronologia Git e non deve essere scritto nel ledger prima del commit.

## Review di integrazione e chiusura

Dopo che tutti i task della User Story sono `resolved` o `skipped`:

```text
integration_review_started
→ test e review della User Story
→ integration_review_passed
→ task_closed
→ phase_closed
```

La chiusura produce un commit metadata per la User Story:

```text
chore(FTR-020): close US-01 after integration review

AI-Toolkit-Feature: FTR-020
AI-Toolkit-Phase: US-01
AI-Toolkit-Checkpoint: phase-closed
```

Questo commit rende durevole anche il passaggio da `resolved` a `closed`.

## Tentativi e rework

Policy:

```text
Attempt 1
→ fallimento
→ un solo rework mirato

Attempt 2
→ fallimento
→ blocked: replan-required
```

Sono consentiti due attempt totali: implementazione iniziale più un rework.

Segnali runtime di task mal dimensionato:

- durata oltre il 150% della stima: warning;
- consumo o durata oltre il 200% prima di un nuovo attempt: replan;
- secondo fallimento;
- scoperta di output indipendenti;
- espansione non prevista di dominio o file;
- verifica molto più ampia di quella pianificata.

## Replan e mini Gate 2

L'orchestratore può proporre la riscomposizione, ma non può eseguire i task sostitutivi senza approvazione.

```text
TASK-BE-01 blocked: replan-required
        ↓
Proposta TASK-BE-01A, TASK-BE-01B, TASK-BE-01C
        ↓
Mini Gate 2
        ↓
Aggiornamento Work Breakdown e Approval Record
        ↓
Ripresa
```

Nel ledger:

```json
{
  "event": "task_replanned",
  "taskId": "TASK-BE-01",
  "supersededBy": ["TASK-BE-01A", "TASK-BE-01B", "TASK-BE-01C"]
}
```

Il task originale diventa `superseded` e rimane nella storia.

## Task senza modifiche

Se il comportamento è già presente o il task non è più necessario:

```text
task_skipped
```

Richiede:

- motivo;
- evidenza;
- file o test che dimostrano il comportamento;
- verifica durante la review della User Story.

Non creare commit vuoti e non usare `resolved`.

## Precondizione del worktree

Prima del primo task il worktree deve essere pulito.

Eccezioni ammesse:

- execution ledger;
- process log;
- artefatti della pipeline esplicitamente riconosciuti.

Modifiche estranee producono:

```text
HARD STOP — DIRTY WORKTREE
```

Nessuna modifica dell'utente viene scartata, spostata o inclusa automaticamente.

## Recovery di un task interrotto

Alla ripresa:

1. risolvere lo stato dal ledger;
2. riconciliare i trailer Git;
3. marcare il precedente attempt `interrupted`;
4. confrontare il worktree con il base commit del task;
5. attribuire il diff al task attivo;
6. avviare un nuovo attempt con task, diff e storia precedente.

Il nuovo agente continua dal worktree esistente. Non viene recuperato il contesto interno del modello, ma vengono preservati tutti gli artefatti prodotti.

Hard stop quando:

- il diff contiene modifiche non attribuibili;
- sono presenti modifiche precedenti dell'utente;
- il branch non coincide;
- ledger e Git sono incoerenti;
- il base commit non è raggiungibile.

Non eseguire automaticamente `reset`, `clean`, stash, checkout distruttivi o cancellazioni.

## Matrice di riconciliazione

| Ledger | Git | Stato | Azione |
|--------|-----|-------|--------|
| `closed` | commit fase presente | closed | saltare |
| `resolved` | commit task presente | resolved | non reimplementare |
| `checkpoint_prepared` | commit presente | recoverable | aggiungere eventi mancanti |
| `checkpoint_prepared` | commit assente | checkpointing | ritentare commit |
| `active` | commit assente | interrupted | riprendere solo questo task |
| `pending` | commit presente | recoverable | ricostruire dal trailer |
| `resolved/closed` | commit assente | inconsistent | hard stop |
| `pending` | commit assente | pending | eseguire |

## Modulo

Struttura indicativa:

```text
lib/
└── task-checkpoints.js
```

Interface proposta:

```javascript
const {
  startTask,
  checkpointTask,
  closePhase,
  recover,
} = require('../lib/task-checkpoints');
```

Il modulo nasconde:

- transizioni del ledger;
- verifica delle invarianti;
- staging controllato;
- creazione e parsing dei trailer;
- riconciliazione con Git;
- gestione degli stati intermedi;
- diagnosi del worktree.

L'orchestratore utilizza l'interface senza reimplementare queste regole.

## CLI

```bash
node bin/cli.js checkpoints status --feature <feature.md>
node bin/cli.js checkpoints reconcile --feature <feature.md>
node bin/cli.js checkpoints start --feature <feature.md> --task TASK-BE-01
node bin/cli.js checkpoints commit --feature <feature.md> --task TASK-BE-01
node bin/cli.js checkpoints close-phase --feature <feature.md> --phase US-01
node bin/cli.js checkpoints recover --feature <feature.md>
```

Le operazioni mutative vengono invocate dall'orchestratore soltanto nei punti previsti dal protocollo.

## Push remoto

La prima versione non effettua push dopo ogni task. I commit locali proteggono da arresto del processo e spegnimento della macchina quando il disco rimane disponibile.

Push configurabile ogni `N` checkpoint o backup remoto appartengono a un'evoluzione successiva e sono necessari per proteggere anche dalla perdita del disco o del workspace.

## Criteri di accettazione

1. Ogni task viene eseguito mediante una sola invocazione agente.
2. I task vengono eseguiti sequenzialmente nel worktree condiviso.
3. `task_activated` viene persistito prima dello spawn.
4. Ogni attempt registra stato, token e durata.
5. Verifica e review mirate avvengono prima del commit.
6. Ogni task valido produce un commit autonomo con trailer.
7. `resolved` richiede un commit raggiungibile.
8. La review di integrazione chiude la User Story con un commit metadata.
9. Sono consentiti due attempt totali.
10. Il secondo fallimento produce `blocked: replan-required`.
11. Il replan richiede un mini Gate 2.
12. Task già `resolved` o `closed` non vengono rieseguiti.
13. Un task `active` dopo un'interruzione viene riconosciuto come `interrupted`.
14. Il diff parziale viene preservato e passato al nuovo attempt.
15. Stati incoerenti causano hard stop con diagnosi.
16. Task senza modifiche usano `skipped`, senza commit vuoto.
17. Modifiche estranee non vengono incluse né scartate.
18. Nessun LLM decide lo stato Git o scrive direttamente il ledger.
19. Non viene eseguito push automatico per task.
20. I test coprono commit, trailer, recovery, replan e worktree sporco.

## Incluso

- esecuzione seriale per task;
- una invocazione per task;
- verifica e review mirate;
- commit per task;
- trailer Git;
- protocollo a due fasi;
- stato `resolved` e `closed`;
- commit di chiusura della User Story;
- massimo due attempt;
- replan con mini Gate 2;
- recovery del task interrotto;
- preservazione del diff parziale;
- task skipped;
- modulo e CLI;
- test automatici.

## Escluso

- worktree paralleli;
- push per task;
- backup remoto;
- checkpoint intermedi dentro un task;
- ripristino del contesto interno del modello;
- risoluzione automatica dei conflitti;
- operazioni Git distruttive;
- modifica delle policy di merge della PR.

## Dipendenze

- utilizza `{PREFIX}-Work-Breakdown.json` prodotto da Atomic Work Breakdown;
- utilizza `{PREFIX}-execution-ledger.jsonl` e il relativo modulo;
- ricava il dossier da `feature.md`, senza dipendere obbligatoriamente dal resolver gerarchico.
