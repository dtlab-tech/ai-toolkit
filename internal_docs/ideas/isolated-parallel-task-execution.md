# Isolated Parallel Task Execution

## Sequenza

Questa è la sesta idea della catena dedicata all'esecuzione resiliente:

```text
1. Atomic Work Breakdown
2. Claude Source Layout and Runtime Resolution
3. Deterministic Estimate Generation
4. Execution Ledger
5. Task Checkpoints and Resume
6. Isolated Parallel Task Execution
```

Dipende dal grafo task-level autorevole, dall'execution ledger append-only e dal protocollo
di checkpoint e recovery. Non modifica l'unità atomica: aumenta soltanto il numero di task
atomici che possono essere attivi contemporaneamente.

## Contesto

Task Checkpoints and Resume introduce inizialmente un executor con `maxConcurrency: 1`.
Questa baseline garantisce attribuzione delle modifiche, commit autonomi e recovery, ma non
sfrutta i task indipendenti presenti nella ready queue.

Eseguire più agenti nello stesso worktree non è sicuro:

- le modifiche possono sovrapporsi;
- il Git index è condiviso;
- staging e commit non sono attribuibili deterministicamente;
- un agente può includere modifiche prodotte da un altro;
- ledger, review e recovery perdono il confine del task.

Il parallelismo è accettabile soltanto se non rompe i checkpoint task-level.

## Obiettivo

Abilitare `maxConcurrency > 1` mediante isolamento reale:

```text
Ready queue
    ↓
Deterministic scheduler (maxConcurrency = N)
    ├── Task A → worktree A → verify → review → commit A
    ├── Task B → worktree B → verify → review → commit B
    └── Task C → worktree C → verify → review → commit C
                                  ↓
                    deterministic integration queue
                                  ↓
                         feature branch aggiornato
```

Ogni task conserva:

- una sola invocazione per attempt;
- ledger e telemetria autonomi;
- verifica e review mirate;
- commit con trailer del task;
- recovery indipendente;
- massimo due attempt prima del replan.

## Configurazione

```json
{
  "execution": {
    "maxConcurrency": 3,
    "isolationStrategy": "git-worktree"
  }
}
```

Regole:

- `maxConcurrency` è un intero positivo;
- il default resta `1`;
- `maxConcurrency > 1` richiede `isolationStrategy: "git-worktree"`;
- configurazioni non supportate producono hard stop prima di attivare task;
- non è consentito ridurre silenziosamente il valore richiesto;
- requested ed effective concurrency vengono persistite nell'execution ledger;
- il modello LLM non può modificare il limite durante l'esecuzione.

## Scheduler deterministico

Lo scheduler JavaScript ricostruisce lo stato dal Work Breakdown, dal ledger e da Git.

Ad ogni ciclo:

1. individua i task `pending`;
2. esclude quelli con dipendenze non `resolved` o `closed`;
3. ordina la ready queue con un criterio stabile documentato;
4. calcola gli slot liberi;
5. crea un worktree per ciascun task selezionato;
6. persiste `task_activated` e `agent_started` prima dello spawn;
7. invoca al massimo `maxConcurrency` attempt contemporanei.

Ordinamento proposto:

```text
topological level → phase order → task ID
```

La disponibilità di meno task ready rispetto agli slot non modifica
`maxConcurrencyEffective`: indica soltanto capacità momentaneamente inutilizzata.

## Isolamento tramite Git worktree

Ogni attempt riceve:

- worktree dedicato;
- branch tecnico deterministico;
- base commit registrato nel ledger;
- task ID e attempt nel nome logico;
- documenti approvati in sola lettura;
- nessun accesso mutativo al worktree di coordinamento.

Naming indicativo:

```text
ai/FTR-020/US-01-TASK-BE-01/attempt-1
```

Il developer agent modifica esclusivamente il proprio worktree. Verifica, review e commit
avvengono nello stesso ambiente isolato.

## Ledger centralizzato

I worker non scrivono direttamente `{PREFIX}-execution-ledger.jsonl`.

Un unico writer JavaScript nel coordinatore:

1. riceve eventi dai worker;
2. li valida;
3. li ordina con una sequence monotona;
4. li appende e sincronizza;
5. restituisce conferma di persistenza.

Ogni attempt parallelo registra almeno:

- task e phase ID;
- attempt;
- worker slot;
- worktree e branch tecnico;
- base commit;
- modello, token e durata;
- verifiche e review;
- commit prodotto;
- stato di integrazione.

La concorrenza delle invocazioni non implica scritture concorrenti sul ledger.

## Commit e integrazione

Il commit atomico viene creato nel worktree del task con i trailer definiti da Task
Checkpoints and Resume.

I commit completati entrano in una coda di integrazione seriale. Il coordinatore:

1. verifica commit e trailer;
2. verifica che il task sia ancora integrabile;
3. integra il commit nel branch della feature in ordine deterministico;
4. esegue i controlli di integrazione richiesti;
5. persiste `commit_integrated` e `task_resolved`;
6. libera lo slot e valuta nuovamente la ready queue.

