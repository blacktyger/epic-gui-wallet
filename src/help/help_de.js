const messages = [
  {
    title: 'Coins versenden',
    text: `Das Senden ist der erste Schritt einer interaktiven Transaktion.<br/>
    <br/>
    Eine Transaktion kann sofort an eine Epicbox- oder http(s)-Adresse gesendet oder manuell über den Austausch von Dateien abgewickelt werden.<br/>
    <br/>
    Um eine neue Transaktion zu starten, stellen Sie sicher, dass Ihr Netzwerkknoten vollständig mit dem Epic Cash-Netzwerk synchronisiert ist.<br/></br>
    Der Status Ihres Netzwerkknotens sollte „synchronisiert“ lauten.<br/>
    <br/>
    Die Empfängeradresse kann eine Epicbox-Adresse oder eine beliebige externe http(s)-Adresse sein.<br/>`,
  },
  {
    title: 'Coins empfangen',
    text: `Um Coins zu erhalten, muss Ihre Wallet empfangsbereit sein.<br/><br/>
    In den Standardeinstellungen ist die Wallet empfangsbereit.<br/><br/>
    Diese Funktion kann in den Einstellungen geändert werden.<br/>
    <br/>
    Auf der Seite „Empfangen“ wird eine Liste von Adressen angezeigt, die für den Empfang von Coins verwendet werden können.<br/>
    <br/>
    Wenn etwas schiefläuft und Ihre Wallet keine Coins empfängt, starten Sie den Wallet-Empfänger auf der Seite „Empfangen“ neu.<br/>`
  },
  {
    title: 'Offline-Transaktion abschließen',
    text: `Um eine Offline-Transaktion abzuschließen, importieren Sie auf dieser Seite die Antwortdatei,<br/>
    die Sie vom Empfänger erhalten haben.<br/>`
  },
  {
    title: 'Offline-Transaktion importieren',
    text: `Auf dieser Seite können Sie die Transaktionsdatei importieren, die Sie vom Absender erhalten haben.<br/>
    <br/>
    Nach dem Importieren der Transaktionsdatei speichern Sie die Antwortdatei und schicken sie an den
    Absender zurück.<br/>`
  },
  {
    title: 'Adressbuch',
    text: `Speichern Sie Ihre Kontakte und deren Adressen im Adressbuch.<br/>
    <br/>
    Wenn Sie sich später für eine weitere Transaktion entscheiden, können Sie im Empfängeradressfeld nach der Adresse des Kontakts suchen.<br/>`
  },
  {
    title: 'Transaktions-ID',
    text: `Die Transaktions-ID ist die eindeutige Kennung für jede Transaktion, die von Empfänger und Sender gemeinsam verwendet wird.<br/>`
  },
  {
    title: 'Coin-ID',
    text: `Die Coin-ID ist die eindeutige Kennung für Ihre Coins auf der Blockchain.<br/>
    Nur Sie können den Wert der Coin-ID sehen.<br/>`
  },
  {
    title: 'Wallet-Empfänger',
    text: `Der Wallet-Empfänger muss in Betrieb sein, um Coins von anderen Wallets zu empfangen.<br/>
    <br/>
    Der Wallet-Empfänger kann auf der Seite „Empfangen“ gestartet oder gestoppt werden.<br/>`
  },
  {
    title: 'Konto',
    text: `Legen Sie Ihren Benutzernamen unter Konto fest.<br/>
    <br/>
    Der Benutzername wird im oberen Bereich der App angezeigt.<br/>`
  },
  {
    title: 'Einstellungen',
    text: `Hier können Sie die Einstellungen ändern, die Sie während des Einrichtungsassistenten vorgenommen haben.<br/>`
  },
  {
    title: 'Netzwerkknoten',
    text: `Dies ist die Adresse Ihres Netzwerkknotens.<br/>
    <br/>
    Ein Netzwerkknoten ist erforderlich, damit die Wallet Coins senden und empfangen kann.<br/>
    <br/>
    Sie können zwischen dem integrierten Netzwerkknoten und einem externen Netzwerkknoten wählen.<br/><br/>
    Wenn Sie diesen Wert ändern, starten Sie bitte Ihre Wallet neu.<br/>`
  },
  {
    title: 'Offline-Transaktion importieren',
    text: `Wenn Ihnen jemand eine Offline-Transaktion schickt, können Sie diese auf der Seite „Offline-Transaktion importieren“ importieren.<br/>
    <br/>Nach dem Import müssen Sie eine Antwortdatei speichern und an den Absender zurückschicken.<br/>`
  },
  {
    title: 'Wiederherstellungsphrase',
    text: `Die Wiederherstellungsphrase ist die Wortliste, die Sie brauchen, um Ihre Wallet wiederherzustellen. Schreiben Sie die Wörter
    in der angezeigten Reihenfolge auf Papier und bewahren Sie das Papier sicher und offline auf. Speichern Sie sie niemals
    als Foto, Bildschirmfoto oder Datei.<br/>
    <br/>
    Wenn Sie diesen Computer oder die Dateien der Wallet verlieren, können Sie die Wallet<br/>
    mit diesen Wörtern wiederherstellen.<br/>`
  },
  {
    title: 'Was ist ein Netzwerkknoten?',
    text: `Ein Netzwerkknoten ist ein Server, der die Daten der Blockchain speichert.<br/><br/>
           Ihre Wallet hat einen integrierten Netzwerkknoten, den Sie verwenden können, oder Sie wählen einen externen Netzwerkknoten auf einem anderen
           Computer oder einen externen öffentlichen Netzwerkknoten.
           <br/><br/>
           Wenn Sie den integrierten Netzwerkknoten zum ersten Mal starten, dauert die Synchronisierung der Blockchain-Daten ca. 2 Stunden.`
  },
  {
    title: 'Peers',
    text: `Peers sind andere Netzwerkknoten, die mit Ihrem Netzwerkknoten verbunden sind.<br/>`
  },
  {
    title: 'Blockchain-Höhe',
    text: `Die Blockchain-Höhe ist die letzte Blocknummer in der Kette. Alle 60 Sekunden erstellt die Blockchain einen neuen Block und der Höhenwert ändert sich.<br/>`
  },
  /* use this for new topic
  {
    title: 'topic',
    text: `can be html too`
  },
  */
];

export default messages
