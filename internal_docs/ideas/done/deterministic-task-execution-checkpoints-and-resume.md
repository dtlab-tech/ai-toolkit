# FTR-018 — Deterministic Task Execution, Checkpoints and Resume

## Stato e finalità

Proposta da usare come input di define-feature. Non costituisce approvazione di feature,
Requirements, Tech Spec o Work Breakdown e non autorizza implementazione o release.

Questa proposta consolida e sostituisce, per FTR-018, i contratti delle idee storiche
`task-checkpoints-and-resume.md` e `isolated-parallel-task-execution.md`.
In caso di differenza prevale questo documento; gli esempi storici non sono contratti runtime.

Percorso concordato: FTR-018 (esecuzione affidabile), FTR-019 (review architetturale e
consolidamento con refactoring approvato), collaudo della 1.0.0, poi v2 multipiattaforma.
La 1.0.0 non è un bump automatico alla chiusura di FTR-018.

## Problema e risultato atteso

Il breakdown atomico non basta: pm-phase3 contiene ancora raggruppamento per agent type,
esecuzione per fase e invocazioni LLM per operazioni deterministiche. Uno spegnimento può
lasciare lavoro e telemetria non riconciliati.

Il task deve diventare l'unità di scheduling, invocazione di implementazione, verifica,
checkpoint e recupero. Si riprende da evidenze persistite, non dalla memoria della chat.
Il lavoro dei task consolidati non viene rieseguito; i file parziali vengono preservati.
Non si promette il recupero di dati mai scritti, del contesto interno del modello o di un disco perso.

## Baseline da confermare prima della progettazione tecnica

- FTR-014: task, dipendenze e verifiche nel Work Breakdown approvato.
- FTR-015: sorgenti in src/claude, test in tests, catalogo e distribuzione locale/globale.
- FTR-016: lib/execution-ledger.js e CLI ledger; file `{PREFIX}-token-ledger.json`.
- FTR-017: registry, native name verificati, provenienza e lifecycle dispatch/self.

Ispezione locale del 2026-09-09: esistono lib/agent-registry.js e metadata nel ledger;
pm-phase3.js contiene ancora buildGroups ed executePhase. package.json riporta 0.11.0:
questo dato non dimostra quale versione sia stata rilasciata. Registrare branch, SHA e
versione effettivi della baseline prima di implementare, senza bump o riallineamenti impliciti.

Non assumere un ledger JSONL/event store: l'attuale ledger è un array di attività con
stati running/done/failed/skipped, open/close/fail/skip e metadata whitelisted.
Non scrivere nuovi campi passando chiavi arbitrarie alla whitelist FTR-017.

## Perimetro

FTR-018 comprende esecuzione sequenziale, checkpoint, resume e supporto reale alla
concorrenza isolata. Sono incrementi distinti della stessa feature, da implementare e
verificare in quest'ordine. Il default rimane sempre `maxConcurrency: 1`.

Esclusi: adapter operativi Codex/Copilot, riscrittura generale, orchestrazione distribuita,
push/merge automatici, backup remoto, ripristino della memoria LLM, risoluzione automatica
dei conflitti e riorganizzazione v2/old. L'assessment completo resta fuori dal nuovo
esecutore, salvo adeguamenti strettamente necessari alla compatibilità.

## Responsabilità deterministiche e integrazione runtime

Un modulo Node.js possiede scheduling, transizioni, lock, persistenza, staging, commit e
riconciliazione. CLI sottile; nessuna duplicazione della logica nei prompt o nei test.
L'interfaccia deve nascondere il protocollo e consentire test comportamentali con processi,
filesystem e Git isolati. I nomi dei metodi si definiscono in Tech Spec, non sono imposti qui.

Gli agenti implementano o valutano il task; non scelgono il prossimo task, non modificano
concorrenza, ledger o checkpoint. Una invocazione di implementazione per task e attempt;
review e rework sono attività distinte e contabilizzate, non task aggiuntivi nascosti.

La Tech Spec deve provare il ponte effettivo tra Node e il runtime Claude disponibile.
I workflow non dispongono delle normali importazioni Node. Non inventare spawn API,
non usare un agente LLM come sostituto del filesystem o del motore deterministico.
Prevedere un primo spike tecnico verificabile: dispatch reale, risultato, telemetria e
cancellazione attraverso un meccanismo supportato. Se non disponibile, fermarsi con
evidenza e decisione richiesta; niente fallback silenzioso a project-manager o vecchio pm-phase3.
Preservare i controlli FTR-017 e risolvere il nativeName verificato prima di ogni dispatch.

## Input e scheduling

- Usare i deliverable approvati: Markdown completo e CSV corrente. Non introdurre
  un Work-Breakdown.json obbligatorio o da rigenerare con LLM.
