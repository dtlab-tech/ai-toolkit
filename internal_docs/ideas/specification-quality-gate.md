# Specification Quality Gate

## Sequenza e posizionamento

Questa idea e le idee dedicate alla resilienza dell'esecuzione appartengono a due assi differenti.

La sequenza di implementazione raccomandata rimane:

```text
1. Atomic Work Breakdown
2. Claude Source Layout and Runtime Resolution
3. Deterministic Estimate Generation
4. Execution Ledger
5. Task Checkpoints and Resume
6. Specification Quality Gate
```

La Specification Quality Gate viene implementata dopo queste cinque iniziative per poter
utilizzare layout sorgente stabile, task atomici, generazione deterministica, ledger e
checkpoint durante le proprie attività di validazione. Isolated Parallel Task Execution è
un'ottimizzazione indipendente e non costituisce una sua precondizione.

Nel processo di feature delivery definitivo, tuttavia, opera logicamente prima dell'Atomic Work Breakdown:

```text
Feature approvata
    ↓
Requirements + Tech Spec
    ↓
Specification Quality Gate
    ↓
Gate 1
    ↓
Atomic Work Breakdown
    ↓
Gate 2
    ↓
Execution Ledger + Task Checkpoints and Resume
```

Non è quindi una quarta fase dell'esecuzione dei task, ma un quality gate a monte che garantisce l'affidabilità degli input usati per produrre il Work Breakdown.

## Contesto

Durante la definizione di FTR-014, Requirements, Tech Spec e Validation Report sono stati rigenerati e corretti più volte. Il Validation Report ha dichiarato in più occasioni che i documenti erano completi e privi di gap, mentre erano ancora presenti incoerenze che avrebbero generato errori reali, tra cui:

- script indicati in percorsi non distribuiti nei progetti consumer;
- incompatibilità fra il formato CSV e il parser effettivo di `pm-phase3`;
- contratti sugli Acceptance Criteria non compatibili con il formato dei Requirements;
- exit code dichiarati ma non verificati nel workflow;
- failure path che non bloccavano Gate 2;
- attività agentiche non tracciate correttamente nel ledger;
- attribuzione token incompleta o incoerente;
- trasformazioni dichiarate non-lossy che perdevano in realtà informazioni;
- File Inventory e test inventory non coerenti con le modifiche necessarie.

Il problema emerso non è la sola presenza di errori in una prima bozza. Il problema è che il processo di validazione li ha certificati come risolti senza verificare la correttezza tecnica del sistema descritto.

L'attuale validazione tende a controllare soprattutto la copertura documentale:

```text
La feature contiene un requisito?
Il requisito è menzionato nella Tech Spec?
Esiste un Acceptance Criterion associato?
```

Questo non è sufficiente per rispondere a domande come:

```text
Il percorso indicato esiste realmente nel progetto installato?
Il consumer corrente interpreta davvero il formato prodotto?
Tutti i failure path portano a uno stato terminale corretto?
Il pseudocodice usa effettivamente i campi che dichiara?
Il Validation Report è coerente con il contenuto corrente dei documenti?
```

## Problema

Una specifica tecnicamente completa ma internamente incoerente trasferisce il costo della scoperta all'implementazione. Questo produce:

- rework durante lo sviluppo;
- incremento del consumo di token;
- stime inattendibili;
- cicli ripetuti di correzione documentale;
- falsa sicurezza generata da report `Clean`;
- rischio di approvare un Gate 1 con decisioni ancora aperte;
- divergenza fra documentazione e comportamento reale del toolkit;
- propagazione degli errori nel Work Breakdown e nelle successive attività agentiche.

La qualità di una specifica non può quindi essere misurata solamente dalla presenza delle sezioni attese. Deve essere verificata rispetto a invarianti documentali, contratti machine-readable e realtà del repository.

## Obiettivo

Introdurre una Specification Quality Gate obbligatoria fra la generazione di Requirements/Tech Spec e il Gate 1.

La gate deve impedire l'approvazione quando esistono:

- contraddizioni fra documenti;
- decisioni obbligatorie ancora aperte;
- contratti incompleti o non implementabili;
- riferimenti incompatibili con il codice reale;
- failure path senza comportamento definito;
- file, componenti o test mancanti dall'inventory;
- esempi incoerenti con gli schemi dichiarati;
- Validation Report non supportato da evidenze verificabili.

Regola fondamentale:

> `Clean` non significa che ogni argomento è menzionato. Significa che tutti i controlli deterministici passano, la review tecnica avversariale non contiene finding aperti e ogni claim critico è supportato da un'evidenza verificabile.

## Principi

### Separazione fra generazione e giudizio

Il componente che genera la Tech Spec non deve essere l'unica fonte della sua validazione. La review deve assumere che la specifica possa essere errata e cercare attivamente casi in cui l'implementazione descritta fallirebbe.

### Controlli deterministici in JavaScript

Tutto ciò che può essere espresso come regola strutturale deve essere implementato in JavaScript e coperto da test, senza utilizzare un LLM.

Esempi:

