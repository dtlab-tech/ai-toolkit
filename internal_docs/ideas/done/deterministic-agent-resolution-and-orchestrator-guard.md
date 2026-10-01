# Deterministic Agent Resolution and Orchestrator Guard

## Identificazione proposta

Questa idea deve essere sviluppata come **FTR-017**, subito dopo il rilascio della
**FTR-016 — Deterministic Execution Ledger Foundation** nella versione `0.12.0`.

La feature deve precedere Task Checkpoints and Resume: l'executor task-by-task non deve
essere costruito finché il toolkit non è in grado di garantire quale orchestratore e quale
agente specializzato vengano realmente invocati.

## Sequenza aggiornata

```text
FTR-014 — Atomic Work Breakdown
FTR-015 — Claude Source Layout and Runtime Resolution
FTR-016 — Deterministic Execution Ledger Foundation
FTR-017 — Deterministic Agent Resolution and Orchestrator Guard
          ↓
Task Checkpoints and Resume
          ↓
Isolated Parallel Task Execution
```

## Contesto

Durante l'implementazione di una feature in un progetto consumer è stato invocato un agente
globale chiamato `project-manager`, appartenente a una vecchia soluzione presente nel
workspace dell'utente. Tale agente ha orchestrato direttamente le attività senza passare dal
workflow `pm-phase3.js` del toolkit.

Il risultato è stato formalmente plausibile ma operativamente scorretto:

- la fase INFRA è stata implementata e committata;
- gli agenti sviluppatori sono stati avviati;
- l'Execution Ledger non è stato aggiornato per i task eseguiti;
- il processo non ha rispettato il percorso `/implement-feature → pm-phase3`;
- l'identità e la provenienza dell'orchestratore effettivo non erano visibili prima del
  dispatch.

La causa non è l'assenza di `pm-phase3.js`: il workflow risultava installato. È stato
semplicemente bypassato da un agente omonimo o semanticamente simile scoperto in un altro
scope.

Claude Code può rendere disponibili contemporaneamente agenti provenienti da:

- configurazione del progetto corrente;
- configurazione globale dell'utente;
- plugin;
- definizioni fornite alla sessione;
- residui di installazioni o progetti precedenti.

La risoluzione dei path introdotta dalla FTR-015 stabilisce quale installazione del toolkit
fornisce gli asset runtime. Non stabilisce però quale agente la piattaforma selezionerà quando
riceve un nome generico come `project-manager`, né impedisce a un utente o a un prompt obsoleto
di entrare nella pipeline dal punto sbagliato.

## Problema da risolvere

Il toolkit oggi confida implicitamente in tre assunzioni non garantite:

1. il nome di un agente identifica univocamente la sua implementazione;
2. il comando iniziale corretto viene sempre utilizzato;
3. se un agente previsto non è disponibile, la piattaforma non ne sceglie uno simile.

Queste assunzioni devono essere sostituite da verifiche deterministiche.

Il problema deve essere affrontato su due piani distinti:

```text
Runtime asset resolution
    Quale installazione contiene gli asset del toolkit?

Agent identity and dispatch
    Quale definizione concreta verrà invocata per un determinato ruolo?
```

La FTR-015 copre il primo piano. La FTR-017 copre il secondo.

## Obiettivo

Introdurre un confine deterministico tra orchestrazione e piattaforma:

```text
Skill / Executor
      ↓
Agent Registry
      ↓
Provenance Guard
      ↓
Platform Adapter
      ↓
Agente verificato
```

Una pipeline può effettuare il dispatch soltanto se:

- l'entry point è quello previsto;
- l'agente richiesto possiede un identificatore canonico;
- la definizione effettiva appartiene all'installazione selezionata del toolkit;
- versione, manifest e contenuto sono coerenti;
- non esistono collisioni irrisolte;
- la fase e il ruolo sono ammessi dalla pipeline corrente.

