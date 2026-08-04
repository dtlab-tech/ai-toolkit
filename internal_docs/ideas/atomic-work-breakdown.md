# Atomic Work Breakdown

## Sequenza

Questa è la prima di tre idee dipendenti:

```text
1. Atomic Work Breakdown
2. Execution Ledger
3. Task Checkpoints and Resume
```

Deve essere implementata per prima perché definisce il task come unità minima, stabile e machine-readable che le feature successive utilizzeranno per tracking, commit e recovery.

## Contesto

Il Work Breakdown attuale può assegnare a una singola fase o invocazione agentica più attività e più output indipendenti. Questo aumenta:

- durata della singola esecuzione;
- quantità di contesto richiesta;
- variabilità delle stime;
- costo delle review;
- ampiezza del rework;
- perdita potenziale in caso di interruzione;
- difficoltà di attribuire token, tempo e modifiche a un risultato preciso.

Un caso reale ha prodotto circa 2,85 milioni di token rispetto a una stima di 322.000, cioè circa 8,9 volte la stima. Una User Story ha richiesto due cicli di rework e un'altra comprendeva nove sheet type in un unico blocco da circa 448.000 token.

Il dato non dimostra che tutto lo scostamento dipenda dalla granularità, ma mostra che output multipli e review tardive possono amplificare fortemente il ricircolo.

## Obiettivo

Fare del task la più piccola modifica che sia contemporaneamente:

- autonomamente implementabile;
- dotata di un risultato osservabile;
- verificabile con controlli specifici;
- committabile;
- attribuibile a un solo dominio principale;
- attribuibile a un solo agent type;
- ripetibile con costo contenuto;
- sufficientemente breve da non creare finestre di lavoro nell'ordine delle ore.

Regola fondamentale:

> Un task può attraversare più classi e layer interni, ma deve produrre un solo comportamento osservabile e una sola verifica principale.

## Atomicità per comportamento

L'atomicità non coincide con un file o una classe.

Questa scomposizione è troppo artificiale:

```text
TASK-BE-01 — Creare Repository
TASK-BE-02 — Creare Service
TASK-BE-03 — Creare Controller
TASK-BE-04 — Creare DTO
```

Nessuno di questi task produce autonomamente un comportamento utile.

È invece corretto:

```text
TASK-BE-01 — Implementare POST /orders includendo Controller,
DTO, validazione, Service e Repository necessari.
```

Il task attraversa più layer interni, ma produce un unico outcome verificabile: un ordine valido può essere creato tramite API.

## Coerenza tra User Story e task

I task non devono eccedere lo scope della User Story.

Esempio scorretto:

```text
US-01 — Come utente voglio inserire da UI un nuovo ordine.

TASK-BE-01 — Implementare GET, POST, PATCH e DELETE degli ordini.
TASK-FE-01 — Implementare lista, dettaglio, creazione, modifica ed eliminazione.
```

La User Story parla di creazione, mentre i task implementano l'intero CRUD.

Una scomposizione coerente è:

```text
US-01 — Creazione ordine
  TASK-DB-01   — Creare schema e migration di Order
  TASK-BE-01   — Implementare POST /orders
  TASK-FE-01   — Implementare il form di creazione
  TASK-TEST-01 — Verificare il flusso end-to-end di creazione

US-02 — Consultazione ordini
  TASK-BE-02   — Implementare GET /orders e GET /orders/{id}
  TASK-FE-02   — Implementare la lista degli ordini
  TASK-FE-03   — Implementare la pagina di dettaglio
  TASK-TEST-02 — Verificare lista e dettaglio

US-03 — Modifica ordine
  TASK-BE-03   — Implementare PATCH /orders/{id}
  TASK-FE-04   — Implementare il form di modifica
  TASK-TEST-03 — Verificare il flusso di modifica

US-04 — Eliminazione ordine
  TASK-BE-04   — Implementare DELETE /orders/{id}
  TASK-FE-05   — Implementare eliminazione e conferma
  TASK-TEST-04 — Verificare il flusso di eliminazione
```

