# Execution Ledger

## Sequenza

Questa è la seconda di tre idee dipendenti:

```text
1. Atomic Work Breakdown
2. Execution Ledger
3. Task Checkpoints and Resume
```

Dipende da Atomic Work Breakdown per gli identificatori stabili dei task e prepara il tracker persistente utilizzato dalla successiva orchestrazione con commit e recovery.

## Contesto

FTR-013 evolve il token ledger da contatore finale a tracker delle invocazioni agentiche. Il concetto deve essere ulteriormente generalizzato: token e costo sono soltanto una parte dello stato necessario per comprendere e riprendere una pipeline.

Il sistema deve poter rispondere deterministicamente a domande come:

- quale fase o task è attivo;
- quali attività sono state completate;
- quali tentativi sono falliti o sono stati interrotti;
- quanto tempo e quanti token sono stati consumati;
- quali verifiche sono state eseguite;
- da quale punto è possibile riprendere;
- quali dati sono incompleti a causa di un'interruzione.

## Obiettivo

Introdurre un **execution ledger** come fonte primaria e persistente della storia di esecuzione della feature.

```text
Work Breakdown
→ piano approvato

Execution Ledger
→ storia del processo e stato ricostruibile

Git
→ risultati tecnici durevoli
```

In questa feature l'execution ledger traccia pipeline, fasi, agent invocation, task, tentativi, token, durata ed esiti. La creazione automatica dei commit per task e il resume operativo completo appartengono alla feature successiva.

## Evoluzione del token ledger

Decisione:

```text
Execution ledger = unica fonte target
Token Estimate   = proiezione calcolata
```

Non devono esistere due ledger scritti in parallelo.

### Compatibilità

- i vecchi `{PREFIX}-token-ledger.json` restano leggibili;
- se una feature in corso possiede solo il token ledger, può essere importato una volta;
- i nuovi workflow scrivono soltanto l'execution ledger;
- `Token-Estimate.md` viene alimentato dall'execution ledger;
- i dossier storici completati non vengono migrati obbligatoriamente;
- l'importazione deve produrre eventi marcati come legacy.

## Formato append-only

Decisione: utilizzare JSON Lines.

```text
{PREFIX}-execution-ledger.jsonl
```

Ogni riga è un evento JSON autonomo:

```jsonl
{"schemaVersion":1,"event":"pipeline_started","feature":"FTR-020","at":"2026-08-02T10:00:00Z"}
{"schemaVersion":1,"event":"task_activated","taskId":"TASK-BE-01","attempt":1,"at":"2026-08-02T10:01:00Z"}
{"schemaVersion":1,"event":"agent_completed","taskId":"TASK-BE-01","attempt":1,"tokens":18450,"durationMs":872000,"at":"2026-08-02T10:15:32Z"}
```

Il ledger non deve sovrascrivere eventi precedenti. Lo stato corrente viene ricostruito applicando gli eventi in ordine.

## Perché append-only

- conserva tutti i tentativi;
- non perde la storia dei rework;
- evita update in-place complessi;
- facilita audit e diagnosi;
- rende evidente il punto di interruzione;
- consente di ignorare e segnalare un'ultima riga troncata;
- permette di rigenerare viste e statistiche;
- separa la fonte degli eventi dalle proiezioni.

## Eventi iniziali

### Pipeline e fase

```text
pipeline_started
pipeline_completed
pipeline_failed
phase_started
phase_completed
phase_failed
```

### Task

```text
task_pending
task_activated
task_interrupted
task_blocked
task_skipped
task_replanned
task_resolved
task_closed
```

### Invocazione agentica

```text
agent_started
agent_completed
agent_failed
agent_interrupted
```

### Verifica e review

```text
verification_started
verification_passed
verification_failed
review_started
review_passed
review_failed
```

Gli eventi Git specifici come `checkpoint_prepared` e `commit_created` saranno utilizzati dalla feature Task Checkpoints and Resume. Lo schema deve poterli accogliere, ma questa feature non implementa ancora il commit per task.

## Stati derivati del task

```text
pending
active
resolved
closed
blocked
failed
interrupted
skipped
superseded
```

Lo stato non viene mantenuto tramite un campo mutabile. Viene derivato dall'ultimo evento rilevante e dalle invarianti applicabili.

Esempio:

```text
task_pending
task_activated
agent_started
agent_completed
verification_passed
task_resolved
```

Vista derivata:

```json
{
  "taskId": "TASK-BE-01",
  "status": "resolved",
  "attempts": 1,
  "tokens": 18450,
  "durationMs": 872000
}
```

## Dati per tentativo

Ogni attempt deve registrare quando disponibili:

- attempt number;
- agent type;
- model;
- phase e task ID;
- timestamp di inizio e fine;
- durata;
- token;
- esito;
- errore;
- motivo del rework;
- verifiche associate.

### Interruzione e token sconosciuti

Non registrare mai token `0` quando il consumo non è disponibile.

```json
{
  "event": "agent_interrupted",
  "taskId": "TASK-BE-01",
  "attempt": 1,
  "tokens": null,
  "tokenStatus": "unavailable_due_to_interruption"
}
```

Questi attempt:

- restano visibili;
- contano nel numero di tentativi;
- non entrano nelle medie di accuratezza;
- producono un warning nelle proiezioni economiche.

## Scrittura durevole

La scrittura non deve essere affidata a un agente LLM.

Un modulo JavaScript deterministico deve:

1. validare l'evento;
2. serializzarlo su una singola riga;
3. aprire il ledger in append;
4. scrivere la riga completa;
5. sincronizzare il file;
6. chiudere il file;
7. rileggere l'ultima riga;
8. confermare che l'evento persistito coincida con quello richiesto.

In caso di ultima riga incompleta dopo un crash:

- non ignorare silenziosamente il problema;
- preservare tutte le righe valide precedenti;
- segnalare la riga troncata;
- consentire una riconciliazione deterministica.

## Modulo

Struttura indicativa:

```text
lib/
└── execution-ledger.js
```

Interface proposta:

```javascript
const {
  appendEvent,
  resolveExecutionState,
  importLegacyTokenLedger,
} = require('../lib/execution-ledger');
```

### `appendEvent`

```javascript
appendEvent({
  featureDir,
  event: {
    event: 'agent_completed',
    taskId: 'TASK-BE-01',
    attempt: 1,
    tokens: 18450,
    durationMs: 872000,
    at: '2026-08-02T10:15:32Z'
  }
});
```

Responsabilità nascoste nel modulo:

- schema validation;
- serializzazione;
- append e sincronizzazione;
- gestione dell'ultima riga troncata;
- sequencing degli eventi;
- errori espliciti.

### `resolveExecutionState`

```javascript
const state = resolveExecutionState({ featureDir });
```

Restituisce:

```javascript
{
  feature: 'FTR-020',
  pipelineStatus: 'running',
  phases: [],
  tasks: [],
  attempts: [],
  totals: {
    tokens: 18450,
    durationMs: 872000
  },
  warnings: []
}
```

### `importLegacyTokenLedger`

Importa una sola volta il vecchio array JSON e produce eventi con:

```json
{
  "source": "legacy-token-ledger",
  "precision": "agent-invocation"
}
```

Non inventa task ID quando il vecchio formato non li contiene.

## Invarianti

- ogni evento ha `schemaVersion`, `event`, `feature` e `at`;
- gli eventi di attempt hanno `attempt >= 1`;
- `agent_completed` richiede durata e token oppure uno stato esplicito di indisponibilità;
- un task non può essere `closed` prima di essere `resolved` o `skipped`;
- eventi sconosciuti producono errore;
- timestamp invalidi producono errore;
- gli eventi precedenti non vengono modificati;
- un import legacy non viene eseguito due volte;
- una proiezione non modifica il ledger.

## Proiezioni

### Execution status

Vista per pipeline, fasi, task e attempt.

### Token Estimate actuals

Calcola:

- token per agente;
- token per task, quando disponibili;
- token per fase;
- token totali;
- attempt con consumo sconosciuto;
- accuratezza delle stime.

### Effort actuals

Calcola durata per attempt, task e fase.

Le proiezioni non sono fonti e possono essere rigenerate.

## CLI

```bash
node bin/cli.js ledger append --feature <feature.md> --event <event.json>
node bin/cli.js ledger status --feature <feature.md>
node bin/cli.js ledger validate --feature <feature.md>
node bin/cli.js ledger import-token-ledger --feature <feature.md>
```

Il percorso viene ricavato dalla directory di `feature.md`. La feature non dipende dal resolver gerarchico per lavorare su un dossier già noto.

## Integrazione nei workflow

Questa feature deve sostituire le scritture LLM del token ledger con chiamate deterministiche al modulo.

Le invocazioni agentiche delle fasi esistenti devono produrre almeno:

```text
agent_started
agent_completed | agent_failed | agent_interrupted
```

Quando il Work Breakdown atomico è disponibile, gli eventi devono includere anche `taskId`. Prima della successiva feature, `pm-phase3` può continuare temporaneamente con l'attuale orchestrazione, ma il ledger deve essere già in grado di rappresentare il task.

## Criteri di accettazione

1. Esiste `{PREFIX}-execution-ledger.jsonl` come nuova fonte primaria.
2. Gli eventi vengono aggiunti senza modificare le righe precedenti.
3. Ogni scrittura è validata, sincronizzata e riletta.
4. L'ultima riga troncata viene segnalata senza perdere gli eventi validi.
5. Lo stato corrente è ricostruibile deterministicamente.
6. Tutti gli attempt rimangono nella storia.
7. Token sconosciuti non vengono convertiti in zero.
8. I workflow non usano LLM per scrivere il ledger.
9. `Token-Estimate.md` e gli actual effort sono calcolabili dal ledger.
10. Il vecchio token ledger può essere importato una sola volta.
11. Non esiste dual-write tra token ledger ed execution ledger.
12. Il modulo ha una piccola interface testata attraverso il suo seam.
13. I test coprono append, fsync/errori, parsing, schema, proiezioni e import legacy.

## Incluso

- file JSONL append-only;
- schema eventi;
- modulo JavaScript;
- stati derivati;
- tracking degli attempt;
- token e durata;
- migrazione da FTR-013;
- proiezioni per Token Estimate ed Effort Estimate;
- CLI;
- integrazione delle invocazioni agentiche esistenti;
- test automatici.

## Escluso

- commit per task;
- serializzazione dei task in `pm-phase3`;
- review per task;
- riconciliazione completa con Git;
- resume delle modifiche parziali;
- replan runtime;
- push remoto;
- worktree paralleli.

## Dipendenze

- richiede gli ID stabili definiti da Atomic Work Breakdown per la granularità task;
- sostituisce progressivamente il token ledger di FTR-013;
- viene utilizzato da Task Checkpoints and Resume.
