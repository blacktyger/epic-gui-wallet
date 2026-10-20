const messages = [
  {
    title: 'Odeslání mincí',
    text: `Odeslání je první krok při vytváření interaktivní transakce.<br/>
    <br/>
    Transakci lze odeslat okamžitě na adresu Epicbox nebo http(s), nebo ji provést ručně výměnou souborů.<br/>
    <br/>
    Než začnete novou transakci, ujistěte se, že je váš uzel plně synchronizován
    se sítí Epic Cash.<br/></br>
    Stav vašeho uzlu by měl být „synchronizován“.<br/>
    <br/>
    Adresou příjemce může být adresa Epicbox nebo libovolná externí adresa http(s).<br/>`,
  },
  {
    title: 'Příjem mincí',
    text: `Aby peněženka mohla přijímat mince, musí běžet naslouchání peněženky.<br/><br/>
    Ve výchozím nastavení je naslouchání zapnuto.<br/><br/>
    Toto lze změnit v Nastavení.<br/>
    <br/>
    Na stránce Příjem je seznam adres, na které můžete mince přijímat.<br/>
    <br/>
    Pokud se něco pokazí a peněženka mince nepřijímá, restartujte naslouchání na stránce Příjem.<br/>`
  },
  {
    title: 'Dokončit offline transakci',
    text: `Chcete-li dokončit offline transakci, naimportujte na této stránce soubor<br/>
    s odpovědí, který jste obdrželi od příjemce.<br/>`
  },
  {
    title: 'Import offline transakce',
    text: `Na této stránce naimportujete soubor transakce, který jste obdrželi od odesílatele.<br/>
    <br/>
    Po importu uložte soubor s odpovědí a pošlete ho zpět
    odesílateli.<br/>`
  },
  {
    title: 'Adresář',
    text: `Ukládejte své kontakty a jejich adresy do adresáře.<br/>
    <br/>
    Když se později rozhodnete provést další transakci, můžete adresu kontaktu vyhledat v poli adresy příjemce.<br/>`
  },
  {
    title: 'ID transakce',
    text: `ID transakce je jedinečný identifikátor každé transakce, společný pro příjemce a odesílatele.<br/>`
  },
  {
    title: 'ID mince',
    text: `ID mince je jedinečný identifikátor vašich mincí na blockchainu.<br/>
    Hodnotu ID mince vidíte jen vy.<br/>`
  },
  {
    title: 'Naslouchání peněženky',
    text: `Aby peněženka mohla přijímat mince z jiných peněženek, musí běžet naslouchání peněženky.<br/>
    <br/>
    Naslouchání lze spustit nebo zastavit na stránce Příjem.<br/>`
  },
  {
    title: 'Účet',
    text: `V části Účet nastavíte své uživatelské jméno.<br/>
    <br/>
    Uživatelské jméno se zobrazuje v horní části aplikace.<br/>`
  },
  {
    title: 'Nastavení',
    text: `Zde můžete změnit nastavení zvolená během asistenta nastavení.<br/>`
  },
  {
    title: 'Server uzlu',
    text: `Toto je umístění vašeho uzlu.<br/>
    <br/>
    Peněženka potřebuje uzel, aby mohla odesílat a přijímat mince.<br/>
    <br/>
    Můžete si vybrat mezi vestavěným uzlem a externím uzlem.<br/><br/>
    Pokud tuto hodnotu změníte, restartujte peněženku.<br/>`
  },
  {
    title: 'Import offline transakce',
    text: `Pokud vám někdo pošle offline transakci, můžete ji naimportovat na stránce „Import offline transakce“.<br/>
    <br/>Po importu musíte uložit soubor s odpovědí a poslat ho zpět odesílateli.<br/>`
  },
  {
    title: 'Obnovovací fráze',
    text: `Obnovovací fráze je seznam slov, který potřebujete k obnovení peněženky. Slova si zapište
    na papír, ve stejném pořadí, v jakém se zobrazují, a papír uschovejte na bezpečném místě offline.
    Nikdy je neukládejte jako fotografii, snímek obrazovky ani soubor.<br/>
    <br/>
    Pokud ztratíte tento počítač nebo soubory peněženky, můžete peněženku obnovit<br/>
    pomocí těchto slov.<br/>`
  },
  {
    title: 'Uzel sítě',
    text: `Uzel sítě je server, který uchovává data blockchainu.<br/><br/>
           Vaše peněženka má vestavěný uzel, který můžete používat, nebo si můžete vybrat externí uzel
           běžící na jiném počítači či externí veřejný uzel.<br/><br/>
           Při prvním spuštění vestavěného uzlu trvá synchronizace dat blockchainu přibližně 2 hodiny.`
  },
  {
    title: 'Protějšky',
    text: `Protějšky jsou další uzly sítě připojené k vašemu uzlu.<br/>`
  },
  {
    title: 'Výška blockchainu',
    text: `Výška blockchainu je číslo posledního bloku v řetězci. Každých 60 sekund vznikne nový blok a hodnota se změní.<br/>`
  },
  /* use this for new topic
  {
    title: 'topic',
    text: `can be html too`
  },
  */
];

export default messages
