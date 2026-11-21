# Dotačník

Česká webová aplikace pro evidenci financování neziskových projektů. V přehledu projektů uvidíte rozpočty, přiřazené výdaje a nejbližší termíny. V detailu projektu přidáte dotaci, sbírku či vlastní prostředky a rozepíšete jeden doklad mezi několik zdrojů. Vyúčtování ukazuje doklady pro každý zdroj a nabízí CSV pro Excel.

## Ukázka na počítači

S Node.js 22 nebo novějším spusťte:

```sh
npm ci
npm start
```

Otevřete http://localhost:3000. Bez nastavení Supabase se zobrazí Skatepark Liberec a Závod na tříkolce. Změny v ukázce zůstávají v prohlížeči.

## Připojení Supabase

1. V novém projektu Supabase spusťte v SQL Editoru soubor [202611210001_initial.sql](supabase/migrations/202611210001_initial.sql). Migrace vytvoří tabulky, pravidla přístupu i funkci pro uložení dokladu.
2. V **Authentication → Users** vytvořte prvního uživatele s e-mailem a potvrzeným účtem. Pro soukromou instalaci vypněte veřejnou registraci.
3. Z nastavení projektu vezměte jeho URL a **publishable key**. Tento klíč je určený pro prohlížeč. Administrátorský klíč Supabase do konfigurace aplikace nepatří.
4. Lokálně zkopírujte `.env.example` do `.env`, vyplňte hodnoty a spusťte `node --env-file=.env server.js`. Po přihlášení je evidence prázdná. Ukázkové projekty jsou součástí režimu bez připojené databáze.

## Nasazení na Render

1. Uložte soubory do kořene GitHub repozitáře a připojte repozitář v Renderu přes **New → Blueprint**. Render načte [render.yaml](render.yaml) s konfigurací webové služby.
2. V Renderu nastavte `SUPABASE_URL` a `SUPABASE_PUBLISHABLE_KEY` z projektu, kde proběhla migrace.
3. Po nasazení otevřete přidělenou adresu a přihlaste se. Adresa `/healthz` kontroluje běh aplikace. Spojení se Supabase ověříte přihlášením a uložením prvního projektu.

## Rozsah první verze

Projekty jsou soukromé pro účet, který je vytvořil. Eviduje se číslo, účel a částka dokladu, rozdělení mezi zdroje, rozpočtová položka a datum úhrady. Rozpočtová položka je zatím text u každé přidělené částky. Částky se ukládají jako celé haléře. Databáze hlídá shodu součtu s dokladem a zůstatek jednotlivých zdrojů.

Sdílení projektů s týmem, souborové přílohy, limity rozpočtových položek a formuláře konkrétních poskytovatelů patří do dalších verzí.
