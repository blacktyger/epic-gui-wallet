/* Help topics (Polish, pl), translated from topics_en.js: Settings › Help in the Modern interface. See topics.js. */
const messages = {
  ui: {
    lede: 'Krótkie odpowiedzi na częste pytania. Wpisz szukane słowo albo otwórz temat.',
    search_label: 'Szukaj w pomocy',
    search_placeholder: 'Na przykład: plik, potwierdzenia, fraza',
    search_keys: 'Naciśnij /, aby szukać. Esc czyści wyszukiwanie.',
    clear: 'Wyczyść wyszukiwanie',
    results: 'Znalezione tematy: {n}',
    no_results: 'Żaden temat nie pasuje do „{q}”. Spróbuj innego słowa.',
    more: 'Czytaj dalej',
    less: 'Pokaż mniej',
    handshake: {
      title: 'Droga transakcji',
      over_epicbox: 'Przez Epicbox',
      with_file: 'Za pomocą pliku',
      you: 'Ty',
      them: 'Odbiorca',
      network: 'Sieć',
      epicbox: 'Epicbox',
      file: 'Plik',
      step: 'Krok {n} z {total}',
      prev: 'Poprzedni krok',
      next: 'Następny krok',
      steps: {
        epicbox: [
          'Twój portfel wysyła płatność do Epicbox i blokuje monety.',
          'Epicbox przekazuje ją dalej, gdy portfel odbiorcy jest online. Portfel odbiorcy dodaje swoją część i podpisuje transakcję.',
          'Portfel odbiorcy odsyła ją do Epicbox.',
          'Epicbox przekazuje ją z powrotem do Twojego portfela.',
          'Twój portfel też podpisuje transakcję, kończy ją i wysyła do sieci.',
          'Sieć umieszcza ją w bloku. Po 3 potwierdzeniach transakcja jest ostateczna.',
        ],
        file: [
          'Twój portfel zapisuje plik transakcji i blokuje monety. Plik przekazujesz odbiorcy samodzielnie.',
          'Odbiorca go otwiera. Jego portfel dodaje swoją część, podpisuje transakcję i zapisuje plik odpowiedzi.',
          'Odbiorca odsyła Ci plik odpowiedzi.',
          'Otwierasz plik odpowiedzi w swoim portfelu.',
          'Twój portfel też podpisuje transakcję, kończy ją i wysyła do sieci.',
          'Sieć umieszcza ją w bloku. Po 3 potwierdzeniach transakcja jest ostateczna.',
        ],
      },
    },
  },

  //the names of places and buttons as this language's app shows them (src/lang)
  terms: {
    receive: 'Odbierz',
    send: 'Wyślij',
    send_go: 'Sprawdź przed wysłaniem, a potem Wyślij … EPIC',
    send_file: 'Wyślij zamiast tego jako plik (u góry ekranu Wyślij)',
    sign_file: 'Odbierz › Pliki transakcji › Podpisz plik transakcji',
    finalize_file: 'Odbierz › Pliki transakcji › Sfinalizuj plik odpowiedzi',
    cancel: 'Aktywność › ta transakcja › Anuluj transakcję',
    outputs: 'Aktywność › Wyjścia',
    phrase: 'Ustawienia › Fraza odzyskiwania',
    rescan: 'Ustawienia › Ponowne skanowanie',
    restore: 'Przywróć z frazy odzyskiwania (na pierwszym ekranie, w sekcji Odblokuj › Dodaj portfel albo Ustawienia › Wszystkie portfele › Dodaj portfel)',
    wallet_files: 'Ustawienia › Ten portfel › Folder portfela',
    node_settings: 'Ustawienia › Node i odbieranie',
    epicbox_setting: 'Ustawienia › Node i odbieranie › Odbieranie',
    tor_setting: 'Ustawienia › Odbieranie › Tor',
    report: 'Ustawienia › Pomoc › Zgłoś problem',
    confirming_label: 'Potwierdzanie',
    locked_label: 'Zablokowane w wysyłanych transakcjach',
    awaiting_label: 'Oczekuje na sfinalizowanie',
    fee_label: 'Opłata sieciowa',
  },

  sections: [
    { id: 'start', title: 'Pierwsze kroki' },
    { id: 'how', title: 'Jak działa Epic Cash' },
    { id: 'safety', title: 'Jak zadbać o bezpieczeństwo portfela' },
    { id: 'network', title: 'Node’y i Epicbox' },
    { id: 'trouble', title: 'Gdy coś pójdzie nie tak' },
  ],

  topics: [
    {
      id: 'receive-first',
      section: 'start',
      title: 'Odbierz pierwsze EPIC',
      short: 'Otwórz ekran [[receive]], skopiuj swój adres Epic i przekaż go nadawcy. Płatność dotrze sama.',
      body: `<p>Twój adres Epic to długi kod, który kończy się znakiem <b>@</b> i nazwą Twojego serwera Epicbox, na przykład
        <b>…@epicbox.epiccash.com</b>. Możesz go bezpiecznie udostępniać: inni potrzebują go, żeby Ci zapłacić, a nikt nie może
        za jego pomocą niczego Ci zabrać.</p>
        <ol>
          <li>Otwórz ekran <b>[[receive]]</b>.</li>
          <li>Skopiuj adres (albo pokaż jego kod QR) i wyślij go osobie, która ma Ci zapłacić.</li>
          <li>Płatność sama pojawi się w sekcji Aktywność. Nie musisz niczego naciskać.</li>
        </ol>
        <p>Po odblokowaniu portfel sam zaczyna odbierać płatności, gdy tylko node zostanie zsynchronizowany. Jeśli ktoś Ci
        zapłaci, gdy portfel jest zamknięty, Epicbox przechowa płatność, a portfel odbierze ją przy następnym odblokowaniu.</p>
        <p>Nowa płatność najpierw czeka, aż portfel nadawcy ją dokończy, a potem jest potwierdzana. Po 3 potwierdzeniach,
        czyli po około 3 minutach, możesz ją wydać.</p>
        <p>Możesz też odbierać przez Tor: włącz go w <b>[[tor_setting]]</b>.</p>`,
    },
    {
      id: 'send',
      section: 'start',
      title: 'Wyślij komuś EPIC',
      short: 'Otwórz ekran [[send]], wklej adres Epic odbiorcy, wpisz kwotę, sprawdź opłatę i wyślij.',
      body: `<ol>
          <li>Otwórz ekran <b>[[send]]</b> i wklej adres Epic odbiorcy albo wybierz go ze swoich kontaktów.</li>
          <li>Wpisz kwotę. Opłatę zobaczysz przed wysłaniem.</li>
          <li>Naciśnij <b>[[send_go]]</b>.</li>
        </ol>
        <p>Teraz portfel odbiorcy musi odpowiedzieć (zobacz „Dlaczego transakcja wymaga obu stron?”). Przy wysyłce przez Epicbox
        odbiorca nie musi być w tej chwili online: płatność poczeka, aż otworzy swój portfel. W tym czasie monety użyte w tej
        wysyłce są zablokowane w Twoim portfelu, żeby nie dało się ich wydać dwa razy.</p>
        <p>Gdy odpowiedź dotrze, portfel sam dokończy transakcję i wyśle ją do sieci. Transakcja jest ostateczna po
        3 potwierdzeniach.</p>
        <p><b>Brak odpowiedzi?</b> Po kilku minutach pojawi się status „Oczekiwanie na odpowiedź odbiorcy”. Poproś odbiorcę,
        żeby otworzył swój portfel. Jeśli odpowiedź nigdy nie nadejdzie, anuluj wysyłkę (<b>[[cancel]]</b>), żeby odblokować
        monety. Wysyłka nigdy nie jest anulowana automatycznie.</p>
        <p>Wysyłać możesz, gdy Twój node jest zsynchronizowany. Do wysyłki na adres Epic Twój portfel musi mieć też połączenie z Epicbox; do tego czasu możesz wysłać płatność plikiem. Możesz też wysłać na
        adres http(s), ale wtedy portfel odbiorcy musi być w tym momencie online i dostępny.</p>`,
    },
    {
      id: 'send-file',
      section: 'start',
      title: 'Wyślij za pomocą pliku',
      short: 'Sposób ręczny: zapisz plik transakcji, przekaż go odbiorcy, a potem otwórz plik odpowiedzi, który Ci odeśle.',
      body: `<p>Wymiana plików to ten sam „uścisk dłoni” co przez Epicbox, tylko wiadomości przekazujesz samodzielnie, na przykład
        e-mailem, przez komunikator albo na pendrivie. Działa to bez Epicbox i nie wymaga, żebyście oboje byli online w tym
        samym czasie.</p>
        <ol>
          <li><b>Ty:</b> na ekranie Wyślij wpisz kwotę, naciśnij <b>[[send_file]]</b> i zapisz plik (ma rozszerzenie .tx). Od tej
          chwili monety są zablokowane.</li>
          <li><b>Odbiorca:</b> wybiera kolejno <b>[[sign_file]]</b> i otwiera plik. Jego portfel podpisuje go i zapisuje plik
          odpowiedzi (nazwa tego pliku zaczyna się od finalize_). Odbiorca odsyła Ci ten plik.</li>
          <li><b>Ty:</b> wybierz kolejno <b>[[finalize_file]]</b> i otwórz plik odpowiedzi. Twój portfel dokończy transakcję
          i wyśle ją do sieci.</li>
        </ol>
        <p>W innych portfelach Epic Cash te kroki nazywają się inaczej. Jeśli plik odpowiedzi nigdy nie nadejdzie, anuluj
        wysyłkę (<b>[[cancel]]</b>), żeby odblokować monety.</p>`,
    },
    {
      id: 'both-sides',
      section: 'how',
      title: 'Dlaczego transakcja wymaga obu stron?',
      short: 'W Epic Cash portfel odbiorcy współtworzy każdą transakcję, więc udział muszą wziąć oba portfele.',
      body: `<p>Epic Cash korzysta z Mimblewimble. Zamiast zapisywać w blockchainie adres i kwotę, oba portfele wspólnie tworzą
        każdą transakcję, trochę jak przy uścisku dłoni:</p>
        <ol>
          <li>Twój portfel rozpoczyna transakcję i blokuje wysyłane monety.</li>
          <li>Portfel odbiorcy dodaje swoją część i podpisuje transakcję.</li>
          <li>Twój portfel też podpisuje transakcję, kończy ją i wysyła do sieci.</li>
        </ol>
        <p>Wiadomości między portfelami trzeba więc jakoś przekazywać. Robi to za Ciebie <b>Epicbox</b>: przechowuje
        wiadomość, gdy drugi portfel jest offline, więc nie musicie być online w tej samej chwili. <b>Plik transakcji</b> to
        sposób ręczny: pliki przekazujesz samodzielnie.</p>`,
      visual: 'handshake',
    },
    {
      id: 'confirmations',
      section: 'how',
      title: 'Potwierdzenia',
      short: 'Transakcja jest ostateczna po 3 potwierdzeniach, zwykle po około 3 minutach.',
      body: `<p>Gdy sieć przyjmie transakcję, górnik umieści ją w bloku. Nowy blok powstaje mniej więcej co minutę. Blok z Twoją
        transakcją to pierwsze potwierdzenie, a każdy następny blok dodaje kolejne i utrudnia cofnięcie transakcji.</p>
        <p>Ten portfel uznaje transakcję za ostateczną po <b>3 potwierdzeniach</b>. Do tego czasu ma ona status
        <b>[[confirming_label]]</b>, a otrzymanych monet nie można jeszcze wydać. Tej liczby nie można zmienić.</p>
        <p>Trwa to dłużej niż zwykle? Portfel widzi nowe bloki tylko przez swój node: sprawdź, czy node jest zsynchronizowany.</p>`,
    },
    {
      id: 'private',
      section: 'how',
      title: 'Co widać w blockchainie',
      short: 'Żadnych adresów ani kwot, tylko zapisy monet, które sieć może sprawdzić, nie wiedząc, do kogo należą ani ile są warte.',
      body: `<p>W wielu blockchainach każdy może sprawdzić adres i zobaczyć jego saldo oraz historię. Epic Cash działa inaczej:</p>
        <ul>
          <li><b>Brak adresów w blockchainie.</b> Twój adres Epic mówi tylko Epicbox, gdzie dostarczyć wiadomości. Nigdy nie
          jest zapisywany w blockchainie.</li>
          <li><b>Brak kwot w blockchainie.</b> Kwoty są ukryte dzięki kryptografii, a mimo to sieć może się upewnić, że żadne
          monety nie powstały z niczego.</li>
          <li><b>Twoje notatki nie trafiają do blockchaina.</b> Wiadomość, którą dodasz, trafia tylko do drugiego portfela.
          Kontakty i nazwy portfeli zostają na tym komputerze.</li>
        </ul>
        <p>Co nie jest ukryte: node, z którego korzystasz, i Twój serwer Epicbox widzą Twój adres IP, a node publiczny widzi,
        o które monety pyta Twój portfel. Jeśli zależy Ci na ukryciu adresu IP, użyj VPN.</p>`,
    },
    {
      id: 'change',
      section: 'how',
      title: 'Zablokowane kwoty i reszta',
      short: 'Saldo składa się z osobnych monet. Przy wysyłce wydawane są całe monety, a nadwyżka wraca do Ciebie jako reszta.',
      body: `<p>Twoje saldo to zbiór monet (nazywanych też wyjściami). Aby wysłać 3 EPIC z monety wartej 5 EPIC, portfel wydaje całą
        monetę: 3 EPIC trafiają do odbiorcy, niewielka opłata do górników, a pozostała kwota wraca do Ciebie jako nowa moneta
        (nowe wyjście): to Twoja <b>reszta</b>.</p>
        <p>Dlatego część salda może być niedostępna przez kilka minut po wysyłce:</p>
        <ul>
          <li><b>[[locked_label]]</b>: monety z wysyłki, która nie została jeszcze zakończona. Jeśli anulujesz wysyłkę, zostaną
          odblokowane.</li>
          <li><b>[[awaiting_label]]</b>: transakcja, która nadal czeka na drugi portfel.</li>
          <li><b>[[confirming_label]]</b>: monety w bloku, który ma mniej niż 3 potwierdzenia, w tym Twoja reszta.</li>
        </ul>
        <p>Swoje monety zobaczysz w sekcji <b>[[outputs]]</b>.</p>`,
    },
    {
      id: 'fees',
      section: 'how',
      title: 'Opłaty',
      short: 'Od każdej transakcji pobierana jest niewielka opłata sieciowa, widoczna przed wysłaniem. Trafia ona do górników.',
      body: `<p>Opłata zależy od tego, ile monet transakcja wydaje i tworzy, a nie od wysyłanej kwoty. Zwykle jest to niewielki
        ułamek jednego EPIC.</p>
        <p>Przed wysłaniem jest widoczna jako <b>[[fee_label]]</b>.</p>
        <p>Przycisk <b>Wszystko</b> obok kwoty wpisuje całe dostępne saldo pomniejszone o dokładną opłatę, więc nie zostaje
        żadna reszta.</p>`,
    },
    {
      id: 'phrase',
      section: 'safety',
      title: 'Fraza odzyskiwania',
      short: 'Te słowa to jedyny sposób, by odzyskać swoje EPIC. Zapisz je na papierze i nikomu ich nie podawaj.',
      body: `<p>Fraza odzyskiwania (w nowym portfelu to 24 słowa) jest kluczem do Twoich pieniędzy. Dzięki niej przywrócisz portfel
        na dowolnym komputerze, ale każdy, kto ją zdobędzie, może zabrać Twoje EPIC.</p>
        <ul>
          <li>Zapisz słowa na papierze, w podanej kolejności, i schowaj kartkę w bezpiecznym miejscu offline.</li>
          <li>Nigdy nie przechowuj ich w postaci zdjęcia, zrzutu ekranu ani pliku. Nigdy nie wpisuj ich na żadnej stronie
          internetowej ani na czacie.</li>
          <li>Nikt w imieniu Epic Cash ani tego portfela nigdy nie poprosi Cię o te słowa.</li>
        </ul>
        <p>Aby ponownie zobaczyć słowa, otwórz sekcję <b>[[phrase]]</b> i wpisz hasło do portfela. Lepiej ich nie kopiować.
        Jeśli jednak to zrobisz, portfel wyczyści schowek po 60 sekundach, a także po zablokowaniu lub zamknięciu portfela.</p>`,
    },
    {
      id: 'backups',
      section: 'safety',
      title: 'Kopie zapasowe i przywracanie',
      short: 'Twoją kopią zapasową jest fraza odzyskiwania. Aby przywrócić portfel, wybierz opcję Przywróć z frazy odzyskiwania i wpisz słowa.',
      body: `<p>Nie trzeba tworzyć żadnego pliku kopii zapasowej: fraza odzyskiwania przywraca wszystko, co jest w blockchainie,
        czyli Twoje saldo.</p>
        <p><b>Aby przywrócić</b> portfel na nowym komputerze albo po jego utracie, wybierz <b>[[restore]]</b>, wpisz słowa,
        sprawdź je i ustaw hasło. Po otwarciu portfel przeszuka blockchain w poszukiwaniu Twoich monet. Saldo pojawi się po
        tym pierwszym skanowaniu.</p>
        <p><b>Czego przywracanie nie odzyska:</b> tego, czego nigdy nie było w blockchainie, na przykład wiadomości dołączonych
        do transakcji, kontaktów i nazw portfeli.</p>
        <p><b>Saldo się nie zgadza?</b> Uruchom ponowne skanowanie (<b>[[rescan]]</b>). Przeszukuje ono cały blockchain
        w poszukiwaniu monet tego portfela.</p>
        <p><b>Pliki portfela</b> znajdziesz w sekcji <b>[[wallet_files]]</b>. Nawet jeśli je skopiujesz, zachowaj frazę
        odzyskiwania: zadziała także wtedy, gdy pliki przepadną.</p>`,
    },
    {
      id: 'nodes',
      section: 'network',
      title: 'Node’y: wbudowany czy zewnętrzny',
      short: 'Node łączy portfel z siecią Epic Cash. Najszybciej zaczniesz z node’em publicznym, a wbudowany to Twój własny node.',
      body: `<p>Portfel potrzebuje node’a, aby odczytywać blockchain (Twoje saldo i potwierdzenia) i wysyłać Twoje transakcje do sieci.</p>
        <ul>
          <li><b>Node zewnętrzny</b> (domyślny): node publiczny, na przykład node.epiccash.com. Działa od razu. Jego właściciel
          widzi Twój adres IP i to, o które monety pyta Twój portfel.</li>
          <li><b>Node wbudowany</b>: działa na tym komputerze. Najpierw pobiera cały blockchain, co trochę trwa i wymaga miejsca
          na dysku, a potem jest w pełni Twój. Na czas synchronizacji portfel korzysta z node’a publicznego.</li>
        </ul>
        <p>Node zmienisz w sekcji <b>[[node_settings]]</b>. Zmianę zatwierdź przyciskiem Zapisz, a portfel sam połączy się
        z nowym node’em. Możesz wpisać adres node’a albo wybrać jeden z publicznych node’ów z listy, na której widać też ich stan.</p>
        <p>Wysyłać można tylko wtedy, gdy node jest zsynchronizowany. Jeśli Twój node zostanie w tyle, portfel zaproponuje
        przełączenie się na inny.</p>`,
    },
    {
      id: 'epicbox',
      section: 'network',
      title: 'Epicbox',
      short: 'Epicbox dostarcza transakcje między portfelami i przechowuje je, gdy drugi portfel jest offline.',
      body: `<p>W każdej transakcji biorą udział oba portfele, więc potrzebują miejsca, w którym wymieniają wiadomości. Takim
        miejscem jest serwer Epicbox: przechowuje wysłaną do Ciebie płatność, dopóki Twój portfel nie będzie online, i przekazuje
        z powrotem odpowiedź Twojego portfela. Wiadomości są zaszyfrowane, a Epicbox nie może wydać Twoich monet.</p>
        <p>Twój adres Epic składa się z klucza publicznego Twojego portfela, znaku <b>@</b> i nazwy Twojego serwera Epicbox.</p>
        <p>Pole <b>Serwer Epicbox</b> znajdziesz w sekcji <b>[[epicbox_setting]]</b>. Możesz wpisać adres serwera albo wybrać
        jeden z serwerów publicznych z listy, na której widać też ich stan, a potem nacisnąć Zapisz. Jeśli wybierzesz inny
        serwer, zmieni się część adresu po znaku @, więc podaj nowy adres osobom, które Ci płacą. Portfel jeden raz sprawdzi,
        czy na starym serwerze nie czekają płatności wysłane na Twój stary adres. Gdy pole jest puste, Epicbox jest
        wyłączony, a z plików nadal możesz korzystać.</p>
        <p>Z Epicbox korzystają też inne portfele Epic Cash, więc można przesyłać płatności między nimi. Epicbox nie ukrywa
        Twojego adresu IP przed serwerem: jeśli Ci na tym zależy, użyj VPN.</p>`,
    },
    {
      id: 'tor',
      section: 'network',
      title: 'Tor',
      short: 'Tor pozwala dwóm portfelom płacić sobie prywatnie na adres .onion, bez otwierania portów. Domyślnie jest wyłączony.',
      body: `<p>Włączysz go w <b>[[tor_setting]]</b>. Portfel dostanie wtedy stały adres Tor (kończy się na <b>.onion</b>), na który inni mogą płacić, a w <b>[[send]]</b> zapłacisz na cudze adresy Tor. Łączenie trwa dłużej, a portfel odbiorcy musi być w tym czasie otwarty z włączonym Tor.</p>
        <p>Tor ukrywa adresy IP obu portfeli podczas wymiany transakcji. Gotowa transakcja trafia do Twojego node’a jak zwykle. Epicbox, sprawdzanie node’a i wbudowany node nie korzystają z Tor.</p>
        <p>Twój adres Tor wynika z klucza portfela i nigdy się nie zmienia. Kto go zna, widzi, kiedy Twój portfel jest online z włączonym Tor.</p>`,
    },
    {
      id: 'troubleshooting',
      section: 'trouble',
      title: 'Rozwiązywanie problemów',
      short: 'Najczęściej przyczyną jest node, który wciąż się synchronizuje, odbiorca, który jeszcze nie odpowiedział, albo zajęty port.',
      body: `<p><b>„Node niezsynchronizowany”: nie mogę wysłać.</b> Wysyłanie będzie możliwe, gdy node nadrobi zaległości.
        Poczekaj chwilę albo wybierz inny node w sekcji [[node_settings]].</p>
        <p><b>„Brak połączenia z Epicbox”.</b> Twój portfel nie może jeszcze połączyć się ze swoim serwerem Epicbox. Poczekaj
        chwilę. Jeśli problem nie ustąpi, sprawdź połączenie z internetem albo wybierz inny serwer w sekcji [[epicbox_setting]].
        W międzyczasie możesz wysyłać za pomocą pliku.</p>
        <p><b>Moja wysyłka ma status „Oczekiwanie na odpowiedź odbiorcy”.</b> Portfel odbiorcy jeszcze nie odpowiedział. Poproś
        odbiorcę, żeby otworzył swój portfel. Jeśli nigdy tego nie zrobi, anuluj wysyłkę ([[cancel]]), żeby odblokować monety.</p>
        <p><b>Nie dotarła do mnie płatność.</b> Sprawdź na ekranie [[receive]], czy odbieranie jest włączone i czy Twój node
        jest zsynchronizowany. Jeśli zmienił się Twój serwer Epicbox, upewnij się, że nadawca użył Twojego nowego
        adresu. Portfel nadawcy musi też dokończyć transakcję, a potem trzeba poczekać kilka minut na potwierdzenia.</p>
        <p><b>„Port 3415 jest zajęty przez inny program”.</b> Inny program, często inny portfel Epic, korzysta z tego portu do
        płatności HTTP. Zamknij ten program, a potem naciśnij przycisk Spróbuj ponownie na ekranie [[receive]]. Epicbox i pliki
        w tym czasie nadal działają.</p>
        <p><b>„Inny program Epic używa tego folderu”.</b> Inny portfel lub node Epic ma otwarte te same pliki. Zamknij ten
        program i spróbuj ponownie.</p>
        <p><b>„Nieprawidłowe hasło”.</b> Sprawdź Caps Lock i układ klawiatury. Jeśli nie pamiętasz hasła, przywróć portfel
        z frazy odzyskiwania i ustaw nowe hasło.</p>
        <p><b>Saldo się nie zgadza.</b> Uruchom ponowne skanowanie ([[rescan]]).</p>`,
    },
    {
      id: 'getting-help',
      section: 'trouble',
      title: 'Jak uzyskać pomoc',
      short: 'Coś nie działa? Wybierz kolejno [[report]].',
      body: `<p>Twoje zgłoszenie jest zaszyfrowane. Może je odczytać tylko twórca aplikacji.</p>`,
    },
  ],
};

export default messages
