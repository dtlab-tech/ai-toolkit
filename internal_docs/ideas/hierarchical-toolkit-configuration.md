# Hierarchical AI Toolkit Configuration

## Contesto

L'AI Toolkit utilizza attualmente convenzioni e percorsi noti agli agenti, come la cartella che contiene i dossier delle feature. Nei normali progetti il percorso ufficiale è `docs/features`, mentre il repository del toolkit utilizza intenzionalmente `internal_docs/features` per poter sviluppare il toolkit con il toolkit stesso senza confondere la documentazione interna con i contenuti distribuiti nel pacchetto npm.

Con l'introduzione della documentazione current-state emergeranno altri valori configurabili, per esempio:

- radice della documentazione;
- directory delle feature;
- directory della documentazione current-state;
- directory delle idee;
- lingua predefinita dei documenti.

Questi valori non devono essere hardcoded nei singoli agenti e non devono essere risolti tramite ragionamento LLM. La loro risoluzione è una logica deterministica che deve essere centralizzata, validata e testata.

## Obiettivo

Introdurre un sistema gerarchico di configurazione dell'AI Toolkit con tre livelli:

```text
Default distribuiti dal toolkit
        ↓ sovrascritti da
Configurazione globale dell'utente
        ↓ sovrascritta da
Configurazione del progetto
```

La precedenza deve essere:

```text
project > global > toolkit defaults
```

Un resolver JavaScript deterministico deve leggere i livelli disponibili, validarli, applicare la precedenza, calcolare i valori effettivi e restituire anche la provenienza di ciascun valore.

`hi-gaia` deve utilizzare il resolver per presentare la configurazione all'utente e consentire la creazione di override specifici per il progetto. L'LLM gestisce solamente la conversazione e la conferma; non implementa merge, validazione o scrittura dei file JSON.

## Principi

### Risoluzione deterministica

Tutta la logica di configurazione deve essere implementata in JavaScript. A parità di file di input, il resolver deve produrre sempre lo stesso risultato.

### Un solo resolver centrale

Gli agenti e i workflow non devono leggere autonomamente i file di configurazione né implementare proprie regole di fallback. Devono consumare il risultato prodotto da un unico modulo.

### Override minimi

I file globale e di progetto devono contenere soltanto i valori realmente sovrascritti. Non devono essere copie complete dei default.

Per esempio, nel repository dell'AI Toolkit deve essere sufficiente:

```json
{
  "documentation": {
    "root": "internal_docs"
  }
}
```

Tutti gli altri valori continuano a essere ereditati dai livelli inferiori.

### Configurazione senza segreti

I file di configurazione devono contenere esclusivamente convenzioni condivisibili. Password, token, connection string e altri segreti sono fuori scope.

### Validazione esplicita

Un file esistente ma non valido non deve essere ignorato silenziosamente. Il resolver deve fallire con un messaggio che identifichi file, proprietà e motivo dell'errore.

## Livelli di configurazione

### Default del toolkit

I default sono distribuiti con il pacchetto e non sono modificati dall'utente.

Percorso indicativo:

```text
config/defaults.json
```

Configurazione iniziale proposta:

```json
{
  "schemaVersion": 1,
  "documentation": {
    "root": "docs",
    "featuresDirectory": "features",
    "currentDirectory": "current",
    "ideasDirectory": "ideas",
    "language": "en"
  }
}
```

### Configurazione globale

La configurazione globale è opzionale e contiene le preferenze applicabili a tutti i progetti dell'utente.

Percorso proposto:

```text
~/.claude/ai-toolkit.config.json
```

Esempio:

```json
{
  "documentation": {
    "language": "en"
  }
}
```

Il file globale è user-owned e non deve essere sovrascritto durante installazione o aggiornamento del toolkit.

### Configurazione del progetto

La configurazione del progetto è opzionale e contiene le convenzioni condivise specifiche del repository.

Percorso proposto:

```text
<project>/.claude/ai-toolkit.config.json
```

Il file dovrebbe essere versionato in Git. Nel repository dell'AI Toolkit consentirebbe di dichiarare l'eccezione di self-hosting:

```json
{
  "documentation": {
    "root": "internal_docs"
  }
}
```

La configurazione personale non versionata, come `.claude/ai-toolkit.config.local.json`, è differita a una possibile evoluzione futura.

## Configurazione effettiva

Nel repository del toolkit, con il solo override di `documentation.root`, il risultato dovrebbe essere equivalente a:

```text
documentation.root              = internal_docs  ← project
documentation.featuresDirectory = features       ← default
documentation.currentDirectory  = current        ← default
documentation.ideasDirectory    = ideas          ← default
documentation.language          = en             ← default/global
```

Percorsi derivati:

```text
internal_docs/features
internal_docs/current
internal_docs/ideas
```

In un progetto senza override:

```text
docs/features
docs/current
docs/ideas
```

## Resolver JavaScript

### Responsabilità

Il resolver deve:

1. leggere i default incorporati;
2. leggere la configurazione globale, se presente;
3. leggere la configurazione del progetto, se presente;
4. validare ciascun livello;
5. applicare il merge con precedenza `project > global > default`;
6. calcolare la provenienza di ogni valore;
7. calcolare e validare i percorsi derivati;
8. restituire un risultato strutturato;
9. non modificare alcun file durante la risoluzione.