Qualunque condizione non verificabile produce un **hard stop**. Non deve esistere alcun
fallback verso agenti omonimi, generici o semanticamente simili.

## Principio fondamentale

```text
Agente previsto, univoco e verificato
    → dispatch

Agente assente, ambiguo, estraneo o incoerente
    → HARD STOP

Mai fallback automatico
```

La decisione è interamente deterministica e implementata in JavaScript. Un LLM non deve
scegliere tra candidati, dedurre la provenienza dal contenuto o correggere automaticamente
una collisione.

## Identificatori canonici

I nomi nativi della piattaforma non devono essere gli identificatori autorevoli del toolkit.
Il catalogo deve assegnare a ogni componente un ID stabile e namespaced, per esempio:

```text
gaia.orchestrator.feature.phase1
gaia.orchestrator.feature.phase2
gaia.orchestrator.feature.phase3
gaia.agent.developer.backend
gaia.agent.developer.frontend
gaia.agent.developer.testing
gaia.agent.review.solution
gaia.agent.work-breakdown.generate
```

Il mapping verso Claude può continuare temporaneamente a utilizzare i nomi dei file
esistenti:

```text
gaia.agent.developer.backend → developer-backend
gaia.agent.review.solution  → review-solution
```

La pipeline deve però riferirsi sempre all'ID canonico. Il nome Claude è un dettaglio
dell'adapter, non un contratto di dominio.

Per i nuovi asset e durante una migrazione controllata, i nomi nativi dovrebbero essere
namespaced anche sulla piattaforma, ad esempio `gaia-developer-backend`, evitando nomi
generici come `project-manager`, `developer` o `architect`.

La migrazione dei nomi non deve essere effettuata in blocco senza compatibilità e test:
mapping canonico e guardia possono essere introdotti prima, quindi i nomi fisici possono
essere aggiornati in task separati.

## Agent Registry

Creare un modulo dedicato, indicativamente:

```text
lib/
└── agent-registry.js
```

Il registry è un deep module: espone una piccola interface e nasconde catalogo, mapping di
piattaforma, manifest, hashing, scope e diagnostica.

Interface proposta:

```javascript
const {
  listRegisteredAgents,
  resolveAgent,
  validateAgentSet,
} = require('../lib/agent-registry');
```

Esempio:

```javascript
const resolved = resolveAgent({
  agentId: 'gaia.agent.developer.backend',
  platform: 'claude',
  projectDir,
  homeDir,
  toolkitVersion,
});
```

Risultato indicativo:

```json
{
  "agentId": "gaia.agent.developer.backend",
  "platform": "claude",
  "nativeName": "gaia-developer-backend",
  "scope": "project",
  "path": "C:/repo/.claude/agents/gaia-developer-backend.md",
  "toolkitVersion": "0.13.0",
  "manifestPath": "C:/repo/.claude/.ai-toolkit-manifest.json",
  "sha256": "...",
  "status": "verified"
}
```

Il risultato non deve contenere un candidato scelto per euristica. Deve rappresentare una
sola risoluzione dimostrabile.

## Catalogo degli agenti

Il catalogo degli agenti è distinto dall'attuale catalogo delle categorie di asset.

`asset-catalog.js` risponde alla domanda:

```text
Quali directory e file appartengono al payload distribuibile?
```

`agent-registry.js` deve rispondere alla domanda:

```text
Quale identità logica possiede questo agente e dove può essere invocato?
```

Il catalogo deve contenere almeno:

- ID canonico;
- ruolo;
- tipo: orchestratore o worker;
- piattaforme supportate;
- nome nativo per piattaforma;
- percorso relativo nell'installazione;
- fasi dalle quali può essere invocato;
- entry point autorizzati;
- versione minima del contratto;
- eventuale stato legacy/deprecato.

Il contenuto atteso e gli hash effettivi devono essere derivati dal package e dal manifest di
installazione, non mantenuti manualmente in più sorgenti.

## Provenance Guard

Prima del dispatch, la guardia deve verificare almeno:

1. l'ID esiste nel registry;
2. la piattaforma richiesta è supportata;
3. l'installazione runtime effettiva è una sola e coerente;
4. il file risolto appartiene al payload catalogato;
5. il manifest dichiara il file;
6. l'hash su disco coincide con quello installato;
7. la versione dell'agente è compatibile con la versione dell'orchestratore;
8. non esistono definizioni omonime estranee in scope con precedenza uguale o superiore;
9. il chiamante è autorizzato a invocare quel ruolo nella fase corrente;
10. l'agent type dichiarato nel Work Breakdown mappa a un solo ID canonico.

Una collisione deve essere segnalata con tutti i candidati, senza scegliere automaticamente:

```text
HARD STOP — AGENT IDENTITY COLLISION

Requested: gaia.agent.developer.backend
Expected:  C:\repo\.claude\agents\gaia-developer-backend.md
Conflicting candidate:
           C:\Users\user\.claude\agents\developer-backend.md

No agent was dispatched.
```

La sola presenza di file estranei non deve necessariamente bloccare ogni pipeline. Deve
bloccare quando il file può interferire con uno degli agenti richiesti oppure quando la
piattaforma non permette di dimostrare quale definizione avrà precedenza.

## Entry point e Orchestrator Guard

`/implement-feature` è l'unico entry point supportato per la pipeline completa di delivery.

La sequenza autorizzata è:

```text
/implement-feature
    → pm-phase1
    → Gate 1
    → pm-phase2
    → Gate 2
    → pm-phase3
```

Prima di ogni fase, l'entry point deve verificare tramite registry l'identità del workflow
successivo. Dopo Gate 2 deve essere invocato esclusivamente
`gaia.orchestrator.feature.phase3`, mappato al workflow `pm-phase3` della stessa installazione.

Non sono ammessi:

- fallback a `project-manager`;
- richiesta all'LLM di trovare un orchestratore equivalente;
- esecuzione manuale dei developer agent come comportamento alternativo implicito;
- prosecuzione se `pm-phase3` non è esposto dalla sessione;
- prosecuzione se le tre fasi provengono da versioni diverse;
- invocazione della pipeline completa a partire da un worker agent.

Se `pm-phase3` non è utilizzabile, il messaggio deve indicare come correggere installazione o
sessione, senza proporre automaticamente un altro agente.

## Correzione dei riferimenti obsoleti

Devono essere inventariati e corretti tutti i prompt che suggeriscono un entry point non
valido. Sono già noti almeno questi riferimenti:

```text
src/claude/agents/generate-work-breakdown.md
    Run /agent-project-manager ...

src/claude/agents/validate-feature-docs.md
    Run /agent-project-manager first.
```

I messaggi devono indirizzare all'entry point pubblico corretto oppure restituire un errore
neutro, senza nominare agenti legacy.

Un test statico deve impedire la reintroduzione di riferimenti a:

```text
/agent-project-manager
subagent_type: project-manager
agentType: project-manager
```

quando riferiti alla pipeline di delivery.

## Preflight obbligatorio

Prima di aprire la prima attività della pipeline, `/implement-feature` deve eseguire un
preflight deterministico.

Il preflight verifica:

- installazione locale oppure globale effettiva;
- coerenza della versione;
- presenza dei tre workflow PM;
- presenza di tutti gli agenti richiesti dalle fasi;
- mapping degli `agent_type` ammessi;
- collisioni con agenti project/user/plugin conosciuti;
- integrità del manifest e degli hash;
- disponibilità dell'Execution Ledger;
- assenza di entry point legacy nei file runtime installati.

Il risultato del preflight deve essere persistito nell'Execution Ledger prima di avviare il
primo agente:

```text
agent_preflight_started
agent_preflight_passed | agent_preflight_failed
```

I dettagli minimi comprendono versione toolkit, modalità locale/globale, agenti richiesti,
identità risolte e collisioni. Non devono essere registrati path contenenti segreti.