- placeholder o decisioni non risolte;
- ID duplicati o riferimenti mancanti;
- percorsi discordanti fra documenti;
- File Inventory incoerente;
- Acceptance Criteria non coperti;
- enum o stati discordanti;
- transizioni senza stato terminale;
- esempi JSON non conformi allo schema;
- riferimenti a file inesistenti nel repository;
- documenti dichiarati immutabili che risultano modificati dopo l'approvazione.

### Review semantica e tecnica separata

Un LLM può verificare aspetti che richiedono comprensione:

- coerenza fra obiettivo, requisiti e soluzione;
- ambiguità semantiche;
- responsabilità collocate nel componente sbagliato;
- failure mode non considerati;
- assunzioni non dichiarate;
- scope creep;
- complessità incompatibile con le stime.

La review tecnica deve anche leggere il repository reale quando la specifica formula claim su componenti esistenti.

### Evidenza prima del verdetto

Ogni finding o esito positivo rilevante deve indicare la propria evidenza:

- documento e sezione;
- file e riga del repository;
- controllo deterministico eseguito;
- test o simulazione utilizzata;
- assunzione esplicita quando la verifica diretta non è possibile.

## Pipeline proposta

```text
Requirements + Tech Spec
        ↓
SQG-01 — Deterministic Document Validation
        ↓ checkpoint
SQG-02 — Cross-Document Semantic Review
        ↓ checkpoint
SQG-03 — Repository Feasibility Review
        ↓ checkpoint
SQG-04 — Failure-Path and State Review
        ↓ checkpoint
SQG-05 — Regression Review and Final Verdict
        ↓
Specification Validation Report
        ↓
Gate 1
```

Ogni fase deve essere un task atomico tracciato nell'Execution Ledger e dotato di checkpoint. Un'interruzione non deve richiedere la ripetizione delle review già completate e ancora valide.

## SQG-01 — Deterministic Document Validation

Un validatore JavaScript deve verificare almeno:

### Struttura

- documenti obbligatori presenti;
- sezioni obbligatorie presenti una sola volta;
- ID di UC, AC, BR, NFR e open question univoci;
- riferimenti risolti;
- tabelle con colonne attese;
- JSON e blocchi strutturati parseabili;
- assenza di placeholder non consentiti come `TBD`, `TODO`, `_____________`;
- stato del documento coerente con la fase del processo.

### Coerenza cross-document

- stesso nome e percorso per ogni componente;
- stessi enum, soglie e stati;
- stesso perimetro incluso/escluso;
- ogni Acceptance Criterion coperto dalla Tech Spec;
- ogni file dichiarato nel design presente nel File Inventory;
- ogni test richiesto presente nel Test Inventory;
- ogni Open Question bloccante risolta prima del Gate 1;
- assenza di modifiche a documenti già approvati e dichiarati immutabili.

### Contratti di stato

- ogni stato ha transizioni consentite;
- ogni attività avviata raggiunge `done`, `failed` o `skipped`;
- ogni errore tecnico ha un comportamento terminale;
- un componente fallito non consente l'avanzamento quando il risultato è obbligatorio;
- ledger, output e gate usano la stessa semantica degli stati.

## SQG-02 — Cross-Document Semantic Review

Una review LLM indipendente deve cercare attivamente:

- requisiti interpretati in modo diverso dalla feature approvata;
- soluzione tecnica che non soddisfa realmente il requisito;
- contraddizioni nascoste fra Main Flow, Error Flow, Acceptance Criteria e pseudocodice;
- termini uguali usati con significati differenti;
- assunzioni trasformate implicitamente in decisioni;
- funzionalità aggiunte senza autorizzazione;
- requisiti obbligatori spostati impropriamente fra i deferred;
- casi in cui gli esempi contraddicono le regole testuali.

La review non deve limitarsi a produrre una coverage matrix.

## SQG-03 — Repository Feasibility Review

La Tech Spec deve essere confrontata con la realtà del repository.

Controlli tipici:

- esistenza dei file da modificare;
- API e runtime realmente disponibili;
- comportamento corrente degli orchestratori;
- modalità di installazione locale e globale;
- percorsi disponibili nei progetti consumer;
- formato realmente letto dai parser esistenti;
- compatibilità con manifest e pruning;
- test framework e dipendenze realmente presenti;
- possibilità concreta di implementare il pseudocodice nel runtime dichiarato.

Quando utile, la review deve eseguire piccoli test deterministici o prototipi read-only per verificare le assunzioni critiche.

## SQG-04 — Failure-Path and State Review

Ogni integrazione deve essere analizzata anche dal punto di vista del fallimento:

- comando non trovato;
- exit code inatteso;
- timeout;
- output vuoto o non parseabile;
- schema mismatch;
- file atteso non prodotto;
- attività interrotta;
- ledger non aggiornabile;
- finding funzionale distinto da errore tecnico;
- step successivo correttamente eseguito, bloccato o skipped.

Per ogni attività deve essere possibile rispondere:

```text
Cosa indica che è iniziata?
Cosa indica che è completata?
Cosa viene persistito se fallisce?
Quali step successivi vengono saltati?
La gate viene bloccata?
I token consumati fino al fallimento vengono conservati?
```

## SQG-05 — Regression Review and Final Verdict

Dopo ogni correzione deve essere rieseguito l'intero insieme di invarianti. Non è sufficiente verificare solamente il finding appena corretto.

La regression review deve rilevare:

- nuove contraddizioni introdotte dalla correzione;
- sezioni obsolete rimaste nel documento;
- esempi non aggiornati;
- File Inventory e test non riallineati;
- report che dichiara risolto un finding ancora presente;
- differenze fra documenti correnti e documenti effettivamente analizzati.

## Specification Validation Report

Il report finale deve distinguere almeno:

```text
PASS     — controllo superato con evidenza
FAIL     — finding bloccante aperto
WARNING  — rischio non bloccante accettabile al Gate 1
N/A      — controllo non applicabile con motivazione
```

Ogni finding deve includere:

- ID stabile;
- severità;
- documento o componente coinvolto;
- evidenza;
- impatto;
- correzione richiesta;
- stato;
- evidenza della regression verification dopo la correzione.

Il report non può dichiarare `Clean` quando:

- esistono finding `FAIL` aperti;
- un controllo deterministico non è stato eseguito;
- una decisione bloccante è ancora aperta;
- una verifica contro il repository necessaria è stata sostituita da un'assunzione;
- il report è basato su una versione precedente dei documenti.

## Gate 1

Il Gate 1 deve mostrare almeno:

- esito complessivo della Specification Quality Gate;
- numero di PASS, FAIL, WARNING e N/A;
- finding bloccanti;
- warning accettabili;
- decisioni prese durante la specifica;
- hash o identificatore delle versioni validate dei documenti.

Gate 1 deve essere bloccato quando esiste almeno un finding `FAIL` aperto.

L'approvazione deve congelare le versioni validate di Requirements e Tech Spec. Una modifica successiva invalida l'approvazione e richiede una nuova esecuzione della gate.

## Integrazione con Atomic Work Breakdown

Il Work Breakdown può essere generato solamente a partire dalle versioni di Requirements e Tech Spec che hanno superato la Specification Quality Gate.

Il JSON del Work Breakdown dovrebbe registrare gli identificatori o hash dei documenti sorgente approvati. Questo consente di verificare che:

- il piano non sia stato generato da documenti obsoleti;
- una modifica post-approvazione richieda una nuova generazione;
- Execution Ledger e checkpoint siano riconducibili a una specifica precisa.

## Impatto economico atteso

La gate introduce ulteriori controlli e un costo iniziale maggiore prima del Gate 1. Questo costo deve essere confrontato con la riduzione di:

- rework durante il Work Breakdown;
- implementazioni basate su contratti impossibili;
- cicli ripetuti di correzione documentale;
- token spesi per attività poi invalidate;
- escalation tardive;
- falsa approvazione di documenti tecnicamente incoerenti.

L'obiettivo non è produrre documenti perfetti in senso astratto, ma impedire che incoerenze rilevabili vengano propagate alle fasi più costose.

## Incluso

- validatore deterministico dei documenti;
- review semantica cross-document;
- review tecnica contro il repository;
- analisi failure path e stati;
- regression review completa;
- nuovo contratto del Validation Report;
- blocco del Gate 1 in presenza di finding aperti;
- identificazione delle versioni documentali validate;
- integrazione con Execution Ledger e checkpoint.

## Escluso

- correzione automatica non supervisionata di Requirements o Tech Spec;
- modifica automatica di documenti già approvati;
- implementazione della feature descritta;
- sostituzione del Gate 2 dedicato al Work Breakdown;
- garanzia assoluta che ogni decisione architetturale sia ottimale;
- eliminazione della review umana per decisioni ad alto impatto.

## Risultati attesi

1. Un Validation Report non può dichiarare `Clean` quando esistono finding aperti.
2. Gli errori strutturali e cross-document deterministici vengono rilevati senza utilizzare un LLM.
3. La review tecnica confronta i claim della specifica con il repository reale.
4. I failure path obbligatori sono definiti e coerenti con Gate e ledger.
5. Ogni correzione attiva una regression review completa.
6. Gate 1 congela versioni identificabili di Requirements e Tech Spec.
7. Il Work Breakdown registra le versioni delle specifiche dalle quali deriva.
8. L'esecuzione della gate è atomica, tracciata e riprendibile.

## Questioni aperte

1. Il validatore deterministico deve essere un unico script o una raccolta di regole/plugin componibili?
2. Quale formato usare per identificare le versioni validate: hash Git, hash dei file o identificatore del commit?
3. La Repository Feasibility Review deve essere obbligatoria per ogni feature o adattata in base alla classificazione della modifica?
4. Quali warning possono essere accettati direttamente dall'utente e quali richiedono un ruolo tecnico specifico?
5. Come invalidare formalmente Gate 1 quando Requirements o Tech Spec cambiano dopo l'approvazione?
6. Quale modello utilizzare per la review semantica e per quella tecnica avversariale?