`GET /orders` e `GET /orders/{id}` possono rimanere nello stesso task se il risultato rimane breve, coerente e verificabile. Devono essere separati quando implementazione o verifica diventano significative.

## Regole di split

Un task deve essere ulteriormente suddiviso quando:

- contiene più risultati funzionali o tecnici indipendenti;
- attraversa domini differenti tra `DB`, `BE`, `FE`, `INFRA` e `TEST`;
- richiede agent type differenti;
- combina comportamenti autonomamente verificabili;
- contiene più output che possono fallire o essere approvati separatamente;
- include una sequenza in cui ogni passo produce già un checkpoint valido;
- non può essere descritto con un singolo criterio di completamento;
- supera la durata massima prevista;
- un errore nella parte finale costringerebbe a ripetere molto lavoro già valido.

### Molteplicità esplicita

Titoli o descrizioni con molteplicità devono richiedere una valutazione di split:

- `N` tipi, sheet, adapter, endpoint, entity o integrazioni;
- elenchi di comportamenti indipendenti;
- verbi multipli collegati da `e`;
- più acceptance criteria verificabili separatamente;
- formule come `tutti i tipi`, `tutti gli adapter` o `CRUD completo`.

La molteplicità non implica automaticamente un task per elemento, ma impedisce di considerare il blocco atomico senza una motivazione esplicita.

Esempio:

```text
ReportSmart — 9 sheet types
```

Deve essere valutato come:

```text
Task condiviso — comportamento comune ReportSmart
Task specifico — sheet type 1
...
Task specifico — sheet type 9
Task finale — verifica integrata
```

Elementi realmente banali e identici possono essere raggruppati soltanto se il gruppo rimane sotto la soglia e conserva un outcome e una verifica unici.

## Atomicità senza micro-task

Non costituiscono task del Work Breakdown:

- leggere un file;
- cercare un simbolo;
- orientarsi nel repository;
- preparare una modifica;
- eseguire un singolo passaggio privo di risultato autonomo.

Sono attività interne all'esecuzione di un task.

Un task è sufficientemente piccolo quando può essere interrotto e rieseguito con costo accettabile, ma sufficientemente completo da produrre un risultato significativo e verificabile.

## Soglie iniziali

Policy proposta per la prima versione:

```text
Target:             ≤ 15 minuti agentici
Warning:            > 20 minuti
Split obbligatorio: > 30 minuti
Task di ore:        non ammesso
```

Non viene introdotto inizialmente un limite assoluto di token, perché dipende da modello e contesto. Le stime token restano obbligatorie e serviranno alla calibrazione futura.

Le soglie potranno diventare configurabili successivamente. I primi valori devono essere espliciti e uguali per tutti i progetti.

## Responsabilità di `generate-work-breakdown`

L'agente deve proporre task atomici utilizzando Requirements, Tech Spec, codebase e convenzioni del progetto.

Ogni task deve dichiarare:

- ID stabile e univoco;
- titolo;
- outcome osservabile;
- dominio principale;
- agent type;
- dipendenze;
- verifica mirata;
- durata agentica stimata;
- token stimati;
- numero di output;
- commit type e subject;
- motivazione se più elementi sono raggruppati.

La valutazione dell'outcome e dell'indipendenza dei comportamenti è semantica e deve essere effettuata dall'agente LLM.

## `validate-work-breakdown`

Un validatore indipendente deve analizzare il piano prima del Gate 2.

### Controlli deterministici

- ID univoci;
- campi obbligatori;
- dipendenze mancanti o cicliche;
- durata sopra soglia;
- domini o agent type multipli;
- task senza verifica;
- task senza commit subject;
- `outputCount > 1` senza motivazione;
- acceptance criteria senza task corrispondenti;
- task non raggiungibili nel grafo delle dipendenze.

### Controlli semantici

- più comportamenti nel titolo o nella descrizione;
- CRUD completo in un task;
- molteplicità nascosta;
- attività separatamente verificabili;
- stima incompatibile con il perimetro;
- disallineamento tra User Story e task;
- task che richiederebbe un ricircolo esteso in caso di errore.

