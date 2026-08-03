# Task-Level Commit Checkpoints

## Contesto

La fase di implementazione dell'AI Toolkit esegue attualmente più task all'interno di una fase o User Story e crea un commit dopo il completamento e la review dell'intera fase. Il token ledger viene inoltre persistito dopo ogni fase per non perdere la telemetria già raccolta in caso di interruzione del workflow.

Questo modello protegge il lavoro al confine tra le fasi, ma lascia una finestra più ampia all'interno della singola fase. Se un workflow viene sospeso, termina per timeout, perde il contesto, viene interrotto dall'utente o il computer si spegne, i task già completati ma non ancora consolidati nel commit di fase non sono rappresentati da checkpoint Git autonomi.

I file modificati possono essere ancora presenti nel worktree, ma il workflow non dispone di una registrazione affidabile e deterministica che indichi:

- quali task siano realmente completati;
- quali verifiche siano state eseguite;
- quali modifiche appartengano a ciascun task;
- da quale punto sia sicuro riprendere;
- quali task non debbano essere eseguiti nuovamente.

## Obiettivo

Trasformare ogni task completato e verificato in un checkpoint Git persistente.

L'invariante desiderata è:

> Un task può essere marcato come completato soltanto se esiste un commit Git raggiungibile dal branch della feature che ne contiene il risultato e lo identifica in modo univoco.

Il comportamento deve essere accompagnato da un commit ledger analogo al token ledger, utilizzabile per:

- conoscere lo stato di ogni task;
- ricostruire il progresso dopo un'interruzione;
- evitare la riesecuzione di task completati;
- verificare la corrispondenza tra Work Breakdown e cronologia Git;
- rendere evidente quale commit implementi ciascun task;
- diagnosticare task incompleti, mancanti o incoerenti.

## Situazione attuale

Il Work Breakdown CSV contiene già, per ciascun task:

```text
phase_id|phase_title|commit_message|depends_on|task_id|task_title|domain|agent_type
```

`pm-phase3` raggruppa i task per fase e tipo di agente, può eseguire fasi e agenti in parallelo, effettua review e rework a livello di fase e crea infine un commit per la fase.

Il nuovo modello deve ridurre la granularità del checkpoint:

```text
Oggi:
Task 1 + Task 2 + Task 3 → review della fase → commit della fase

Target:
Task 1 → verifica → commit
Task 2 → verifica → commit
Task 3 → verifica → commit
→ review aggregata della fase
```

## Principi

### Unità atomica condivisa

FTR-013 introduce un activity ledger con una entry per invocazione di agente. Nell'orchestrazione attuale, tuttavia, una singola invocazione può ricevere più task dello stesso tipo e quindi il consumo di token rimane aggregato a livello di gruppo o fase.

Questa idea adotta intenzionalmente una granularità più fine e stabilisce la seguente equivalenza:

```text
Work Breakdown task
    = singola invocazione di agente
    = singola misurazione nel token ledger
    = singola verifica
    = singolo commit Git
```

Di conseguenza, nella prima versione i task devono essere eseguiti sequenzialmente nel worktree condiviso. Questa scelta sacrifica parte del throughput ottenuto tramite dispatch parallelo, ma garantisce:

- attribuzione non ambigua delle modifiche;
- misurazione reale dei token per task;
- staging e commit atomici;
- verifica mirata;
- resume deterministico;
- tracciabilità completa tra Work Breakdown, agente, token e Git;
- assenza di concorrenza sul Git index e sul ledger.

Il parallelismo potrà essere reintrodotto successivamente soltanto attraverso isolamento reale, per esempio tramite un worktree Git dedicato a ciascun task.

### Git è la fonte primaria del checkpoint

Il commit Git è la prova persistente del completamento del task. Il ledger descrive e indicizza i checkpoint, ma non deve dichiarare completato un task privo del relativo commit.

### Commit soltanto dopo verifica

Il completamento dichiarato dall'agente di sviluppo non è sufficiente. Prima del commit devono essere eseguite le verifiche proporzionate al task, per esempio:

- test mirati;
- build del modulo interessato;
- lint o validazione strutturale;
- controllo dei file attesi;
- review automatica, quando prevista a quel livello.

### Commit atomico per task

Il commit deve contenere soltanto il task dichiarato e gli eventuali aggiornamenti deterministici del ledger. Non deve includere accidentalmente modifiche appartenenti ad altri task ancora in esecuzione.

### Ripresa deterministica

Alla ripresa, il workflow deve ricostruire lo stato leggendo Work Breakdown, ledger e cronologia Git. Non deve chiedere a un LLM di dedurre quali task siano probabilmente completati.

