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

Il requisito nasce da un failure mode concreto e non accettabile: una pipeline può lavorare per ore, essere interrotta poco prima della conclusione e perdere progresso, telemetria e conoscenza dello stato perché le informazioni sono rimaste soltanto nella memoria dell'orchestratore o non sono state consolidate in checkpoint durevoli.

La pipeline deve quindi poter essere fermata dopo qualsiasi task e riprendere senza rieseguire i task già risolti. L'eventuale perdita deve essere limitata, nel caso peggiore, al solo task che risultava `active` al momento dell'interruzione.

L'invariante desiderata è:

> Un task può essere marcato come completato soltanto se esiste un commit Git raggiungibile dal branch della feature che ne contiene il risultato e lo identifica in modo univoco.

Il comportamento deve essere accompagnato da un **execution ledger**, evoluzione del token/activity ledger introdotto da FTR-013, utilizzabile per:

- conoscere lo stato di ogni task;
- ricostruire il progresso dopo un'interruzione;
- evitare la riesecuzione di task completati;
- verificare la corrispondenza tra Work Breakdown e cronologia Git;
- rendere evidente quale commit implementi ciascun task;
- diagnosticare task incompleti, mancanti o incoerenti.

## Modello di stato del task

Il task deve essere trattato analogamente a un work item preso in carico da uno sviluppatore. Ogni transizione deve essere persistita nel ledger prima di procedere allo step successivo.

```text
pending
   ↓ presa in carico
active
   ↓ implementazione e verifiche riuscite
resolved
   ↓ review/integrity check conclusi
closed
```

Stati aggiuntivi:

```text
blocked      dipendenza o decisione esterna mancante
failed       tentativo concluso con errore noto
interrupted  precedente esecuzione terminata mentre il task era active
```

### `pending`

Il task è presente nel Work Breakdown, ma non è ancora stato avviato.

### `active`

Il task è stato preso in carico. Prima di invocare l'agente, il workflow deve scrivere atomicamente nel ledger:

- task ID;
- phase/User Story ID;
- agent type;
- attempt number;
- stato `active`;
- timestamp di inizio;
- branch corrente;
- dipendenze verificate;
- eventuale commit base da cui parte il task.

La scrittura deve essere completata e riletta con successo prima dello spawn dell'agente. In caso di spegnimento durante l'esecuzione, la successiva run deve poter identificare esattamente il task interrotto.

### `resolved`

Il task può passare a `resolved` soltanto quando:

- l'agente ha concluso l'implementazione;
- le verifiche mirate sono riuscite;
- il consumo di token dell'invocazione è stato raccolto;
- il tempo trascorso è stato calcolato;
- le modifiche sono state attribuite al task;
- codice, test e ledger aggiornato sono stati inclusi in un commit atomico;
- il commit contiene i trailer della feature e del task;
- il commit è raggiungibile dal branch della feature.

Il commit rappresenta il checkpoint durevole del passaggio a `resolved`.

### `closed`

Il task passa a `closed` dopo il superamento della review aggregata o delle verifiche di integrazione previste per la fase/User Story. Un task `resolved` rimane comunque recuperabile e non deve essere reimplementato; eventuali correzioni devono produrre un rework commit collegato allo stesso task.

### Persistenza delle transizioni

Il ledger non deve essere scritto da un agente LLM. Le transizioni devono essere effettuate da uno script JavaScript deterministico mediante scrittura atomica:

1. serializzare il nuovo stato in un file temporaneo nella stessa directory;
2. chiudere e sincronizzare la scrittura;
3. sostituire atomicamente il ledger precedente;
4. rileggere e validare il JSON;
5. procedere soltanto se lo stato riletto coincide con quello richiesto.

Il ledger deve conservare anche la cronologia dei tentativi, in modo da non sovrascrivere l'evidenza di esecuzioni fallite o interrotte.

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
    = singola entry nell'execution ledger con misurazione token
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

### Granularità massima del task

La resilienza del modello dipende dalla dimensione dei task: la perdita massima dopo un'interruzione coincide con il lavoro non ancora consolidato del task `active`. Di conseguenza, task molto lunghi vanificherebbero il beneficio dei checkpoint atomici.

Il Work Breakdown deve privilegiare un numero maggiore di task piccoli e controllabili rispetto a pochi task estesi. Un task deve rappresentare la più piccola modifica che sia contemporaneamente:

- autonomamente implementabile;
- dotata di un risultato osservabile;
- verificabile con controlli specifici;
- committabile senza dipendere da modifiche parziali non concluse;
- attribuibile a un solo agente type e a un solo dominio principale;
- ripetibile con costo contenuto in caso di interruzione.

Un task deve essere ulteriormente suddiviso quando:

- contiene più risultati funzionali o tecnici indipendenti;
- combina implementazione, migrazione, test e documentazione non strettamente atomici;
- attraversa più domini tra `DB`, `BE`, `FE`, `INFRA` e `TEST`;
- richiede agenti di tipo differente;
- modifica aree del codebase che possono essere verificate separatamente;
- contiene una sequenza di passi in cui ciascun passo produce già un checkpoint valido;
- non può essere descritto con un singolo criterio di completamento principale;
- la sua stima supera la durata massima configurata per un task agentico;
- il fallimento nella parte finale costringerebbe a ripetere una quantità significativa di lavoro già valido.

L'atomicità deve essere valutata rispetto al comportamento prodotto, non rispetto al numero di classi o file modificati. Controller, DTO, Service e Repository possono appartenere allo stesso task quando sono tutti necessari per completare un unico comportamento verificabile.

Esempio da evitare perché contiene più comportamenti indipendenti:

```text
TASK-BE-01 — Implementare GET, POST, PATCH e DELETE degli ordini
attraverso Controller, DTO, validazione, Service e Repository.
```

Possibile scomposizione:

```text
TASK-DB-01   — Creare schema e migration dell'entità Order
TASK-BE-01   — Implementare POST /orders, includendo Controller,
               DTO, validazione, Service e Repository necessari
TASK-BE-02   — Implementare GET /orders e GET /orders/{id}
TASK-BE-03   — Implementare PATCH /orders/{id}
TASK-BE-04   — Implementare DELETE /orders/{id}
TASK-FE-01   — Implementare il form di creazione ordine
TASK-FE-02   — Implementare la lista degli ordini
TASK-FE-03   — Implementare la pagina di dettaglio
TASK-FE-04   — Implementare modifica ed eliminazione dalla UI
TASK-TEST-01 — Verificare il flusso end-to-end di creazione ordine
```

La scomposizione finale può essere ulteriormente adattata in base alla durata stimata. Per esempio, `GET /orders` e `GET /orders/{id}` possono rimanere nello stesso task se costituiscono un checkpoint breve e coerente; devono essere separati se la loro implementazione o verifica diventa significativa.

La User Story e i task devono inoltre avere scope coerente. Una User Story che richiede soltanto l'inserimento di un ordine non deve includere task per consultazione, modifica ed eliminazione. In quel caso il CRUD completo deve essere suddiviso in User Story funzionali distinte, per esempio creazione, consultazione, modifica ed eliminazione.

### Atomicità senza micro-task artificiali

La scomposizione non deve produrre task privi di un risultato autonomo. Attività come leggere un file, orientarsi nel repository, eseguire una singola ricerca o preparare mentalmente una modifica non costituiscono task del Work Breakdown: sono passaggi interni all'esecuzione di un task.

Un task è abbastanza piccolo quando può essere interrotto e rieseguito con un costo accettabile, ma abbastanza completo da produrre un commit significativo e verificabile.

Regola sintetica:

> Un task può attraversare più classi e layer interni, ma deve produrre un solo comportamento osservabile e una sola verifica principale.

### Controllo automatico del Work Breakdown

`generate-work-breakdown` deve assegnare a ogni task almeno:

- un outcome unico;
- un dominio principale;
- un agent type;
- dipendenze esplicite;
- una verifica mirata;
- una stima di durata agentica;
- un commit message specifico.

Prima del Gate 2, una validazione deterministica o strutturata deve segnalare i task potenzialmente troppo grandi. Il Gate 2 non dovrebbe approvare un Work Breakdown contenente task oltre la soglia prevista senza una motivazione esplicita.

La soglia temporale deve essere configurabile. I valori definitivi devono essere calibrati mediante i dati reali del ledger, ma la policy iniziale deve escludere esplicitamente task con durata attesa nell'ordine delle ore.

Il ledger consentirà successivamente di confrontare stima e durata reale e di rilevare pattern ricorrenti:

- task frequentemente oltre soglia;
- task che richiedono molti rework;
- task interrotti più volte;
- categorie di task da scomporre ulteriormente;
- granularità eccessiva che produce overhead sproporzionato.

## Impatto economico della granularità

Task troppo ampi non aumentano soltanto la finestra di perdita in caso di interruzione. Aumentano preventivamente anche il consumo atteso di token e la varianza rispetto alle stime.

Un agente che riceve più output indipendenti nella stessa invocazione deve:

- caricare e mantenere un contesto più ampio;
- coordinare più decisioni contemporaneamente;
- verificare più comportamenti nello stesso ciclo;
- produrre una completion più lunga;
- sottoporre alla review un insieme più esteso di modifiche;
- rieseguire una parte significativa del ragionamento quando anche un solo comportamento fallisce;
- affrontare rework che possono riaprire elementi già corretti.

Il costo del rework non è quindi limitato alla singola correzione: spesso include nuovamente orientamento, lettura del contesto, analisi, modifica, test e review dell'intero perimetro assegnato.

Con task atomici, il feedback arriva prima e il ricircolo rimane confinato:

```text
Task ampio con 9 output
→ review aggregata
→ 1 output fallisce
→ rework su un contesto che ne contiene 9

9 task atomici
→ verifica e commit dopo ciascun output
→ 1 output fallisce
→ rework limitato a quel task
```

### Caso reale osservato

Una pipeline recente ha prodotto il seguente risultato:

```text
INFRA — EF Core entities, DbContext, factory
US-01 — Cold Cache ReportBase: 2 rework cycles
US-02 — Warm Cache ReportBase
US-03 — Cache Invalidation ReportBase
US-04 — ReportPC Lot Data
US-05 — ReportSmart: 9 sheet types

Token stimati:   circa 322.000
Token effettivi: circa 2.850.000
Scostamento:     circa 8,9× la stima
US-05:           circa 448.000 token
```

Il dato non dimostra che tutta la differenza sia causata esclusivamente dalla granularità, ma evidenzia due segnali forti:

1. `US-01` ha richiesto due cicli di rework sul perimetro complessivo della User Story;
2. `US-05` dichiara esplicitamente nove sheet type, cioè una molteplicità di output gestita come un unico blocco.

`US-05` avrebbe dovuto essere analizzata come almeno:

```text
Task condiviso — infrastruttura o comportamento comune di ReportSmart
Task specifico — implementazione/verifica sheet type 1
Task specifico — implementazione/verifica sheet type 2
...
Task specifico — implementazione/verifica sheet type 9
Task finale — verifica integrata dei nove sheet type
```

Se alcuni sheet type sono realmente banali e identici dal punto di vista implementativo, possono essere raggruppati soltanto quando il gruppo rimane sotto la soglia di durata e conserva una verifica unica e chiara. Il numero nove non deve essere nascosto dentro un singolo task senza che la stima tenga conto della molteplicità.

### Regola sulla molteplicità

Quando titolo o descrizione di un task contengono una molteplicità esplicita, il Work Breakdown deve richiedere una valutazione di split.

Segnali indicativi:

- `N` tipi, adapter, sheet, endpoint, entity o integrazioni;
- elenchi di comportamenti indipendenti;
- verbi multipli collegati da `e`;
- più criteri di accettazione verificabili separatamente;
- più output che possono fallire o essere approvati autonomamente.

La molteplicità non implica automaticamente un task per elemento, ma impedisce di considerare il blocco atomico senza una motivazione verificabile.

### Regola sul rework

Un task che richiede rework ripetuto è un segnale di perimetro eccessivo, requisito ambiguo o verifica tardiva.

La policy proposta è:

```text
Primo fallimento
→ rework mirato sul task

Secondo fallimento
→ non continuare automaticamente sull'intero task
→ hard stop tecnico
→ analizzare il motivo
→ riscomporre il task oppure chiarire requisito e verifica
```

Il limite non serve a dichiarare fallita la feature, ma a evitare che la pipeline continui a consumare token su un'unità di lavoro mal definita.

L'execution ledger deve rendere disponibili almeno:

- token per tentativo;
- token cumulativi del task;
- numero di rework;
- durata di ciascun tentativo;
- finding che ha causato il rework;
- decisione di riscomposizione;
- task sostitutivi eventualmente creati.

