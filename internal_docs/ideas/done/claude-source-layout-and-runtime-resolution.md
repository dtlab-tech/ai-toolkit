# Claude Source Layout and Runtime Resolution

## Identificazione proposta

Questa idea deve essere sviluppata come **FTR-015**, immediatamente dopo FTR-014 — Atomic
Work Breakdown.

## Sequenza

Diventa la seconda iniziativa della catena dedicata all'esecuzione resiliente:

```text
1. Atomic Work Breakdown — FTR-014
2. Claude Source Layout and Runtime Resolution — FTR-015
3. Deterministic Estimate Generation
4. Execution Ledger
5. Task Checkpoints and Resume
6. Isolated Parallel Task Execution
```

Deve precedere le altre evoluzioni perché tutte aggiungeranno o modificheranno script,
workflow, skill e agenti. Continuare a svilupparli direttamente sotto `.claude` manterrebbe
permission prompt continui e ambiguità tra definizioni locali e globali.

## Contesto

Il repository utilizza attualmente `.claude` contemporaneamente come:

- directory sorgente del toolkit;
- directory runtime scoperta automaticamente da Claude Code;
- payload copiato dall'installer nei progetti consumer;
- configurazione locale del repository che sviluppa il toolkit stesso.

Questa sovrapposizione crea due problemi strutturali.

### Directory protetta

Claude Code considera `.claude` una directory protetta. Le modifiche a
`.claude/scripts`, `.claude/workflows` e agli altri percorsi non esplicitamente esentati
richiedono conferma anche quando il progetto usa `acceptEdits` o regole `Edit`/`Write`.

Lo sviluppo del toolkit modifica continuamente proprio questi file, rendendo inevitabile la
permission fatigue.

### Risoluzione locale e globale

Quando il toolkit è installato globalmente in `~/.claude` ma il repository contiene anche
agenti, skill, comandi e workflow omonimi in `<project>/.claude`, Claude Code vede entrambe le
sorgenti e applica le proprie regole di precedenza.

Nel repository self-hosted questo rende difficile stabilire:

- quale versione di un agente sia stata effettivamente caricata;
- se si stia testando il sorgente corrente o una copia globale precedente;
- se un problema derivi dalla risoluzione o dall'implementazione;
- se una modifica locale sia già disponibile alla sessione corrente;
- se agenti e workflow provengano tutti dalla stessa versione.

## Decisione architetturale

Separare definitivamente **sorgenti**, **runtime installato** e **configurazione personale**.

```text
src/claude/
→ fonte autorevole versionata del toolkit

<consumer>/.claude/
→ runtime prodotto dall'installazione locale

~/.claude/
→ runtime prodotto dall'installazione globale

<toolkit-repo>/.claude/settings.local.json
→ sola configurazione personale ignorata da Git, se necessaria
```

Nel repository del toolkit non devono più esistere copie versionate di agenti, skill,
comandi, workflow o script sotto `.claude`.

## Layout sorgente target

```text
src/
└── claude/
    ├── agents/
    ├── commands/
    ├── skills/
    ├── workflows/
    └── scripts/
```

Non utilizzare `src/.claude`: una directory chiamata `.claude` resterebbe un percorso
protetto. Il nome sorgente deve essere esattamente `src/claude` o equivalente senza punto.

I contenuti non appartenenti al runtime Claude restano nelle directory appropriate:

```text
lib/                 moduli JavaScript riusabili
bin/                 adapter CLI
tests/               test, fixture, mock e helper test-only del toolkit
docs/procedures/     procedure documentali distribuite
internal_docs/       dossier e idee interne
```

`src/claude` deve contenere esclusivamente asset necessari all'esecuzione del toolkit. Non
devono essere presenti sotto `src/claude`, neppure all'interno di `scripts`:

- test Jest o altri file `*.test.js`;
- fixture e sample usati esclusivamente dai test;
- mock;
- helper e harness test-only;
- script di verifica che non appartengono al runtime distribuito.