### Nessun push per task

Il checkpoint è inizialmente locale al branch della feature. Non è necessario effettuare un push remoto dopo ogni task. Il push rimane un'operazione esplicita della fase PR o di un eventuale meccanismo separato di backup remoto.

### Cronologia intermedia accettabile

Il branch della feature può contenere molti commit piccoli. La strategia della PR può mantenere la cronologia oppure utilizzare squash merge secondo le policy del progetto.

## Identificazione dei commit

Ogni task commit deve avere un messaggio riconoscibile e machine-readable.

Formato indicativo:

```text
feat(FTR-013): implement TASK-BE-01 user lookup

AI-Toolkit-Feature: FTR-013
AI-Toolkit-Task: TASK-BE-01
AI-Toolkit-Phase: US-01
```

I trailer Git permettono al resolver del ledger di individuare i commit senza dipendere dal testo libero del subject.

Per task non funzionali possono essere usati subject coerenti con la natura della modifica:

```text
test(FTR-013): cover TASK-TEST-02 duplicate users
docs(FTR-013): complete TASK-DOC-01 application overview
chore(FTR-013): configure TASK-INFRA-01 pipeline
```

I trailer restano gli identificatori autorevoli.

## Commit ledger

### Percorso

Il ledger deve vivere nel dossier della feature:

```text
{documentationRoot}/features/{PREFIX}-{slug}/
└── {PREFIX}-commit-ledger.json
```

Nel repository del toolkit, per esempio:

```text
internal_docs/features/FTR-013-example/FTR-013-commit-ledger.json
```

Nei progetti standard:

```text
docs/features/FTR-013-example/FTR-013-commit-ledger.json
```

Il percorso deve essere ottenuto dalla configurazione risolta del toolkit e non hardcoded.

### Contenuto proposto

```json
{
  "schemaVersion": 1,
  "feature": "FTR-013",
  "branch": "feature/FTR-013-example",
  "updatedAt": "2026-08-02T15:30:00Z",
  "tasks": [
    {
      "taskId": "TASK-BE-01",
      "phaseId": "US-01",
      "title": "Implement user lookup",
      "status": "completed",
      "commitMessage": "feat(FTR-013): implement TASK-BE-01 user lookup",
      "completedAt": "2026-08-02T15:20:00Z",
      "verification": {
        "status": "passed",
        "commands": [
          "npm test -- user-lookup"
        ]
      }
    },
    {
      "taskId": "TASK-BE-02",
      "phaseId": "US-01",
      "title": "Expose lookup endpoint",
      "status": "pending"
    }
  ]
}
```

### Relazione tra ledger e SHA

Il ledger non deve necessariamente memorizzare lo SHA finale nello stesso commit che completa il task, perché lo SHA non è noto finché il commit non viene creato e cambierebbe se il commit venisse modificato.

La relazione deve essere risolta tramite i trailer Git:

```text
AI-Toolkit-Feature: FTR-013
AI-Toolkit-Task: TASK-BE-01
```

Durante la lettura o riconciliazione, uno script deterministico può restituire anche lo SHA effettivo:

```json
{
  "taskId": "TASK-BE-01",
  "status": "completed",
  "commitSha": "7b9d42e...",
  "ledgerStatus": "completed",
  "gitStatus": "reachable"
}
```

In questo modo il ledger può essere incluso nello stesso commit del task senza creare una dipendenza circolare dallo SHA.

## Modulo deterministico

La gestione dei checkpoint e del ledger non deve essere affidata al modello LLM. Deve esistere un modulo JavaScript con una piccola interface, utilizzata dall'orchestratore e dalla CLI.

Interface indicativa:

```javascript
const {
  createTaskCheckpoint,
  resolveTaskProgress,
} = require('../lib/task-checkpoints');
```

### `createTaskCheckpoint`

Responsabilità:

1. verificare branch e repository;
2. controllare che il task esista nel Work Breakdown;
3. verificare che il task non sia già completato;
4. verificare l'esito delle validazioni richieste;
5. aggiornare il ledger in memoria;
6. aggiungere allo staging soltanto i file appartenenti al task e il ledger;
7. creare il commit con trailer standard;
8. leggere lo SHA prodotto;
9. riconciliare Git e ledger;
10. restituire un risultato strutturato.

Risultato indicativo:

```javascript
{
  "changed": true,
  "feature": "FTR-013",
  "taskId": "TASK-BE-01",
  "commitSha": "7b9d42e...",
  "commitMessage": "feat(FTR-013): implement TASK-BE-01 user lookup",
  "verification": "passed",
  "remainingTasks": 4
}
```