La strategia concreta può essere cherry-pick o equivalente, ma deve essere nascosta dietro
un modulo deterministico e testabile. Non è ammesso copiare file manualmente tra worktree.

## Conflitti di integrazione

Un conflitto non viene risolto automaticamente da un LLM.

```text
integration_conflict
→ task_blocked
→ diagnosi con file e commit coinvolti
→ rebase/replan esplicitamente autorizzato
```

Il commit prodotto nel worktree resta raggiungibile e il worktree non viene eliminato. Gli
altri task indipendenti possono completare, ma nessun task dipendente dal task bloccato viene
attivato.

## Recovery

Alla ripresa il coordinatore riconcilia:

- ledger;
- branch della feature;
- branch tecnici;
- worktree registrati;
- commit prodotti ma non integrati;
- task attivi senza processo agente;
- slot dichiarati occupati.

Stati principali:

| Stato osservato | Azione |
|---|---|
| commit task già integrato | ricostruire gli eventi mancanti e non rieseguire |
| commit presente solo nel worktree | rimettere in coda di integrazione |
| task active, worktree con diff ma senza commit | nuovo attempt con diff preservato |
| task active, worktree pulito e agente assente | marcare interrupted e ritentare |
| worktree non attribuibile | hard stop |
| branch base non raggiungibile | hard stop |

Non eseguire automaticamente reset, clean, force removal o cancellazione di branch con
lavoro non integrato.

## Cleanup sicuro

Un worktree può essere rimosso soltanto quando:

- il commit del task è integrato e raggiungibile;
- gli eventi `commit_integrated` e `task_resolved` sono persistiti;
- non esistono modifiche non committate;
- non serve a una diagnosi o a un rework.

Il cleanup viene eseguito dal modulo JavaScript con target assoluti validati. La rimozione
forzata non appartiene al percorso normale.

## Modulo

Struttura indicativa:

```text
lib/
├── task-scheduler.js
├── worktree-isolation.js
└── commit-integration.js
```

Interface proposta:

```javascript
const {
  resolveReadyQueue,
  dispatchReadyTasks,
  integrateCompletedTask,
  recoverParallelExecution,
  cleanupResolvedWorktree,
} = require('../lib/task-scheduler');
```

Le interface devono nascondere lock, naming, Git plumbing, sequencing del ledger e
riconciliazione. Gli agenti ricevono task e worktree, non implementano lo scheduler.

## CLI

```bash
node bin/cli.js execution status --feature <feature.md>
node bin/cli.js execution dispatch --feature <feature.md>
node bin/cli.js execution integrate --feature <feature.md> --task <task-id>
node bin/cli.js execution recover --feature <feature.md>
node bin/cli.js execution cleanup --feature <feature.md> --task <task-id>
```

## Criteri di accettazione

1. `maxConcurrency > 1` attiva al massimo quel numero di task.
2. Vengono attivati soltanto task con dipendenze soddisfatte.
3. La ready queue ha ordinamento deterministico.
4. Ogni attempt parallelo utilizza un worktree distinto.
5. Nessun worker modifica il worktree di coordinamento o scrive direttamente il ledger.
6. Il ledger usa un unico writer e conserva eventi separati per task e attempt.
7. Token e durata sono attribuiti al singolo attempt.
8. Ogni task valido produce un commit autonomo con trailer.
9. L'integrazione dei commit è seriale e deterministica.
10. Un conflitto blocca soltanto il task e i suoi dipendenti.
11. Commit prodotti ma non integrati vengono recuperati senza rieseguire il task.
12. Worktree con modifiche non attribuibili causano hard stop.
13. Il cleanup non elimina worktree con lavoro non integrato.
14. `maxConcurrency: 1` mantiene il comportamento di Task Checkpoints and Resume.
15. Nessun modello LLM decide scheduling, isolamento, integrazione o cleanup.
16. I test coprono scheduling, limite di concorrenza, worktree, integrazione, conflitti,
    recovery e cleanup.

## Incluso

- scheduler task-level concorrente;
- `maxConcurrency > 1`;
- worktree e branch tecnici isolati;
- ledger writer centralizzato;
- commit task-level nei worktree;
- integrazione seriale;
- conflitti espliciti;
- recovery concorrente;
- cleanup sicuro;
- configurazione gerarchica;
- CLI e test automatici.

## Escluso

- parallelismo nello stesso worktree;
- merge conflict resolution automatica;
- modifica dinamica del limite durante un attempt;
- scheduling distribuito su più macchine;
- push remoto per ogni task;
- cancellazione forzata di worktree o branch;
- ripristino del contesto interno del modello.

## Dipendenze

- utilizza `{PREFIX}-Work-Breakdown.json` come grafo task-level autorevole;
- utilizza `{PREFIX}-execution-ledger.jsonl` come storia e stato ricostruibile;
- preserva il protocollo di Task Checkpoints and Resume;
- risolve `execution.maxConcurrency` e `execution.isolationStrategy` tramite la configurazione
  gerarchica del toolkit.
