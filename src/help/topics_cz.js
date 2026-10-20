/* Help topics (Czech, cz), translated from topics_en.js: Settings › Help in the Modern interface. See topics.js. */
const messages = {
  ui: {
    lede: 'Krátké odpovědi na časté otázky. Použijte hledání nebo otevřete téma.',
    search_label: 'Hledat v nápovědě',
    search_placeholder: 'Například: soubor, potvrzení, fráze',
    search_keys: 'Hledání spustíte klávesou /. Klávesa Esc hledání vymaže.',
    clear: 'Vymazat hledání',
    results: 'Nalezená témata: {n}',
    no_results: 'Výrazu „{q}“ neodpovídá žádné téma. Zkuste jiné slovo.',
    more: 'Číst dále',
    less: 'Zobrazit méně',
    handshake: {
      title: 'Jak transakce putuje',
      over_epicbox: 'Přes Epicbox',
      with_file: 'Pomocí souboru',
      you: 'Vy',
      them: 'Příjemce',
      network: 'Síť',
      epicbox: 'Epicbox',
      file: 'Soubor',
      step: 'Krok {n} z {total}',
      prev: 'Předchozí krok',
      next: 'Další krok',
      steps: {
        epicbox: [
          'Vaše peněženka pošle platbu do Epicboxu a uzamkne mince.',
          'Epicbox ji předá dál, až bude peněženka příjemce online. Peněženka příjemce přidá svou část a podepíše ji.',
          'Peněženka příjemce ji pošle zpět do Epicboxu.',
          'Epicbox ji předá zpět vaší peněžence.',
          'Vaše peněženka také podepíše, dokončí transakci a odešle ji do sítě.',
          'Síť ji zapíše do bloku. Po 3 potvrzeních je konečná.',
        ],
        file: [
          'Vaše peněženka uloží soubor transakce a uzamkne mince. Soubor příjemci předáte sami.',
          'Příjemce ho otevře. Jeho peněženka přidá svou část, podepíše a uloží soubor s odpovědí.',
          'Příjemce vám soubor s odpovědí pošle zpět.',
          'Soubor s odpovědí otevřete ve své peněžence.',
          'Vaše peněženka také podepíše, dokončí transakci a odešle ji do sítě.',
          'Síť ji zapíše do bloku. Po 3 potvrzeních je konečná.',
        ],
      },
    },
  },

  //the names of places and buttons as this language's app shows them (src/lang)
  terms: {
    receive: 'Přijmout',
    send: 'Odeslat',
    send_go: 'Zkontrolovat odeslání, potom Odeslat … EPIC',
    send_file: 'Místo toho odeslat jako soubor (nahoře na stránce Odeslat)',
    sign_file: 'Přijmout › Soubory transakcí › Podepsat soubor transakce',
    finalize_file: 'Přijmout › Soubory transakcí › Dokončit soubor s odpovědí',
    cancel: 'Aktivita › příslušná transakce › Zrušit transakci',
    outputs: 'Aktivita › Výstupy',
    phrase: 'Nastavení › Obnovovací fráze',
    rescan: 'Nastavení › Nové prohledání',
    restore: 'Obnovit z obnovovací fráze (na první obrazovce, v Odemknout › Přidat peněženku nebo v Nastavení › Všechny peněženky › Přidat peněženku)',
    wallet_files: 'Nastavení › Tato peněženka › Složka peněženky',
    node_settings: 'Nastavení › Uzel a příjem',
    epicbox_setting: 'Nastavení › Uzel a příjem › Příjem',
    report: 'Nastavení › Nápověda › Nahlásit problém',
    confirming_label: 'Potvrzuje se',
    locked_label: 'Uzamčeno v odchozích platbách',
    awaiting_label: 'Čeká na dokončení',
    fee_label: 'Poplatek sítě',
  },

  sections: [
    { id: 'start', title: 'Začínáme' },
    { id: 'how', title: 'Jak Epic Cash funguje' },
    { id: 'safety', title: 'Jak mít peněženku v bezpečí' },
    { id: 'network', title: 'Uzly a Epicbox' },
    { id: 'trouble', title: 'Když se něco pokazí' },
  ],

  topics: [
    {
      id: 'receive-first',
      section: 'start',
      title: 'Přijetí vašich prvních EPIC',
      short: 'Otevřete stránku [[receive]], zkopírujte svou adresu Epic a dejte ji odesílateli. Platba dorazí sama.',
      body: `<p>Vaše adresa Epic je dlouhý kód, který končí znakem <b>@</b> a názvem vašeho serveru Epicbox, například
        <b>…@epicbox.epiccash.com</b>. Můžete ji bez obav sdílet: lidé ji potřebují, aby vám mohli zaplatit, a nikdo vám s ní
        nic nevezme.</p>
        <ol>
          <li>Otevřete stránku <b>[[receive]]</b>.</li>
          <li>Zkopírujte adresu (nebo zobrazte její QR kód) a pošlete ji tomu, kdo vám platí.</li>
          <li>Platba se sama objeví v sekci Aktivita. Nemusíte na nic klikat.</li>
        </ol>
        <p>Vaše peněženka začne přijímat sama po odemčení, jakmile je uzel synchronizován. Pokud je peněženka zavřená, když vám
        někdo platí, Epicbox platbu podrží a vaše peněženka si ji vyzvedne při příštím odemčení.</p>
        <p>Nová platba nejdřív čeká, až ji peněženka odesílatele dokončí, potom se potvrzuje. Po 3 potvrzeních, asi po 3 minutách,
        ji můžete utratit.</p>`,
    },
    {
      id: 'send',
      section: 'start',
      title: 'Odeslání EPIC někomu',
      short: 'Otevřete stránku [[send]], vložte adresu Epic příjemce, zadejte částku, zkontrolujte poplatek a odešlete.',
      body: `<ol>
          <li>Otevřete stránku <b>[[send]]</b> a vložte adresu Epic příjemce, nebo vyberte jeden ze svých kontaktů.</li>
          <li>Zadejte částku. Poplatek se zobrazí před odesláním.</li>
          <li>Stiskněte <b>[[send_go]]</b>.</li>
        </ol>
        <p>Teď musí odpovědět peněženka příjemce (viz „Proč transakce potřebuje obě strany?“). Přes Epicbox příjemce nemusí být
        právě teď online: platba počká, až se jeho peněženka otevře. Dokud čekáte, jsou mince, které transakce používá, ve vaší
        peněžence uzamčené, takže je nelze utratit dvakrát.</p>
        <p>Až se odpověď vrátí, vaše peněženka transakci sama dokončí a odešle ji do sítě. Konečná je po 3 potvrzeních.</p>
        <p><b>Žádná odpověď?</b> Po několika minutách se ve stavu objeví „Čeká se na odpověď příjemce“. Požádejte příjemce, aby
        otevřel svou peněženku. Pokud odpověď nikdy nepřijde, zrušte odeslání (<b>[[cancel]]</b>) a mince se odemknou.
        Odeslání se nikdy neruší samo.</p>
        <p>Odesílat můžete, jakmile je váš uzel synchronizován. Odeslání na adresu Epic navíc vyžaduje, aby byl připojen váš vlastní Epicbox; mezitím můžete platbu poslat souborem. Odeslat můžete i na adresu http(s),
        ale pak musí být peněženka příjemce v tu chvíli online a dostupná.</p>`,
    },
    {
      id: 'send-file',
      section: 'start',
      title: 'Odeslání pomocí souboru',
      short: 'Ruční způsob: uložte soubor transakce, předejte ho příjemci a pak otevřete soubor s odpovědí, který vám pošle zpět.',
      body: `<p>Soubory provedou stejné „podání ruky“ jako Epicbox, ale zprávy přenášíte sami, například e-mailem, chatem nebo na
        flash disku. Fungují i bez Epicboxu a nemusíte být oba online ve stejnou dobu.</p>
        <ol>
          <li><b>Vy:</b> na stránce Odeslat zadejte částku, stiskněte <b>[[send_file]]</b> a uložte soubor (končí na .tx).
          Od této chvíle jsou mince uzamčené.</li>
          <li><b>Příjemce:</b> soubor otevře v části <b>[[sign_file]]</b>. Jeho peněženka ho podepíše a uloží soubor s odpovědí
          (jeho název začíná na finalize_). Ten soubor vám pošle zpět.</li>
          <li><b>Vy:</b> soubor s odpovědí otevřete v části <b>[[finalize_file]]</b>. Vaše peněženka transakci dokončí a odešle
          ji do sítě.</li>
        </ol>
        <p>Jiné peněženky Epic Cash mají pro tyto kroky vlastní názvy. Pokud soubor s odpovědí nikdy nedorazí, zrušte odeslání
        (<b>[[cancel]]</b>) a mince se odemknou.</p>`,
    },
    {
      id: 'both-sides',
      section: 'how',
      title: 'Proč transakce potřebuje obě strany?',
      short: 'V Epic Cash pomáhá každou transakci sestavit i peněženka příjemce, takže se musí zapojit obě peněženky.',
      body: `<p>Epic Cash používá Mimblewimble. Místo zapsání adresy a částky do blockchainu obě peněženky sestavují každou
        transakci společně, jako při podání ruky:</p>
        <ol>
          <li>Vaše peněženka transakci zahájí a uzamkne mince, které posíláte.</li>
          <li>Peněženka příjemce přidá svou část a podepíše.</li>
          <li>Vaše peněženka také podepíše, dokončí transakci a odešle ji do sítě.</li>
        </ol>
        <p>Zprávy mezi oběma peněženkami proto musí něco přenášet. <b>Epicbox</b> to udělá za vás: zprávu podrží, dokud je druhá
        peněženka offline, takže nemusíte být oba online ve stejnou chvíli. <b>Soubor transakce</b> je ruční způsob: soubory
        předáváte sami.</p>`,
      visual: 'handshake',
    },
    {
      id: 'confirmations',
      section: 'how',
      title: 'Potvrzení',
      short: 'Transakce je konečná po 3 potvrzeních, obvykle asi za 3 minuty.',
      body: `<p>Když síť transakci přijme, těžař ji zapíše do bloku. Nový blok vzniká zhruba každou minutu. Blok s vaší transakcí
        je první potvrzení a každý další blok přidá další potvrzení a transakci je pak těžší zvrátit.</p>
        <p>Tato peněženka považuje transakci za konečnou po <b>3 potvrzeních</b>. Do té doby se zobrazuje jako
        <b>[[confirming_label]]</b> a přijaté mince nelze zatím utratit. Toto číslo je pevné.</p>
        <p>Trvá to déle než obvykle? Vaše peněženka vidí nové bloky jen přes svůj uzel: zkontrolujte, zda je uzel synchronizován.</p>`,
    },
    {
      id: 'private',
      section: 'how',
      title: 'Co ukazuje blockchain',
      short: 'Žádné adresy ani částky: jen záznamy o mincích, které síť ověří, aniž by viděla, kdo a kolik.',
      body: `<p>V mnoha blockchainech může kdokoli vyhledat adresu a vidět její zůstatek a historii. Epic Cash je jiný:</p>
        <ul>
          <li><b>V blockchainu nejsou adresy.</b> Vaše adresa Epic jen říká Epicboxu, kam doručit zprávy. Do blockchainu se
          nikdy nezapisuje.</li>
          <li><b>V blockchainu nejsou částky.</b> Částky jsou skryté pomocí kryptografie a síť přesto může ověřit, že žádné
          mince nevznikly z ničeho.</li>
          <li><b>Vaše poznámky zůstávají mimo blockchain.</b> Zpráva, kterou přidáte, jde jen druhé peněžence. Kontakty a názvy
          peněženek zůstávají na tomto počítači.</li>
        </ul>
        <p>Co skryté není: uzel, který používáte, a váš server Epicbox vidí vaši IP adresu a veřejný uzel vidí, na které mince
        se vaše peněženka ptá. Pokud vám na IP adrese záleží, použijte VPN.</p>`,
    },
    {
      id: 'change',
      section: 'how',
      title: 'Uzamčené částky a zbytek',
      short: 'Váš zůstatek tvoří oddělené mince. Odeslání utratí celé mince a zbytek se vám vrátí.',
      body: `<p>Váš zůstatek je sada mincí (říká se jim také výstupy). Když chcete poslat 3 EPIC z mince o hodnotě 5 EPIC,
        peněženka utratí celou minci: 3 EPIC jdou příjemci, malý poplatek těžařům a zbytek se vám vrátí jako nová mince, váš
        výstup se <b>zbytkem</b>.</p>
        <p>Proto může být část zůstatku několik minut po odeslání nedostupná:</p>
        <ul>
          <li><b>[[locked_label]]</b>: mince v odeslání, které ještě není dokončené. Odemknou se, když odeslání zrušíte.</li>
          <li><b>[[awaiting_label]]</b>: transakce, která stále čeká na druhou peněženku.</li>
          <li><b>[[confirming_label]]</b>: mince v bloku s méně než 3 potvrzeními, včetně vašeho zbytku.</li>
        </ul>
        <p>Své mince uvidíte v části <b>[[outputs]]</b>.</p>`,
    },
    {
      id: 'fees',
      section: 'how',
      title: 'Poplatky',
      short: 'Každá transakce platí malý poplatek sítě, který vidíte před odesláním. Dostanou ho těžaři.',
      body: `<p>Poplatek závisí na tom, kolik mincí transakce utrácí a vytváří, ne na částce. Obvykle je to malý zlomek jednoho EPIC.</p>
        <p>Před odesláním ho uvidíte jako <b>[[fee_label]]</b>.</p>
        <p>Tlačítko <b>Vše</b> vedle částky vyplní celý váš zůstatek, který lze utratit, zmenšený o přesný poplatek, takže
        žádný zbytek nezůstane.</p>`,
    },
    {
      id: 'phrase',
      section: 'safety',
      title: 'Vaše obnovovací fráze',
      short: 'Tato slova jsou jediný způsob, jak získat své EPIC zpět. Zapište si je na papír a nikomu je nesdělujte.',
      body: `<p>Obnovovací fráze (24 slov u nové peněženky) je klíč k vašim penězům. S ní můžete peněženku obnovit na jakémkoli
        počítači a kdokoli jiný, kdo ji má, vám může vaše EPIC vzít.</p>
        <ul>
          <li>Slova si zapište na papír, v tomto pořadí, a papír uschovejte na bezpečném místě offline.</li>
          <li>Nikdy je neukládejte jako fotku, snímek obrazovky ani soubor. Nikdy je nezadávejte na webových stránkách ani do chatu.</li>
          <li>Nikdo z Epic Cash ani z této peněženky vás o ně nikdy nepožádá.</li>
        </ul>
        <p>Chcete-li slova znovu zobrazit, otevřete <b>[[phrase]]</b> a zadejte heslo peněženky. Raději je nekopírujte:
        pokud to uděláte, peněženka schránku vymaže po 60 sekundách a také když peněženku zamknete nebo zavřete.</p>`,
    },
    {
      id: 'backups',
      section: 'safety',
      title: 'Zálohy a obnovení',
      short: 'Vaší zálohou je obnovovací fráze. Peněženku obnovíte zadáním jejích slov v části Obnovit z obnovovací fráze.',
      body: `<p>Nemusíte vytvářet žádný soubor se zálohou: obnovovací fráze vrátí vše, co je v blockchainu, tedy váš zůstatek.</p>
        <p><b>Obnovení</b> na novém počítači nebo po ztrátě: zvolte <b>[[restore]]</b>, zadejte slova, zkontrolujte je a zvolte
        heslo. Po otevření peněženka prohledá blockchain a vyhledá vaše mince. Zůstatek se objeví po tomto prvním prohledání.</p>
        <p><b>Co obnovení nevrátí:</b> to, co nikdy nebylo v blockchainu, například zprávy k transakcím, kontakty a názvy
        peněženek.</p>
        <p><b>Zůstatek vypadá špatně?</b> Použijte <b>[[rescan]]</b>. Prohledá celý blockchain a najde mince této peněženky.</p>
        <p><b>Soubory peněženky</b> jsou v <b>[[wallet_files]]</b>. Obnovovací frázi si uschovejte, i když soubory zkopírujete:
        poslouží i tehdy, když soubory ztratíte.</p>`,
    },
    {
      id: 'nodes',
      section: 'network',
      title: 'Uzly: vestavěný nebo externí',
      short: 'Uzel spojuje vaši peněženku se sítí Epic Cash. Veřejný uzel je nejrychlejší, vestavěný je váš vlastní.',
      body: `<p>Peněženka potřebuje uzel, aby četla blockchain (váš zůstatek a potvrzení) a odesílala vaše transakce do sítě.</p>
        <ul>
          <li><b>Externí uzel</b> (výchozí): veřejný uzel, například node.epiccash.com. Funguje hned. Ten, kdo ho provozuje,
          vidí vaši IP adresu a na které mince se vaše peněženka ptá.</li>
          <li><b>Vestavěný uzel</b>: běží na tomto počítači. Nejdřív stáhne celý blockchain, což chvíli trvá a potřebuje místo na
          disku, a pak je váš vlastní. Během synchronizace peněženka používá veřejný uzel.</li>
        </ul>
        <p>Změňte to v <b>[[node_settings]]</b> a stiskněte Uložit. Peněženka se k novému uzlu připojí sama. Můžete zadat adresu
        uzlu nebo vybrat jeden z veřejných uzlů, které jsou uvedeny se svým stavem.</p>
        <p>Odesílat můžete, jen když je uzel synchronizován. Pokud váš uzel zaostává, peněženka nabídne přepnutí na jiný.</p>`,
    },
    {
      id: 'epicbox',
      section: 'network',
      title: 'Epicbox',
      short: 'Epicbox doručuje transakce mezi peněženkami a drží je, dokud je druhá peněženka offline.',
      body: `<p>Obě peněženky se účastní každé transakce, takže jejich zprávy potřebují místo setkání. Server Epicbox je tímto
        místem: platbu poslanou vám drží, dokud se vaše peněženka nepřipojí, a odpověď vaší peněženky nese zpět. Zprávy jsou
        šifrované a Epicbox nemůže utratit vaše mince.</p>
        <p>Vaše adresa Epic je veřejný klíč vaší peněženky, pak <b>@</b> a název vašeho serveru Epicbox.</p>
        <p>Nastavení <b>Server Epicbox</b> je v <b>[[epicbox_setting]]</b>. Můžete zadat server nebo vybrat jeden z veřejných
        serverů, které jsou uvedeny se svým stavem, a pak stisknout Uložit. Pokud zvolíte jiný server, část za @ se změní, takže
        novou adresu dejte lidem, kteří vám platí. Peněženka jednou zkontroluje starý server, zda tam nejsou platby poslané na
        vaši starou adresu. Když je pole prázdné, Epicbox je vypnutý a soubory můžete dál používat.</p>
        <p>Epicbox používají i jiné peněženky Epic Cash, takže si mezi sebou můžete platit. Epicbox před serverem neskrývá vaši
        IP adresu: pokud vám na tom záleží, použijte VPN.</p>`,
    },
    {
      id: 'troubleshooting',
      section: 'trouble',
      title: 'Řešení potíží',
      short: 'Většinou jde o uzel, který se ještě synchronizuje, příjemce, který ještě neodpověděl, nebo obsazený port.',
      body: `<p><b>„Uzel není synchronizován“: nemohu odeslat.</b> Odesílat půjde, až váš uzel dožene síť. Chvíli počkejte nebo
        vyberte jiný uzel v [[node_settings]].</p>
        <p><b>„Epicbox není připojen“.</b> Vaše peněženka se zatím nemůže připojit ke svému serveru Epicbox. Chvíli počkejte.
        Pokud to tak zůstane, zkontrolujte připojení k internetu nebo vyberte jiný server v [[epicbox_setting]]. Mezitím můžete
        odesílat pomocí souboru.</p>
        <p><b>Moje odeslání má stav „Čeká se na odpověď příjemce“.</b> Peněženka příjemce ještě neodpověděla. Požádejte
        příjemce, aby otevřel svou peněženku. Pokud ji nikdy neotevře, zrušte odeslání ([[cancel]]) a mince se odemknou.</p>
        <p><b>Platba pro mě nedorazila.</b> Na stránce [[receive]] zkontrolujte, zda je příjem zapnutý a zda je váš uzel
        synchronizován. Pokud jste změnili server Epicbox, ujistěte se, že odesílatel použil vaši novou adresu. Peněženka
        odesílatele musí transakci také dokončit, potom počítejte s několika minutami na potvrzení.</p>
        <p><b>„Port 3415 používá jiný program“.</b> Jiný program, často jiná peněženka Epic, používá tento port pro platby přes
        HTTP. Zavřete ho a stiskněte Zkusit znovu na stránce [[receive]]. Epicbox a soubory mezitím fungují dál.</p>
        <p><b>„Tuto složku používá jiný program Epic“.</b> Jiná peněženka nebo uzel Epic má otevřené stejné soubory. Zavřete
        tento program a zkuste to znovu.</p>
        <p><b>„Špatné heslo“.</b> Zkontrolujte Caps Lock a rozložení klávesnice. Pokud jste heslo zapomněli, obnovte peněženku
        z její obnovovací fráze a zvolte nové heslo.</p>
        <p><b>Zůstatek vypadá špatně.</b> Použijte [[rescan]].</p>`,
    },
    {
      id: 'getting-help',
      section: 'trouble',
      title: 'Kde získat pomoc',
      short: 'Něco nefunguje? Otevřete [[report]].',
      body: `<p>Vaše hlášení je šifrované. Přečíst ho může jen vývojář.</p>`,
    },
  ],
};

export default messages
