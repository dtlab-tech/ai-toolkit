# Performance & Throughput Assessment — Proposta concettuale

## Contesto

Il confronto tra un assessment prodotto da `/assess-codebase` e l'analisi di Fable su un altro progetto ha evidenziato un gap nella copertura dei costi runtime.

La pipeline considerata nel confronto impiegava quattro agent:

- `gaia-generic-software-assessment`;
- `gaia-concurrency-safety-assessment`;
- `gaia-layered-architecture-assessment`;
- `gaia-dependency-supply-chain-security`.

Questi coprono qualità generale, correttezza concorrente, confini architetturali e rischi delle dipendenze. Eventuali osservazioni prestazionali del generic assessment non costituiscono un'analisi sistematica di throughput, batching, durata delle risorse e costo per elemento.

In `am-phase1` il discovery è dinamico: i quattro agent descrivono il caso che ha originato l'idea, non un elenco fisso da introdurre nel workflow.

## Problema

Un sistema può essere corretto rispetto a thread safety e layering ma degradare fortemente quando il volume cresce:

- query, salvataggi e chiamate esterne ripetuti per ogni elemento;
- context ORM e oggetti trattenuti per tutta la durata di un batch;
- connessioni o client ricreati senza verificare pooling e riuso;
- operazioni sincrone che occupano worker durante attese I/O;
- lavoro già completato ripetuto dopo il fallimento di un batch;
- algoritmi e lookup il cui costo cresce più rapidamente del carico.

Manca un owner esplicito di queste verifiche. Aggiungere poche regole al generic assessment rischia di lasciare invariato il problema di profondità e copertura.

## Evidenze dal confronto con Fable

La revisione manuale del percorso di elaborazione di un altro repository, successiva al confronto con Fable, ha riportato cinque casi non segnalati dall'assessment. Il percorso tratta fino a 5.000 componenti per sottoprocesso esterno.

| Caso riportato | Meccanismo da verificare | Impatto potenziale |
|---|---|---|
| Un singolo EF6 `DbContext` risolto per chunk, con change tracker che cresce durante l'elaborazione | Lifetime effettivo del context, entità tracked, detach/dispose e limiti del chunk | Crescita della memoria; possibile contributo agli `OutOfMemory` per cui esiste già una gestione con exit code 6 |
| 6–10 round trip DB non raggruppati per componente | Query e `SaveChanges` effettivi lungo il percorso EF6, provider e confini delle transazioni | Costo I/O moltiplicato per componenti e sottoprocessi paralleli |
| 3–4 cicli raw SQL open/query/close per componente in `DesignBasisDataRepository` | Lookup di correlazione design-basis ripetuti, possibilità di query aggregate e comportamento del pool | Round trip ridondanti e overhead di acquisizione; open/close logico non prova una nuova connessione fisica |
| Una chiamata al servizio esterno di transcode per componente | Un percorso batch è stato riportato nella stessa classe: verificare equivalenza funzionale, limiti e gestione errori | Mancata ammortizzazione del costo della chiamata esterna |
| Un'eccezione non gestita sull'elemento N invalida il lavoro del chunk | Confini di commit, checkpoint, risultati persistiti, acknowledgement e retry | Lavoro scartato o ripetuto, amplificazione dei retry e riduzione del throughput utile |

Queste sono evidenze riportate dall'analisi del progetto originario, non difetti verificati nel codice di `ai-toolkit`. Questa idea non dispone dei relativi file, commit, trace o benchmark: non inventare riferimenti di riga o misure.

L'exit code 6 è un indizio operativo, non dimostra che il change tracker causi l'OOM. Analogamente, i conteggi riportati sono una base per costruire casi di valutazione, non misure universali di EF6. Prima di trasformarli in finding su un repository occorre verificarli sul percorso concreto.

## Obiettivo e proposta

Aggiungere un assessment agent autonomo e language-agnostic:

| Elemento | Valore proposto |
|---|---|
| Nome nativo | `gaia-performance-throughput-assessment` |
| File sorgente | `src/claude/agents/gaia-performance-throughput-assessment.md` |
| Scope | `performance` |
| Invocazione | `/assess-codebase <path> --scope=performance` |
| Output | `docs/assessments/{ASSESS_PREFIX}/{ASSESS_PREFIX}-Performance-Assessment.md` |
| Finding ID | `{ASSESS_PREFIX}-PERF-NNN` |
| Canonical registry ID proposto | `gaia.agent.assessment.performance-throughput` |

