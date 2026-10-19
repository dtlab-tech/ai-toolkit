# Work Breakdown — Disciplina di Scope tra Fasi (Layered Architecture vs Vertical Slice)

## Contesto

Osservato ripetutamente durante la generazione reale di un Work Breakdown (`gaia-generate-work-breakdown`) per una feature multi-microservizio con backend .NET, in una serie di tentativi successivi sullo stesso progetto consumer, ciascuno corretto solo parzialmente dal successivo:

1. **Primo sintomo — implementazione duplicata fra fasi.** Un comportamento già costruito per intero in una fase derivata da una UC (es. validazione dell'`aud` claim in `IdentityController`, costruita come parte di `US-01`) veniva ridescritto come nuovo task di implementazione in una fase successiva derivata dalla UC che tratta esplicitamente quel comportamento (`US-10`, "Reject OBO token with wrong audience") — stesso file, stesso outcome, task diverso. Corretto solo per l'istanza specifica mostrata nel prompt come esempio; ricomparso su altre coppie AC/fase al tentativo successivo (seeding del registry, validazione OBO real-mode, ecc.).
2. **Secondo sintomo — fase di test trasversale non autorizzata.** Il generatore ha introdotto di propria iniziativa una fase finale ("Testing and verification" / "Complete end-to-end integration and manual verification") che cita Acceptance Criteria di quasi tutte le altre fasi. Vietata esplicitamente nel prompt — il tentativo successivo l'ha rigenerata identica, solo rinominata.
3. **Terzo sintomo — sovraccarico sistemico della prima fase.** Con il generatore portato da `haiku` a `sonnet` (risolve la validazione strutturale), il validator *semantico* ha segnalato che la fase `US-01` (la cui UC-01 originale ha per scope solo "compila ed esegui in locale": `dotnet build`, `npm install`, `dotnet run`) conteneva 12 task su 14 — l'intero service layer applicativo: entità, DTO, interfacce e implementazioni dell'OBO exchanger (mock e Azure reale), l'orchestrator, il mapping, la registrazione DI, la configurazione JWT Bearer. Nessuno di questi task citava un AC fuori scope (`acceptanceCriteria: []` su tutti) — la validazione strutturale (`wb-validate.js`) era pulita — ma il *contenuto* di quei task corrisponde funzionalmente a comportamento di cui altre UC sono esplicitamente responsabili (OBO exchange, bearer enforcement, audience validation, fail-fast su credenziali mancanti, seeding del registry).

## Problema

Il modello generatore, anche a un tier più capace, costruisce in modo naturale un service layer completo e funzionante il prima possibile (istinto ingegneristico ragionevole: serve perché la soluzione compili e giri), e lo colloca quasi interamente nella prima fase conveniente — tipicamente quella "fondazionale" derivata dalla UC più generica (build/avvio locale). Le fasi successive, ciascuna derivata da una UC specifica con i propri Acceptance Criteria, finiscono quindi per essere "sottili" (solo controller/wiring + verifica) o, nei tentativi meno riusciti, per ridescrivere da capo lo stesso comportamento già costruito a monte.

Il prompt attuale di `gaia-generate-work-breakdown` (si veda [`atomic-work-breakdown.md`](done/atomic-work-breakdown.md), FTR-014) non distingue esplicitamente:
- cosa appartiene a una fase di scaffolding/fondazione condivisa (oggi solo `INFRA`, esplicitamente limitata a configurazione/env-var/manifest/auth-setup/script — non a logica di business);
- cosa appartiene a una fase UC-specifica ma è di natura trasversale/di servizio condiviso (es. un exchanger OBO usato da più endpoint);
- cosa deve restare strettamente nel perimetro dichiarato dalla UC che origina la fase (es. `UC-01` è letteralmente solo build+avvio, non implementazione di servizi applicativi).

Senza questa distinzione esplicita, correggere un singolo sintomo con una regola testuale in più (anti-pattern, esempio concreto, divieto di un pattern specifico) si è dimostrato un rimedio che non generalizza: il modello soddisfa la lettera della regola sull'esempio dato e la viola di nuovo su un caso isomorfo ma non testualmente identico.

## Obiettivo

Una guida di decomposizione che permetta al generatore di costruire un'architettura a livelli (servizi condivisi prima, endpoint/wiring dopo) **senza** che questo si traduca in:
- task di una fase che implementano per intero comportamento di cui un'altra UC è responsabile;
- duplicazione dello stesso outcome/file fra una fase "fondazionale" e la fase UC-specifica che lo riguarda;
- fasi sintetiche non derivate da alcuna UC.

Non è detto che la risposta sia "vietare" il layering architetturale (costruire servizi prima dei controller è spesso corretto); più probabilmente serve un terzo concetto esplicito nello schema/prompt, oltre a `INFRA` e alle fasi `US-NN`, per "servizi condivisi derivati dal Tech-Spec ma non attribuibili a una singola UC" — con regole chiare su cosa può o non può contenere, e su come le fasi UC-specifiche successive devono referenziarlo (dependsOn verso il servizio condiviso, non re-implementazione) invece di ignorarlo o duplicarlo.

## Mitigazioni già tentate (parziali, non risolutive)

- Due round di tightening del prompt (anti-pattern "duplicate implementation", anti-pattern "domain mismatch su task di sola verifica", divieto esplicito di fase di test trasversale) — hanno corretto gli esempi specifici mostrati, non il pattern generale.
- Innalzamento del tier del modello generatore da `haiku` a `sonnet` — ha risolto la validazione *strutturale* (nessuna citazione AC fuori scope) ma non il sovraccarico semantico della prima fase, che resta un bias sistemico anche a tier più alto.

## Collegamenti

- Precondizione: [`atomic-work-breakdown.md`](done/atomic-work-breakdown.md) (FTR-014) — introduce lo schema di task/fase su cui questa idea interviene.
- Possibile sovrapposizione con [`specification-quality-gate.md`](specification-quality-gate.md): se il Tech-Spec descrivesse esplicitamente quali componenti sono "servizi condivisi multi-UC" prima della generazione del Work Breakdown, il generatore avrebbe un segnale strutturato invece di doverlo inferire — da valutare se questa idea debba essere un prerequisito o un completamento di quella.
- Allineamento da verificare con [`requirements-techspec-split-and-traceability-matrix.md`](requirements-techspec-split-and-traceability-matrix.md): probabilmente la stessa causa radice (un LLM a cui si chiede troppo in un colpo solo, perde traccia dei "fratelli" già decisi) che si ripresenta a un'altra granularità — lì è emerso un caso concreto in miniatura durante l'esempio lavorato: un campo `sourceUC` assegnato a una fase della Work Breakdown includeva erroneamente una UC che quella fase non implementa davvero, scoperto solo costruendo una matrice di copertura esplicita, non dalla sola lettura dei documenti. Non unire le due idee, ma non progettarle in isolamento l'una dall'altra.

## Questioni aperte

- Introdurre un terzo `phase.type` (es. `"shared-service"`) accanto a `"infrastructure"` e `"user-story"`, con regole di scope dedicate nel validator? O è sufficiente guidare meglio l'assegnazione dei task esistenti alle fasi `US-NN` già derivate dalle UC, senza nuovo schema?
- Come distinguere deterministicamente (o nel prompt) "questo task implementa comportamento della propria UC" da "questo task implementa comportamento di un'altra UC, solo collocato qui per comodità architetturale"? Il case study mostra che la sola assenza di citazione AC fuori scope (`acceptanceCriteria: []`) non è un segnale sufficiente — serve probabilmente analisi semantica del contenuto (`outcome`/file prodotto) rispetto al testo della UC di ciascuna fase, cosa che oggi fa solo il validator semantico *dopo* la generazione, mai durante.
