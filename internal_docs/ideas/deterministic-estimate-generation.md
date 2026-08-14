# Deterministic Estimate Generation

## Sequenza

Questa idea deve essere sviluppata subito dopo Claude Source Layout and Runtime Resolution:

```text
1. Atomic Work Breakdown
2. Claude Source Layout and Runtime Resolution
3. Deterministic Estimate Generation
4. Execution Ledger
5. Task Checkpoints and Resume
6. Isolated Parallel Task Execution
```

Dipende dal Work Breakdown JSON introdotto da Atomic Work Breakdown. Elimina una
invocazione LLM non atomica prima che Execution Ledger e Task Checkpoints and Resume
introducano tracking e recovery più generali.

## Contesto

Il workflow `pm-phase2` utilizza attualmente una singola agent call denominata
`parse-wb-write-estimates` per eseguire in sequenza più responsabilità:

1. leggere il Work Breakdown;
2. estrarre e calcolare le metriche;
3. scrivere `{PREFIX}-Effort-Estimate.md`;
4. scrivere `{PREFIX}-Token-Estimate.md`;
5. restituire infine un risultato conforme a uno schema strutturato.

In alcune esecuzioni l'agente completa parte delle operazioni di I/O ma non restituisce il
risultato strutturato. Il timeout provoca il retry dell'intera invocazione, che rilegge e
riscrive gli stessi artefatti senza conoscere con certezza quali operazioni fossero già state
completate.

Il problema non è soltanto la lunghezza del prompt. La causa architetturale è la presenza di
più attività e più side effect persistenti dentro una singola unità di retry, senza checkpoint
intermedi.

## Obiettivo

Sostituire `parse-wb-write-estimates` con una pipeline JavaScript deterministica composta da
tre operazioni atomiche e idempotenti:

```text
Work-Breakdown.json
        ↓
parse-work-breakdown
        ↓
Estimate-Metrics.json
        ↓
write-effort-estimate
        ↓
Effort-Estimate.md
        ↓
write-token-estimate
        ↓
Token-Estimate.md
```

Parsing, calcoli, applicazione delle tariffe e rendering dei template non richiedono giudizio
semantico. Non devono quindi utilizzare un modello LLM.

## Decisioni principali

### Fonte del Work Breakdown

La soluzione definitiva legge `{PREFIX}-Work-Breakdown.json`, fonte autorevole introdotta da
Atomic Work Breakdown.

Non deve analizzare il Markdown tramite euristiche. Markdown e CSV sono viste derivate e non
devono alimentare i calcoli delle stime.

### Checkpoint tecnico delle metriche

Il parsing produce:

```text
{PREFIX}-Estimate-Metrics.json
```

Il file è un artefatto tecnico derivato e rigenerabile. Deve contenere almeno:

```json
{
  "schemaVersion": 1,
  "feature": "FTR-014",
  "sourcePath": "FTR-014-Work-Breakdown.json",
  "sourceHash": "sha256:...",
  "generatedAt": "2026-08-09T10:00:00Z",
  "userStories": 7,
  "totalTasks": 25,
  "domainBreakdown": {
    "BE": 20,
    "FE": 0,
    "DB": 0,
    "DevOps": 0,
    "INFRA": 0,
    "TEST": 5
  },
  "totalAgentMinutes": 324,
  "totalEstimatedTokens": 521000,
  "criticalPathMinutes": 133,
  "phases": []
}
```

`sourceHash` impedisce di riutilizzare metriche riferite a un Work Breakdown successivamente
modificato.

### Tre unità atomiche

#### `parse-work-breakdown`

Input:

- Work Breakdown JSON;
- schema supportato.

Output:

- Estimate Metrics JSON.

Responsabilità:

- validare il formato di input;
- calcolare conteggi e distribuzioni;
- sommare durata e token stimati;
- costruire il grafo delle dipendenze;
- calcolare il critical path dal grafo reale;
- salvare hash e metriche.

Non scrive Effort Estimate o Token Estimate.

#### `write-effort-estimate`

Input:

- Estimate Metrics JSON.

Output:

- `{PREFIX}-Effort-Estimate.md`.

Responsabilità:

- verificare l'hash del Work Breakdown;
- applicare il template deterministico;
- riportare metriche complessive e per fase;
- non inventare stime mancanti;
- scrivere un solo documento.