L'agent deve leggere `AGENTS.md` come Step 0, riconoscere runtime, framework, versioni e provider, ricostruire i percorsi ad alto volume e produrre finding utilizzabili dalla pipeline di interventi. Il frontmatter deve includere `name`, `description` e un `model` esplicito fra quelli consentiti dalle convenzioni del toolkit.

L'assessment resta in sola lettura sul codice applicativo: scrive soltanto gli artefatti previsti e non applica ottimizzazioni.

## Detection focus

| Area | Ricerca e verifica richieste |
|---|---|
| ORM / DB context lifetime | Context/session/unit-of-work longevi; change tracking accumulato; materializzazione eccessiva; lifetime DI, disposal, no-tracking e confini transazionali |
| Batching | `SaveChanges`, insert/update, lookup e invocazioni per elemento; disponibilità di batch API; dimensione massima, atomicità, ordinamento e risultati parziali |
| External I/O | HTTP, RPC, servizi esterni, file e sottoprocessi nei loop; costo per chiamata, timeout, rate limit e possibilità di ammortizzazione |
| Connection reuse | Creazione ripetuta di client/sessioni; pooling configurato; riuso di connessioni e handshake; distinzione fra open/close logico e connessione fisica |
| Memory growth | Tracker, cache, liste, buffer, payload, stream e risultati trattenuti; limiti, eviction, streaming e backpressure |
| Failure / retry granularity | Unità di lavoro, commit, checkpoint e acknowledgement; costo del replay; poison item; retry bounded; idempotenza e duplicazione degli effetti |
| N+1 | Query o caricamenti lazy dentro iterazioni; lookup ripetuti con chiavi note; numero di chiamate lungo il call graph |
| Sync I/O in loops | Attese bloccanti, sync-over-async e I/O sincrono in percorsi caldi; occupazione worker/event loop e alternative compatibili col runtime |
| Algorithmic complexity | Scansioni annidate, ricerca lineare ripetuta, sort e serializzazioni ripetuti; costo in funzione delle cardinalità reali |
| Throughput e saturazione | Serializzazione, lock contention, parallelismo non limitato o inefficiente e pressione su pool/servizi; distinguere capacità utile e lavoro in volo |

Un pattern sintattico è un candidato, non una prova. Un loop piccolo e limitato, un context con tracking disabilitato, una connessione pooled o una transazione volutamente atomica possono essere scelte corrette.

Le mitigazioni devono preservare semantica, isolamento e correttezza. Non prescrivere automaticamente un context per elemento, un batch per chunk, più parallelismo o una conversione ad async.

## Distinzione rispetto al concurrency assessment

Il concurrency assessment verifica correttezza e sicurezza: race condition, shared mutable state, atomicità, interleaving, cancellazione e shutdown.

Il performance assessment verifica costo e capacità: latenza, operazioni per elemento, memoria trattenuta, saturazione delle risorse e throughput utile. Si applica anche a programmi interamente sequenziali.

Esempi:

- context condiviso fra thread con accessi non sicuri: concurrency;
- context usato sequenzialmente che trattiene migliaia di entità: performance;
- lock necessario ma esteso a una lenta chiamata esterna: performance per contention; concurrency se esiste anche un problema di correttezza;
- retry dell'intero chunk: performance per replay e lavoro perso; referenziare separatamente eventuali problemi di duplicazione o consistenza.

Quando i due agent osservano lo stesso percorso, mantenere evidenze e impatti distinti e collegare i finding. Il consolidamento deve evitare di contare due volte lo stesso problema o creare interventi duplicati.

## Evidence-before-finding

Per ogni candidato, l'agent deve:

1. Individuare entry point, loop e chiamate transitivamente eseguite.
2. Citare file e righe reali con snippet essenziali; verificare configurazione, lifetime e comportamento del framework pertinente.
3. Ricostruire unità di elaborazione, cardinalità, frequenza, parallelismo e confini di transazione/retry. Segnalare i valori ignoti.
4. Cercare controevidenze: batching già attivo, pooling, cache, limiti, no-tracking, checkpoint o percorso batch non equivalente.
5. Spiegare il nesso fra codice e costo, separando fatti osservati, stime e ipotesi.
6. Emettere un finding soltanto con evidenza sufficiente; altrimenti registrare una domanda `Q-PERF-NNN` o una verifica proposta, esclusa dai conteggi dei finding confermati.
7. Indicare una mitigazione proporzionata e come validarla con misure prima/dopo.