### `resolveTaskProgress`

Responsabilità:

1. leggere il Work Breakdown CSV;
2. leggere il commit ledger, se presente;
3. leggere i commit raggiungibili sul branch corrente;
4. individuare i trailer relativi alla feature;
5. confrontare task attesi, ledger e Git;
6. restituire task completati, pendenti e incoerenti;
7. non modificare repository o documenti.

## Vincolo del parallelismo

### Problema

L'orchestrazione attuale può eseguire più task o gruppi di task in parallelo nello stesso worktree.

Due task paralleli che modificano lo stesso worktree non possono creare in modo affidabile commit atomici indipendenti:

- `git add -A` può includere modifiche dell'altro task;
- due commit simultanei possono competere sul Git index lock;
- file condivisi possono contenere cambiamenti parziali di entrambi i task;
- lo staging per file non risolve i casi in cui due task modificano lo stesso file;
- il ledger stesso sarebbe una risorsa condivisa modificata concorrente.

Di conseguenza, non è sufficiente aggiungere `git commit` alla fine di ogni agente parallelo.

### Opzione A — Task seriali nello stesso worktree

```text
Task 1 → verifica → commit
Task 2 → verifica → commit
Task 3 → verifica → commit
```

Vantaggi:

- implementazione semplice;
- commit realmente atomici;
- recovery chiaro;
- nessuna concorrenza sul Git index;
- facile attribuzione dei file al task.

Svantaggi:

- riduzione del parallelismo;
- aumento del wall-clock complessivo.

Questa è l'opzione consigliata per la prima versione, perché privilegia affidabilità e verificabilità.

### Opzione B — Worktree isolato per task

Ogni task viene eseguito in un Git worktree dedicato e produce un commit indipendente. L'orchestratore integra poi i commit nel branch della feature rispettando le dipendenze.

Vantaggi:

- mantiene il parallelismo;
- isolamento reale;
- commit atomici per task.

Svantaggi:

- gestione più complessa di worktree e branch temporanei;
- merge o cherry-pick dei risultati;
- conflitti da risolvere durante l'integrazione;
- cleanup e recovery dei worktree;
- maggiore complessità su Windows e negli ambienti CI.

Questa opzione può essere valutata come evoluzione successiva.

### Opzione C — Commit per batch parallelo

I task continuano a lavorare nello stesso worktree e l'orchestratore crea un unico commit al termine del batch.

È più granulare dell'attuale commit di fase, ma non soddisfa l'invariante di un commit per task. Può essere considerata una soluzione transitoria, non il target finale.

## Flusso proposto per la prima versione

```text
Leggi Work Breakdown e commit ledger
        ↓
Riconcilia ledger con Git
        ↓
Seleziona il primo task pending con dipendenze soddisfatte
        ↓
Esegui un solo task
        ↓
Esegui verifiche mirate
        ↓
Aggiorna il ledger
        ↓
Crea commit atomico con trailer
        ↓
Verifica che il commit sia raggiungibile
        ↓
Passa al task successivo
```

La review di fase può rimanere dopo il completamento di tutti i task della fase. Gli eventuali rework devono produrre commit separati che referenzino il task corretto:

```text
fix(FTR-013): remediate TASK-BE-01 review findings

AI-Toolkit-Feature: FTR-013
AI-Toolkit-Task: TASK-BE-01
AI-Toolkit-Phase: US-01
AI-Toolkit-Rework: 1
```

## Ripresa dopo un'interruzione

All'avvio o alla ripresa di `pm-phase3`, il workflow deve eseguire una riconciliazione deterministica.

Possibili stati:

| Ledger | Git | Stato risolto | Azione |
|--------|-----|---------------|--------|
| completed | commit presente | completed | salta il task |
| pending | commit presente | recoverable | aggiorna/riconcilia il ledger |
| completed | commit assente | inconsistent | hard stop e diagnosi |
| pending | commit assente | pending | esegui il task |
| assente | commit presente | recoverable | ricostruisci dal trailer |

Il workflow deve inoltre controllare il worktree:

- worktree pulito: ripresa normale;
- modifiche non committate riconducibili al task corrente: proporre la ripresa del task;
- modifiche non attribuibili: hard stop per evitare commit accidentali;
- branch differente da quello registrato: hard stop o richiesta esplicita di riconciliazione.

## Comandi CLI indicativi

### Stato dei task