## Integrazione con l'Execution Ledger

Ogni evento relativo a un'invocazione deve identificare l'agente con dati stabili:

```json
{
  "agentId": "gaia.agent.developer.backend",
  "nativeAgentName": "gaia-developer-backend",
  "platform": "claude",
  "toolkitVersion": "0.13.0",
  "resolutionScope": "project",
  "definitionHash": "sha256:..."
}
```

La FTR-017 non sostituisce il lifecycle introdotto dalla FTR-016. Aggiunge provenienza e
identità agli eventi e garantisce che l'apertura nel ledger avvenga prima del dispatch.

La regola è:

```text
preflight persistito
    → agent_started persistito
    → dispatch
    → agent_completed | agent_failed | agent_interrupted
```

Se `agent_started` non può essere persistito, l'agente non parte. Se lo stato terminale non
può essere persistito, la pipeline si ferma.

## CLI

Estendere la CLI con comandi indicativi:

```bash
ai-toolkit agents list --project <dir> --format json
ai-toolkit agents resolve --project <dir> --id <canonical-id>
ai-toolkit agents preflight --project <dir> --pipeline implement-feature
ai-toolkit doctor agents --project <dir>
ai-toolkit agents cleanup --project <dir> --dry-run
```

### `agents list`

Elenca esclusivamente le identità registrate dal toolkit e la relativa disponibilità.

### `agents resolve`

Restituisce una sola definizione verificata oppure exit code non zero. Lo stdout deve essere
machine-readable; warning e diagnostica vanno su stderr.

### `agents preflight`

Valida l'intero set richiesto dalla pipeline senza effettuare dispatch.

### `doctor agents`

Produce una vista leggibile di:

- agenti toolkit installati;
- scope e path di provenienza;
- versione e integrità;
- collisioni;
- agenti globali estranei potenzialmente interferenti;
- riferimenti legacy;
- remediation suggerita.

È sempre read-only.

### `agents cleanup --dry-run`

Elenca soltanto asset obsoleti attribuibili con certezza a vecchie installazioni del toolkit.
La rimozione effettiva deve richiedere un comando esplicito, utilizzare manifest e trash
recuperabile e non deve mai cancellare agenti user-owned o appartenenti ad altri strumenti.

## Politica degli scope

Politica target:

| Scope | Uso ammesso |
|---|---|
| Sessione | set esplicito e verificato per esecuzioni controllate |
| Progetto | installazione locale intenzionale del toolkit |
| Globale utente | sola installazione globale namespaced del toolkit |
| Plugin | adapter o asset esplicitamente registrati |
| File estranei | mai selezionati dal toolkit |

Un generico `project-manager.md` globale non deve essere considerato parte del toolkit. Il
doctor può segnalarlo come collisione o rischio, ma non può eliminarlo senza autorizzazione.

L'installer globale deve distribuire soltanto agenti namespaced e registrati. L'upgrade deve
riconoscere tramite manifest i precedenti asset toolkit con nomi legacy e proporne la
migrazione o il cleanup recuperabile.

## Compatibilità multipiattaforma

La FTR-017 viene implementata inizialmente per Claude, ma il dominio non deve dipendere dai
concetti specifici di Claude Code.

Il core utilizza:

```text
canonical agent ID
role
capabilities
pipeline phase
provenance
version
integrity
```

Gli adapter traducono questi concetti:

```text
ClaudeAdapter
    canonical ID → subagent/workflow name

CodexAdapter
    canonical ID → skill/subagent execution contract

CopilotAdapter
    canonical ID → Copilot agent/instruction mechanism
```

In questa feature è incluso soltanto l'adapter Claude funzionante. Per Codex e GitHub
Copilot devono essere definiti interface e fixture contrattuali, non implementazioni runtime
complete.

## Gestione della compatibilità

La prima versione deve poter leggere Work Breakdown che contengono gli attuali `agent_type`:

```text
developer-backend
developer-frontend
developer-testing
```

Questi valori vengono mappati deterministicamente agli ID canonici. Valori sconosciuti
producono errore e non vengono passati direttamente alla piattaforma.

Il mapping legacy deve essere:

- esplicito;
- versionato;
- privo di fuzzy matching;
- coperto da test;
- accompagnato da warning di deprecazione quando opportuno.

## Sequenza di implementazione richiesta

Il Work Breakdown deve suddividere la feature in task piccoli e con singolo output,
preferibilmente in questo ordine:

1. inventario deterministico degli agenti, workflow e riferimenti legacy esistenti;
2. definizione degli ID canonici e del catalogo;
3. test contrattuali del registry;
4. implementazione delle funzioni pure del registry;
5. modello di provenienza e verifica del manifest;
6. hashing e controllo di integrità;
7. detection delle collisioni tra scope;
8. adapter Claude;
9. comando `agents list`;
10. comando `agents resolve`;
11. comando `doctor agents` read-only;
12. comando `agents preflight`;
13. integrazione del preflight in `/implement-feature`;
14. guardia obbligatoria prima di `pm-phase1`, `pm-phase2` e `pm-phase3`;
15. rimozione di ogni fallback a `project-manager`;
16. correzione dei riferimenti `/agent-project-manager` obsoleti;
17. estensione degli eventi Execution Ledger con identità e provenienza;
18. aggiornamento del catalogo e dell'installer globale;
19. migrazione controllata dei nomi legacy toolkit;
20. cleanup in modalità `--dry-run`;
21. test E2E con agente globale omonimo estraneo;
22. test E2E con versioni locale/globale differenti;
23. test E2E che dimostra il mancato dispatch dopo un preflight fallito;
24. documentazione della policy e della remediation.

I cambi di naming, la logica di risoluzione e l'integrazione nei workflow devono essere task
distinti. Nessun task deve comprendere contemporaneamente registry, installer, workflow e
test E2E.

## Scenari di test obbligatori

1. sola installazione locale coerente;
2. sola installazione globale coerente;
3. agente globale estraneo con nome `project-manager`;
4. agente globale estraneo omonimo a un worker legacy;
5. agente locale toolkit e agente globale estraneo omonimo;
6. due installazioni toolkit con versioni differenti;
7. manifest mancante, corrotto o obsoleto;
8. file toolkit modificato dopo l'installazione;
9. agente richiesto assente;
10. agent type del Work Breakdown sconosciuto;
11. mapping legacy valido;
12. riferimento obsoleto a `/agent-project-manager`;
13. `pm-phase3` assente o non esposto;
14. preflight fallito senza alcun `agent_started` successivo;
15. impossibilità di scrivere il ledger prima del dispatch;
16. set completo valido con dispatch consentito;
17. path Windows con spazi;
18. home temporanea: la home reale non viene consultata nei test;
19. cleanup dry-run che non modifica file;
20. agente user-owned non presente nel manifest, mai cancellato.

Il test principale di regressione deve creare una home temporanea contenente un falso
`project-manager.md` di una vecchia soluzione e dimostrare che:

- il doctor lo segnala;
- il registry non lo associa a un ID toolkit;
- `/implement-feature` non lo invoca;
- se può interferire con la risoluzione, la pipeline si ferma prima del dispatch;
- nessun evento di completamento fittizio viene scritto nel ledger.

## Criteri di accettazione