Lo stamp `.ai-toolkit-version` non è un file sorgente: rappresenta lo stato di una specifica
installazione e continua a essere generato dall'installer esclusivamente nella destinazione
runtime.

## Classificazione obbligatoria prima della migrazione

La migrazione non deve spostare indiscriminatamente tutto il contenuto versionato di
`.claude` in `src/claude`. Ogni file deve essere classificato prima dello spostamento:

```text
.claude/{agents,commands,skills,workflows}/**
→ src/claude/{agents,commands,skills,workflows}/**

.claude/scripts/<asset-runtime>
→ src/claude/scripts/<asset-runtime>

.claude/scripts/tests/**
→ tests/**
```

Al momento della definizione dell'idea esistono 29 file versionati sotto
`.claude/scripts/tests`, comprendenti test, fixture, helper e script di verifica. Tutti devono
essere migrati nella gerarchia top-level `tests`, aggiornando import, path delle fixture,
configurazione Jest e comandi di verifica.

Qualunque file ambiguo, non chiaramente classificabile come runtime o test-only, produce un
hard stop e richiede una decisione esplicita: non deve essere copiato automaticamente in
entrambe le destinazioni.

## Fonte autorevole e divieto di dual-write

`src/claude` diventa l'unica fonte autorevole per gli asset Claude del pacchetto.

Non devono esistere copie mantenute manualmente sia in `src/claude` sia nella root
`.claude`. In particolare:

- gli agenti modificano esclusivamente `src/claude`;
- i test strutturali leggono esclusivamente `src/claude`;
- tutti i test, fixture, mock e helper test-only risiedono esclusivamente sotto `tests`;
- il packaging include esclusivamente `src/claude`;
- l'installer legge esclusivamente `src/claude`;
- `.claude` nei consumer viene generata soltanto dall'installer;
- nessuno script di build sincronizza automaticamente una seconda copia versionata nella
  root del repository.

## Packaging npm

`package.json` deve sostituire l'attuale inclusione di `.claude` con `src/claude`:

```json
{
  "files": [
    "bin",
    "lib",
    "src/claude",
    "docs",
    "CLAUDE.md",
    "CLAUDE.global.md"
  ]
}
```

Il pacchetto pubblicato conserva quindi i sorgenti runtime senza materializzare `.claude`
nel repository di sviluppo.

`npm pack --dry-run` deve verificare almeno:

- presenza di tutti gli agenti, skill, comandi, workflow e script previsti;
- assenza completa di `tests/**`;
- assenza di file `*.test.js`, fixture, mock e helper test-only sotto `src/claude`;
- assenza di `.claude/settings.json` e `.claude/settings.local.json`;
- assenza di `internal_docs` e altri artefatti interni non destinati al pacchetto;
- assenza di una seconda copia degli stessi asset.

La correzione introdotta al termine della FTR-014 esclude temporaneamente
`.claude/scripts/tests/**` tramite filtri dell'installer e del package. La FTR-015 deve
sostituire questa protezione basata sul vecchio layout con la separazione fisica delle
responsabilità e con un catalogo positivo degli asset runtime. Le esclusioni temporanee
diventate inutili devono essere rimosse, mentre devono restare regression test che
impediscano a qualunque asset test-only di entrare nuovamente nel package o
nell'installazione.

## Installer locale

L'installazione locale continua a produrre il layout runtime atteso da Claude Code:

```text
package/src/claude/**
→ <target>/.claude/**
```

La mapping principale di `bin/cli.js` diventa indicativamente:

```javascript
{
  src: path.join(packageRoot, 'src', 'claude'),
  dest: path.join(targetDir, '.claude')
}
```

Manifest, version stamp, conflitti, orphan detection, trash recuperabile e `NEVER_COPY`
devono continuare a funzionare rispetto al percorso di destinazione, non al percorso
sorgente.

## Installer globale

