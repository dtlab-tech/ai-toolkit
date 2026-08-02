# Application Overview — Proposta concettuale

## Contesto

L'AI Toolkit produce attualmente un dossier documentale per ogni feature, contenente definizione funzionale, requisiti, specifica tecnica, piano di lavoro, approvazioni ed evidenze dell'implementazione.

Questi documenti descrivono efficacemente le singole modifiche, ma non forniscono una rappresentazione consolidata dell'applicazione nel suo stato corrente.

Con il passare del tempo, per comprendere cosa faccia oggi un'applicazione sarebbe necessario:

- conoscere tutte le feature implementate;
- leggere molti dossier `FTR`;
- ricostruire l'ordine temporale delle modifiche;
- distinguere le feature completate da quelle pianificate o abbandonate;
- capire quali informazioni piu recenti abbiano superato quelle precedenti;
- interpretare documentazione prevalentemente orientata allo sviluppo.

Serve quindi un documento stabile che rappresenti l'applicazione nel suo complesso e venga aggiornato nel tempo.

## Scopo di `application-overview.md`

`application-overview.md` e la pagina principale della documentazione current-state dell'applicazione.

Il documento deve rispondere principalmente alle seguenti domande:

1. Che cos'e questa applicazione?
2. Perche esiste?
3. Quali processi o bisogni aziendali supporta?
4. Chi la utilizza?
5. Quali funzionalita offre attualmente?
6. Quali sono i suoi confini?
7. Con quali altri sistemi interagisce?
8. Chi ne e responsabile?
9. Qual e il suo stato nel ciclo di vita?
10. Dove si trovano gli approfondimenti funzionali, tecnici e operativi?

Il percorso previsto e:

```text
docs/current/application-overview.md
```

## Pubblico destinatario

Il documento deve essere comprensibile anche senza conoscere il codice o il repository.

I destinatari possono includere:

- utenti aziendali;
- business owner;
- application owner;
- analisti funzionali;
- project manager;
- service manager;
- team di supporto;
- sviluppatori appena entrati nel progetto;
- architetti;
- agenti AI che devono orientarsi nel codebase.

Il linguaggio deve quindi essere prevalentemente funzionale e aziendale. I dettagli tecnici devono comparire solamente quando indispensabili per comprendere il perimetro dell'applicazione.

## Ruolo del documento

`application-overview.md` deve essere:

- una rappresentazione dello stato corrente;
- la porta d'ingresso alla documentazione dell'applicazione;
- una sintesi delle capacita disponibili;
- un punto di collegamento verso documenti piu specifici;
- una fonte utilizzabile dagli agenti AI durante l'analisi del progetto;
- un contenuto pubblicabile in un futuro portale documentale.

Non deve essere:

- il registro cronologico delle modifiche;
- la copia dei requisiti delle singole feature;
- una specifica tecnica dettagliata;
- un manuale utente completo;
- un runbook operativo;
- una roadmap;
- un elenco di funzionalita pianificate ma non disponibili;
- un documento rigenerato integralmente a ogni modifica.

## Relazione con le feature

I dossier sotto `docs/features` descrivono le change:

```text
docs/features/FTR-042-example/
├── feature.md
├── FTR-042-Requirements.md
├── FTR-042-Tech-Spec.md
└── ...
```

`application-overview.md` descrive invece il risultato consolidato delle change approvate e implementate.

Esempio:

```text
FTR-010 introduce la creazione degli ordini
FTR-018 aggiunge il workflow di approvazione
FTR-027 sostituisce l'invio manuale con l'integrazione SAP
```

L'overview non deve riportare tre descrizioni separate. Deve rappresentare lo stato corrente:

```markdown
### Order Management

L'applicazione consente di creare e modificare gli ordini, sottoporli
a un workflow di approvazione e trasmettere automaticamente gli ordini
approvati a SAP.
```

Le FTR restano disponibili come evidenza storica e come fonte di tracciabilita.

## Principi di contenuto

### Solo stato corrente

Devono essere presentate come disponibili soltanto funzionalita effettivamente implementate.

Elementi pianificati, deferred o ancora in approvazione non devono essere mescolati alle funzionalita correnti. Se necessario, possono essere indicati in una sezione separata e chiaramente identificata, ma nella prima versione e preferibile escluderli.