Un modello di costo può esprimere, per esempio, `roundTripsPerItem × itemsPerChunk × concurrentProcesses`: è una stima condizionata, non una misura di latenza o un benchmark. Non attribuire automaticamente allo stesso insieme le query già incluse in altri conteggi.

Le metriche di validazione possono includere round trip/item, chiamate esterne/chunk, durata e p95, item/s completati, memoria di picco, entità tracked e lavoro ripetuto per retry. Non eseguire load test o chiamate mutative su servizi reali come parte dell'assessment statico.

## Severity e confidence

Mantenere due dimensioni indipendenti e motivarle:

| Severity | Criterio |
|---|---|
| `CRITICAL` | Evidenza di esaurimento risorse o indisponibilità su un percorso operativo rilevante, con condizioni di attivazione documentate |
| `HIGH` | Amplificazione sostanziale di I/O, memoria o replay su un percorso ad alto volume, con impatto e scala sostenuti da evidenze |
| `MEDIUM` | Inefficienza circoscritta o impatto moderato, con limiti e condizioni espliciti |
| `LOW` | Costo ridotto o opportunità limitata, comunque dimostrata e utile |

| Confidence | Criterio |
|---|---|
| `confirmed` | Meccanismo verificato nel codice/configurazione o tramite misure disponibili; un impatto numerico è confermato soltanto se misurato |
| `probable` | Evidenze forti del meccanismo, ma una condizione rilevante resta da validare |
| `suspected` | Evidenza insufficiente: registrare come domanda/verifica separata, non come difetto accertato |

Un `SaveChanges` o una chiamata HTTP in un loop non implica automaticamente severity HIGH. L'assenza di benchmark non impedisce di dimostrare un meccanismo, ma impedisce di inventare il guadagno prestazionale.

## Output proposto

Il report `{ASSESS_PREFIX}-Performance-Assessment.md` comprende:

- perimetro, stack, percorsi analizzati e limitazioni;
- sintesi per severity e confidence;
- tabella dei percorsi caldi e modello di costo, con assunzioni esplicite;
- finding dettagliati;
- domande e verifiche ancora aperte;
- raccomandazioni prioritarie e piano di misurazione.

Formato indicativo di ciascun finding:

```text
[SEVERITY] [AREA] — ID: {ASSESS_PREFIX}-PERF-NNN
Title:
Hot path / unit of work:
Evidence: file:line, snippet e riferimenti alla configurazione
Observed behavior:
Cost mechanism / scaling:
Workload and assumptions:
Counter-evidence checked:
Impact: osservato oppure atteso, esplicitamente distinto
Severity rationale:
Confidence: confirmed | probable
Confidence rationale:
Recommendation and tradeoffs:
Validation: metrica, baseline e confronto previsto
Related findings:
Candidate interventions:
```

Restituire all'orchestrator un riepilogo strutturato con percorso del report, conteggi e limitazioni. Anche in assenza di finding, produrre il report con perimetro verificato e risultato esplicito. Un agent fallito non equivale a zero problemi.

## Integrazione nel toolkit

### Registry e installazione

Aggiornare `lib/agent-registry.js` con la nuova entry, seguendo i campi già previsti dal catalogo: canonical ID, native name, percorso installato, ruolo, tipo, fasi autorizzate, pipeline e piattaforme.

Il percorso installato è `.claude/agents/gaia-performance-throughput-assessment.md`; il sorgente resta sotto `src/claude/agents/`. Verificare discovery, installazione, manifest/hash e risoluzione senza introdurre scansioni hardcoded alternative al catalogo. La versione minima dovrà essere quella della release che introduce l'agent.

### Orchestrator e SCOPE_AGENT_MAP

Aggiornare `src/claude/workflows/am-phase1.js`:

- rendere l'agent scopribile attraverso il meccanismo `list-assets`;
- aggiungere `performance` a `SCOPE_AGENT_MAP`;
- includerlo nel discovery senza scope e selezionarlo con `--scope=performance`;
- supportare scope combinati, per esempio `performance,concurrency`, senza duplicare dispatch;
- preservare report, gestione degli errori e integrazione nelle stime.

Nel codice corrente la mappa contiene nomi come `concurrency-safety-assessment`, mentre il frontmatter dichiara `gaia-concurrency-safety-assessment` e il filtro usa uguaglianza esatta. L'implementazione deve allineare selezione e risoluzione ai nomi effettivi del registry, verificando anche gli scope esistenti: copiare semplicemente il vecchio formato rischia di selezionare zero agent.

### Consolidamento e assessment registry

Verificare che `gaia-intervention-documentation-standard` acquisisca il nuovo report, preservi evidenze e confidence e deduplichi i finding sovrapposti. Adeguare eventuali elenchi chiusi di report, categorie o KPI.

Conservare l'integrazione con il Findings Gate e con il registry degli assessment gestito da `am-phase2`: il nuovo report e gli interventi devono essere rintracciabili senza cambiare il protocollo di approvazione. Questo registry è distinto dal catalogo degli agent in `lib/agent-registry.js`.

### Test e documentazione

Prevedere:

- validazione frontmatter del nuovo agent;
- test di registry, risoluzione, installazione e catalog equivalence;
- test del filtro e del dispatch di `am-phase1`, oltre ai guard statici già presenti in `tests/regression/am-phase1-static.test.js`;
- casi di valutazione con i cinque pattern originari e relativi controlli negativi;
- test del consolidamento, degli errori e del collegamento agli interventi;
- aggiornamento di `src/claude/skills/assess-codebase/SKILL.md`, `docs/reference.md`, `README.md` e della tabella degli assessment in `AGENTS.md`, dove pertinente.

Documentare scope, filename, confine con concurrency, severity/confidence e limiti dell'analisi statica. La futura implementazione deve eseguire `npm test`; la valutazione della qualità dei finding richiede anche fixture rappresentative, non soltanto test di presenza di parole nel prompt.

## Criteri di accettazione

1. Il nuovo agent esiste con nome, frontmatter e Step 0 conformi alle convenzioni.
2. Il registry lo risolve e l'installazione lo include con manifest e hash coerenti.
3. `--scope=performance` seleziona e avvia il nuovo agent; nessun filtro vuoto dovuto a nomi legacy.
4. Senza scope l'agent viene scoperto; con scope combinati viene eseguito una sola volta e gli scope preesistenti continuano a funzionare.
5. Il report viene scritto esattamente come `{ASSESS_PREFIX}-Performance-Assessment.md` nella directory dell'assessment.
6. Il detection focus comprende tutte le aree elencate, incluse N+1, sync I/O nei loop e complessità algoritmica.
7. Ogni finding include riferimenti verificabili, meccanismo di costo, assunzioni, severity, confidence, motivazioni e validazione proposta.
8. Assenza di misure o informazioni di workload viene dichiarata; non vengono inventati benchmark, causalità OOM o nuove connessioni fisiche.
9. I cinque casi del confronto con Fable sono coperti da fixture o scenari di valutazione con evidenze sufficienti; i controlli negativi evitano segnalazioni automatiche su pooling, no-tracking, loop limitati o atomicità necessaria.
10. Il confine con concurrency è esplicito e il consolidamento evita doppi conteggi dello stesso problema.
11. Report, interventi, conteggi, stime e assessment registry restano collegati; un fallimento dell'agent è visibile come assessment parziale.
12. L'agent non modifica codice applicativo e non avvia automaticamente remediation o load test.
13. Documentazione e test di integrazione sono aggiornati; `npm test` passa nella futura implementazione.

## Incluso ed escluso

Incluso nella proposta: un agent dedicato, il contratto delle evidenze e del report, scope performance e integrazione completa nella pipeline esistente.

Escluso: micro-ottimizzazioni stilistiche prive di impatto dimostrabile, infrastruttura di benchmark universale, profiling automatico in produzione, remediation autonoma e un redesign generale degli orchestrator.

Questo documento registra l'idea per una successiva elaborazione in feature. Non implementa l'agent né assegna un nuovo identificatore FTR.
