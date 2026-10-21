/* Help topics (German, de): Settings › Help in the Modern interface. Same structure as topics_en.js. */
const messages = {
  ui: {
    lede: 'Kurze Antworten auf häufige Fragen. Suchen Sie oder öffnen Sie ein Thema.',
    search_label: 'Hilfe durchsuchen',
    search_placeholder: 'Zum Beispiel: Datei, Bestätigungen, Phrase',
    search_keys: 'Drücken Sie /, um zu suchen. Esc löscht die Suche.',
    clear: 'Suche löschen',
    results: 'Gefundene Themen: {n}',
    no_results: 'Kein Thema passt zu „{q}“. Versuchen Sie ein anderes Wort.',
    more: 'Mehr lesen',
    less: 'Weniger anzeigen',
    handshake: {
      title: 'So läuft eine Transaktion ab',
      over_epicbox: 'Über Epicbox',
      with_file: 'Mit einer Datei',
      you: 'Sie',
      them: 'Empfänger',
      network: 'Netzwerk',
      epicbox: 'Epicbox',
      file: 'Datei',
      step: 'Schritt {n} von {total}',
      prev: 'Vorheriger Schritt',
      next: 'Nächster Schritt',
      steps: {
        epicbox: [
          'Ihre Wallet sendet die Zahlung an Epicbox und sperrt die Coins.',
          'Epicbox leitet sie weiter, sobald die Wallet des Empfängers online ist. Seine Wallet fügt ihren Teil hinzu und signiert.',
          'Die Wallet des Empfängers schickt sie zurück an Epicbox.',
          'Epicbox gibt sie an Ihre Wallet zurück.',
          'Auch Ihre Wallet signiert, schließt die Transaktion ab und sendet sie an das Netzwerk.',
          'Das Netzwerk nimmt sie in einen Block auf. Nach 3 Bestätigungen ist sie endgültig.',
        ],
        file: [
          'Ihre Wallet speichert eine Transaktionsdatei und sperrt die Coins. Die Datei schicken Sie selbst an den Empfänger.',
          'Der Empfänger öffnet sie. Seine Wallet fügt ihren Teil hinzu, signiert und speichert eine Antwortdatei.',
          'Der Empfänger schickt Ihnen die Antwortdatei zurück.',
          'Sie öffnen die Antwortdatei in Ihrer Wallet.',
          'Auch Ihre Wallet signiert, schließt die Transaktion ab und sendet sie an das Netzwerk.',
          'Das Netzwerk nimmt sie in einen Block auf. Nach 3 Bestätigungen ist sie endgültig.',
        ],
      },
    },
  },

  //where things are in the app: this language's UI labels
  terms: {
    receive: 'Empfangen',
    send: 'Senden',
    send_go: 'Senden prüfen, dann … EPIC senden',
    send_file: 'Stattdessen als Datei senden (oben bei Senden)',
    sign_file: 'Empfangen › Transaktionsdateien › Transaktionsdatei signieren',
    finalize_file: 'Empfangen › Transaktionsdateien › Antwortdatei abschließen',
    cancel: 'Aktivität › die Transaktion › Transaktion abbrechen',
    outputs: 'Aktivität › Coins',
    phrase: 'Einstellungen › Wiederherstellungsphrase',
    rescan: 'Einstellungen › Neu scannen',
    restore: 'Mit Wiederherstellungsphrase wiederherstellen (auf dem ersten Bildschirm, unter Entsperren › Wallet hinzufügen oder unter Einstellungen › Alle Wallets › Wallet hinzufügen)',
    wallet_files: 'Einstellungen › Diese Wallet › Wallet-Ordner',
    node_settings: 'Einstellungen › Netzwerkknoten und Empfang',
    epicbox_setting: 'Einstellungen › Netzwerkknoten und Empfang › Empfangen',
    tor_setting: 'Einstellungen › Empfangen › Tor',
    report: 'Einstellungen › Hilfe › Problem melden',
    confirming_label: 'Wird bestätigt',
    locked_label: 'In ausgehenden Zahlungen gebunden',
    awaiting_label: 'Warten auf Abschluss',
    fee_label: 'Netzwerkgebühr',
  },

  sections: [
    { id: 'start', title: 'Erste Schritte' },
    { id: 'how', title: 'So funktioniert Epic Cash' },
    { id: 'safety', title: 'Ihre Wallet sicher halten' },
    { id: 'network', title: 'Netzwerkknoten und Epicbox' },
    { id: 'trouble', title: 'Wenn etwas schiefgeht' },
  ],

  topics: [
    {
      id: 'receive-first',
      section: 'start',
      title: 'Ihre ersten EPIC empfangen',
      short: 'Öffnen Sie [[receive]], kopieren Sie Ihre Epic-Adresse und geben Sie sie dem Absender. Die Zahlung kommt von selbst an.',
      body: `<p>Ihre Epic-Adresse ist ein langer Code, der mit <b>@</b> und dem Namen Ihres Epicbox-Servers endet, zum Beispiel
        <b>…@epicbox.epiccash.com</b>. Sie können sie bedenkenlos weitergeben: Andere brauchen sie, um Sie zu bezahlen, und niemand
        kann Ihnen damit etwas wegnehmen.</p>
        <ol>
          <li>Öffnen Sie <b>[[receive]]</b>.</li>
          <li>Kopieren Sie die Adresse (oder zeigen Sie ihren QR-Code an) und schicken Sie sie der Person, die Sie bezahlt.</li>
          <li>Die Zahlung erscheint von selbst unter „Aktivität“. Sie müssen nichts drücken.</li>
        </ol>
        <p>Ihre Wallet beginnt von selbst zu empfangen, nachdem Sie sie entsperrt haben und sobald der Netzwerkknoten synchronisiert
        ist. Ist die Wallet geschlossen, wenn jemand Sie bezahlt, hält Epicbox die Zahlung bereit, und Ihre Wallet holt sie beim
        nächsten Entsperren ab.</p>
        <p>Eine neue Zahlung wartet zuerst, bis die Wallet des Absenders sie abgeschlossen hat, und wird dann als „Wird bestätigt“
        angezeigt. Nach 3 Bestätigungen, also nach etwa 3 Minuten, können Sie sie ausgeben.</p>
        <p>Du kannst auch über Tor empfangen: Schalte es in <b>[[tor_setting]]</b> ein.</p>`,
    },
    {
      id: 'send',
      section: 'start',
      title: 'An jemanden senden',
      short: 'Öffnen Sie [[send]], fügen Sie die Epic-Adresse des Empfängers ein, geben Sie den Betrag ein, prüfen Sie die Gebühr und senden Sie.',
      body: `<ol>
          <li>Öffnen Sie <b>[[send]]</b> und fügen Sie die Epic-Adresse des Empfängers ein, oder wählen Sie einen Ihrer Kontakte.</li>
          <li>Geben Sie den Betrag ein. Die Gebühr sehen Sie, bevor Sie senden.</li>
          <li>Drücken Sie <b>[[send_go]]</b>.</li>
        </ol>
        <p>Jetzt muss die Wallet des Empfängers antworten (siehe „Warum braucht eine Transaktion beide Seiten?“). Über Epicbox muss
        der Empfänger nicht gerade online sein: Die Zahlung wartet, bis seine Wallet geöffnet wird. Solange Sie warten, sind die
        dafür verwendeten Coins in Ihrer Wallet gesperrt, damit sie nicht doppelt ausgegeben werden können.</p>
        <p>Sobald seine Antwort zurückkommt, schließt Ihre Wallet die Transaktion von selbst ab und sendet sie an das Netzwerk.
        Nach 3 Bestätigungen ist sie endgültig.</p>
        <p><b>Keine Antwort?</b> Nach einigen Minuten lautet der Status „Warten auf die Antwort des Empfängers“. Bitten Sie den
        Empfänger, seine Wallet zu öffnen. Kommt die Antwort nie, brechen Sie die Zahlung unter <b>[[cancel]]</b> ab, um die Coins
        zu entsperren. Eine Zahlung wird nie von selbst abgebrochen.</p>
        <p>Sie können senden, sobald Ihr Netzwerkknoten synchronisiert ist. Zum Senden an eine Epic-Adresse muss außerdem Ihre eigene Epicbox verbunden sein; bis dahin können Sie per Datei senden. Sie können auch an
        eine http(s)-Adresse senden, aber dann muss die Wallet des Empfängers in diesem Moment online und erreichbar sein.</p>`,
    },
    {
      id: 'send-file',
      section: 'start',
      title: 'Mit einer Datei senden',
      short: 'Der manuelle Weg: Transaktionsdatei speichern, an den Empfänger weitergeben, dann die Antwortdatei öffnen, die er zurückschickt.',
      body: `<p>Mit Dateien läuft derselbe Handschlag ab wie über Epicbox, aber Sie tragen die Nachrichten selbst weiter, zum Beispiel
        per E-Mail, Chat oder USB-Stick. Das funktioniert ohne Epicbox und auch, wenn Sie beide nicht gleichzeitig online sind.</p>
        <ol>
          <li><b>Sie:</b> Geben Sie unter „Senden“ den Betrag ein, drücken Sie <b>[[send_file]]</b> und speichern Sie die Datei (sie
          endet auf .tx). Ab jetzt sind die Coins gesperrt.</li>
          <li><b>Der Empfänger:</b> öffnet die Datei unter <b>[[sign_file]]</b>. Seine Wallet signiert sie und speichert eine
          Antwortdatei (ihr Name beginnt mit finalize_). Diese Datei schickt er an Sie zurück.</li>
          <li><b>Sie:</b> öffnen die Antwortdatei unter <b>[[finalize_file]]</b>. Ihre Wallet schließt die Transaktion ab und sendet
          sie an das Netzwerk.</li>
        </ol>
        <p>Andere Epic-Cash-Wallets nennen diese Schritte anders. Kommt die Antwortdatei nie, brechen Sie die Zahlung unter
        <b>[[cancel]]</b> ab, um die Coins zu entsperren.</p>`,
    },
    {
      id: 'both-sides',
      section: 'how',
      title: 'Warum braucht eine Transaktion beide Seiten?',
      short: 'Bei Epic Cash hilft die Wallet des Empfängers beim Aufbau jeder Transaktion, deshalb müssen beide Wallets mitwirken.',
      body: `<p>Epic Cash verwendet Mimblewimble. Statt eine Adresse und einen Betrag in die Blockchain zu schreiben, bauen die beiden
        Wallets jede Transaktion gemeinsam auf, wie bei einem Handschlag:</p>
        <ol>
          <li>Ihre Wallet beginnt sie und sperrt die Coins, die Sie senden.</li>
          <li>Die Wallet des Empfängers fügt ihren Teil hinzu und signiert.</li>
          <li>Auch Ihre Wallet signiert, schließt die Transaktion ab und sendet sie an das Netzwerk.</li>
        </ol>
        <p>Also muss etwas die Nachrichten zwischen den beiden Wallets befördern. <b>Epicbox</b> übernimmt das für Sie: Es hält die
        Nachricht bereit, solange die andere Wallet offline ist, sodass Sie nicht beide im selben Moment online sein müssen. Eine
        <b>Transaktionsdatei</b> ist der manuelle Weg: Sie geben die Dateien selbst weiter.</p>`,
      visual: 'handshake',
    },
    {
      id: 'confirmations',
      section: 'how',
      title: 'Bestätigungen',
      short: 'Eine Transaktion ist nach 3 Bestätigungen endgültig, meist nach etwa 3 Minuten.',
      body: `<p>Nimmt das Netzwerk eine Transaktion an, nimmt ein Miner sie in einen Block auf. Etwa jede Minute kommt ein neuer Block.
        Der Block mit Ihrer Transaktion ist die erste Bestätigung, und jeder weitere Block danach fügt eine hinzu und macht es
        schwerer, die Transaktion rückgängig zu machen.</p>
        <p>Diese Wallet betrachtet eine Transaktion nach <b>3 Bestätigungen</b> als endgültig. Bis dahin wird sie als
        <b>[[confirming_label]]</b> angezeigt, und erhaltene Coins können noch nicht ausgegeben werden. Die Zahl ist fest.</p>
        <p>Dauert es länger als sonst? Ihre Wallet sieht neue Blöcke nur über ihren Netzwerkknoten: Prüfen Sie, ob der Netzwerkknoten
        synchronisiert ist.</p>`,
    },
    {
      id: 'private',
      section: 'how',
      title: 'Was die Blockchain zeigt',
      short: 'Keine Adressen und keine Beträge: nur Coin-Einträge, die das Netzwerk prüfen kann, ohne zu sehen, wer oder wie viel.',
      body: `<p>Bei vielen Blockchains kann jeder eine Adresse nachschlagen und Kontostand und Verlauf sehen. Epic Cash ist anders:</p>
        <ul>
          <li><b>Keine Adressen in der Blockchain.</b> Ihre Epic-Adresse sagt Epicbox nur, wohin Nachrichten zugestellt werden. Sie
          wird nie in die Blockchain geschrieben.</li>
          <li><b>Keine Beträge in der Blockchain.</b> Beträge sind durch Kryptografie verborgen, und das Netzwerk kann trotzdem
          prüfen, dass keine Coins aus dem Nichts entstanden sind.</li>
          <li><b>Ihre Notizen bleiben außerhalb der Blockchain.</b> Eine Nachricht, die Sie hinzufügen, geht nur an die andere Wallet.
          Kontakte und Wallet-Namen bleiben auf diesem Computer.</li>
        </ul>
        <p>Was nicht verborgen ist: Der Netzwerkknoten, den Sie nutzen, und Ihr Epicbox-Server können Ihre IP-Adresse sehen, und ein
        öffentlicher Netzwerkknoten kann sehen, nach welchen Coins Ihre Wallet fragt. Nutzen Sie ein VPN, wenn Ihnen die IP-Adresse
        wichtig ist.</p>`,
    },
    {
      id: 'change',
      section: 'how',
      title: 'Gesperrte Beträge und Wechselgeld',
      short: 'Ihr Kontostand besteht aus einzelnen Coins. Beim Senden werden ganze Coins ausgegeben, und der Rest kommt als Wechselgeld zu Ihnen zurück.',
      body: `<p>Ihr Kontostand besteht aus mehreren Coins (auch Outputs genannt). Um 3 EPIC von einem Coin über 5 EPIC zu senden, gibt Ihre
        Wallet den ganzen Coin aus: 3 EPIC gehen an den Empfänger, eine kleine Gebühr an die Miner, und der Rest kommt als neuer
        Coin zu Ihnen zurück, Ihr <b>Wechselgeld</b>-Output.</p>
        <p>Deshalb kann ein Teil Ihres Kontostands nach dem Senden einige Minuten lang nicht verfügbar sein:</p>
        <ul>
          <li><b>[[locked_label]]</b>: Coins in einer Zahlung, die noch nicht abgeschlossen ist. Sie werden entsperrt, wenn Sie die
          Zahlung abbrechen.</li>
          <li><b>[[awaiting_label]]</b>: eine Transaktion, die noch auf die andere Wallet wartet.</li>
          <li><b>[[confirming_label]]</b>: Coins in einem Block mit weniger als 3 Bestätigungen, auch Ihr Wechselgeld.</li>
        </ul>
        <p>Ihre Coins sehen Sie unter <b>[[outputs]]</b>.</p>`,
    },
    {
      id: 'fees',
      section: 'how',
      title: 'Gebühren',
      short: 'Jede Transaktion zahlt eine kleine Netzwerkgebühr, die vor dem Senden angezeigt wird. Sie geht an die Miner.',
      body: `<p>Die Gebühr hängt davon ab, wie viele Coins Ihre Transaktion ausgibt und erzeugt, nicht vom Betrag. Meist ist sie ein
        kleiner Bruchteil eines EPIC.</p>
        <p>Sie sehen sie vor dem Senden als <b>[[fee_label]]</b>.</p>
        <p><b>Alles</b> neben dem Betrag trägt Ihren gesamten verfügbaren Kontostand abzüglich der genauen Gebühr ein, sodass kein
        Wechselgeld übrig bleibt.</p>`,
    },
    {
      id: 'phrase',
      section: 'safety',
      title: 'Ihre Wiederherstellungsphrase',
      short: 'Diese Wörter sind der einzige Weg, Ihre EPIC zurückzubekommen. Notieren Sie sie auf Papier und geben Sie sie nie weiter.',
      body: `<p>Die Wiederherstellungsphrase (bei einer neuen Wallet 24 Wörter) ist der Schlüssel zu Ihrem Geld. Mit ihr können Sie Ihre
        Wallet auf jedem Computer wiederherstellen, und jeder andere, der sie hat, kann Ihnen Ihre EPIC wegnehmen.</p>
        <ul>
          <li>Schreiben Sie die Wörter in dieser Reihenfolge auf Papier und bewahren Sie das Papier sicher und offline auf.</li>
          <li>Speichern Sie sie niemals als Foto, Screenshot oder Datei. Geben Sie sie niemals auf einer Website oder in einem Chat ein.</li>
          <li>Niemand von Epic Cash oder dieser Wallet wird Sie jemals danach fragen.</li>
        </ul>
        <p>Um die Wörter noch einmal zu sehen, öffnen Sie <b>[[phrase]]</b> und geben Sie das Passwort Ihrer Wallet ein. Am besten
        kopieren Sie sie nicht: Tun Sie es doch, leert die Wallet die Zwischenablage nach 60 Sekunden sowie dann, wenn Sie die
        Wallet sperren oder schließen.</p>`,
    },
    {
      id: 'backups',
      section: 'safety',
      title: 'Sicherungen und Wiederherstellung',
      short: 'Ihre Wiederherstellungsphrase ist Ihre Sicherung. Zum Wiederherstellen geben Sie ihre Wörter unter „Mit Wiederherstellungsphrase wiederherstellen“ ein.',
      body: `<p>Sie müssen keine Sicherungsdatei erstellen: Die Wiederherstellungsphrase bringt alles zurück, was in der Blockchain
        steht, also Ihren Kontostand.</p>
        <p><b>Zum Wiederherstellen</b> auf einem neuen Computer oder nach einem Verlust: Wählen Sie <b>[[restore]]</b>, geben Sie die
        Wörter ein, prüfen Sie sie und wählen Sie ein Passwort. Wenn die Wallet sich öffnet, durchsucht sie die Blockchain nach Ihren
        Coins. Ihr Kontostand erscheint nach diesem ersten Scan.</p>
        <p><b>Was eine Wiederherstellung nicht zurückbringen kann:</b> alles, was nie in der Blockchain stand, etwa
        Transaktionsnachrichten, Kontakte und Wallet-Namen.</p>
        <p><b>Der Kontostand sieht falsch aus?</b> Verwenden Sie <b>[[rescan]]</b>. Dabei wird die ganze Blockchain nach den Coins
        dieser Wallet durchsucht.</p>
        <p><b>Die Dateien der Wallet</b> finden Sie unter <b>[[wallet_files]]</b>. Bewahren Sie Ihre Wiederherstellungsphrase auch
        dann auf, wenn Sie die Dateien kopieren: Sie hilft auch dann, wenn die Dateien verloren sind.</p>`,
    },
    {
      id: 'nodes',
      section: 'network',
      title: 'Netzwerkknoten: integriert oder extern',
      short: 'Ein Netzwerkknoten verbindet Ihre Wallet mit dem Epic-Cash-Netzwerk. Ein öffentlicher ist am schnellsten, der integrierte ist Ihr eigener.',
      body: `<p>Die Wallet braucht einen Netzwerkknoten, um die Blockchain zu lesen (Ihren Kontostand und die Bestätigungen) und um
        Ihre Transaktionen an das Netzwerk zu senden.</p>
        <ul>
          <li><b>Externer Netzwerkknoten</b> (der Standard): ein öffentlicher Netzwerkknoten, etwa node.epiccash.com. Er funktioniert
          sofort. Wer ihn betreibt, kann Ihre IP-Adresse sehen und welche Coins Ihre Wallet abfragt.</li>
          <li><b>Integrierter Netzwerkknoten</b>: läuft auf diesem Computer. Er lädt zuerst die gesamte Blockchain herunter, was eine
          Weile dauert und Speicherplatz braucht, und danach ist er Ihr eigener. Während er synchronisiert, nutzt die Wallet einen
          öffentlichen Netzwerkknoten.</li>
        </ul>
        <p>Ändern Sie das unter <b>[[node_settings]]</b> und drücken Sie „Speichern“. Die Wallet verbindet sich von selbst mit dem
        neuen Netzwerkknoten. Sie können die Adresse eines Netzwerkknotens eintippen oder einen der öffentlichen Netzwerkknoten
        auswählen, die mit ihrem Status aufgelistet sind.</p>
        <p>Sie können nur senden, solange der Netzwerkknoten synchronisiert ist. Fällt Ihr Netzwerkknoten zurück, bietet die Wallet
        an, zu einem anderen zu wechseln.</p>`,
    },
    {
      id: 'epicbox',
      section: 'network',
      title: 'Epicbox',
      short: 'Epicbox stellt Transaktionen zwischen Wallets zu und hält sie bereit, solange die andere Wallet offline ist.',
      body: `<p>An jeder Transaktion sind beide Wallets beteiligt, daher brauchen ihre Nachrichten einen Treffpunkt. Ein Epicbox-Server
        ist dieser Treffpunkt: Er hält eine Zahlung an Sie bereit, bis Ihre Wallet online ist, und trägt die Antwort Ihrer Wallet
        zurück. Die Nachrichten sind verschlüsselt, und Epicbox kann Ihre Coins nicht ausgeben.</p>
        <p>Ihre Epic-Adresse besteht aus dem öffentlichen Schlüssel Ihrer Wallet, dann <b>@</b> und dem Namen Ihres Epicbox-Servers.</p>
        <p>Die Einstellung <b>Epicbox-Server</b> finden Sie unter <b>[[epicbox_setting]]</b>. Sie können einen Server eintippen oder
        einen der öffentlichen Server auswählen, die mit ihrem Status aufgelistet sind, und dann „Speichern“ drücken. Wählen Sie
        einen anderen Server, ändert sich der Teil nach dem @; geben Sie daher Ihre neue Adresse an die Leute weiter, die Sie
        bezahlen. Die Wallet prüft den alten Server einmal auf Zahlungen, die an Ihre alte Adresse geschickt wurden. Ist das Feld
        leer, ist Epicbox aus, und Sie können weiterhin Dateien verwenden.</p>
        <p>Andere Epic-Cash-Wallets nutzen Epicbox ebenfalls, daher können Sie zwischen diesen Wallets bezahlen. Epicbox verbirgt Ihre IP-Adresse
        nicht vor dem Server: Nutzen Sie ein VPN, wenn Ihnen das wichtig ist.</p>`,
    },
    {
      id: 'tor',
      section: 'network',
      title: 'Tor',
      short: 'Mit Tor bezahlen zwei Wallets einander privat über eine .onion-Adresse, ohne dass Ports geöffnet werden. Standardmäßig ist Tor aus.',
      body: `<p>Schalte es in <b>[[tor_setting]]</b> ein. Deine Wallet bekommt dann eine feste Tor-Adresse (sie endet auf <b>.onion</b>), an die andere zahlen können, und in <b>[[send]]</b> kannst du an fremde Tor-Adressen zahlen. Der Verbindungsaufbau dauert länger, und die Wallet des Empfängers muss in diesem Moment mit aktiviertem Tor geöffnet sein.</p>
        <p>Tor verbirgt die IP-Adressen beider Wallets, während sie die Transaktion austauschen. Die fertige Transaktion geht wie gewohnt an deinen Node. Epicbox, Node-Prüfungen und der eingebaute Node nutzen Tor nicht.</p>
        <p>Deine Tor-Adresse stammt aus dem Schlüssel deiner Wallet und ändert sich nie. Wer sie kennt, sieht, wann deine Wallet mit aktiviertem Tor online ist.</p>`,
    },
    {
      id: 'troubleshooting',
      section: 'trouble',
      title: 'Fehlerbehebung',
      short: 'Meist liegt es an einem Netzwerkknoten, der noch synchronisiert, an einem Empfänger, der noch nicht geantwortet hat, oder an einem belegten Port.',
      body: `<p><b>„Netzwerkknoten nicht synchronisiert“: Ich kann nicht senden.</b> Senden ist möglich, sobald Ihr Netzwerkknoten
        aufgeholt hat. Warten Sie etwas oder wählen Sie unter [[node_settings]] einen anderen Netzwerkknoten.</p>
        <p><b>„Epicbox nicht verbunden“.</b> Ihre Wallet erreicht ihren Epicbox-Server noch nicht. Warten Sie einen Moment. Bleibt es
        so, prüfen Sie Ihre Internetverbindung oder wählen Sie unter [[epicbox_setting]] einen anderen Server. Bis dahin können Sie
        mit einer Datei senden.</p>
        <p><b>Meine Zahlung steht auf „Warten auf die Antwort des Empfängers“.</b> Die Wallet des Empfängers hat noch nicht
        geantwortet. Bitten Sie den Empfänger, seine Wallet zu öffnen. Wenn er das nie tun wird, brechen Sie die Zahlung unter
        [[cancel]] ab, um die Coins zu entsperren.</p>
        <p><b>Eine Zahlung an mich ist nicht angekommen.</b> Prüfen Sie unter [[receive]], ob der Empfang an ist und Ihr
        Netzwerkknoten synchronisiert ist. Haben Sie Ihren Epicbox-Server geändert, vergewissern Sie sich, dass der Absender Ihre
        neue Adresse verwendet hat. Auch die Wallet des Absenders muss die Transaktion abschließen; danach rechnen Sie mit einigen
        Minuten für die Bestätigungen.</p>
        <p><b>„Port 3415 wird von einem anderen Programm verwendet“.</b> Ein anderes Programm, oft eine andere Epic-Wallet, belegt den
        Port für HTTP-Zahlungen. Schließen Sie dieses Programm und drücken Sie dann unter [[receive]] „Erneut versuchen“. Epicbox
        und Dateien funktionieren in der Zwischenzeit weiter.</p>
        <p><b>„Ein anderes Epic-Programm verwendet diesen Ordner“.</b> Eine andere Epic-Wallet oder ein anderer Epic-Netzwerkknoten
        hat dieselben Dateien geöffnet. Schließen Sie das andere Programm und versuchen Sie es erneut.</p>
        <p><b>„Falsches Passwort“.</b> Prüfen Sie die Feststelltaste und das Tastaturlayout. Haben Sie das Passwort vergessen,
        stellen Sie die Wallet mit ihrer Wiederherstellungsphrase wieder her und wählen Sie ein neues.</p>
        <p><b>Der Kontostand sieht falsch aus.</b> Verwenden Sie [[rescan]].</p>`,
    },
    {
      id: 'getting-help',
      section: 'trouble',
      title: 'Hilfe erhalten',
      short: 'Stimmt etwas nicht? Öffnen Sie [[report]].',
      body: `<p>Ihre Meldung ist verschlüsselt. Nur der Entwickler kann sie lesen.</p>`,
    },
  ],
};

export default messages