### Consolidamento, non concatenazione

L'aggiornamento non deve aggiungere automaticamente un paragrafo per ogni nuova feature.

L'agente deve integrare la nuova informazione nella descrizione esistente, eliminando eventuali affermazioni superate e mantenendo il documento coerente.

### Evidenze verificabili

Le informazioni devono essere ricavate da fonti presenti nel repository, come:

- codice corrente;
- configurazione;
- test;
- documentazione delle feature completate;
- Feature Registry;
- README e documentazione esistente;
- manifest e file di deployment;
- informazioni confermate dall'utente.

Quando le fonti sono contraddittorie o insufficienti, l'agente deve chiedere conferma e non inventare la risposta.

### Stabilita

Il documento non deve contenere dettagli destinati a cambiare frequentemente, se non realmente utili.

Per esempio, e preferibile:

```text
L'applicazione integra il sistema ERP aziendale per trasmettere gli ordini.
```

rispetto a:

```text
OrderService chiama SapClient.SendOrderAsync attraverso ISapGateway.
```

Il secondo dettaglio appartiene alla documentazione architetturale.

### Navigabilita

Il documento deve indirizzare il lettore verso gli approfondimenti, senza duplicarli.

## Struttura proposta

```markdown
---
document_kind: application-overview
scope: current-state
application_id: <stable-application-id>
application_name: <application-name>
business_domain: <domain>
lifecycle: active
business_owner: <owner-or-tbd>
application_owner: <owner-or-tbd>
language: en
last_reviewed: <date>
---

# <Application Name>

## Overview

Breve descrizione dell'applicazione: che cosa fa, per chi e perche esiste.

## Business Context

### Business Purpose

Bisogno aziendale e valore fornito dall'applicazione.

### Supported Processes

| Process | Application responsibility |
|---------|----------------------------|
| ... | ... |

## Users and Stakeholders

| User or stakeholder | Interaction with the application |
|---------------------|----------------------------------|
| ... | ... |

## Current Capabilities

### <Capability name>

Descrizione funzionale consolidata della capability disponibile.

### <Capability name>

Descrizione funzionale consolidata della capability disponibile.

## Application Boundaries

### Responsibilities

Cosa appartiene al perimetro dell'applicazione.

### Out of Scope

Cosa e gestito da altri sistemi o processi.

## External Systems

| System | Relationship | Information exchanged |
|--------|--------------|-----------------------|
| ... | ... | ... |

## Ownership and Lifecycle

| Field | Value |
|-------|-------|
| Business owner | ... |
| Application owner | ... |
| Support team | ... |
| Lifecycle status | Active / Maintenance / Sunset |
| Business criticality | ... |

## Known Limitations

Limitazioni correnti rilevanti per utenti e stakeholder.

## Documentation

- Feature delivery history: `../features/`
- Architecture: `architecture.md`
- Operations: `operations.md`
- User guide: link, se disponibile

## Traceability

| Current capability | Source features |
|--------------------|-----------------|
| ... | FTR-010, FTR-018 |
```

## Perche usare il frontmatter

Il frontmatter rende il documento utilizzabile anche da sistemi automatici senza modificare la leggibilita del Markdown.

In futuro permettera di:

- costruire il catalogo applicativo;
- aggregare applicazioni per dominio;
- applicare filtri e permessi;
- individuare documenti senza owner;
- controllare la data dell'ultima revisione;
- pubblicare il contenuto in spazi differenti;
- indicizzare soltanto documentazione valida;
- alimentare la ricerca semantica e gli assistenti AI.

Nella prima implementazione lo schema puo rimanere minimale. Non e necessario definire subito tutti i metadati futuri.

## Modalita di costruzione iniziale

Quando `application-overview.md` non esiste, il toolkit deve eseguire un'attivita di bootstrap.

### Raccolta del contesto

L'agente deve leggere:

1. `AGENTS.md`;
2. `README.md`;
3. struttura generale del repository;
4. Feature Registry;
5. dossier delle feature completate;
6. codice e configurazioni principali;
7. eventuale documentazione preesistente;
8. configurazione di deployment e integrazioni, se rilevante.

### Preparazione della bozza