L'installazione globale copia le sottodirectory da `src/claude` verso `~/.claude`:

```text
package/src/claude/agents     → ~/.claude/agents
package/src/claude/skills     → ~/.claude/skills
package/src/claude/commands   → ~/.claude/commands
package/src/claude/workflows  → ~/.claude/workflows
package/src/claude/scripts    → ~/.claude/scripts
```

La lista non deve essere duplicata tra più funzioni. Un unico catalogo deterministico degli
asset installabili deve alimentare installazione locale, globale, manifest e test.

Il catalogo deve essere una allowlist di categorie e destinazioni runtime, non una copia
ricorsiva seguita da una lista crescente di eccezioni. Local e global installer devono
derivare dallo stesso catalogo sia il piano di installazione sia il contenuto del manifest.

## Risoluzione runtime locale/globale

La migrazione risolve l'ambiguità nel repository del toolkit perché `src/claude` non viene
scoperta automaticamente da Claude Code.

Regole target:

1. nel repository del toolkit, gli agenti runtime provengono dall'installazione globale;
2. in un progetto consumer con installazione locale, `<project>/.claude` è intenzionalmente
   la sorgente runtime del progetto e può prevalere sulla versione globale;
3. nessun repository deve contenere involontariamente entrambe le copie prodotte dal toolkit;
4. la provenienza effettiva deve essere diagnosticabile;
5. agenti, skill, workflow e script usati nella stessa pipeline devono appartenere a una
   versione coerente del toolkit.

## Diagnostica della provenienza

Estendere la CLI con un comando indicativo:

```bash
node bin/cli.js doctor resolution --project .
```

Output minimo:

```text
Toolkit source:       C:\...\node_modules\@dtlabs\ai-toolkit\src\claude
Local runtime:        not installed
Global runtime:       C:\Users\user\.claude
Effective mode:       global
Toolkit version:      1.2.3
Duplicate agents:     none
Mixed versions:       no
```

Il comando deve rilevare:

- toolkit installato soltanto localmente;
- toolkit installato soltanto globalmente;
- copie presenti in entrambe le posizioni;
- agenti omonimi con contenuti o versioni differenti;
- workflow che dipendono da script mancanti;
- version stamp o manifest incoerenti;
- asset locali residui nel repository self-hosted dopo la migrazione.

La diagnostica è read-only e non elimina o sovrascrive file.

## Risoluzione degli script runtime

I riferimenti a script devono distinguere il percorso sorgente dal percorso installato:

```text
Authoring/test path: src/claude/scripts/<script>.js
Local runtime path:  <project>/.claude/scripts/<script>.js
Global runtime path: ~/.claude/scripts/<script>.js
```

Non hardcodare `.claude/scripts` come se fosse sempre locale. Un resolver JavaScript deve
determinare il runtime asset coerente con la modalità effettiva:

```javascript
resolveClaudeRuntimeAsset({
  projectDir,
  relativePath: 'scripts/wb-validate.js'
});
```

Ordine proposto:

1. runtime locale valido e completo, se il progetto è installato localmente;
2. runtime globale valido e completo;
3. errore esplicito con diagnostica.

Non mescolare singoli asset locali e globali nella stessa pipeline. La risoluzione avviene a
livello di installazione/versione, non file per file.

## Self-hosting e ciclo di sviluppo

Il repository del toolkit usa il toolkit globale per orchestrare il proprio sviluppo, ma le
modifiche in `src/claude` non devono diventare runtime implicitamente.

Flusso raccomandato:

```text
modifica src/claude
→ test
→ npm pack --dry-run
→ installazione/sync globale esplicita
→ nuova sessione Claude per il test end-to-end
```

Un eventuale comando di sviluppo:

```bash
npm run toolkit:dev-install-global
```

deve essere:

- esplicito, mai eseguito automaticamente da test o pre-commit;
- deterministico;
- preceduto da dry-run e riepilogo;
- compatibile con manifest e backup recuperabile;
- seguito da verifica della versione installata;
- documentato come modifica della configurazione globale dell'utente.