#### `write-token-estimate`

Input:

- Estimate Metrics JSON;
- token actual disponibili per le fasi concluse;
- configurazione prezzi.

Output:

- `{PREFIX}-Token-Estimate.md`.

Responsabilità:

- applicare formule deterministiche;
- distinguere estimate, actual e dati non disponibili;
- non sostituire dati sconosciuti con zero;
- scrivere un solo documento.

## Modulo proposto

Struttura indicativa:

```text
lib/
└── estimate-generation.js

src/claude/scripts/
└── estimate-generation.js
```

Il modulo contiene la logica riutilizzabile; lo script espone una CLI sottile.

Interface indicativa:

```javascript
const {
  parseWorkBreakdown,
  renderEffortEstimate,
  renderTokenEstimate,
} = require('../lib/estimate-generation');
```

CLI indicativa:

```bash
node src/claude/scripts/estimate-generation.js parse \
  --work-breakdown <Work-Breakdown.json> \
  --output <Estimate-Metrics.json>

node src/claude/scripts/estimate-generation.js effort \
  --metrics <Estimate-Metrics.json> \
  --output <Effort-Estimate.md>

node src/claude/scripts/estimate-generation.js tokens \
  --metrics <Estimate-Metrics.json> \
  --pricing <token-pricing.json> \
  --actuals <actuals.json> \
  --output <Token-Estimate.md>
```

## Scrittura atomica

Ogni comando che produce un file deve:

1. validare completamente gli input;
2. generare il contenuto in memoria;
3. scrivere un file temporaneo nella stessa directory della destinazione;
4. sincronizzare e chiudere il file;
5. sostituire atomicamente la destinazione;
6. rileggere e validare l'output;
7. restituire exit code `0` soltanto dopo la verifica.

Un'interruzione non deve lasciare un documento finale parzialmente scritto.

## Idempotenza e invalidazione

- rieseguire un comando con gli stessi input produce lo stesso contenuto, esclusi eventuali
  metadati temporali esplicitamente previsti;
- `effort` e `tokens` rifiutano metriche il cui `sourceHash` non coincide con il Work
  Breakdown corrente;
- un output già valido può essere riconosciuto e lasciato invariato;
- un retry non ricalcola né riscrive gli output degli step precedenti;
- nessun comando modifica il Work Breakdown.

## Integrazione in `pm-phase2`

`pm-phase2` deve invocare sequenzialmente i tre comandi, trattandoli come attività distinte:

```text
parse-work-breakdown:phase2
write-effort-estimate:phase2
write-token-estimate:phase2
```

Policy:

- lo step successivo parte soltanto dopo la verifica positiva dell'output precedente;
- timeout e retry sono specifici dello step;
- un retry riguarda soltanto lo step fallito;
- il fallimento interrompe la sequenza e conserva gli output validi precedenti;
- il workflow non contiene più il prompt composito `parse-wb-write-estimates`;
- se il runtime non può eseguire direttamente Node.js, un wrapper agent può eseguire un
  singolo comando, ma non deve interpretare, calcolare o riscrivere i contenuti.

## Tracking e integrazione futura

Questa feature deve utilizzare chiavi di attività stabili, così Execution Ledger potrà
tracciarle senza modificare nuovamente il contratto:

```text
parse-work-breakdown:phase2
write-effort-estimate:phase2
write-token-estimate:phase2
```

Non introduce anticipatamente un secondo ledger. Fino a Execution Ledger utilizza i
meccanismi di tracking già disponibili nel toolkit.

Quando Execution Ledger sarà implementato, ogni comando produrrà gli eventi di inizio,
completamento o fallimento previsti dal ledger. Task Checkpoints and Resume utilizzerà gli
stessi confini per il recovery.

## Retry e gestione degli errori

- nessun retry dell'intera pipeline;
- retry limitato al solo comando fallito;
- numero massimo di tentativi configurabile e contenuto;
- exit code distinti per input invalido, hash non coerente, errore di parsing, errore di
  scrittura e output non valido;
- stderr diagnostico e machine-readable quando possibile;
- nessun loop autonomo di verifica e riscrittura affidato a un LLM.

## Fix temporaneo durante FTR-014

Questa idea descrive la soluzione definitiva successiva a FTR-014.

Per completare FTR-014 con il toolkit corrente è ammesso un fix temporaneo che suddivide
`parse-wb-write-estimates` in tre agent call separate:

1. parse e restituzione delle metriche;
2. scrittura del solo Effort Estimate;
3. scrittura del solo Token Estimate.

Il fix temporaneo:

- non introduce il nuovo JSON prima che FTR-014 sia disponibile;
- non deve essere considerato la soluzione target;
- deve ridurre la dimensione delle unità di retry;
- sarà sostituito dal modulo JavaScript deterministico.

## Bootstrap e current state

La feature non deve essere applicata retroattivamente al processo che la implementa.

Durante la sua stessa implementazione, il toolkit usa il contratto della versione installata.
Requirements e Tech Spec descrivono il target da sviluppare e non modificano implicitamente
gli output o il comportamento degli agenti correnti.

Questa regola evita di ripetere il problema di bootstrap emerso durante FTR-014.

## Strategia di test

### Parsing

- Work Breakdown valido;
- schema non supportato;
- campi obbligatori mancanti;
- conteggi per dominio;
- somma delle durate e dei token;
- critical path con rami indipendenti;
- dipendenza inesistente o ciclo;
- hash stabile a input invariato.

### Rendering Effort Estimate

- output coerente con le metriche;
- totale uguale alla somma delle fasi;
- critical path non composto da rami indipendenti;
- hash non coerente rifiutato;
- output precedente non corrotto in caso di errore.

### Rendering Token Estimate

- formule e arrotondamenti;
- prezzi mancanti o invalidi;
- actual sconosciuti rappresentati come `null`/`—`, non zero;
- totale coerente con le righe;
- output precedente non corrotto in caso di errore.

### Orchestrazione

- ordine `parse → effort → tokens`;
- fallimento di parse impedisce entrambi i writer;
- fallimento di effort non riesegue parse e impedisce tokens;
- fallimento di tokens preserva metrics ed effort;
- retry limitato allo step fallito;
- nessuna invocazione di `parse-wb-write-estimates`;
- nessun LLM utilizzato per parsing, calcolo o rendering.

## Criteri di accettazione

1. `parse-wb-write-estimates` non esiste più come agent call composita.
2. Parsing, Effort Estimate e Token Estimate sono tre operazioni distinte.
3. Tutte le trasformazioni sono implementate in JavaScript deterministico.
4. Il Work Breakdown JSON è l'unica fonte delle metriche strutturali.
5. Estimate Metrics contiene l'hash del Work Breakdown sorgente.
6. Ogni step produce un solo output persistente.
7. Ogni output viene scritto atomicamente e validato dopo la scrittura.
8. Retry e timeout sono applicati al singolo step.
9. Il completamento di uno step non viene perso se uno step successivo fallisce.
10. Il critical path viene calcolato dal grafo e non sommando rami indipendenti.
11. Token sconosciuti non vengono registrati come zero.
12. Le chiavi delle attività sono stabili e pronte per Execution Ledger.
13. La CLI e il modulo vengono distribuiti in tutte le modalità di installazione supportate.
14. I test coprono parsing, rendering, hash, atomic write, retry e failure propagation.

## Incluso

- modulo JavaScript deterministico;
- CLI con tre subcommand;
- Estimate Metrics JSON derivato;
- generazione Effort Estimate;
- generazione Token Estimate;
- calcolo del critical path;
- hash e invalidazione;
- scrittura atomica;
- integrazione in `pm-phase2`;
- retry per step;
- distribuzione tramite installer;
- test automatici.

## Escluso

- definizione del Work Breakdown JSON, appartenente ad Atomic Work Breakdown;
- Execution Ledger append-only;
- commit Git per task;
- resume generale della pipeline;
- modifica manuale delle stime tramite LLM;
- stime economiche basate su dati esterni non configurati;
- migrazione obbligatoria degli estimate storici.

## Dipendenze

- richiede Atomic Work Breakdown e il relativo JSON autorevole;
- richiede Claude Source Layout and Runtime Resolution e aggiunge i propri script sotto
  `src/claude/scripts`;
- precede Execution Ledger, fornendo tre attività stabili da tracciare;
- prepara i confini di recovery utilizzati da Task Checkpoints and Resume;
- non determina il parallelismo runtime, che appartiene a Isolated Parallel Task Execution;
- utilizza la configurazione prezzi già disponibile nel toolkit.