L'agente deve distinguere:

- informazioni confermate dalle fonti;
- informazioni inferite con sufficiente evidenza;
- informazioni mancanti;
- informazioni contraddittorie.

Prima di scrivere il documento definitivo deve presentare una sintesi simile:

```text
Application name: confirmed
Business purpose: partially known
Current capabilities: 7 identified
External systems: 3 identified
Business owner: unknown
Application owner: confirmed
Lifecycle: unknown

Questions requiring confirmation:
- ...
```

### Interazione con l'utente

L'agente deve chiedere soltanto informazioni non ricavabili dal repository, in particolare:

- finalita aziendale;
- business owner;
- utenti e stakeholder;
- processi supportati;
- criticita;
- lifecycle;
- nomi aziendali di sistemi e capability.

### Approvazione

Il primo `application-overview.md` deve essere considerato una bozza fino all'approvazione umana.

L'approvazione dovrebbe verificare soprattutto la correttezza funzionale e aziendale, non solamente quella tecnica.

## Modalita di aggiornamento

Quando il documento esiste gia, il toolkit non deve rigenerarlo integralmente.

Dopo una feature implementata, deve:

1. leggere il documento corrente;
2. analizzare la feature approvata;
3. verificare il codice effettivamente realizzato;
4. determinare se la feature modifica l'overview;
5. proporre una patch circoscritta;
6. mostrare cosa viene aggiunto, modificato o rimosso;
7. aggiornare la tracciabilita;
8. attendere l'approvazione prima di considerare valido il nuovo current state.

Una feature puo avere:

```text
Impact: none
```

quando introduce, per esempio:

- un refactoring interno;
- nuovi test;
- ottimizzazioni senza effetti funzionali;
- modifiche al processo di build;
- correzioni che non cambiano il comportamento documentato.

Puo invece avere:

```text
Impact: application-overview
```

quando introduce o modifica:

- una capability;
- un attore;
- un processo supportato;
- un confine applicativo;
- un sistema esterno;
- una limitazione significativa;
- ownership o lifecycle.

## Regole di aggiornamento

L'agente deve:

- preservare le informazioni corrette gia presenti;
- non cancellare contenuti senza motivazione;
- non aggiungere feature non implementate;
- non usare il solo `feature.md` come prova dell'implementazione;
- verificare il risultato reale nel codice e nei test;
- aggiornare una capability esistente invece di duplicarla;
- rimuovere o correggere descrizioni superate;
- mantenere un linguaggio comprensibile ai non tecnici;
- collegare le capability alle FTR di origine;
- segnalare le ambiguita;
- non sovrascrivere decisioni editoriali umane senza evidenziarlo.

## Criteri di qualita

Un buon `application-overview.md` deve permettere a un nuovo lettore di comprendere l'applicazione in circa cinque minuti.

Il documento e valido quando:

- descrive chiaramente finalita e valore;
- elenca le capacita effettivamente disponibili;
- identifica utenti e stakeholder;
- chiarisce il perimetro;
- mostra le principali relazioni con altri sistemi;
- contiene ownership e lifecycle;
- non richiede la conoscenza delle singole FTR;
- non contiene dettagli tecnici eccessivi;
- non presenta funzionalita pianificate come esistenti;
- e coerente con codice e documentazione approvata;
- contiene collegamenti agli approfondimenti;
- conserva la tracciabilita verso le feature.

## Prima feature suggerita per il toolkit

Per mantenere piccolo il primo incremento, implementare inizialmente soltanto il bootstrap:

> Generare `docs/current/application-overview.md` per un'applicazione esistente attraverso analisi del repository, consolidamento delle feature completate e domande mirate all'utente.

In questa prima feature lasciare fuori:

- aggiornamento automatico dopo ogni FTR;
- apertura di PR cross-repository;
- pubblicazione nel portale;
- generazione di Architecture e Operations;
- supporto multilingua;
- gestione avanzata dei permessi;
- sincronizzazione con cataloghi esterni.

Il secondo incremento potra occuparsi dell'aggiornamento incrementale dell'overview dopo l'implementazione di una feature.

Questa separazione consente di validare prima il modello documentale e la qualita del risultato, senza modificare immediatamente l'intera pipeline del toolkit.