- Normalizzare deterministicamente in memoria task, outcome, dipendenze e verifiche.
  Validare parità, unicità, grafo aciclico e completezza prima di mutazioni.
- Se serve uno snapshot persistito per resume, deve essere derivato, versionato e legato
  tramite digest ai documenti approvati, non una seconda fonte modificabile.
- Ordinamento stabile e documentato dei task ready; dipendenze soddisfatte solo dopo
  checkpoint integrato e valido, oppure skip verificato esplicitamente ammesso.
- Verificare Gate 1/Gate 2 e identificare esattamente repository, feature e piano approvato.
- Modifica del piano/configurazione durante una run: stop e riconciliazione autorizzata,
  non reinterpretazione automatica. Replan con nuova approvazione e storia preservata.

## Configurazione e concorrenza

`maxConcurrency` è un intero positivo, default 1. Definire in Tech Spec una sorgente di
configurazione esplicita e la sua precedenza senza implementare l'intera idea di configurazione
gerarchica. Persistire valore richiesto ed effettivo; mai ridurlo silenziosamente.

Con 1: un task attivo nello stesso worktree, attribuzione e index controllati.
Con N maggiore di 1: worktree/branch tecnici isolati per attempt, mai worker concorrenti
nello stesso worktree. Il numero di attempt contemporanei non supera N.
Un solo coordinatore scrive lo stato condiviso e integra i commit in sequenza stabile.
Acquisire lock esclusivi anche contro una seconda istanza del toolkit; recovery dei lock
stale solo dopo evidenza che il precedente proprietario non è più attivo.

Il task parallelo non sblocca dipendenze prima dell'integrazione e della verifica sul branch
feature. Registrare SHA originario e SHA integrato. Conflitti o fallimenti di integrazione
fermano nuove partenze e preservano lavoro/branch; non risolvere o scartare automaticamente.
Isolare anche output di build e risorse di test condivise, oppure serializzarne l'uso.
Worktree separati non costituiscono da soli una sandbox: esplicitare e testare i limiti
del runtime rispetto a scritture fuori dal worktree assegnato.

## Lifecycle, ledger e telemetria

Distinguere stato del task, stato dell'operazione ledger e checkpoint Git. Un `done` di un
agente non prova che il task sia consolidato. La Tech Spec deve definire transizioni e
mapping sui contratti FTR-016/017, inclusa una migrazione backward-compatible se necessaria.
Non sostituire il ledger né introdurre un secondo conteggio token. Un eventuale journal
tecnico deve avere ownership distinta e non duplicare attività o actuals.

Prima del dispatch persistire e rileggere identità run/task/attempt, base SHA, piano,
worker e stato iniziale. Se la persistenza fallisce, non invocare l'agente.
Persistire esito e misure appena disponibili, prima delle operazioni successive.
Token sconosciuti = null con motivo; zero solo se noto. Separare tempo elapsed e tempo
attivo, evitando di attribuire lo spegnimento al lavoro agente. Conservare ogni attempt.
Per la concorrenza non attribuire delta globali sovrapposti ai singoli task.

Definire stop cooperativo: niente nuove partenze, consolidamento dei risultati ricevuti.
Stop immediato/interruzione: preservazione dei file e recovery dell'attempt incompleto.
Un processo ancora attivo non deve essere duplicato da un resume.
Default proposto: un attempt iniziale e un rework automatico; poi stop e proposta di replan.
Il recupero di un commit già creato non è un nuovo attempt di implementazione.

## Checkpoint e Git

Sequenza: implementazione → verifiche mirate → review mirata → preparazione persistita
del checkpoint → staging controllato → commit → registrazione del risultato verificato.
La review di integrazione della fase resta distinta e può aprire un rework tracciato.

Ogni task modificativo verificato produce un commit atomico con identità feature, task,
run/attempt e piano correlabili. No `git add .`, commit di modifiche estranee, reset/clean,
stash automatici o force push. All'avvio classificare separatamente artefatti pipeline
consentiti e modifiche utente: queste ultime richiedono stop, non pulizia automatica.
Task realmente senza modifiche: skip con evidenza e verifiche, niente commit vuoto.

Commit e ledger NON sono una transazione unica. Persistire intenzione e riferimenti
necessari prima del commit; registrare SHA solo dopo. Lo SHA di un commit non può essere
contenuto nel commit stesso: la Tech Spec deve definire come rendere durevole la
registrazione successiva senza commit ricorsivi o un working tree permanentemente ambiguo.

La riconciliazione non si fida solo dei trailer: verificare identità, base/ancestry,
raggiungibilità sul branch corretto, piano e contenuto atteso. Commit duplicati o evidenze
discordanti producono stop, non scelta arbitraria. Commit hook failure: nessun task concluso.