### Struttura proposta

```text
Fincantieri.CommonLibraries.AIToolkit/
├── config/
│   └── defaults.json
├── lib/
│   └── config-resolver.js
├── bin/
│   └── cli.js
└── tests/
    └── cli/
        └── config-resolver.test.js
```

`lib/config-resolver.js` costituisce il modulo che nasconde merge, validazione, calcolo della provenienza e sicurezza dei percorsi. `bin/cli.js` è l'adapter da linea di comando.

### Interface proposta

```javascript
const {
  resolveConfig,
  setProjectOverride,
  unsetProjectOverride,
} = require('../lib/config-resolver');
```

Risoluzione:

```javascript
const result = resolveConfig({
  projectDir: 'C:\\ws\\my-project',
  homeDir: 'C:\\Users\\user'
});
```

Risultato indicativo:

```javascript
{
  effective: {
    schemaVersion: 1,
    documentation: {
      root: 'internal_docs',
      featuresDirectory: 'features',
      currentDirectory: 'current',
      ideasDirectory: 'ideas',
      language: 'en'
    }
  },
  sources: {
    'documentation.root': 'project',
    'documentation.featuresDirectory': 'default',
    'documentation.currentDirectory': 'default',
    'documentation.ideasDirectory': 'default',
    'documentation.language': 'global'
  },
  paths: {
    documentationRoot: 'C:\\ws\\my-project\\internal_docs',
    features: 'C:\\ws\\my-project\\internal_docs\\features',
    current: 'C:\\ws\\my-project\\internal_docs\\current',
    ideas: 'C:\\ws\\my-project\\internal_docs\\ideas'
  },
  files: {
    defaults: '<toolkit>/config/defaults.json',
    global: 'C:\\Users\\user\\.claude\\ai-toolkit.config.json',
    project: 'C:\\ws\\my-project\\.claude\\ai-toolkit.config.json'
  }
}
```

### Algoritmo indicativo

```javascript
function resolveConfig({ projectDir, homeDir }) {
  const defaults = readRequiredJson(DEFAULTS_PATH);
  const globalConfig = readOptionalJson(
    path.join(homeDir, '.claude', 'ai-toolkit.config.json')
  );
  const projectConfig = readOptionalJson(
    path.join(projectDir, '.claude', 'ai-toolkit.config.json')
  );

  validateConfig(defaults, 'default');
  validateConfig(globalConfig, 'global');
  validateConfig(projectConfig, 'project');

  const effective = deepMerge(defaults, globalConfig, projectConfig);
  const sources = calculateSources(defaults, globalConfig, projectConfig);
  const paths = calculateAndValidatePaths(
    projectDir,
    effective.documentation
  );

  return {
    effective,
    sources,
    paths,
    files: resolveConfigFiles(projectDir, homeDir)
  };
}
```

L'implementazione può essere sincrona: i file sono piccoli, la risoluzione avviene all'avvio di operazioni del toolkit e il progetto utilizza già Node.js/CommonJS.

## Validazione

La prima versione deve validare almeno:

- sintassi JSON;
- `schemaVersion` supportata;
- proprietà conosciute;
- tipi dei valori;
- stringhe non vuote;
- path relativi;
- assenza di segmenti `..`;
- assenza di path assoluti;
- contenimento dei percorsi risultanti nel progetto.

Esempio di errore:

```text
ConfigurationError:
Invalid value for "documentation.root" in project configuration.
Expected a relative path inside the project, received "../shared".
```

Le proprietà sconosciute devono produrre un errore per evitare che un refuso venga ignorato:

```json
{
  "documentation": {
    "featureDirectory": "features"
  }
}
```

Se la proprietà prevista è `featuresDirectory`, il resolver deve segnalarlo esplicitamente.

## Comandi CLI

### Risoluzione machine-readable

```bash
node bin/cli.js config resolve --project .
```

L'output deve essere JSON e includere almeno `effective`, `sources` e `paths`.

### Visualizzazione human-readable

```bash
node bin/cli.js config show --project .
```

Esempio:

```text
AI Toolkit — Effective Project Configuration

| Setting                         | Effective value | Source  |
|---------------------------------|-----------------|---------|
| documentation.root              | docs            | default |
| documentation.featuresDirectory | features        | default |
| documentation.currentDirectory  | current         | default |
| documentation.ideasDirectory    | ideas           | default |
| documentation.language          | en              | global  |

Computed paths:
  Features: docs/features
  Current:  docs/current
  Ideas:    docs/ideas
```

### Impostazione di un override

```bash
node bin/cli.js config set \
  --scope project \
  --project . \
  documentation.root internal_docs
```

### Rimozione di un override

```bash
node bin/cli.js config unset \
  --scope project \
  --project . \
  documentation.root
```

Dopo `unset`, il valore deve tornare a essere ereditato dal livello globale o dai default.

## Scrittura degli override

Anche la modifica dei file deve essere deterministica e gestita dallo script JavaScript.