## Permission model

Dopo la migrazione, le attività normali modificano `src/claude`, che non è un protected path.
Con `acceptEdits`, Claude Code può quindi creare e aggiornare i sorgenti senza una conferma per
ogni file.

Le scritture nei runtime `.claude` restano concentrate in un comando installer esplicito. Il
vantaggio non consiste nell'aggirare la protezione, ma nel ridurre centinaia di modifiche
interattive a una singola operazione deterministica e verificabile.

## Migrazione

La feature deve:

1. inventariare tutti gli asset versionati sotto `.claude`;
2. classificare ogni file come runtime, test-only, configurazione personale o ambiguo;
3. spostare gli asset runtime con conservazione della cronologia in `src/claude`;
4. spostare `.claude/scripts/tests/**` con conservazione della cronologia in `tests/**`;
5. aggiornare import, path delle fixture, configurazione Jest e comandi di verifica;
6. non spostare `settings.json` o `settings.local.json`;
7. aggiornare package manifest e installer;
8. sostituire i filtri temporanei FTR-014 con il catalogo positivo degli asset runtime;
9. distinguere nei testi i path di authoring dai path runtime;
10. aggiornare workflow e resolver degli script;
11. rimuovere le copie versionate residue sotto `.claude`;
12. verificare installazioni locali e globali in directory temporanee;
13. verificare l'upgrade da installazioni precedenti che contengono test nel manifest;
14. verificare il contenuto effettivo del tarball npm;
15. eseguire la diagnostica di risoluzione sul repository self-hosted;
16. documentare il nuovo ciclo di sviluppo.

La migrazione non deve cancellare `.claude/settings.local.json` personale né includerlo in
Git. Qualunque file non attribuibile al toolkit produce hard stop invece di essere spostato o
eliminato automaticamente.

Gli artifact storici delle FTR già approvate non devono essere riscritti in massa soltanto
per sostituire i vecchi path. Devono essere aggiornati i sorgenti eseguibili, i test e la
documentazione corrente destinata agli utilizzatori; i documenti storici restano immutati,
salvo che siano essi stessi input runtime ancora consumati dalla pipeline.

Per preservare la leggibilità della cronologia, gli spostamenti devono essere effettuati in
modo riconoscibile da Git e senza mescolare nello stesso task modifiche funzionali non
necessarie.

## Aggiornamenti ai test

I test che oggi assumono `.claude` come sorgente devono utilizzare `src/claude`, inclusi:

- validazione frontmatter degli agenti;
- validazione frontmatter delle skill;
- test di presenza e naming;
- test dei workflow;
- fixture e script FTR-014;
- installer locale e globale;
- manifest/orphan handling;
- `npm pack --dry-run`.

I 29 file attualmente sotto `.claude/scripts/tests` devono invece essere eseguiti dalla
gerarchia top-level `tests`, senza creare una nuova directory `src/claude/scripts/tests`.

Servono inoltre test specifici per:

- assenza di asset versionati nella root `.claude`;
- assenza di test, fixture, mock e helper test-only sotto `src/claude`;
- presenza di tutti i test del toolkit sotto la gerarchia top-level `tests`;
- assenza completa di `tests/**` dal tarball npm;
- catalogo unico degli asset installabili;
- equivalenza tra payload sorgente e destinazione installata;
- rilevamento di installazioni duplicate o miste;
- risoluzione atomica locale oppure globale;
- errore quando uno script richiesto manca nella modalità selezionata;
- preservazione dei file user-owned;
- cleanup tramite manifest e trash dei test installati da versioni precedenti, senza
  eliminare file utente non registrati.

## Sequenza di implementazione richiesta

Per mantenere la lavorazione controllabile e coerente con l'Atomic Work Breakdown, il Work
Breakdown della FTR-015 deve organizzare l'implementazione in fasi sequenziali:

1. inventario e classificazione deterministica dei file;
2. migrazione dei test e aggiornamento della suite;
3. migrazione degli asset runtime in `src/claude`;
4. aggiornamento del packaging npm;
5. aggiornamento degli installer e del cleanup delle installazioni precedenti;
6. resolver atomico locale/globale;
7. comando read-only `doctor resolution`;
8. self-hosting esplicito e documentazione corrente.

Ogni task deve produrre un singolo risultato verificabile. Gli spostamenti meccanici devono
essere separati dalle successive modifiche di comportamento, così eventuali regressioni
sono localizzabili e i checkpoint restano recuperabili.

## Criteri di accettazione

1. Tutti gli asset Claude versionati hanno fonte autorevole sotto `src/claude`.
2. Non esistono agenti, skill, comandi, workflow o script versionati nella root `.claude`.
3. `src/.claude` non viene creato.
4. Claude Code non scopre automaticamente i sorgenti come configurazione locale.
5. L'installer locale copia `src/claude` in `<target>/.claude`.
6. L'installer globale copia tutti gli asset previsti in `~/.claude`, inclusi gli script.
7. Local e global installer usano lo stesso catalogo di asset.
8. `settings.json` e `settings.local.json` non vengono mai copiati o sovrascritti.
9. Il package npm include `src/claude` e non include una copia root `.claude`.
10. Nessun test, fixture, mock o helper test-only è presente sotto `src/claude`.
11. Tutti i test del toolkit risiedono sotto la gerarchia top-level `tests`.
12. Il package npm non contiene `tests/**` né altri asset test-only.
13. Le installazioni locale e globale non contengono asset test-only.
14. L'upgrade gestisce tramite manifest e trash i test distribuiti da versioni precedenti.
15. Tutti i test strutturali leggono `src/claude`.
16. I riferimenti runtime agli script funzionano sia con installazione locale sia globale.
17. Una pipeline non mescola asset locali e globali.
18. La CLI diagnostica provenienza, duplicati e versioni miste.
19. Il repository self-hosted usa una sola sorgente runtime effettiva.
20. Le normali modifiche ai sorgenti non richiedono write dentro un protected path.
21. L'installazione globale di sviluppo è sempre esplicita e verificabile.
22. `npm test` e `npm pack --dry-run` completano con successo.
23. README, installation guide, reference e AGENTS.md descrivono il nuovo layout.

## Incluso

- migrazione `.claude` → `src/claude` dei soli asset versionati;
- migrazione `.claude/scripts/tests/**` → `tests/**` di test, fixture e helper test-only;
- nuovo layout sorgente;
- aggiornamento del packaging npm;
- aggiornamento installer locale e globale;
- catalogo unico degli asset;
- resolver runtime locale/globale;
- diagnostica della provenienza;
- aggiornamento dei test;
- aggiornamento della documentazione;
- ciclo di self-hosting esplicito;
- rimozione delle copie runtime locali dal repository del toolkit;
- cleanup recuperabile degli asset test-only installati dalle versioni precedenti.

## Escluso

- modifica dei contenuti funzionali degli agenti;
- redesign dei workflow pm-phase1/2/3;
- Execution Ledger;
- checkpoint per task;
- parallelismo tramite worktree;
- sostituzione dell'installer con un plugin Claude Code;
- installazione globale automatica durante test, build o commit;
- modifica o cancellazione automatica della configurazione personale dell'utente.

## Dipendenze e impatto sulla roadmap

- segue FTR-014 senza modificarne il contratto del Work Breakdown;
- diventa FTR-015;
- Deterministic Estimate Generation deve usare `src/claude/scripts` come percorso sorgente;
- Execution Ledger, Task Checkpoints and Resume e Isolated Parallel Task Execution devono
  essere sviluppate soltanto dopo questa migrazione;
- i riferimenti provvisori a numeri FTR futuri presenti nei dossier già approvati restano
  storici e non richiedono modifiche retroattive.
