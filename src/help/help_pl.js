const messages = [
  {
    title: 'Wysyłanie monet',
    text: `Wysłanie to pierwszy krok w tworzeniu transakcji, w której biorą udział obie strony.<br/>
    <br/>
    Transakcję można wysłać od razu na adres Epicbox lub http(s) albo przeprowadzić ręcznie, wymieniając pliki.<br/>
    <br/>
    Zanim zaczniesz nową transakcję, upewnij się, że Twój węzeł jest w pełni zsynchronizowany
    z siecią Epic Cash.<br/></br>
    Stan węzła powinien mieć wartość „zsynchronizowany”.<br/>
    <br/>
    Adresem odbiorcy może być adres Epicbox albo dowolny zewnętrzny adres http(s).<br/>`,
  },
  {
    title: 'Odbieranie monet',
    text: `Aby odbierać monety, portfel musi nasłuchiwać.<br/><br/>
    W ustawieniach domyślnych nasłuch jest włączony.<br/><br/>
    Możesz to zmienić w Ustawieniach.<br/>
    <br/>
    Na stronie Odbierz znajdziesz listę adresów, na które możesz otrzymywać monety.<br/>
    <br/>
    Jeśli coś pójdzie nie tak i portfel nie odbiera monet, uruchom ponownie nasłuch na stronie Odbierz.<br/>`
  },
  {
    title: 'Finalizacja transakcji offline',
    text: `Aby sfinalizować transakcję offline, zaimportuj na tej stronie plik<br/>
    odpowiedzi otrzymany od odbiorcy.<br/>`
  },
  {
    title: 'Import transakcji offline',
    text: `Na tej stronie zaimportujesz plik transakcji otrzymany od nadawcy.<br/>
    <br/>
    Po zaimportowaniu zapisz plik odpowiedzi i przekaż go
    nadawcy.<br/>`
  },
  {
    title: 'Książka adresowa',
    text: `Zapisuj swoje kontakty i ich adresy w książce adresowej.<br/>
    <br/>
    Gdy później zechcesz wysłać kolejną transakcję, wyszukasz adres kontaktu w polu adresu odbiorcy.<br/>`
  },
  {
    title: 'ID transakcji',
    text: `ID transakcji to niepowtarzalny identyfikator transakcji, wspólny dla odbiorcy i nadawcy.<br/>`
  },
  {
    title: 'ID monety',
    text: `ID monety to niepowtarzalny identyfikator Twoich monet w blockchainie.<br/>
    Tylko Ty widzisz ID monety.<br/>`
  },
  {
    title: 'Nasłuch portfela',
    text: `Aby odbierać monety z innych portfeli, nasłuch portfela musi być uruchomiony.<br/>
    <br/>
    Nasłuch uruchomisz i zatrzymasz na stronie Odbierz.<br/>`
  },
  {
    title: 'Profil',
    text: `W sekcji Profil ustawisz swoje imię.<br/>
    <br/>
    Imię jest widoczne u góry aplikacji.<br/>`
  },
  {
    title: 'Ustawienia',
    text: `Tutaj zmienisz ustawienia wybrane w asystencie konfiguracji.<br/>`
  },
  {
    title: 'Serwer węzła',
    text: `To adres Twojego węzła.<br/>
    <br/>
    Portfel potrzebuje węzła, aby wysyłać i odbierać monety.<br/>
    <br/>
    Możesz wybrać wbudowany węzeł albo węzeł zewnętrzny.<br/><br/>
    Po zmianie tego ustawienia uruchom portfel ponownie.<br/>`
  },
  {
    title: 'Import transakcji offline',
    text: `Jeśli ktoś wyśle Ci transakcję offline, zaimportuj ją na stronie „Importuj transakcję offline”.<br/>
    <br/>Po imporcie zapisz plik odpowiedzi i odeślij go nadawcy.<br/>`
  },
  {
    title: 'Fraza odzyskiwania',
    text: `Fraza odzyskiwania to słowa, których potrzebujesz, aby odzyskać portfel. Zapisz je
    w tej samej kolejności, w jakiej są wyświetlane, na przykład na papierze.<br/>
    <br/>
    Jeśli kiedyś stracisz dane portfela, odzyskasz go<br/>
    za pomocą tych słów.<br/>`
  },
  {
    title: 'Węzeł sieci',
    text: `Węzeł sieci to serwer, który przechowuje dane blockchaina.<br/><br/>
           Portfel ma wbudowany węzeł, z którego możesz korzystać. Możesz też wybrać zewnętrzny węzeł uruchomiony
           na innym komputerze albo publiczny węzeł.<br/><br/>
           Przy pierwszym uruchomieniu wbudowany węzeł potrzebuje około 2 godzin, aby zsynchronizować dane blockchaina.`
  },
  {
    title: 'Peery',
    text: `Peery to inne węzły sieci połączone z Twoim węzłem.<br/>`
  },
  {
    title: 'Wysokość blockchaina',
    text: `Wysokość blockchaina to numer najnowszego bloku w łańcuchu. Co 60 sekund powstaje nowy blok i wysokość się zmienia.<br/>`
  },
];

export default messages
