const messages = [
  {
    title: 'Send coins',
    text: `The send command is the first step in building an interactive transaction.<br/>
    <br/>
    The transaction can either be sent instantly to an Epicbox or http(s) address, or done manually through the exchange of files.<br/>
    <br/>
    To start a new transaction, make sure your node server is fully synced 
    to the Epic Cash network.<br/></br>
    The status of your node server should read, “synced.”<br/>
    <br/>
    The recipient address can be an Epicbox address or any external http(s) address.<br/>`,
  },
  {
    title: 'Receive coins',
    text: `To receive coins, your wallet must be in listen mode.<br/><br/>
    The wallet’s default settings activate the listen/receive mode by default.<br/><br/>
    This feature can be changed in Settings.<br/>
    <br/>
    On the Receive Page, there will be a list of addresses that can be used to receive coins.<br/>
    <br/>
    If something goes wrong and your wallet is not receiving coins, restart the listener on the Receive Page.<br/>`
  },
  {
    title: 'Finalize offline transaction',
    text: `To finalize an offline transaction, use this page to import the response<br/>
    file you received from the receiver.<br/>`
  },
  {
    title: 'Import offline transaction',
    text: `Use this page to import the transaction file you received from the sender.<br/>
    <br/>
    After importing the transaction file, save the response file and send it back
    to the sender.<br/>`
  },
  {
    title: 'Address book',
    text: `Save your contacts and their addresses in the address book.<br/>
    <br/>
    If you later decide to make another transaction, you can search for the contact’s address in the recipient’s address field.<br/>`
  },
  {
    title: 'Transaction ID',
    text: `The Transaction ID is the unique identifier for each transaction shared by the receiver and sender.<br/>`
  },
  {
    title: 'Coin ID',
    text: `The Coin ID is the unique identifier for your coins on the blockchain.<br/>
    Only you can see the Coin ID value.<br/>`
  },
  {
    title: 'Wallet listener',
    text: `The wallet listener must be running to receive coins from other wallets.<br/>
    <br/>
    The listener can be started or stopped on the Receive Page.<br/>`
  },
  {
    title: 'Account',
    text: `Set your username in Account.<br/>
    <br/>
    The username is displayed at the top of the app.<br/>`
  },
  {
    title: 'Settings',
    text: `Here you can change the settings made during the setup assistant process.<br/>`
  },
  {
    title: 'Node Server',
    text: `This is the location of your node server.<br/>
    <br/>
    A node server is required for the wallet to send and receive coins.<br/>
    <br/>
    You can choose between the built-in node server and an external node server.<br/><br/>
    If you change this value, please restart your wallet.<br/>`
  },
  {
    title: 'Import offline transaction',
    text: `If somebody sends you an offline transaction, you can import it on page "Import offline transaction".<br/>
    <br/>After the import you must save a finalization transaction file and send it back to the sender.<br/>`
  },
  {
    title: 'Recovery phrase',
    text: `The recovery phrase is the list of words you need to restore your wallet. Write the words down
    on paper, in the order they are shown, and keep the paper somewhere safe and offline. Never keep them
    as a photo, screenshot or file.<br/>
    <br/>
    If you lose this computer or the wallet's files, you can restore the wallet<br/>
    with these words.<br/>`
  },
  {
    title: 'Network node',
    text: `A network node is a server which stores the blockchain data.<br/><br/>
           Your wallet has a built-in node you can use or select an external node you are running on another 
           computer or an external public node.<br/><br/>
           The first time you run the built-in node it will take approx. 2 hrs to sync the blockchain data.`
  },
  {
    title: 'Peers',
    text: `Peers are other network nodes that are connected to your network node<br/>`
  },
  {
    title: 'Blockchain Height',
    text: `The blockchain height is the latest block number in the chain. Every 60 seconds the blockchain creates a new block and the height value changes.<br/>`
  },
  /* use this for new topic
  {
    title: 'topic',
    text: `can be html too`
  },
  */
];

export default messages