1. Ogni agente toolkit possiede un ID canonico univoco e namespaced.
2. Gli orchestratori e i Work Breakdown utilizzano ID canonici o mapping legacy espliciti.
3. La risoluzione è implementata in JavaScript senza decisioni LLM.
4. Il registry restituisce una sola definizione verificata oppure un errore.
5. Non esiste fuzzy matching o fallback verso agenti simili.
6. `/implement-feature` è l'unico entry point della pipeline completa.
7. Dopo Gate 2 viene invocato esclusivamente il `pm-phase3` verificato.
8. L'assenza di `pm-phase3` produce hard stop e nessun dispatch alternativo.
9. Agenti di progetti precedenti non possono essere selezionati dal toolkit.
10. Collisioni e versioni miste vengono rilevate prima del primo dispatch.
11. Manifest e hash dimostrano la provenienza dell'agente.
12. Un file modificato dopo l'installazione viene segnalato come non verificato.
13. `doctor agents` mostra scope, versione, provenienza e collisioni.
14. Il doctor è read-only.
15. Il cleanup predefinito è dry-run e non elimina file.
16. File user-owned o estranei al manifest non vengono mai eliminati automaticamente.
17. Tutti i riferimenti runtime a `/agent-project-manager` vengono rimossi.
18. Un test statico ne impedisce la reintroduzione.
19. Il preflight viene registrato nell'Execution Ledger.
20. `agent_started` viene persistito prima del dispatch.
21. Gli eventi agente includono ID canonico, piattaforma, versione, scope e hash.
22. Un errore di persistenza del ledger impedisce il dispatch.
23. Gli attuali agent type del Work Breakdown restano compatibili tramite mapping esplicito.
24. Agent type sconosciuti vengono rifiutati.
25. L'installer globale distribuisce soltanto agenti registrati e namespaced.
26. I test non consultano o modificano la home reale.
27. La suite E2E dimostra che un falso `project-manager` globale non viene invocato.
28. Core registry e provenance guard non dipendono dalle API Claude.
29. L'adapter Claude è operativo.
30. Le interface per futuri adapter Codex e Copilot sono documentate e testate come contratto.

## Incluso

- ID canonici e namespace;
- agent registry deterministico;
- provenance guard;
- verifica di manifest, versione e hash;
- detection delle collisioni;
- adapter Claude;
- mapping legacy degli agent type esistenti;
- comandi CLI list, resolve, preflight e doctor;
- orchestrator guard per `/implement-feature` e `pm-phase1/2/3`;
- rimozione dei fallback a `project-manager`;
- correzione dei riferimenti legacy;
- integrazione con l'Execution Ledger;
- policy installer per agenti globali;
- cleanup dry-run e remediation guidata;
- test statici, unitari, di integrazione ed E2E;
- interface contrattuale per adapter futuri.

## Escluso

- implementazione completa degli adapter Codex e GitHub Copilot;
- Task Checkpoints and Resume;
- esecuzione task-by-task;
- commit per task;
- worktree paralleli;
- supporto effettivo a `maxConcurrency > 1`;
- eliminazione automatica di agenti user-owned;
- modifica della configurazione personale senza comando esplicito;
- fuzzy matching dei ruoli;
- fallback automatici;
- redesign funzionale degli agenti developer;
- sostituzione dell'Execution Ledger;
- migrazione completa della v2 multipiattaforma.

## Dipendenze e impatto sulla roadmap

- utilizza l'asset catalog e il resolver runtime introdotti dalla FTR-015;
- utilizza l'Execution Ledger rilasciato con la FTR-016 e toolkit `0.12.0`;
- deve essere completata prima di Task Checkpoints and Resume;
- fornisce il seam sul quale gli executor futuri effettueranno il dispatch;
- prepara la separazione tra core multipiattaforma e adapter Claude/Codex/Copilot;
- non modifica retroattivamente gli artifact approvati delle feature precedenti.

## Risultato atteso

Al termine della FTR-017, l'esecuzione non dipenderà più dalla speranza che il nome corretto
venga risolto dalla piattaforma.

Per ogni invocazione sarà possibile rispondere in modo deterministico a quattro domande:

```text
Quale agente è stato richiesto?
Da quale installazione proviene?
Con quale versione e contenuto è stato eseguito?
Quale orchestratore ne ha autorizzato il dispatch?
```

Se anche una sola risposta manca o risulta ambigua, nessun agente verrà avviato.