```bash
node bin/cli.js checkpoints status \
  --feature docs/features/FTR-013-example/feature.md
```

### Riconciliazione

```bash
node bin/cli.js checkpoints reconcile \
  --feature docs/features/FTR-013-example/feature.md
```

### Creazione checkpoint

```bash
node bin/cli.js checkpoints commit \
  --feature docs/features/FTR-013-example/feature.md \
  --task TASK-BE-01 \
  --verification passed
```

La creazione del checkpoint è un'operazione mutativa e deve essere invocata dall'orchestratore soltanto dopo la verifica del task.

## Aggiornamenti al Work Breakdown

Per supportare commit realmente atomici, ogni task dovrebbe disporre almeno di:

- `task_id` stabile e univoco;
- titolo;
- dominio;
- dipendenze;
- tipo di agente;
- commit subject o categoria di commit;
- verifiche richieste;
- opzionalmente, file attesi o scope consentito.

Il campo `commit_message`, oggi associato alla fase, dovrebbe essere sostituito o affiancato da un commit message per task.

## Sicurezza Git

Il sistema deve:

- operare soltanto sul branch della feature approvato;
- non effettuare commit direttamente su branch protetti;
- non utilizzare `git add -A` se esistono modifiche non attribuite al task;
- non eseguire automaticamente reset, clean o checkout distruttivi;
- non scartare modifiche non committate;
- fallire se il Git index è bloccato;
- verificare l'identità Git prima del primo commit;
- non effettuare push senza l'autorizzazione prevista dal workflow;
- preservare eventuali modifiche preesistenti dell'utente.

## Test

Casi minimi:

- primo task completato e committato;
- task già completato non rieseguito;
- commit con trailer corretto;
- ledger aggiornato nello stesso checkpoint;
- riconciliazione tra ledger e Git;
- ledger assente ma commit presente;
- ledger completed ma commit assente;
- interruzione dopo commit e prima del task successivo;
- interruzione durante un task;
- worktree sporco prima dell'avvio;
- file modificati non attribuiti al task;
- branch errato;
- task con dipendenze non soddisfatte;
- task senza modifiche da committare;
- test del task falliti;
- commit Git fallito;
- Git index lock presente;
- rework associato al task originale;
- resume dopo più task completati;
- serializzazione stabile del ledger;
- percorso del ledger ottenuto dalla configurazione del toolkit.

## Criteri di accettazione iniziali

La prima implementazione può considerarsi completata quando:

1. ogni task ha un identificatore stabile nel Work Breakdown;
2. i task vengono eseguiti individualmente nel worktree condiviso;
3. un task viene marcato completed soltanto dopo verifiche riuscite;
4. ogni task completato produce un commit Git autonomo;
5. ogni commit contiene trailer per feature, task e fase;
6. il commit ledger è persistito nel dossier della feature;
7. Git e ledger possono essere riconciliati deterministicamente;
8. una nuova esecuzione salta i task già completati;
9. stati incoerenti causano un hard stop con diagnosi esplicita;
10. modifiche non attribuite non vengono incluse automaticamente;
11. il workflow può riprendere dal primo task pending dopo un'interruzione;
12. nessun modello LLM decide se un commit esista o se un task sia completato;
13. i checkpoint non provocano push automatici;
14. i test coprono commit, ledger, riconciliazione e recovery.

## Perimetro della prima feature

### Incluso

- commit per singolo task;
- esecuzione seriale dei task nel worktree condiviso;
- commit ledger JSON;
- trailer Git machine-readable;
- riconciliazione deterministica;
- resume dei task pending;
- gestione dei rework;
- CLI per status, reconcile e commit;
- integrazione con `pm-phase3`;
- test automatici;
- utilizzo della configurazione del toolkit per individuare il dossier della feature.

### Escluso

- worktree paralleli per task;
- push remoto dopo ogni task;
- backup automatico su remote;
- risoluzione automatica dei conflitti;
- reset o pulizia distruttiva del worktree;
- modifica delle policy di merge della PR;
- commit diretti su branch protetti;
- checkpoint intermedi durante un task non ancora completato.

## Evoluzioni future

- worktree isolati per preservare il parallelismo;
- push opzionale dopo un numero configurabile di checkpoint;
- visualizzazione dello stato task/commit in `feature-status`;
- metriche sul tempo trascorso tra checkpoint;
- commit automatico della documentazione current-state come task dedicato;
- generazione del commit ledger interamente dalla cronologia Git;
- recovery assistito delle modifiche lasciate da un task interrotto;
- policy configurabili sulla granularità dei checkpoint.