## Resume e durabilità

Status è read-only. Resume/reconcile mutativi richiedono invocazione esplicita e sono
idempotenti. Worktree parziali e commit non integrati restano preservati.

| Evidenza | Comportamento richiesto |
|---|---|
| Checkpoint valido e integrato | Non reimplementare il task |
| Commit creato, registrazione finale mancante | Riconciliare senza nuovo commit né nuovo agent |
| Verifiche finite, commit assente | Rivalidare le evidenze e completare il checkpoint se sicuro |
| Attempt interrotto con diff parziale | Preservare diff; attribuzione verificata prima della ripresa |
| Commit nel worktree ma non integrato | Riprendere integrazione, non implementazione |
| Task concluso ma commit mancante/non raggiungibile | Stop con diagnosi |
| Branch/piano cambiato, diff estraneo, stato corrotto | Stop senza perdita di dati |

Specificare atomic write, flush e limiti filesystem/OS: un rename da solo non giustifica
una garanzia assoluta contro power loss. Commit locali non proteggono da perdita del disco.
Il cleanup riguarda solo risorse create dalla run, integrate e pulite; mai rimozione forzata
di lavoro non consolidato. Nessun resume deve dipendere dal transcript della chat.

## Incrementi di implementazione proposti

1. Verifica baseline e spike del ponte runtime, inclusi limiti di osservabilità.
2. Parser del piano approvato e scheduler puro con ordinamento stabile.
3. Protocollo persistente e ledger backward-compatible, lock e diagnosi read-only.
4. Esecuzione sequenziale di un task con verifiche, review e telemetria.
5. Commit controllato e riconciliazione delle finestre commit/ledger.
6. Stop/resume, retry e replan autorizzato.
7. Worktree isolati e limite N, integrazione seriale e recovery concorrente.
8. Integrazione nel percorso ufficiale implement-feature, distribuzione e documentazione.
9. Collaudo end-to-end con fault injection e feature reale, prima della review FTR-019.

Ogni incremento va scomposto nel WB in task con singolo output verificabile; non equivale
a una singola invocazione agente. FTR-018 non va eseguita presumendo già disponibile il
nuovo executor: documentare il percorso di bootstrap approvato e i suoi limiti.

## Criteri di accettazione da sviluppare nei Requirements

1. Nessun raggruppamento per agent type: una implementazione per task/attempt.
2. Scheduling ripetibile, dipendenze rispettate e input invalido rifiutato prima delle scritture.
3. Dispatch impedito se ledger/lock/provenienza non sono verificati.
4. Ledger e token storici preservati e leggibili dai consumer attuali; nessun doppio conteggio.
5. Task concluso solo con verifiche/review e checkpoint validi; skip provato separatamente.
6. N=1 sequenziale; N=2/N=3 realmente isolati, limite rispettato e integrazione seriale.
7. Due coordinatori concorrenti non possono prendere in carico lo stesso task.
8. Resume ripetuto non duplica agent, commit, integrazioni o misure già persistite.
9. Fault injection prima/dopo dispatch, verifica, checkpoint-prepared, commit e scrittura
   finale dimostra assenza di falsi completamenti e conservazione del lavoro su disco.
10. Recovery copre anche commit paralleli non integrati, lock stale e conflitti.
11. Stato corrotto, piano cambiato e modifiche estranee provocano stop non distruttivo.
12. Test usano moduli reali, Git temporaneo e fake worker tramite la stessa interfaccia;
    non reimplementano lo scheduler nei test e non toccano home/installazioni reali.
13. Installazione locale/globale e packaging distribuiscono il nuovo runtime, non test/fixture.
14. Prova manuale controllata del percorso Claude ufficiale oltre ai test senza LLM;
    eventuali limiti di token/cancellazione dichiarati, mai mascherati da mock verdi.
15. Nessun push, merge, rilascio o approvazione automatica introdotti dalla feature.

## Decisioni che la Tech Spec deve chiudere prima del Gate 1

- Ponte Node/runtime effettivamente supportato e modalità di dispatch/cancellazione.
- Schema del protocollo e mapping ledger, migrazione e idempotenza per ogni operazione.
- Parser lossless MD/CSV e identità dello snapshot del piano.
- Durabilità e posizione dello stato tecnico rispetto ai commit e al writer centralizzato.
- Identificazione/recupero lock, policy di integrazione e diagnosi dei conflitti.
- Comandi pubblici, configurazione, exit code e comportamento read-only/mutativo.

Non demandare queste decisioni al developer durante l'implementazione e non inventare
nuove capacità del runtime per far apparire completo il documento.