Questi dati devono alimentare sia la ripresa operativa sia la calibrazione futura delle stime.

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

## Execution ledger

L'execution ledger è il tracker persistente dell'intero processo di delivery. I token rappresentano una delle metriche registrate, insieme a stato, durata, tentativi, verifiche, errori e checkpoint Git.

FTR-013 costituisce il predecessore di questo modello: introduce il tracking per invocazione di agente nel file `{PREFIX}-token-ledger.json`. Questa idea porta il task a unità minima dell'esecuzione e propone `execution ledger` come nome e contratto target. L'eventuale rinomina o migrazione del file esistente deve essere implementata esplicitamente e mantenere la compatibilità con Token Estimate e workflow già esistenti.

### Percorso

Il ledger deve vivere nel dossier della feature:

```text
{documentationRoot}/features/{PREFIX}-{slug}/
└── {PREFIX}-execution-ledger.json
```

Nel repository del toolkit, per esempio:

```text
internal_docs/features/FTR-013-example/FTR-013-execution-ledger.json
```

Nei progetti standard:

```text
docs/features/FTR-013-example/FTR-013-execution-ledger.json
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
      "status": "resolved",
      "commitMessage": "feat(FTR-013): implement TASK-BE-01 user lookup",
      "attempts": 1,
      "startedAt": "2026-08-02T15:10:00Z",
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
  "ledgerStatus": "resolved",
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
3. verificare che il task non sia già `resolved` o `closed`;
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
2. leggere l'execution ledger, se presente;
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
Leggi Work Breakdown ed execution ledger
        ↓
Riconcilia ledger con Git
        ↓
Seleziona il primo task pending con dipendenze soddisfatte
        ↓
Persisti atomicamente task active + started_at + attempt
        ↓
Esegui un solo task
        ↓
Registra token, durata ed esito del tentativo
        ↓
Esegui verifiche mirate
        ↓
Aggiorna il ledger a resolved
        ↓
Crea commit atomico con codice, test, ledger e trailer
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
| closed | commit presente | closed | salta il task |
| resolved | commit presente | resolved | non reimplementare; completa eventuale review |
| active | commit assente | interrupted | riprendi o riesegui soltanto questo task |
| pending | commit presente | recoverable | aggiorna/riconcilia il ledger |
| resolved/closed | commit assente | inconsistent | hard stop e diagnosi |
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
- ledger resolved/closed ma commit assente;
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
2. ogni task definisce un solo outcome principale, una verifica mirata e un commit specifico;
3. task sopra la soglia configurata vengono rifiutati o richiedono una motivazione esplicita al Gate 2;
4. task che attraversano domini o agent type differenti vengono suddivisi;
5. i task vengono eseguiti individualmente nel worktree condiviso;
6. il ledger viene aggiornato atomicamente a `active` prima di invocare l'agente;
7. ogni tentativo registra inizio, fine, stato, token utilizzati e durata;
8. un task viene marcato `resolved` soltanto dopo verifiche riuscite;
9. ogni task risolto produce un commit Git autonomo;
10. ogni commit contiene trailer per feature, task e fase;
11. l'execution ledger è persistito nel dossier della feature;
12. Git e ledger possono essere riconciliati deterministicamente;
13. una nuova esecuzione salta i task `resolved` o `closed`;
14. un task rimasto `active` viene riconosciuto come interrotto;
15. stati incoerenti causano un hard stop con diagnosi esplicita;
16. modifiche non attribuite non vengono incluse automaticamente;
17. il workflow può riprendere limitando la perdita al solo task interrotto;
18. nessun modello LLM decide se un commit esista o se un task sia completato;
19. i checkpoint non provocano push automatici;
20. i test coprono granularità, transizioni, commit, ledger, riconciliazione e recovery.

## Perimetro della prima feature

### Incluso

- commit per singolo task;
- generazione di task piccoli, atomici e autonomamente verificabili;
- stima della durata per task e controllo della soglia prima del Gate 2;
- esecuzione seriale dei task nel worktree condiviso;
- execution ledger JSON;
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
- generazione o riconciliazione dell'execution ledger dalla cronologia Git;
- recovery assistito delle modifiche lasciate da un task interrotto;
- policy configurabili sulla granularità dei checkpoint.