### Risultato

```text
Work Breakdown Validation

Tasks:                   27
Atomic tasks:            24
Tasks requiring split:    2
Tasks requiring waiver:   1
Maximum estimated time:  22 min
Tasks above threshold:    0
```

Il Gate 2 deve essere bloccato quando esistono task che richiedono split.

## Gate 2

Il Gate 2 deve presentare:

- numero di User Story;
- numero di task;
- distribuzione per dominio;
- durata massima stimata;
- task oltre warning;
- task raggruppati con motivazione;
- esito del validatore;
- eventuali waiver richiesti.

La prima versione non deve consentire waiver per task stimati oltre 30 minuti. I raggruppamenti sotto soglia possono essere approvati quando outcome e verifica restano unici.

## Formato del Work Breakdown

### Fonte machine-readable

Introdurre:

```text
{PREFIX}-Work-Breakdown.json
```

Esempio:

```json
{
  "schemaVersion": 2,
  "feature": "FTR-020",
  "phases": [
    {
      "id": "US-01",
      "title": "Create order",
      "tasks": [
        {
          "id": "TASK-BE-01",
          "title": "Implement POST /orders",
          "outcome": "A valid order can be created through the API",
          "domain": "BE",
          "agentType": "developer-backend",
          "dependsOn": ["TASK-DB-01"],
          "verification": {
            "commands": ["dotnet test --filter OrderCreation"]
          },
          "estimate": {
            "agentMinutes": 15,
            "tokens": 35000
          },
          "outputCount": 1,
          "groupingRationale": null,
          "commit": {
            "type": "feat",
            "subject": "implement TASK-BE-01 order creation API"
          }
        }
      ]
    }
  ]
}
```

### Vista umana

`{PREFIX}-Work-Breakdown.md` rimane il documento presentato al Gate 2.

### CSV

`{PREFIX}-Work-Breakdown.csv` diventa una vista di compatibilità temporanea. Durante la migrazione può essere generato dal JSON, ma non deve più essere la fonte primaria dell'orchestratore.

## Impatto economico atteso

Task più piccoli introducono più invocazioni e un overhead fisso maggiore, ma riducono:

- contesto per invocazione;
- costo della review;
- rework esteso;
- ripetizione di lavoro già valido;
- varianza tra stima e consuntivo;
- rischio di perdere ore di attività.

L'obiettivo non è minimizzare il numero di chiamate, ma minimizzare il costo totale e il rischio di coda.

## Criteri di accettazione

1. `generate-work-breakdown` produce un JSON con schema versionato.
2. Ogni task definisce un solo outcome principale.
3. Ogni task ha un solo dominio e un solo agent type.
4. Ogni task contiene verifica, stima e commit subject.
5. Task oltre 30 minuti vengono obbligatoriamente suddivisi.
6. Molteplicità e output multipli richiedono una valutazione esplicita.
7. User Story e task hanno scope coerente.
8. `validate-work-breakdown` esegue controlli deterministici e semantici.
9. Il Gate 2 è bloccato in presenza di task che richiedono split.
10. Il Markdown viene generato coerentemente dal modello strutturato.
11. Il CSV viene mantenuto soltanto come compatibilità temporanea.
12. I test coprono schema, dipendenze, soglie, campi obbligatori e Gate 2.

## Incluso

- nuovo contratto del task;
- nuovo Work Breakdown JSON;
- aggiornamento di `generate-work-breakdown`;
- nuovo `validate-work-breakdown`;
- validazione prima del Gate 2;
- soglie iniziali;
- aggiornamento della presentazione del Gate 2;
- compatibilità temporanea con il CSV;
- test automatici.

## Escluso

- execution ledger;
- modifica dell'esecuzione di `pm-phase3`;
- commit per task;
- resume;
- worktree paralleli;
- controllo runtime di token e durata;
- replan durante l'implementazione.

## Dipendenze successive

L'Execution Ledger utilizzerà gli ID e il contratto dei task definiti qui. Task Checkpoints and Resume utilizzerà entrambi.