`setProjectOverride` deve:

1. leggere il file esistente, se presente;
2. validarlo;
3. modificare soltanto la proprietà richiesta;
4. preservare gli altri override;
5. serializzare con indentazione stabile;
6. scrivere prima un file temporaneo nella stessa directory;
7. sostituire atomicamente il file originale;
8. rileggere e validare il risultato;
9. restituire il cambiamento effettuato.

Risultato indicativo:

```javascript
{
  changed: true,
  path: 'C:\\ws\\project\\.claude\\ai-toolkit.config.json',
  key: 'documentation.root',
  previousValue: undefined,
  newValue: 'internal_docs',
  previousSource: 'default',
  effectiveSource: 'project'
}
```

L'operazione deve essere idempotente: impostare nuovamente lo stesso valore deve restituire `changed: false` senza riscritture non necessarie.

## Integrazione con `hi-gaia`

`hi-gaia` deve introdurre un percorso `Project Configuration`.

Il flusso previsto è:

1. invocare `config resolve`;
2. mostrare valori effettivi e relativa provenienza;
3. spiegare brevemente il significato delle variabili;
4. chiedere se l'utente vuole configurare override per il progetto;
5. raccogliere i valori desiderati;
6. mostrare una preview della modifica;
7. chiedere conferma;
8. invocare `config set` o `config unset`;
9. invocare nuovamente `config resolve`;
10. mostrare il risultato finale.

Esempio di preview:

```diff
+ {
+   "documentation": {
+     "root": "internal_docs"
+   }
+ }
```

`hi-gaia` non deve:

- effettuare il merge dei livelli;
- decidere autonomamente la provenienza dei valori;
- modificare direttamente il JSON;
- ignorare errori di validazione;
- introdurre proprietà non conosciute dal resolver.

## Utilizzo da parte degli agenti

Gli agenti che lavorano sulla documentazione non devono assumere direttamente `docs/` o `internal_docs/`.

Devono utilizzare i percorsi risolti, per esempio:

```text
config.paths.features
config.paths.current
config.paths.ideas
```

Questo vale almeno per:

- `define-feature`;
- feature registry;
- implementazione delle feature;
- comandi di stato e navigazione delle feature;
- futuro bootstrap di `application-overview.md`;
- futura analisi dell'impatto documentale.

## Test

Il modulo deve essere verificato mediante test automatici con directory temporanee.

Casi minimi:

- risoluzione con soli default;
- global che sovrascrive default;
- project che sovrascrive global;
- override parziale;
- file globale assente;
- file di progetto assente;
- JSON malformato;
- chiave sconosciuta;
- tipo non valido;
- path assoluto;
- path contenente `..`;
- calcolo corretto dei path derivati;
- garanzia che i path rimangano nel progetto;
- `set` idempotente;
- `unset` con fallback al livello precedente;
- preservazione degli altri override;
- nessuna scrittura durante `resolveConfig`;
- serializzazione stabile e rilettura dopo la scrittura.

## Criteri di accettazione iniziali

La prima implementazione può considerarsi completata quando:

1. esiste un file di default distribuito dal toolkit;
2. il resolver legge correttamente default, global e project;
3. la precedenza è sempre `project > global > default`;
4. ogni valore risolto include la propria provenienza;
5. i percorsi documentali sono calcolati e validati;
6. gli errori di configurazione sono espliciti e deterministici;
7. esistono comandi CLI per `resolve`, `show`, `set` e `unset`;
8. `hi-gaia` presenta la configurazione e delega ogni modifica alla CLI;
9. il repository del toolkit può configurare `internal_docs` senza hardcoding negli agenti;
10. i normali progetti continuano a utilizzare `docs` senza configurazione aggiuntiva;
11. i test coprono risoluzione, validazione e aggiornamento degli override;
12. nessun modello LLM viene utilizzato per risolvere, validare o scrivere la configurazione.

## Perimetro della prima feature

### Incluso

- default incorporati nel toolkit;
- configurazione globale opzionale;
- configurazione di progetto opzionale;
- merge gerarchico;
- configurazione iniziale dei percorsi documentali;
- provenienza dei valori;
- validazione dei path;
- resolver JavaScript/CommonJS;
- comandi CLI deterministici;
- percorso di configurazione in `hi-gaia`;
- scrittura dei soli override;
- test automatici;
- utilizzo del resolver da parte degli agenti che dipendono dai percorsi documentali.

### Escluso

- configurazione personale non versionata;
- configurazione remota aziendale;
- policy centralizzate non sovrascrivibili;
- segreti;
- UI grafica;
- sincronizzazione con sistemi esterni;
- migrazioni automatiche complesse;
- editor generico di proprietà non dichiarate nello schema.

## Evoluzioni future

Possibili incrementi successivi:

- `.claude/ai-toolkit.config.local.json` non versionato;
- policy aziendali obbligatorie;
- schema JSON pubblicato per autocomplete e validazione negli editor;
- migrazione automatica tra versioni dello schema;
- configurazione centralizzata di organization/team;
- ulteriori sezioni oltre a `documentation`;
- comando diagnostico che mostri conflitti, override ridondanti e valori deprecati.
